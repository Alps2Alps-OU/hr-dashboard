import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncRoadmapTasks, fetchQuarterlyMilestones } from '@/lib/asana';

export const dynamic = 'force-dynamic';

function getWeekBounds(date: Date, offset = 0): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const toMon = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + toMon + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

// POST — trigger sync
export async function POST(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get('type') ?? 'changes') as 'full' | 'changes';
  try {
    const t0 = Date.now();
    const result = await syncRoadmapTasks(type);
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// GET — return metrics + tasks from local DB
export async function GET() {
  try {
    const now = new Date();
    const thisWeek = getWeekBounds(now, 0);
    const lastWeek = getWeekBounds(now, -1);
    const nextWeekEnd = new Date(now.getTime() + 7 * 86_400_000);

    const [meta, allTasks, okrs, quarterlyMilestones] = await Promise.all([
      prisma.roadmapSyncMeta.findUnique({ where: { id: 'singleton' } }),
      prisma.asanaTask.findMany({ orderBy: { dueOn: 'asc' } }),
      prisma.hROkr.findMany({ orderBy: { quarter: 'asc' } }),
      fetchQuarterlyMilestones().catch(() => []),
    ]);

    const okrsByQuarter: Record<string, unknown[]> = {};
    for (const o of okrs) {
      if (!okrsByQuarter[o.quarter]) okrsByQuarter[o.quarter] = [];
      okrsByQuarter[o.quarter].push(o);
    }

    if (!meta || allTasks.length === 0) {
      return NextResponse.json({ isEmpty: true, okrsByQuarter, quarterlyMilestones, lastAsanaSync: null });
    }

    // Enrich tasks with derived fields
    const tasks = allTasks.map((t) => {
      const completedMs = t.completedAt ? t.completedAt.getTime() : null;
      const dueMs = t.dueOn ? t.dueOn.getTime() : null;
      const daysOpen = t.completed && completedMs
        ? daysBetween(t.createdAt, t.completedAt!)
        : daysBetween(t.createdAt, now);
      const daysOverdue = !t.completed && dueMs && dueMs < now.getTime()
        ? daysBetween(t.dueOn!, now)
        : null;
      return {
        id: t.id,
        gid: t.gid,
        projectGid: t.projectGid,
        name: t.name,
        completed: t.completed,
        dueOn: t.dueOn?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        assignee: t.assignee,
        section: t.section,
        quarter: t.quarter,
        daysOpen,
        daysOverdue,
      };
    });

    // KPI helper — computed over a task subset
    const computeKpis = (ts: typeof tasks) => {
      return {
        doneThisWeek: ts.filter((t) => t.completed && t.completedAt &&
          new Date(t.completedAt) >= thisWeek.start && new Date(t.completedAt) <= thisWeek.end).length,
        doneLastWeek: ts.filter((t) => t.completed && t.completedAt &&
          new Date(t.completedAt) >= lastWeek.start && new Date(t.completedAt) <= lastWeek.end).length,
        plannedThisWeek: ts.filter((t) => t.dueOn &&
          new Date(t.dueOn) >= thisWeek.start && new Date(t.dueOn) <= thisWeek.end).length,
        inProgress: ts.filter((t) => !t.completed).length,
        overdue: ts.filter((t) => !t.completed && (t.daysOverdue ?? 0) > 0).length,
        dueThisWeek: ts.filter((t) => !t.completed && t.dueOn &&
          new Date(t.dueOn) > now && new Date(t.dueOn) <= nextWeekEnd).length,
        avgClosureTime: (() => {
          const done = ts.filter((t) => t.completed && t.completedAt);
          if (!done.length) return null;
          const total = done.reduce((s, t) =>
            s + daysBetween(new Date(t.createdAt), new Date(t.completedAt!)), 0);
          return Math.round(total / done.length);
        })(),
      };
    }

    const kpis = computeKpis(tasks);

    // Quarterly breakdown — only tasks due in the roadmap year.
    // The Strategic Roadmap is year-scoped, so tasks whose due date falls in a
    // different year (e.g. leftover 2025 items) must not leak into these buckets.
    const roadmapYear = now.getFullYear();
    const byQuarter: Record<string, { planned: number; completed: number; remaining: number }> = {
      Q1: { planned: 0, completed: 0, remaining: 0 },
      Q2: { planned: 0, completed: 0, remaining: 0 },
      Q3: { planned: 0, completed: 0, remaining: 0 },
      Q4: { planned: 0, completed: 0, remaining: 0 },
    };
    for (const t of tasks) {
      if (!t.quarter || !byQuarter[t.quarter]) continue;
      if (!t.dueOn || new Date(t.dueOn).getFullYear() !== roadmapYear) continue;
      byQuarter[t.quarter].planned++;
      if (t.completed) byQuarter[t.quarter].completed++;
      else byQuarter[t.quarter].remaining++;
    }

    // Bottlenecks — overdue tasks sorted worst-first
    const bottlenecks = tasks
      .filter((t) => !t.completed && (t.daysOverdue ?? 0) > 0)
      .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
      .slice(0, 50);

    return NextResponse.json({
      isEmpty: false,
      sync: {
        lastSyncedAt: meta.lastSyncedAt?.toISOString() ?? null,
        lastMode: meta.lastMode,
        taskCount: meta.taskCount,
      },
      kpis,
      byQuarter,
      roadmapYear,
      bottlenecks,
      tasks,
      okrsByQuarter,
      quarterlyMilestones,
      lastAsanaSync: meta.lastSyncedAt?.toISOString() ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

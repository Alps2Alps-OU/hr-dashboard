import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const d30  = new Date(now.getTime() - 30  * 86_400_000);
    const d90  = new Date(now.getTime() - 90  * 86_400_000);

    const [employees, terminations] = await Promise.all([
      prisma.employee.findMany({ orderBy: { startDate: 'desc' } }),
      prisma.termination.findMany({ orderBy: { exitDate: 'desc' } }),
    ]);

    const active = employees.filter((e) => e.isActive);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const hiresLast30 = employees.filter((e) => new Date(e.startDate) >= d30).length;
    const hiresLast90 = employees.filter((e) => new Date(e.startDate) >= d90).length;
    const exitsLast90 = terminations.filter((t) => new Date(t.exitDate) >= d90).length;

    // Three exit types — last 90 days
    const voluntaryExitsLast90      = terminations.filter((t) => t.type === 'voluntary'       && new Date(t.exitDate) >= d90).length;
    const involuntaryExitsLast90    = terminations.filter((t) => t.type === 'involuntary'     && new Date(t.exitDate) >= d90).length;
    const mutualAgreementExitsLast90 = terminations.filter((t) => t.type === 'mutual_agreement' && new Date(t.exitDate) >= d90).length;

    // All-time exit type counts
    const voluntaryExits        = terminations.filter((t) => t.type === 'voluntary').length;
    const involuntaryExits      = terminations.filter((t) => t.type === 'involuntary').length;
    const mutualAgreementExits  = terminations.filter((t) => t.type === 'mutual_agreement').length;

    // Probation in progress (end date in future, status not passed/failed)
    const probationInProgress = active.filter((e) =>
      e.probationEndDate && new Date(e.probationEndDate) >= now &&
      (!e.probationStatus || e.probationStatus === 'active')
    ).length;

    const avgTenureDays = active.length
      ? active.reduce((sum, e) => sum + Math.floor((now.getTime() - new Date(e.startDate).getTime()) / 86_400_000), 0) / active.length
      : 0;

    // ── Monthly hiring trend — last 12 months ─────────────────────────────────
    const hiringTrend = Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 1);
      const label = monthDate.toLocaleString('en', { month: 'short', year: '2-digit' });
      const hires = employees.filter((e) => {
        const d = new Date(e.startDate);
        return d >= monthDate && d < nextMonth;
      }).length;
      const exits = terminations.filter((t) => {
        const d = new Date(t.exitDate);
        return d >= monthDate && d < nextMonth;
      }).length;
      return { month: label, hires, exits, net: hires - exits };
    });

    // ── Headcount by department ───────────────────────────────────────────────
    const deptMap: Record<string, number> = {};
    for (const e of active) {
      const dept = e.department || 'Unknown';
      deptMap[dept] = (deptMap[dept] ?? 0) + 1;
    }
    const headcountByDept = Object.entries(deptMap)
      .map(([dept, count]) => ({ dept, count }))
      .sort((a, b) => b.count - a.count);

    // ── Role level distribution ───────────────────────────────────────────────
    const levelMap: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const e of active) levelMap[e.level] = (levelMap[e.level] ?? 0) + 1;
    const levelDist = Object.entries(levelMap).map(([level, count]) => ({
      level,
      label: level === 'C' ? 'C — Directors+' : level === 'B' ? 'B — Managers' : 'A — Specialists',
      count,
    }));

    // ── Tenure distribution ───────────────────────────────────────────────────
    const buckets: Record<string, number> = { '< 3 mo': 0, '3–6 mo': 0, '6–12 mo': 0, '1–2 yr': 0, '2 yr+': 0 };
    for (const e of active) {
      const days = Math.floor((now.getTime() - new Date(e.startDate).getTime()) / 86_400_000);
      if      (days <  90) buckets['< 3 mo']++;
      else if (days < 180) buckets['3–6 mo']++;
      else if (days < 365) buckets['6–12 mo']++;
      else if (days < 730) buckets['1–2 yr']++;
      else                 buckets['2 yr+']++;
    }
    const tenureDist = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

    // ── Recent hires table (last 20) ─────────────────────────────────────────
    const recentHires = employees.slice(0, 20).map((e) => ({
      id: e.id, name: e.name, department: e.department, level: e.level,
      startDate: e.startDate, isActive: e.isActive,
    }));

    return NextResponse.json({
      kpis: {
        totalActive: active.length,
        totalEmployees: employees.length,
        hiresLast30,
        hiresLast90,
        exitsLast90,
        voluntaryExitsLast90,
        involuntaryExitsLast90,
        mutualAgreementExitsLast90,
        avgTenureMonths: Math.round(avgTenureDays / 30),
        voluntaryExits,
        involuntaryExits,
        mutualAgreementExits,
        probationInProgress,
      },
      hiringTrend,
      headcountByDept,
      levelDist,
      tenureDist,
      recentHires,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

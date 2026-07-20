import { NextResponse } from 'next/server';
import {
  readHiringsSheet, parseHiringRecords,
  readOkrSheet, parseOkrLatestWeek, parseOkrWeeklyTrend, parseOkrAllWeeks,
} from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [hiringsRaw, okrRaw] = await Promise.all([
      readHiringsSheet(),
      readOkrSheet(),
    ]);

    // ── Hirings tab ───────────────────────────────────────────────────────────
    const records = parseHiringRecords(hiringsRaw);
    const active  = records.filter((r) => !['hired', 'cancelled'].includes(r.statusGroup));
    const allHired = records.filter((r) => r.statusGroup === 'hired');

    // Hired by quarter & month for 2025 + 2026
    const hiredByPeriod = (year: number) => {
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const byQ: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      const byM: Record<string, number> = {};
      MONTHS.forEach((m) => { byM[m] = 0; });
      for (const r of allHired) {
        const dateStr = r.closedDate || r.openedDate;
        if (!dateStr) continue;
        const parts = dateStr.split('/');
        if (parts.length !== 3 || parseInt(parts[2], 10) !== year) continue;
        const mo = parseInt(parts[1], 10);
        if (mo >= 1  && mo <= 3)  byQ['Q1']++;
        if (mo >= 4  && mo <= 6)  byQ['Q2']++;
        if (mo >= 7  && mo <= 9)  byQ['Q3']++;
        if (mo >= 10 && mo <= 12) byQ['Q4']++;
        if (mo >= 1  && mo <= 12) byM[MONTHS[mo - 1]]++;
      }
      return { byQ, byM };
    };

    // 'open' and 'active' are both "Ongoing" — merged into one count
    const ongoingCount = active.filter((r) => r.statusGroup === 'open' || r.statusGroup === 'active').length;
    const offeredCount = active.filter((r) => r.statusGroup === 'offered').length;
    const onHoldCount  = active.filter((r) => r.statusGroup === 'on_hold').length;
    // Ref check is tracked as a pipeline STAGE in OKR 2026, not as a Hirings status.
    // Calculated after currentWeek is parsed — placeholder here, computed below.

    // Open positions breakdown by complexity level (A / B / C)
    const openByLevel: Record<string, number> = { A: 0, B: 0, C: 0, '': 0 };
    for (const r of active) {
      const lvl = r.complexity || '';
      openByLevel[lvl] = (openByLevel[lvl] ?? 0) + 1;
    }

    // Avg running days — calculated from raw row data only (not sheet formula)
    const runArr = active.filter((r) => r.runningDays != null).map((r) => r.runningDays!);
    const avgRunningDays = runArr.length ? Math.round(runArr.reduce((s, v) => s + v, 0) / runArr.length) : 0;

    // Per complexity-level running days
    const lr: Record<string, { t: number; n: number }> = { A: { t: 0, n: 0 }, B: { t: 0, n: 0 }, C: { t: 0, n: 0 } };
    for (const r of active) {
      if (r.runningDays == null || !lr[r.complexity]) continue;
      lr[r.complexity].t += r.runningDays; lr[r.complexity].n++;
    }
    const avgRunningByLevel: Record<string, number> = {
      A: lr.A.n > 0 ? Math.round(lr.A.t / lr.A.n) : 0,
      B: lr.B.n > 0 ? Math.round(lr.B.t / lr.B.n) : 0,
      C: lr.C.n > 0 ? Math.round(lr.C.t / lr.C.n) : 0,
    };

    // Source breakdown
    const sourceMap: Record<string, number> = {};
    for (const r of allHired.filter((r) => r.source)) {
      sourceMap[r.source.trim()] = (sourceMap[r.source.trim()] ?? 0) + 1;
    }
    const sourceBreakdown = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // By dept (active)
    const deptMap: Record<string, { open: number; active: number; offered: number; on_hold: number }> = {};
    for (const r of active) {
      const dept = r.department || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = { open: 0, active: 0, offered: 0, on_hold: 0 };
      const sg = r.statusGroup as 'open' | 'active' | 'offered' | 'on_hold';
      if (deptMap[dept][sg] !== undefined) deptMap[dept][sg]++;
    }
    const byDept = Object.entries(deptMap)
      .map(([dept, v]) => ({ dept, total: v.open + v.active + v.offered + v.on_hold, ...v }))
      .sort((a, b) => b.total - a.total);

    // Hires per month — last 12 months
    const now = new Date();
    const hiresPerMonth = Array.from({ length: 12 }, (_, i) => {
      const d  = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const label = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      const yyyy  = String(d.getFullYear());
      const mm    = String(d.getMonth() + 1).padStart(2, '0');
      const count = allHired.filter((r) => {
        const ds = r.closedDate || r.openedDate;
        if (!ds) return false;
        const p = ds.split('/');
        return p.length === 3 && p[2] === yyyy && p[1] === mm;
      }).length;
      return { month: label, count };
    });

    // ── OKR 2026 tab ─────────────────────────────────────────────────────────
    const currentWeek = parseOkrLatestWeek(okrRaw);
    const weeklyTrend = parseOkrWeeklyTrend(okrRaw);
    const allWeeks    = parseOkrAllWeeks(okrRaw);

    const weeksDesc     = [...allWeeks].reverse();
    const hiredThisWeek = weeksDesc[0]?.vacancies.filter((v) => v.statusGroup === 'hired').length ?? 0;
    const hiredLastWeek = weeksDesc[1]?.vacancies.filter((v) => v.statusGroup === 'hired').length ?? 0;

    // Ref Check = total candidates at reference check stage in the current OKR week
    const refCheckCount = (currentWeek?.vacancies ?? [])
      .filter((v) => v.statusGroup !== 'hired' && v.statusGroup !== 'closed')
      .reduce((sum, v) => sum + (v.stages.referenceCheck ?? 0), 0);

    // ── Unified vacancy list ───────────────────────────────────────────────────
    // Hirings tracker is the master record; enrich each active role with the
    // pipeline-stage tags from the current OKR week (best-effort name match).
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const okrActiveVacs = (currentWeek?.vacancies ?? []).filter(
      (v) => v.statusGroup !== 'hired' && v.statusGroup !== 'closed'
    );
    const okrStagesFor = (position: string) => {
      const p = norm(position);
      if (!p) return null;
      for (const v of okrActiveVacs) {
        const q = norm(v.position);
        if (!q) continue;
        if (p === q || (p.length > 4 && q.length > 4 && (p.includes(q) || q.includes(p)))) {
          return v.stages;
        }
      }
      return null;
    };
    const yearOf = (r: (typeof records)[number]) => {
      const ds = r.closedDate || r.openedDate || r.quarter || '';
      const m = ds.match(/(20\d{2})/);
      return m ? m[1] : '';
    };
    const allVacancies = records.map((r) => ({
      ...r,
      year: yearOf(r),
      okrStages: ['hired', 'cancelled'].includes(r.statusGroup) ? null : okrStagesFor(r.position),
    }));

    return NextResponse.json({
      summary: {
        totalActive: active.length,
        ongoingCount, offeredCount, onHoldCount,
        refCheckCount, hiredThisWeek, hiredLastWeek,
        openByLevel,
        avgRunningDays, avgRunningByLevel,
        currentWeekVacancies: currentWeek?.vacancies.filter(
          (v) => v.statusGroup !== 'hired' && v.statusGroup !== 'closed'
        ).length ?? 0,
      },
      hiredByYear: { 2025: hiredByPeriod(2025), 2026: hiredByPeriod(2026) },
      active: active.slice(0, 200),
      hired2026Table: allHired.filter((r) =>
        (r.closedDate || r.openedDate || r.quarter || '').includes('2026')
      ).slice(0, 100),
      allVacancies: allVacancies.slice(0, 800),
      sourceBreakdown, byDept, hiresPerMonth,
      currentWeek, weeklyTrend, allWeeks,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

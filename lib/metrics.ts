import { prisma } from './db';
import { computeRAG, getSLALimit, detectRoleLevel } from './sla';
import { readHiringsSheet, parseHiringRecords } from './sheets';

// ── date helpers ──────────────────────────────────────────────────────────────

function parseDMY(s: string): Date | null {
  if (!s) return null;
  const p = s.split('/');
  if (p.length !== 3) return null;
  const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

function avg(arr: number[]): number | null {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function computeAllMetrics() {
  const now = new Date();

  // Fetch everything in parallel
  const [hiringsRaw, activeEmployees, allEmployees, terminations] = await Promise.all([
    readHiringsSheet().catch(() => [] as string[][]),
    prisma.employee.findMany({ where: { isActive: true } }),
    prisma.employee.findMany(),
    prisma.termination.findMany(),
  ]);

  const records = parseHiringRecords(hiringsRaw);
  const active  = records.filter((r) => !['hired', 'cancelled'].includes(r.statusGroup));
  const hired   = records.filter((r) => r.statusGroup === 'hired');

  // ── Headcount ────────────────────────────────────────────────────────────────
  const totalHeadcount = activeEmployees.length;

  // ── Open roles ───────────────────────────────────────────────────────────────
  const openRoles = active.length;

  // ── Overall + per-level metrics (all-time) ───────────────────────────────────
  const levelTTF: Record<string, number[]> = { A: [], B: [], C: [], '': [] };
  const levelTTH: Record<string, number[]> = { A: [], B: [], C: [], '': [] };

  for (const r of hired) {
    const lvl = r.complexity || '';
    const o = parseDMY(r.openedDate), c = parseDMY(r.closedDate);
    if (o && c) {
      const d = daysBetween(o, c);
      if (d > 0 && d < 730) {
        if (levelTTF[lvl] !== undefined) levelTTF[lvl].push(d);
        levelTTF[''].push(d); // all combined
      }
    }
    const of2 = parseDMY(r.offerSentDate);
    if (of2 && c) {
      const d = daysBetween(of2, c);
      if (d >= 0 && d < 365) {
        if (levelTTH[lvl] !== undefined) levelTTH[lvl].push(d);
        levelTTH[''].push(d);
      }
    }
  }

  const avgTimeToFill       = avg(levelTTF['']);
  const avgTimeToHire       = avg(levelTTH['']);
  const avgTTFByLevel = { A: avg(levelTTF.A), B: avg(levelTTF.B), C: avg(levelTTF.C) };
  const avgTTHByLevel = { A: avg(levelTTH.A), B: avg(levelTTH.B), C: avg(levelTTH.C) };

  const withOffer   = records.filter((r) => r.offerAccepted !== null);
  const acceptedAll = withOffer.filter((r) => r.offerAccepted === true).length;
  const offerAcceptanceRate = withOffer.length > 0
    ? Math.round((acceptedAll / withOffer.length) * 1000) / 10
    : null;

  // ── Probation ────────────────────────────────────────────────────────────────
  const probationInProgress = activeEmployees.filter((e) =>
    e.probationEndDate && new Date(e.probationEndDate) >= now
  ).length;
  const probationEnded = activeEmployees.filter((e) =>
    e.probationEndDate && new Date(e.probationEndDate) < now && e.probationStatus != null
  ).length;
  const probationPassed = activeEmployees.filter((e) => e.probationStatus === 'passed').length;
  const probationSuccessRate = probationEnded > 0
    ? Math.round((probationPassed / probationEnded) * 1000) / 10
    : null;

  // ── Early Attrition ──────────────────────────────────────────────────────────
  const earlyAttritionCount = terminations.filter((t) => t.tenureDays <= 90).length;

  // ── SLA breakdown — from Google Sheets active pipeline ───────────────────────
  const slaData = active.map((r) => {
    const level = (['A','B','C'].includes(r.complexity)
      ? r.complexity
      : detectRoleLevel(r.position)) as 'A' | 'B' | 'C';
    const daysOpen  = r.runningDays ?? 0;
    const rag       = computeRAG(level, daysOpen);
    const slaLimit  = getSLALimit(level);
    return {
      id: `${r.position}-${r.openedDate}`,
      title: r.position, department: r.department, level,
      daysOpen, rag, slaLimit, hiringManager: r.hiringManager || null,
    };
  });

  const slaBreakdown = {
    green: slaData.filter((p) => p.rag === 'green').length,
    amber: slaData.filter((p) => p.rag === 'amber').length,
    red:   slaData.filter((p) => p.rag === 'red').length,
  };
  const topSLABreaches = slaData
    .filter((p) => p.rag === 'red' || p.rag === 'amber')
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .slice(0, 10);

  // ── Monthly recruitment trends — last 18 months ───────────────────────────────
  const monthlyRecruitment = Array.from({ length: 18 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (17 - i), 1);
    const yyyy  = String(d.getFullYear());
    const mm    = String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleString('en', { month: 'short', year: '2-digit' });

    const monthHired = hired.filter((r) => {
      const ds = r.closedDate || r.openedDate;
      if (!ds) return false;
      const p = ds.split('/');
      return p.length === 3 && p[2] === yyyy && p[1] === mm;
    });

    const ttfArr = monthHired.flatMap((r) => {
      const o = parseDMY(r.openedDate), c = parseDMY(r.closedDate);
      if (!o || !c) return [];
      const d2 = daysBetween(o, c);
      return d2 > 0 && d2 < 730 ? [d2] : [];
    });
    const tthArr = monthHired.flatMap((r) => {
      const o = parseDMY(r.offerSentDate), c = parseDMY(r.closedDate);
      if (!o || !c) return [];
      const d2 = daysBetween(o, c);
      return d2 >= 0 && d2 < 365 ? [d2] : [];
    });
    const withOfferM   = monthHired.filter((r) => r.offerAccepted !== null);
    const acceptedM    = withOfferM.filter((r) => r.offerAccepted === true).length;
    const rejectedM    = withOfferM.filter((r) => r.offerAccepted === false).length;

    return {
      month: label,
      yearMonth: `${yyyy}-${mm}`,
      hiredCount:         monthHired.length,
      avgTimeToFill:      avg(ttfArr),
      avgTimeToHire:      avg(tthArr),
      offerAcceptancePct: withOfferM.length > 0
        ? Math.round((acceptedM / withOfferM.length) * 100) : null,
      offerSentCount:     withOfferM.length,
      offerRejectedCount: rejectedM,
    };
  });

  // ── Monthly probation outcomes — last 18 months ───────────────────────────────
  const monthlyProbation = Array.from({ length: 18 }, (_, i) => {
    const d        = new Date(now.getFullYear(), now.getMonth() - (17 - i), 1);
    const nextMo   = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label    = d.toLocaleString('en', { month: 'short', year: '2-digit' });

    const probEndedThisMonth = allEmployees.filter((e) =>
      e.probationEndDate &&
      new Date(e.probationEndDate) >= d &&
      new Date(e.probationEndDate) < nextMo
    );

    // Exits this month — from termination records
    const exitsThisMonth = terminations.filter((t) => {
      const ed = new Date(t.exitDate);
      return ed >= d && ed < nextMo;
    });

    return {
      month: label,
      yearMonth: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      probationPassed:   probEndedThisMonth.filter((e) => e.probationStatus === 'passed').length,
      probationFailed:   probEndedThisMonth.filter((e) => e.probationStatus === 'failed').length,
      probationExtended: probEndedThisMonth.filter((e) => e.probationStatus === 'extended').length,
      exitsVoluntary:    exitsThisMonth.filter((t) => t.type === 'voluntary').length,
      exitsInvoluntary:  exitsThisMonth.filter((t) => t.type === 'involuntary').length,
      exitsMutual:       exitsThisMonth.filter((t) => t.type === 'mutual_agreement').length,
      totalExits:        exitsThisMonth.length,
    };
  });

  // ── Headcount Delta (last 6 months) ──────────────────────────────────────────
  const headcountDelta = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date();
    d.setMonth(d.getMonth() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const hires = await prisma.employee.count({ where: { startDate: { gte: start, lte: end } } });
    const exits = await prisma.termination.count({ where: { exitDate: { gte: start, lte: end } } });
    headcountDelta.push({
      month: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
      hires, exits, net: hires - exits,
    });
  }

  const offerRejectedCount = withOffer.filter((r) => r.offerAccepted === false).length;

  // ── Record-level hire events — enables Day/Week/Month bucketing client-side ────
  const dmyToISO = (ds: string): string | null => {
    const p = (ds || '').split('/');
    if (p.length !== 3) return null;
    const [d, m, y] = p;
    if (y.length !== 4) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };
  const hireEvents = hired.flatMap((r) => {
    const iso = dmyToISO(r.closedDate || r.openedDate);
    if (!iso) return [];
    const o = parseDMY(r.openedDate), c = parseDMY(r.closedDate);
    let ttf: number | null = null;
    if (o && c) { const d = daysBetween(o, c); ttf = d > 0 && d < 730 ? d : null; }
    const of2 = parseDMY(r.offerSentDate);
    let tth: number | null = null;
    if (of2 && c) { const d = daysBetween(of2, c); tth = d >= 0 && d < 365 ? d : null; }
    return [{
      date: iso,
      level: ['A', 'B', 'C'].includes(r.complexity) ? r.complexity : '',
      ttf, tth,
      offerDecided: r.offerAccepted !== null,
      offerAccepted: r.offerAccepted === true,
    }];
  });

  return {
    totalHeadcount, openRoles,
    avgTimeToFill, avgTimeToHire,
    avgTTFByLevel, avgTTHByLevel,
    offerAcceptanceRate, probationSuccessRate, probationInProgress,
    offerSentCount: withOffer.length,
    offerAcceptedCount: acceptedAll,
    offerRejectedCount,
    earlyAttritionCount,
    slaBreakdown, topSLABreaches, headcountDelta,
    monthlyRecruitment, monthlyProbation,
    hireEvents,
  };
}

export async function computeAndSaveSnapshot() {
  const metrics = await computeAllMetrics();
  const today   = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailySnapshot.upsert({
    where: { date: today },
    create: {
      date: today,
      totalHeadcount:       metrics.totalHeadcount,
      openRoles:            metrics.openRoles,
      avgTimeToFill:        metrics.avgTimeToFill,
      avgTimeToHire:        metrics.avgTimeToHire,
      offerAcceptanceRate:  metrics.offerAcceptanceRate,
      probationSuccessRate: metrics.probationSuccessRate,
      earlyAttritionCount:  metrics.earlyAttritionCount,
    },
    update: {
      totalHeadcount:       metrics.totalHeadcount,
      openRoles:            metrics.openRoles,
      avgTimeToFill:        metrics.avgTimeToFill,
      avgTimeToHire:        metrics.avgTimeToHire,
      offerAcceptanceRate:  metrics.offerAcceptanceRate,
      probationSuccessRate: metrics.probationSuccessRate,
      earlyAttritionCount:  metrics.earlyAttritionCount,
      syncedAt:             new Date(),
    },
  });
  return metrics;
}

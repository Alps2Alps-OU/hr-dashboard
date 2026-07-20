import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [thisMonthExits, last90Exits, allTerminations] = await Promise.all([
      prisma.termination.findMany({ where: { exitDate: { gte: monthStart } }, include: { employee: true } }),
      prisma.termination.findMany({ where: { exitDate: { gte: ninetyDaysAgo } }, include: { employee: true } }),
      prisma.termination.findMany({ include: { employee: true }, orderBy: { exitDate: 'desc' } }),
    ]);

    const voluntary90 = last90Exits.filter((t) => t.type === 'voluntary').length;
    const voluntaryPct = last90Exits.length > 0 ? Math.round((voluntary90 / last90Exits.length) * 1000) / 10 : null;
    const avgTenureDays = allTerminations.length > 0
      ? Math.round(allTerminations.reduce((a, b) => a + b.tenureDays, 0) / allTerminations.length)
      : null;

    const reasonMap: Record<string, number> = {};
    for (const t of allTerminations) {
      const r = t.reason ?? 'Not specified';
      reasonMap[r] = (reasonMap[r] ?? 0) + 1;
    }

    const headcountDelta = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const hires = await prisma.employee.count({ where: { startDate: { gte: start, lte: end } } });
      const exits = await prisma.termination.count({ where: { exitDate: { gte: start, lte: end } } });
      headcountDelta.push({ month: start.toLocaleString('default', { month: 'short', year: '2-digit' }), hires, exits, net: hires - exits });
    }

    return NextResponse.json({
      exitsThisMonth: thisMonthExits.length, exitsLast90Days: last90Exits.length,
      voluntaryPct, avgTenureDays,
      voluntaryCount: allTerminations.filter((t) => t.type === 'voluntary').length,
      involuntaryCount: allTerminations.filter((t) => t.type === 'involuntary').length,
      mutualAgreementCount: allTerminations.filter((t) => t.type === 'mutual_agreement').length,
      exitReasons: Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
      headcountDelta, terminations: allTerminations,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

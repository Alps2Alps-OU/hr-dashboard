import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeRAG, getDaysOpen, getSLALimit } from '@/lib/sla';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [openPositions, candidates, employees, tasks, initiatives] = await Promise.all([
      prisma.position.findMany({ where: { status: 'open' } }),
      prisma.candidate.findMany(),
      prisma.employee.findMany({ where: { probationEndDate: { gt: now }, isActive: true } }),
      prisma.onboardingTask.findMany({ where: { status: 'overdue' }, include: { employee: true } }),
      prisma.hRInitiative.findMany({ where: { ragStatus: 'red' } }),
    ]);

    const enriched = openPositions.map((pos) => {
      const level = pos.level as 'A' | 'B' | 'C';
      const daysOpen = getDaysOpen(pos.openedDate);
      const rag = computeRAG(level, daysOpen);
      const slaLimit = getSLALimit(level);
      return { ...pos, daysOpen, rag, slaLimit, daysOverLimit: daysOpen - slaLimit };
    });

    const recentWithOffer = candidates.filter((c) => c.offerDate && new Date(c.offerDate) >= thirtyDaysAgo).length;
    const recentAccepted = candidates.filter((c) => c.offerDate && new Date(c.offerDate) >= thirtyDaysAgo && c.offerAccepted === true).length;
    const recentOfferRate = recentWithOffer > 0 ? Math.round((recentAccepted / recentWithOffer) * 1000) / 10 : null;

    const probationExpiring = employees.map((e) => ({
      ...e,
      daysRemaining: e.probationEndDate ? Math.floor((new Date(e.probationEndDate).getTime() - now.getTime()) / 86400000) : 999,
    })).filter((e) => e.daysRemaining <= 7).sort((a, b) => a.daysRemaining - b.daysRemaining);

    return NextResponse.json({
      slaRed: enriched.filter((p) => p.rag === 'red').sort((a, b) => b.daysOverLimit - a.daysOverLimit),
      slaAmber: enriched.filter((p) => p.rag === 'amber').sort((a, b) => b.daysOpen - a.daysOpen),
      offerAlert: recentOfferRate !== null && recentOfferRate < 80,
      recentOfferRate,
      probationExpiring,
      overdueTasks: tasks.map((t) => ({ ...t, daysOverdue: t.dueDate ? Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / 86400000) : 0 })),
      blockedInitiatives: initiatives,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

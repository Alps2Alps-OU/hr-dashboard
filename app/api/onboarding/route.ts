import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [newHires, inProbation, tasks, earlyAttrition] = await Promise.all([
      prisma.employee.findMany({ where: { startDate: { gte: monthStart }, isActive: true }, orderBy: { startDate: 'desc' } }),
      prisma.employee.findMany({ where: { probationEndDate: { gt: now }, isActive: true, probationStatus: { in: ['active', null] } }, orderBy: { probationEndDate: 'asc' } }),
      prisma.onboardingTask.findMany({ include: { employee: true }, orderBy: { dueDate: 'asc' } }),
      prisma.termination.findMany({ where: { tenureDays: { lte: 90 } }, include: { employee: true }, orderBy: { exitDate: 'desc' } }),
    ]);

    const probationEnded = await prisma.employee.count({ where: { probationEndDate: { lt: now }, probationStatus: { not: null } } });
    const probationPassed = await prisma.employee.count({ where: { probationStatus: 'passed' } });
    const probationSuccessRate = probationEnded > 0 ? Math.round((probationPassed / probationEnded) * 1000) / 10 : null;

    const completedOnTime = tasks.filter((t) =>
      t.status === 'completed' && (!t.dueDate || !t.completedDate || t.completedDate <= t.dueDate)
    ).length;
    const completionRate = tasks.length > 0 ? Math.round((completedOnTime / tasks.length) * 1000) / 10 : null;

    const overdueTasks = tasks.filter((t) => t.status === 'overdue').map((t) => ({
      ...t, daysOverdue: t.dueDate ? Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / 86400000) : 0,
    }));

    const probationTracker = inProbation.map((e) => ({
      ...e, daysRemaining: e.probationEndDate
        ? Math.floor((new Date(e.probationEndDate).getTime() - now.getTime()) / 86400000)
        : null,
    }));

    return NextResponse.json({
      newHires, newHiresCount: newHires.length, inProbationCount: inProbation.length,
      probationSuccessRate, completionRate, overdueTasks, probationTracker,
      earlyAttrition, earlyAttritionCount: earlyAttrition.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

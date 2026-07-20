import { NextResponse } from 'next/server';
import { computeAllMetrics } from '@/lib/metrics';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [metrics, lastSnapshot] = await Promise.all([
      computeAllMetrics(),
      prisma.dailySnapshot.findFirst({ orderBy: { date: 'desc' } }),
    ]);
    return NextResponse.json({ ...metrics, lastSnapshot });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

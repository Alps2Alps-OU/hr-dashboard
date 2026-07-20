import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const source = (req.nextUrl.searchParams.get('source') ?? 'all') as
    'all' | 'peopleforce' | 'invoices' | 'asana' | 'notion' | 'engagement';
  try {
    const results = await runSync(source);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  const { prisma } = await import('@/lib/db');
  const logs = await prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 20 });
  return NextResponse.json({ logs });
}

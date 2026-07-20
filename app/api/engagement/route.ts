import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeEnps, enpsBand } from '@/lib/engagement';

export const dynamic = 'force-dynamic';

// All derived series are computed here in app code — never by AI (PRD requirement).

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function participationRate(responses: number, invited: number | null): number | null {
  if (!invited || invited <= 0) return null;
  return Math.round((responses / invited) * 100);
}

export async function GET() {
  try {
    const rows = await prisma.engagementSurvey.findMany({ orderBy: { surveyDate: 'asc' } });

    if (rows.length === 0) {
      return NextResponse.json({ isEmpty: true, latest: null, previous: null, comparison: null, trend: [], surveys: [], insight: null });
    }

    const surveys = rows.map((s) => ({
      id: s.id,
      period: s.period,
      surveyDate: s.surveyDate.toISOString(),
      enps: s.enps,
      band: enpsBand(s.enps),
      avgScore: s.avgScore,
      hasEnps: s.promoters + s.passives + s.detractors > 0,
      promoters: s.promoters,
      passives: s.passives,
      detractors: s.detractors,
      responses: s.responses,
      invitedCount: s.invitedCount,
      participationRate: participationRate(s.responses, s.invitedCount),
      categoryScores: parseJson<Record<string, number>>(s.categoryScores),
      commentThemes: parseJson<string[]>(s.commentThemes),
      sourceType: s.sourceType,
    }));

    // Standard-eNPS cards/trend only use surveys that actually carry a promoter/detractor split.
    const withEnps = surveys.filter((s) => s.hasEnps);
    const latest = withEnps.length ? withEnps[withEnps.length - 1] : null;
    const previous = withEnps.length > 1 ? withEnps[withEnps.length - 2] : null;

    if (!latest) {
      // Surveys exist but none has a Standard eNPS yet (older avg/10-only decks).
      return NextResponse.json({ isEmpty: true, latest: null, previous: null, comparison: null, trend: [], surveys, insight: null });
    }

    // eNPS trend (period → score) + promoter/passive/detractor as % of responses
    const trend = withEnps.map((s) => {
      const total = s.promoters + s.passives + s.detractors;
      const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
      return {
        period: s.period,
        enps: s.enps,
        promoterPct: pct(s.promoters),
        passivePct: pct(s.passives),
        detractorPct: pct(s.detractors),
      };
    });

    // Latest-vs-previous comparison (all deltas computed here)
    let comparison = null;
    if (previous) {
      const catNames = new Set([
        ...Object.keys(latest.categoryScores ?? {}),
        ...Object.keys(previous.categoryScores ?? {}),
      ]);
      comparison = {
        fromPeriod: previous.period,
        toPeriod: latest.period,
        enps: { latest: latest.enps, previous: previous.enps, delta: latest.enps - previous.enps },
        promoters: { latest: latest.promoters, previous: previous.promoters, delta: latest.promoters - previous.promoters },
        passives: { latest: latest.passives, previous: previous.passives, delta: latest.passives - previous.passives },
        detractors: { latest: latest.detractors, previous: previous.detractors, delta: latest.detractors - previous.detractors },
        participationRate: {
          latest: latest.participationRate,
          previous: previous.participationRate,
          delta: latest.participationRate != null && previous.participationRate != null
            ? latest.participationRate - previous.participationRate : null,
        },
        categories: Array.from(catNames).map((name) => {
          const l = latest.categoryScores?.[name] ?? null;
          const p = previous.categoryScores?.[name] ?? null;
          return { name, latest: l, previous: p, delta: l != null && p != null ? Math.round((l - p) * 10) / 10 : null };
        }),
      };
    }

    // The AI insight lives on the latest Standard-eNPS survey record
    const insight = rows.find((r) => r.id === latest.id)?.aiInsight ?? null;

    return NextResponse.json({ isEmpty: false, latest, previous, comparison, trend, surveys, insight });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Manual entry / correction — upsert one survey by period. eNPS recomputed from counts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const period = String(body.period ?? '').trim();
    if (!period) return NextResponse.json({ error: 'period is required (e.g. "2026-Q2")' }, { status: 400 });

    const promoters = Number(body.promoters) || 0;
    const passives = Number(body.passives) || 0;
    const detractors = Number(body.detractors) || 0;
    const total = promoters + passives + detractors;
    if (total <= 0) return NextResponse.json({ error: 'promoters/passives/detractors must sum to > 0' }, { status: 400 });

    const surveyDate = body.surveyDate ? new Date(body.surveyDate) : new Date();
    if (isNaN(surveyDate.getTime())) return NextResponse.json({ error: 'invalid surveyDate' }, { status: 400 });

    const enps = computeEnps(promoters, passives, detractors);
    const responses = Number(body.responses) || total;
    const invitedCount = body.invitedCount != null ? Number(body.invitedCount) : null;
    const categoryScores = body.categoryScores ? JSON.stringify(body.categoryScores) : null;
    const commentThemes = body.commentThemes ? JSON.stringify(body.commentThemes) : null;

    const survey = await prisma.engagementSurvey.upsert({
      where: { period },
      create: { period, surveyDate, enps, promoters, passives, detractors, responses, invitedCount, categoryScores, commentThemes, sourceType: 'manual' },
      update: { surveyDate, enps, promoters, passives, detractors, responses, invitedCount, categoryScores, commentThemes, sourceType: 'manual', extractedAt: new Date() },
    });

    return NextResponse.json({ ok: true, survey });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

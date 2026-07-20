import { prisma } from '../lib/db';
import { computeEnps } from '../lib/engagement';

// Demo engagement surveys so the Employee Engagement tab is reviewable before a
// real Asana source is wired. Safe to re-run — upserts by period. Marked sourceType "seed".

interface SeedSurvey {
  period: string; surveyDate: string;
  promoters: number; passives: number; detractors: number; invitedCount: number;
  categoryScores: Record<string, number>;
  commentThemes?: string[];
  aiInsight?: string;
}

const SEED: SeedSurvey[] = [
  {
    period: '2025-Q3', surveyDate: '2025-09-30',
    promoters: 18, passives: 14, detractors: 8, invitedCount: 52,
    categoryScores: { Management: 7.2, Growth: 6.1, Recognition: 5.8, 'Work-Life Balance': 7.0, Culture: 7.6 },
    commentThemes: ['career growth', 'workload'],
  },
  {
    period: '2025-Q4', surveyDate: '2025-12-20',
    promoters: 16, passives: 15, detractors: 11, invitedCount: 55,
    categoryScores: { Management: 6.9, Growth: 5.7, Recognition: 5.5, 'Work-Life Balance': 6.4, Culture: 7.3 },
    commentThemes: ['workload', 'recognition', 'year-end burnout'],
  },
  {
    period: '2026-Q1', surveyDate: '2026-03-28',
    promoters: 24, passives: 12, detractors: 7, invitedCount: 56,
    categoryScores: { Management: 7.6, Growth: 6.8, Recognition: 6.4, 'Work-Life Balance': 7.1, Culture: 8.0 },
    commentThemes: ['career growth', 'onboarding'],
  },
  {
    period: '2026-Q2', surveyDate: '2026-06-27',
    promoters: 27, passives: 11, detractors: 6, invitedCount: 58,
    categoryScores: { Management: 7.9, Growth: 7.2, Recognition: 6.9, 'Work-Life Balance': 7.4, Culture: 8.2 },
    commentThemes: ['career growth', 'compensation'],
    aiInsight:
      'eNPS has climbed steadily since the Q4 2025 dip, reaching its highest point this quarter as detractors fell to their lowest count. The recovery is broad-based, but Recognition remains the weakest driver despite improving — worth pairing the positive momentum with a concrete recognition programme before it caps further gains.',
  },
];

async function main() {
  for (const s of SEED) {
    const enps = computeEnps(s.promoters, s.passives, s.detractors);
    const responses = s.promoters + s.passives + s.detractors;
    await prisma.engagementSurvey.upsert({
      where: { period: s.period },
      create: {
        period: s.period, surveyDate: new Date(s.surveyDate), enps,
        promoters: s.promoters, passives: s.passives, detractors: s.detractors,
        responses, invitedCount: s.invitedCount,
        categoryScores: JSON.stringify(s.categoryScores),
        commentThemes: s.commentThemes ? JSON.stringify(s.commentThemes) : null,
        aiInsight: s.aiInsight ?? null,
        sourceType: 'seed',
      },
      update: {
        surveyDate: new Date(s.surveyDate), enps,
        promoters: s.promoters, passives: s.passives, detractors: s.detractors,
        responses, invitedCount: s.invitedCount,
        categoryScores: JSON.stringify(s.categoryScores),
        commentThemes: s.commentThemes ? JSON.stringify(s.commentThemes) : null,
        aiInsight: s.aiInsight ?? null,
        sourceType: 'seed', extractedAt: new Date(),
      },
    });
    console.log(`[Seed] ${s.period}: eNPS ${enps > 0 ? '+' : ''}${enps} (${responses} responses)`);
  }
  console.log(`[Seed] ${SEED.length} engagement surveys seeded.`);
  process.exit(0);
}

main().catch((e) => { console.error('[Seed] Fatal:', e); process.exit(1); });

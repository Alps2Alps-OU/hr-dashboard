import { prisma } from '../lib/db';
import { computeEnps } from '../lib/engagement';

// Loads the real eNPS survey data (Q1 2026 onward) with figures read directly from
// the presentations. Used because the OPENROUTER_API_KEY is currently invalid (401)
// so the automated AI-extraction step can't run. Once a valid key is in place,
// `POST /api/sync?source=engagement` (or the local ingest script) will refresh these
// from the decks automatically. Also prunes anything before ENGAGEMENT_START_PERIOD.

const START_PERIOD = process.env.ENGAGEMENT_START_PERIOD || '2026-Q1';

async function main() {
  // ── Q1 2026 — full deck: Standard eNPS 58/32/10, 88% response (69/78), 18 pulse dims ──
  const promoters = 40, passives = 22, detractors = 7; // 58% / 32% / 10% of 69 respondents
  const enps = computeEnps(promoters, passives, detractors); // → +48
  const pulse = {
    'HR support': 86, 'Psychological safety': 85, 'Leadership trust': 82, 'Role clarity': 82,
    'Motivation': 82, 'Onboarding': 80, 'Recognition': 79, 'Team collaboration': 79,
    'Tools & processes': 79, 'Growth opportunities': 78, 'Communications': 77, 'Manager dev support': 76,
    'Salary satisfaction': 75, 'Mission connection': 75, 'Feedback quality': 74, 'Change management': 73,
    'Workload': 71, 'Work-life balance': 71,
  };
  const themes = ['work-life balance', 'workload', 'change management', 'communication transparency'];
  const insight =
    "Q1 2026's Standard eNPS of +48 sits well above the ~+30 industry benchmark, even as the internal average score eased from 9.0 (Q3 2025) to 8.6/10. Psychological safety (85) and HR support (86) are clear strengths to build on. The pressure points are Work-life balance and Workload (both 71) and Change management (73) — consistent with comments about a high pace of change — and are where leadership attention will move the needle most next quarter.";

  await prisma.engagementSurvey.upsert({
    where: { period: '2026-Q1' },
    create: { period: '2026-Q1', surveyDate: new Date('2026-03-31'), enps, avgScore: 8.6,
      promoters, passives, detractors, responses: 69, invitedCount: 78,
      categoryScores: JSON.stringify(pulse), commentThemes: JSON.stringify(themes),
      aiInsight: insight, sourceType: 'upload', sourceRef: 'local:Q1-2026' },
    update: { surveyDate: new Date('2026-03-31'), enps, avgScore: 8.6,
      promoters, passives, detractors, responses: 69, invitedCount: 78,
      categoryScores: JSON.stringify(pulse), commentThemes: JSON.stringify(themes),
      aiInsight: insight, sourceType: 'upload', sourceRef: 'local:Q1-2026', extractedAt: new Date() },
  });

  // Drop demo seed rows and anything before the reporting-window start (e.g. 2025 surveys).
  const removed = await prisma.engagementSurvey.deleteMany({
    where: { OR: [{ sourceType: 'seed' }, { period: { lt: START_PERIOD } }] },
  });
  console.log(`[Load] Q1 2026 loaded (eNPS = +${enps}). Removed ${removed.count} pre-${START_PERIOD}/seed rows.`);
  process.exit(0);
}

main().catch((e) => { console.error('[Load] Fatal:', e); process.exit(1); });

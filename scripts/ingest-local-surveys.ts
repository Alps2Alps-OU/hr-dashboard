import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { prisma } from '../lib/db';
import { parsePptxText, ingestDeckText, generateEngagementInsight } from '../lib/engagement';

// Ingest eNPS survey result decks (.pptx) from local files into the dashboard DB.
// Reuses the SAME extraction path as the Google Drive sync (parsePptxText + ingestDeckText),
// so this both loads data now and validates that pipeline. Usage:
//   ts-node --project tsconfig.scripts.json scripts/ingest-local-surveys.ts <file1.pptx> <file2.pptx> ...

// Minimal .env.local loader (dotenv isn't installed) — needed for OPENROUTER_API_KEY.
function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DEFAULT_FILES = [
  'C:\\Users\\Karen\\Downloads\\Engagament survey, Summery of Q1, 2025 (1).pptx',
  'C:\\Users\\Karen\\Downloads\\Q1_2026_Engagement_Survey_FINAL.pptx',
  'C:\\Users\\Karen\\Downloads\\Engagament survey, Summery of Q3  2025 (2).pptx',
];

async function main() {
  loadEnv();
  const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;

  let parsed = 0;
  for (const path of files) {
    if (!existsSync(path)) { console.warn(`[Ingest] Missing file, skipping: ${path}`); continue; }
    try {
      const text = await parsePptxText(readFileSync(path));
      console.log(`[Ingest] ${basename(path)} → ${text.length} chars of slide text`);
      const res = await ingestDeckText(text, `local:${basename(path)}`, 'upload');
      if (res) { console.log(`[Ingest]   → stored ${res.period}: eNPS ${res.enps}`); parsed++; }
      else console.log(`[Ingest]   → skipped (unchanged or no period)`);
    } catch (e) {
      console.error(`[Ingest] Failed on ${basename(path)}:`, e instanceof Error ? e.message : e);
    }
  }

  if (parsed > 0) {
    const removed = await prisma.engagementSurvey.deleteMany({ where: { sourceType: 'seed' } });
    if (removed.count) console.log(`[Ingest] Removed ${removed.count} demo seed rows.`);
    const insight = await generateEngagementInsight();
    console.log(`[Ingest] Leadership insight: ${insight ? 'generated' : 'skipped'}`);
  }

  console.log(`[Ingest] Done — ${parsed} survey(s) ingested.`);
  process.exit(0);
}

main().catch((e) => { console.error('[Ingest] Fatal:', e); process.exit(1); });

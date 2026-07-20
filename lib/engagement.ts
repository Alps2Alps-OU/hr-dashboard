/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';
import { google } from 'googleapis';
import JSZip from 'jszip';
import { prisma } from './db';

// ── eNPS math (the single source of the formula — never computed by AI) ─────────

/** Standard eNPS = %promoters − %detractors, rounded. Range −100…+100. */
export function computeEnps(promoters: number, passives: number, detractors: number): number {
  const total = promoters + passives + detractors;
  if (total <= 0) return 0;
  return Math.round(((promoters - detractors) / total) * 100);
}

/** Colour band for an eNPS score — shared contract with the UI. */
export function enpsBand(enps: number): 'red' | 'amber' | 'green' {
  if (enps < 0) return 'red';
  if (enps < 30) return 'amber';
  return 'green';
}

// ── Google Drive auth (identical pattern to lib/invoices.ts) ────────────────────

function getDriveAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  let creds: Record<string, unknown>;
  try { creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
  catch { creds = JSON.parse(raw); }
  return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
}

// ── PPTX text extraction (pptx = a zip of slide XML) ────────────────────────────

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

export async function parsePptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));

  const parts: string[] = [];
  const re = /<a:t>([^<]*)<\/a:t>/g;
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string');
    const runs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const t = m[1].replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (e: string) => XML_ENTITIES[e] ?? e);
      if (t) runs.push(t);
    }
    re.lastIndex = 0;
    if (runs.length) parts.push(runs.join(' '));
  }
  return parts.join('\n');
}

// ── Period helpers ──────────────────────────────────────────────────────────────

/** Normalise "Q1 2026", "Q1, 2026", "2026 Q1", "Q3 2025" → "2026-Q1". */
function normalizePeriod(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/Q\s*([1-4]).{0,4}(20\d{2})/i) || raw.match(/(20\d{2}).{0,4}Q\s*([1-4])/i);
  if (!m) return null;
  // First regex → [_, q, year]; second → [_, year, q]
  const [q, year] = /^Q/i.test(m[0].trim()) ? [m[1], m[2]] : [m[2], m[1]];
  return `${year}-Q${q}`;
}

/** Last day of the quarter for a "YYYY-Qn" period. */
function quarterEndDate(period: string): Date {
  const [year, q] = period.split('-Q');
  const endMonth = Number(q) * 3; // Q1→3, Q2→6, ...
  return new Date(Date.UTC(Number(year), endMonth, 0));
}

// ── Extracted survey shape ──────────────────────────────────────────────────────

interface ExtractedSurvey {
  period: string | null;
  responses: number | null;
  invited: number | null;
  responseRatePct: number | null;
  promoterPct: number | null;
  passivePct: number | null;
  detractorPct: number | null;
  standardEnps: number | null;   // ±100, if the deck states it directly
  avgScore: number | null;       // the legacy "eNPS score" out of 10
  pulseScores: Record<string, number> | null; // dimension → 0-100
  commentThemes: string[] | null;
}

// ── AI extraction (reads figures already present in the deck) ───────────────────

async function extractSurveyWithAI(text: string): Promise<ExtractedSurvey | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'HR Dashboard',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content:
`You are reading an Amitours employee engagement / eNPS survey results presentation. Extract ONLY figures that already appear in the text — never calculate or invent. Return ONLY a JSON object, no markdown:
{
  "period": string|null,            // survey period the deck summarises, e.g. "Q1 2026" or "Q3 2025"
  "responses": number|null,         // number of respondents (e.g. from "69/78" -> 69)
  "invited": number|null,           // employees invited (e.g. from "69/78" -> 78)
  "responseRatePct": number|null,   // participation / response rate %
  "promoterPct": number|null,       // % promoters (Standard eNPS breakdown, 9-10)
  "passivePct": number|null,        // % passives (7-8)
  "detractorPct": number|null,      // % detractors (0-6)
  "standardEnps": number|null,      // the ±100 "Standard eNPS" if stated
  "avgScore": number|null,          // the "eNPS score" average out of 10 for THIS period (not prior periods)
  "pulseScores": object|null,       // dimension -> score 0-100, e.g. {"Leadership trust":82,"Recognition":79}
  "commentThemes": string[]|null    // short recurring qualitative themes if listed
}
Rules: If a "Standard eNPS" promoter/passive/detractor split is shown, fill promoterPct/passivePct/detractorPct. Older decks may only have an out-of-10 score and participation — then fill avgScore + responseRatePct and leave the promoter fields null. Use null for anything absent.

Survey text:
${text.slice(0, 14000)}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message?.content?.trim() ?? '';
  try {
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}') + 1;
    return JSON.parse(raw.slice(start, end)) as ExtractedSurvey;
  } catch {
    console.error('[Engagement] Failed to parse AI response:', raw.slice(0, 300));
    return null;
  }
}

// ── Shared per-deck ingest (used by Drive sync AND local-file ingestion) ────────

/**
 * Extract one deck's text into an EngagementSurvey row. App computes eNPS; AI only
 * reads figures. Skips work when the deck content hash is unchanged. Returns the
 * period+enps on write, or null when skipped/unusable.
 */
export async function ingestDeckText(
  text: string, sourceRef: string, sourceType = 'drive',
): Promise<{ period: string; enps: number } | null> {
  if (!text.trim()) return null;

  const contentHash = createHash('sha256').update(text).digest('hex');
  const existing = await prisma.engagementSurvey.findFirst({ where: { sourceRef } });
  if (existing?.contentHash === contentHash) return null; // unchanged deck

  const ex = await extractSurveyWithAI(text);
  if (!ex) return null;

  const period = normalizePeriod(ex.period);
  if (!period) { console.warn('[Engagement] Could not derive period from deck content'); return null; }

  // Reporting-window cutoff — ignore surveys before the configured start (default 2026-Q1).
  // "YYYY-Qn" sorts lexicographically, so a string compare is correct here.
  const startPeriod = process.env.ENGAGEMENT_START_PERIOD || '2026-Q1';
  if (period < startPeriod) { console.log(`[Engagement] ${period} is before ${startPeriod} — skipping.`); return null; }

  // Standard eNPS + distribution — app computes, never the AI.
  let promoters = 0, passives = 0, detractors = 0, enps = 0;
  const responses = ex.responses ?? 0;
  if (ex.promoterPct != null && ex.detractorPct != null) {
    const passivePct = ex.passivePct ?? Math.max(0, 100 - ex.promoterPct - ex.detractorPct);
    enps = Math.round(ex.promoterPct - ex.detractorPct);
    promoters = Math.round((ex.promoterPct / 100) * responses);
    passives = Math.round((passivePct / 100) * responses);
    detractors = Math.round((ex.detractorPct / 100) * responses);
  } else if (ex.standardEnps != null) {
    enps = Math.round(ex.standardEnps);
  }

  await prisma.engagementSurvey.upsert({
    where: { period },
    create: {
      period, surveyDate: quarterEndDate(period), enps, avgScore: ex.avgScore,
      promoters, passives, detractors, responses, invitedCount: ex.invited ?? null,
      categoryScores: ex.pulseScores ? JSON.stringify(ex.pulseScores) : null,
      commentThemes: ex.commentThemes ? JSON.stringify(ex.commentThemes) : null,
      sourceType, sourceRef, contentHash,
    },
    update: {
      surveyDate: quarterEndDate(period), enps, avgScore: ex.avgScore,
      promoters, passives, detractors, responses, invitedCount: ex.invited ?? null,
      categoryScores: ex.pulseScores ? JSON.stringify(ex.pulseScores) : null,
      commentThemes: ex.commentThemes ? JSON.stringify(ex.commentThemes) : null,
      sourceType, sourceRef, contentHash, extractedAt: new Date(),
    },
  });
  return { period, enps };
}

// ── Deck selection ──────────────────────────────────────────────────────────────

interface DriveFile { id: string; name: string; modifiedTime: string }

/** Pick the canonical results deck: prefer FINAL, then a summary, skip LinkedIn/social versions. */
function pickCanonicalDeck(files: DriveFile[]): DriveFile | null {
  const usable = files.filter((f) => !/linkedin|social|post/i.test(f.name));
  const pool = usable.length ? usable : files;
  if (pool.length === 0) return null;
  const byRecency = [...pool].sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
  return byRecency.find((f) => /final/i.test(f.name))
      ?? byRecency.find((f) => /summ|результ|итог/i.test(f.name))
      ?? byRecency[0];
}

// ── Sync: extract surveys from per-quarter subfolders in a Drive folder ──────────

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Reads survey result decks (PPTX) from GOOGLE_DRIVE_SURVEYS_FOLDER_ID.
 * That folder holds one sub-folder per quarter; each sub-folder holds the deck(s).
 * No-op (graceful) when the env var is unset. A deck is only re-parsed when its
 * content hash changed (PRD requirement). Period is derived from the DECK CONTENT,
 * not the folder name (folder names are inconsistent).
 */
export async function syncEngagementSurveys(): Promise<{ parsed: number; skipped: number; source: string }> {
  const rootId = process.env.GOOGLE_DRIVE_SURVEYS_FOLDER_ID;
  if (!rootId) {
    console.log('[Engagement] GOOGLE_DRIVE_SURVEYS_FOLDER_ID not set — skipping deck extraction (seed/manual data retained).');
    return { parsed: 0, skipped: 0, source: 'none' };
  }

  const auth = getDriveAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Quarter sub-folders (plus the root itself, in case decks sit at the top level)
  const folderRes = await drive.files.list({
    q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)', pageSize: 100,
  });
  const folderIds = [rootId, ...(folderRes.data.files ?? []).map((f) => f.id!).filter(Boolean)];

  let parsed = 0, skipped = 0;
  for (const folderId of folderIds) {
    try {
      const deckRes = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='${PPTX_MIME}' and trashed=false`,
        fields: 'files(id,name,modifiedTime)', pageSize: 100,
      });
      const decks = (deckRes.data.files ?? []) as DriveFile[];
      const deck = pickCanonicalDeck(decks);
      if (!deck) { continue; } // e.g. an in-progress quarter with no results deck yet

      const dl = await drive.files.get({ fileId: deck.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const text = await parsePptxText(Buffer.from(dl.data as ArrayBuffer));
      const res = await ingestDeckText(text, deck.id, 'drive');
      if (res) { console.log(`[Engagement] ${res.period}: eNPS ${res.enps} (deck "${deck.name}")`); parsed++; }
      else skipped++;
    } catch (e) {
      console.warn(`[Engagement] Folder ${folderId} failed:`, e instanceof Error ? e.message : e);
      skipped++;
    }
  }

  // Once real decks are in, drop the demo seed rows so nothing misleading lingers.
  if (parsed > 0) {
    const removed = await prisma.engagementSurvey.deleteMany({ where: { sourceType: 'seed' } });
    if (removed.count) console.log(`[Engagement] Removed ${removed.count} seed rows (real data present).`);
  }

  console.log(`[Engagement] ${parsed} surveys extracted, ${skipped} skipped/unchanged`);
  return { parsed, skipped, source: 'drive' };
}

// ── AI interpretation (receives ONLY already-computed metrics) ──────────────────

/**
 * Generates a short leadership insight from computed metrics; stores it on the most
 * recent survey that has a Standard eNPS. AI never sees raw data — only our numbers.
 */
export async function generateEngagementInsight(): Promise<string | null> {
  const all = await prisma.engagementSurvey.findMany({ orderBy: { surveyDate: 'asc' } });
  const surveys = all.filter((s) => s.promoters + s.passives + s.detractors > 0);
  if (surveys.length === 0) return null;

  const latest = surveys[surveys.length - 1];
  const previous = surveys.length > 1 ? surveys[surveys.length - 2] : null;

  const summary = {
    latest: { period: latest.period, enps: latest.enps, promoters: latest.promoters, passives: latest.passives, detractors: latest.detractors, responses: latest.responses },
    previous: previous ? { period: previous.period, enps: previous.enps } : null,
    enpsDelta: previous ? latest.enps - previous.enps : null,
    trend: surveys.map((s) => ({ period: s.period, enps: s.enps })),
    categoryScores: latest.categoryScores ? JSON.parse(latest.categoryScores) : null,
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { console.log('[Engagement] OPENROUTER_API_KEY not set — skipping AI insight.'); return null; }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'HR Dashboard',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content:
`You are an HR analytics advisor writing for the head of HR. Based ONLY on these already-calculated eNPS metrics, write a concise 2-4 sentence leadership insight: what changed, what it likely signals, and where to look. Interpret, don't restate every number. Plain prose, no markdown headers.

Metrics: ${JSON.stringify(summary)}`,
      }],
    }),
  });

  if (!res.ok) { console.warn('[Engagement] Insight generation failed:', res.status); return null; }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const insight = data.choices[0]?.message?.content?.trim() ?? null;
  if (insight) await prisma.engagementSurvey.update({ where: { id: latest.id }, data: { aiInsight: insight } });
  return insight;
}

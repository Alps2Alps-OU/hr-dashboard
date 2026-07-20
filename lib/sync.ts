import { prisma } from './db';
import { syncPositions, syncCandidates, syncEmployees } from './peopleforce';
import { syncAsanaRoadmap, syncAsanaOKRs } from './asana';
import { syncNotion } from './notion';
import { syncInvoicePDFs } from './invoices';
import { syncEngagementSurveys, generateEngagementInsight } from './engagement';
import { computeAndSaveSnapshot } from './metrics';

type SyncSource = 'all' | 'peopleforce' | 'invoices' | 'asana' | 'notion' | 'engagement';

async function logSync(source: string, status: 'ok' | 'error', message?: string) {
  await prisma.syncLog.create({ data: { source, status, message } });
}

export async function runSync(source: SyncSource = 'all') {
  const results: Record<string, string> = {};

  if (source === 'all' || source === 'peopleforce') {
    try {
      await syncPositions(); await syncCandidates(); await syncEmployees();
      await logSync('peopleforce', 'ok'); results.peopleforce = 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync('peopleforce', 'error', msg); results.peopleforce = `error: ${msg}`;
    }
  }

  if (source === 'all' || source === 'invoices') {
    try {
      await syncInvoicePDFs(); await logSync('invoices', 'ok'); results.invoices = 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync('invoices', 'error', msg); results.invoices = `error: ${msg}`;
    }
  }

  if (source === 'all' || source === 'asana') {
    try {
      await syncAsanaRoadmap(); await syncAsanaOKRs();
      await logSync('asana', 'ok'); results.asana = 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync('asana', 'error', msg); results.asana = `error: ${msg}`;
    }
  }

  if (source === 'all' || source === 'notion') {
    try {
      await syncNotion(); await logSync('notion', 'ok'); results.notion = 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync('notion', 'error', msg); results.notion = `error: ${msg}`;
    }
  }

  if (source === 'all' || source === 'engagement') {
    try {
      const r = await syncEngagementSurveys();
      await generateEngagementInsight();
      await logSync('engagement', 'ok', `parsed ${r.parsed}, skipped ${r.skipped} (${r.source})`);
      results.engagement = 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync('engagement', 'error', msg); results.engagement = `error: ${msg}`;
    }
  }

  try { await computeAndSaveSnapshot(); results.snapshot = 'ok'; }
  catch (e) { results.snapshot = `error: ${e instanceof Error ? e.message : String(e)}`; }

  return results;
}

export async function getLastSyncTime(): Promise<Date | null> {
  const latest = await prisma.syncLog.findFirst({ where: { status: 'ok' }, orderBy: { syncedAt: 'desc' } });
  return latest?.syncedAt ?? null;
}

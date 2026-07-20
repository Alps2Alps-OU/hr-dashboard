import 'dotenv/config';
import { runSync } from '../lib/sync';

async function main() {
  const source = (process.argv[2] ?? 'all') as 'all' | 'peopleforce' | 'invoices' | 'asana' | 'notion' | 'engagement';
  console.log(`[Sync] Starting manual sync: ${source}`);
  const results = await runSync(source);
  console.log('[Sync] Results:', results);
  process.exit(0);
}

main().catch((e) => { console.error('[Sync] Fatal:', e); process.exit(1); });

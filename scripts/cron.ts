import 'dotenv/config';
import cron from 'node-cron';
import { runSync } from '../lib/sync';

// PeopleForce + Invoices: daily 05:00 BRT = 08:00 UTC
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Daily PeopleForce + Invoices sync');
  await runSync('peopleforce');
  await runSync('invoices');
}, { timezone: 'UTC' });

// Asana + Notion: weekly Monday 06:00 BRT = 09:00 UTC
cron.schedule('0 9 * * 1', async () => {
  console.log('[Cron] Weekly Asana + Notion sync');
  await runSync('asana');
  await runSync('notion');
}, { timezone: 'UTC' });

console.log('[Cron] Scheduler started.');
console.log('  PeopleForce + Invoices: daily 08:00 UTC (05:00 BRT)');
console.log('  Asana + Notion:          Mondays 09:00 UTC (06:00 BRT)');

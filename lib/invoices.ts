import { google } from 'googleapis';
import { prisma } from './db';

interface ExtractedCost { positionTitle: string; amount: number; currency: string; }

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  let creds: Record<string, unknown>;
  try { creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
  catch { creds = JSON.parse(raw); }
  return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
}

function fuzzyMatchPosition(title: string, positions: { id: string; title: string }[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const target = norm(title);
  let bestId: string | null = null, bestScore = 0;
  for (const pos of positions) {
    const posNorm = norm(pos.title);
    if (posNorm === target) return pos.id;
    let score = 0;
    if (posNorm.includes(target) || target.includes(posNorm)) { score = 0.8; }
    else {
      const targetWords = new Set(target.split(' '));
      const overlap = posNorm.split(' ').filter((w) => targetWords.has(w)).length;
      score = overlap / Math.max(targetWords.size, posNorm.split(' ').length);
    }
    if (score > bestScore) { bestScore = score; bestId = pos.id; }
  }
  return bestScore >= 0.4 ? bestId : null;
}

async function extractCostsWithAI(text: string): Promise<ExtractedCost[]> {
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
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract recruitment costs from this invoice. Return ONLY a JSON array:\n[{ "positionTitle": string, "amount": number, "currency": string }]\nNo explanation, no markdown, just the JSON array.\n\nInvoice text:\n${text.slice(0, 8000)}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0].message.content.trim();
  try {
    const start = raw.indexOf('['), end = raw.lastIndexOf(']') + 1;
    return JSON.parse(raw.slice(start, end)) as ExtractedCost[];
  } catch { console.error('[Invoices] Failed to parse AI response:', raw); return []; }
}

export async function syncInvoicePDFs() {
  const folderId = process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_INVOICES_FOLDER_ID not set');

  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const listRes = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
    fields: 'files(id,name,createdTime)', pageSize: 100,
  });

  const files = listRes.data.files ?? [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const openPositions = await prisma.position.findMany({ where: { status: { not: 'closed' } }, select: { id: true, title: true } });
  const unmatched: string[] = [];
  let parsed = 0;

  for (const file of files) {
    if (!file.id || !file.name) continue;
    const fileMonth = file.createdTime ? new Date(file.createdTime).toISOString().slice(0, 7) : currentMonth;
    const existing = await prisma.costPerHire.findFirst({ where: { invoiceMonth: fileMonth } });
    if (existing) continue;

    const dlRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(dlRes.data as ArrayBuffer);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdf = await require('pdf-parse')(buffer);
    const costs = await extractCostsWithAI(pdf.text);

    for (const cost of costs) {
      const posId = fuzzyMatchPosition(cost.positionTitle, openPositions);
      if (!posId) { unmatched.push(cost.positionTitle); continue; }
      await prisma.costPerHire.upsert({
        where: { positionId: posId },
        create: { positionId: posId, advertisingCost: 0, agencyFee: cost.amount, totalCost: cost.amount, invoiceMonth: fileMonth },
        update: { agencyFee: cost.amount, totalCost: cost.amount, invoiceMonth: fileMonth, extractedAt: new Date() },
      });
    }
    parsed++;
  }
  if (unmatched.length) console.warn('[Invoices] Unmatched positions:', unmatched);
  console.log(`[Invoices] ${parsed} PDFs parsed`);
}

import { prisma } from './db';

const BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function nfetch(path: string, body?: Record<string, unknown>) {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY not set');
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractPlainText(blocks: Record<string, unknown>[]): string {
  return blocks.map((block) => {
    const type = block.type as string;
    const content = block[type] as Record<string, unknown>;
    if (!content?.rich_text) return '';
    return (content.rich_text as Record<string, unknown>[]).map((rt) => (rt.plain_text as string) ?? '').join('');
  }).filter(Boolean).join('\n');
}

function fuzzyScore(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const aWords = new Set(na.split(' '));
  const bWords = nb.split(' ');
  const overlap = bWords.filter((w) => aWords.has(w)).length;
  return overlap / Math.max(aWords.size, bWords.length);
}

export async function syncNotion() {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error('NOTION_DATABASE_ID not set');
  const initiatives = await prisma.hRInitiative.findMany();
  if (!initiatives.length) { console.log('[Notion] No initiatives — run Asana sync first'); return; }

  let cursor: string | undefined, synced = 0;
  do {
    const res = await nfetch(`/databases/${dbId}/query`, { start_cursor: cursor, page_size: 100 });
    for (const page of res.results ?? []) {
      const titleProp =
        page.properties?.Name?.title?.[0]?.plain_text ??
        page.properties?.Title?.title?.[0]?.plain_text ??
        Object.values(page.properties ?? {}).find((p: Record<string, unknown>) => p.type === 'title')
          ?.title?.[0]?.plain_text ?? '';
      if (!titleProp) continue;

      let bestMatch = initiatives[0], bestScore = 0;
      for (const init of initiatives) {
        const score = fuzzyScore(init.title, titleProp);
        if (score > bestScore) { bestScore = score; bestMatch = init; }
      }
      if (bestScore < 0.5) continue;

      const blocks = await nfetch(`/blocks/${page.id}/children`);
      const allText = extractPlainText(blocks.results ?? []);
      const lines = allText.split('\n').filter(Boolean);
      await prisma.hRInitiative.update({
        where: { id: bestMatch.id },
        data: { notionDescription: lines[0] ?? '', notionNotes: lines.slice(1).join('\n') },
      });
      synced++;
    }
    cursor = res.next_cursor;
  } while (cursor);
  console.log(`[Notion] ${synced} initiatives enriched`);
}

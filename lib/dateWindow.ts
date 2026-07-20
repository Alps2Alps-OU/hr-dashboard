// Shared time-window model used by the Explore filter bar across dashboard tabs.
// A single {from, to, granularity} window drives every time-based panel in a tab,
// so figures never have to be reconciled between panels.

export type Granularity = 'day' | 'week' | 'month';

export interface TimeWindow {
  from: string; // ISO yyyy-mm-dd (inclusive)
  to: string;   // ISO yyyy-mm-dd (inclusive)
  granularity: Granularity;
}

export type PresetId = '7d' | '14d' | '28d' | 'month' | 'all';

// ── ISO date helpers (all dates are yyyy-mm-dd, local calendar days) ────────────

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// ── Presets ─────────────────────────────────────────────────────────────────────

/** Compute a {from,to} window for a preset. `to` is always today. */
export function presetWindow(preset: PresetId, minISO: string, today = todayISO()): { from: string; to: string } {
  switch (preset) {
    case '7d':  return { from: addDays(today, -6),  to: today };
    case '14d': return { from: addDays(today, -13), to: today };
    case '28d': return { from: addDays(today, -27), to: today };
    case 'month': {
      const d = fromISO(today);
      return { from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    }
    case 'all': return { from: minISO, to: today };
  }
}

/** Which preset (if any) exactly matches the current window. */
export function matchPreset(win: { from: string; to: string }, minISO: string, today = todayISO()): PresetId | null {
  for (const p of ['7d', '14d', '28d', 'month', 'all'] as PresetId[]) {
    const w = presetWindow(p, minISO, today);
    if (w.from === win.from && w.to === win.to) return p;
  }
  return null;
}

// ── Bucketing ───────────────────────────────────────────────────────────────────

export interface Bucket {
  key: string;        // stable key, e.g. 2026-07-13
  label: string;      // short display label
  start: string;      // ISO inclusive
  end: string;        // ISO inclusive
  incomplete: boolean; // period extends past today → partial data
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

/** Build the ordered list of buckets spanning [from, to] at the given granularity. */
export function buildBuckets(win: TimeWindow, today = todayISO()): Bucket[] {
  const start = fromISO(win.from);
  const end = fromISO(win.to);
  const now = fromISO(today);
  const buckets: Bucket[] = [];

  if (win.granularity === 'day') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = toISO(d);
      buckets.push({
        key: iso, start: iso, end: iso,
        label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        incomplete: iso >= today && sameDay(d, now),
      });
    }
  } else if (win.granularity === 'week') {
    for (let d = startOfWeek(start); d <= end; d.setDate(d.getDate() + 7)) {
      const s = new Date(d);
      const e = new Date(d); e.setDate(e.getDate() + 6);
      buckets.push({
        key: toISO(s), start: toISO(s), end: toISO(e),
        label: `${s.getDate()} ${MONTHS[s.getMonth()]}`,
        incomplete: e > now,
      });
    }
  } else {
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= end) {
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      buckets.push({
        key: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`,
        start: toISO(s), end: toISO(e),
        label: `${MONTHS[s.getMonth()]} ${String(s.getFullYear()).slice(2)}`,
        incomplete: e > now,
      });
      d.setMonth(d.getMonth() + 1);
    }
  }
  return buckets;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Assign each dated item to its bucket. Items outside [from,to] are dropped. */
export function bucketItems<T extends { date: string }>(items: T[], buckets: Bucket[]): T[][] {
  const out: T[][] = buckets.map(() => []);
  if (!buckets.length) return out;
  const from = buckets[0].start;
  const to = buckets[buckets.length - 1].end;
  for (const it of items) {
    if (it.date < from || it.date > to) continue;
    // find bucket whose [start,end] contains it.date
    for (let i = 0; i < buckets.length; i++) {
      if (it.date >= buckets[i].start && it.date <= buckets[i].end) { out[i].push(it); break; }
    }
  }
  return out;
}

/** Only items falling within [from, to]. */
export function itemsInWindow<T extends { date: string }>(items: T[], win: { from: string; to: string }): T[] {
  return items.filter((it) => it.date >= win.from && it.date <= win.to);
}

// ── Formatting ──────────────────────────────────────────────────────────────────

export function formatDay(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatRange(win: TimeWindow): string {
  const gran = win.granularity === 'day' ? 'day' : win.granularity === 'week' ? 'week' : 'month';
  return `${formatDay(win.from)} → ${formatDay(win.to)} · ${gran} buckets · incomplete buckets are shaded`;
}

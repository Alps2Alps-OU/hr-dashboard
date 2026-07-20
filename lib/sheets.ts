/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from 'googleapis';

const SPREADSHEET_ID = '1mdI3KKT6tBWbtatbl53UmozxV-nv6tCpSsWTAYsoCpY';
const HIRINGS_GID    = 274762622;

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  let creds: Record<string, unknown>;
  try { creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
  catch { creds = JSON.parse(raw); }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function isFilteredDept(val: string): boolean {
  const v = val.toLowerCase();
  return v.includes('alveda') || v.includes('ayurveda');
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return isNaN(n) || n < 0 || n > 9999 ? null : n;
}

/** Parse DD/MM/YYYY date strings used throughout the sheet */
function parseDateStr(s: string): Date | null {
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return isNaN(d.getTime()) ? null : d;
}

/** Compute running days from openedDate to closedDate (or today if no closed date) */
function computeRunningDays(openedDate: string, closedDate: string): number | null {
  const start = parseDateStr(openedDate);
  if (!start) return null;
  const end = parseDateStr(closedDate) ?? new Date();
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIRINGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

export type StatusGroup = 'open' | 'active' | 'offered' | 'on_hold' | 'hired' | 'cancelled' | 'other';

export interface HiringRecord {
  position:       string;
  department:     string;
  recruiter:      string;
  hiringManager:  string;
  rawStatus:      string;
  statusGroup:    StatusGroup;
  openedDate:     string;
  runningDays:    number | null;
  complexity:     string;
  priority:       string;
  closedDate:     string;
  offerSentDate:  string;
  timeToHire:     number | null;
  timeToFill:     number | null;
  offerAccepted:  boolean | null;
  probationDone:  string;
  source:         string;
  cost:           string;
  quarter:        string;
  month:          string;
  candidateName:  string;
}

/** Column indices (0-based) confirmed from the actual Hirings sheet */
const C = {
  POSITION:       0,
  DEPARTMENT:     1,
  RECRUITER:      2,
  HIRING_MGR:     3,
  STATUS:         4,
  OPENED:         5,
  COMPLEXITY:     7,
  PRIORITY:       8,
  RUNNING_DAYS:   10,
  CLOSED:         12,
  OFFER_SENT:     13,
  TIME_TO_HIRE:   15,
  TIME_TO_FILL:   16,
  OFFER_ACCEPTED: 18,
  PROBATION:      19,
  SOURCE:         20,
  COST:           21,
  QUARTER:        22,
  MONTH:          23,
  CANDIDATE:      24,
} as const;

function normalizeHiringStatus(raw: string): StatusGroup {
  const s = raw.toLowerCase().trim();
  if (!s) return 'other';
  if (s.includes('cancelled'))                              return 'cancelled';
  if (s.includes('hired') || s === 'rehire')               return 'hired';
  if (s.includes('offered'))                               return 'offered';
  if (s.includes('on hold') || s.includes('hold'))        return 'on_hold';
  if (s.includes('ongoing'))                                        return 'active';
  if (s.includes('new position') || s.includes('reopened') || s.includes('reopen')) return 'open';
  if (s.includes('not filled'))                            return 'open';
  return 'other';
}

function parseOfferAccepted(v: string | undefined): boolean | null {
  if (!v) return null;
  const s = v.toLowerCase().trim();
  if (s === 'yes') return true;
  if (s === 'no')  return false;
  return null;
}

function isSectionHeader(row: string[]): boolean {
  return row.length <= 2 && !row[0]?.trim();
}

export async function readHiringsSheet(): Promise<string[][]> {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const target = meta.data.sheets?.find((s) => s.properties?.sheetId === HIRINGS_GID);
  const name   = target?.properties?.title ?? 'Hirings';
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1:Z300`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (res.data.values ?? []) as string[][];
}

export function parseHiringRecords(rows: string[][]): HiringRecord[] {
  const results: HiringRecord[] = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (isSectionHeader(row)) continue;
    // Stop at the summary stats section (~row 148)
    if (i >= 148 && !row[0]?.trim()) break;

    const position = (row[C.POSITION] ?? '').trim();
    if (!position) continue;
    const dept = (row[C.DEPARTMENT] ?? '').trim();

    const rawStatus  = (row[C.STATUS] ?? '').trim();
    // Skip rows with no status or unrecognised status — nothing to show
    if (!rawStatus) continue;
    const statusGroup = normalizeHiringStatus(rawStatus);
    if (statusGroup === 'other') continue;

    // Alveda/Ayurveda: only exclude ACTIVE pipeline records (open/active/offered/on_hold).
    // Hired and cancelled records from those depts are included in all metrics.
    const ACTIVE_STATUSES: StatusGroup[] = ['open', 'active', 'offered', 'on_hold'];
    if (isFilteredDept(dept) && ACTIVE_STATUSES.includes(statusGroup)) continue;

    const openedDate = (row[C.OPENED]  ?? '').trim();
    const closedDate = (row[C.CLOSED]  ?? '').trim();
    // Running days only for positions actively being worked — null for everything else
    const OPEN_STATUSES: StatusGroup[] = ['open', 'active', 'offered', 'on_hold'];
    const isStillOpen = OPEN_STATUSES.includes(statusGroup);
    results.push({
      position,
      department:    dept,
      recruiter:     (row[C.RECRUITER]     ?? '').trim(),
      hiringManager: (row[C.HIRING_MGR]    ?? '').trim(),
      rawStatus,
      statusGroup,
      openedDate,
      runningDays: isStillOpen
        ? (parseNum(row[C.RUNNING_DAYS]) ?? computeRunningDays(openedDate, ''))
        : null,
      complexity:    (row[C.COMPLEXITY]    ?? '').trim().toUpperCase(),
      priority:      (row[C.PRIORITY]      ?? '').trim(),
      closedDate,
      offerSentDate: (row[C.OFFER_SENT]    ?? '').trim(),
      timeToHire:    parseNum(row[C.TIME_TO_HIRE]),
      timeToFill:    parseNum(row[C.TIME_TO_FILL]),
      offerAccepted: parseOfferAccepted(row[C.OFFER_ACCEPTED]),
      probationDone: (row[C.PROBATION]     ?? '').trim(),
      source:        (row[C.SOURCE]        ?? '').trim(),
      cost:          (row[C.COST]          ?? '').trim(),
      quarter:       (row[C.QUARTER]       ?? '').trim(),
      month:         (row[C.MONTH]         ?? '').trim(),
      candidateName: (row[C.CANDIDATE]     ?? '').trim(),
    });
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OKR 2026 TAB — weekly pipeline tracker
// ═══════════════════════════════════════════════════════════════════════════════

export interface OkrVacancy {
  position:    string;
  project:     string;
  hiringManager: string;
  recruiter:   string;
  level:       string;
  openedDate:  string;
  rawStatus:   string;
  statusGroup: 'hired' | 'new' | 'ongoing' | 'on_hold' | 'closed' | 'other';
  stages: {
    cvScreening:    number;
    hrInterview:    number;
    hrShortlisted:  number;
    competency:     number;
    technical:      number;
    finalInterview: number;
    referenceCheck: number;
    offerDone:      number;
    offerAccepted:  number;
    offerRejected:  number;
  };
}

export interface OkrWeekSnapshot {
  weekRange: string;     // "01/06/2026-05/06/2026"
  startDate: string;
  totalDeclared: number; // from the header "#N"
  vacancies: OkrVacancy[];
}

function normalizeOkrStatus(raw: string): OkrVacancy['statusGroup'] {
  const s = raw.toLowerCase();
  if (s.includes('hired') || s.includes('position closed internally') || s.includes('rehired') || s.includes('rehire')) return 'hired';
  if (s.includes('on hold') || s.includes('hold')) return 'on_hold';
  if (s.includes('cancelled') || s.includes('position closed') || s.includes('transformed')) return 'closed';
  if (s.includes('new position') || s.startsWith('new')) return 'new';
  if (s.includes('ongoing') || s.includes('in process') || s.includes('in progress') || s.includes('open')) return 'ongoing';
  return 'other';
}

/** Map the varying stage label texts to a canonical key */
function stageKey(label: string): keyof OkrVacancy['stages'] | null {
  const l = label.toLowerCase();
  if (l.includes('offer accepted')) return 'offerAccepted';
  if (l.includes('offer rejected')) return 'offerRejected';
  if (l.includes('offer'))          return 'offerDone';
  if (l.includes('reference'))      return 'referenceCheck';
  if (l.includes('final'))          return 'finalInterview';
  if (l.includes('technical'))      return 'technical';
  if (l.includes('competency'))     return 'competency';
  if (l.includes('shortlist') || (l.includes('hr') && l.includes('shortlist'))) return 'hrShortlisted';
  if (l.includes('hr interview') || (l.includes('interview') && (l.includes('scheduled') || l.includes('done') || l.includes('planned') || l === 'interview scheduled'))) return 'hrInterview';
  if (l.includes('cv screening') || l.includes('cv screening')) return 'cvScreening';
  return null;
}

function isWeekHeader(cell: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}[-–]/.test(cell.trim());
}

export async function readOkrSheet(): Promise<string[][]> {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  // Read a large range — the sheet currently has ~480 rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `OKR 2026!A1:Z1000`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (res.data.values ?? []) as string[][];
}

export function parseOkrLatestWeek(rows: string[][]): OkrWeekSnapshot | null {
  // Find all week-header row indices
  const headerIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.[0] && isWeekHeader(rows[i][0])) {
      headerIndices.push(i);
    }
  }
  if (headerIndices.length === 0) return null;

  const latestIdx = headerIndices[headerIndices.length - 1];
  const nextIdx   = rows.length; // parse to end

  const headerRow = rows[latestIdx];
  const weekRange = (headerRow[0] ?? '').split('\n')[0].trim();
  const startDate = weekRange.split(/[-–]/)[0].trim();

  // Extract declared vacancy count from "Total vacancies #N"
  const totalMatch = (headerRow[0] ?? '').match(/#\s*(\d+)/);
  const totalDeclared = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  // Position names start at col 1 in the header row
  const positionNames: string[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    positionNames.push((headerRow[c] ?? '').replace('\n', ' ').trim());
  }
  const numVacancies = positionNames.length;
  if (numVacancies === 0) return null;

  // Initialise vacancy records
  const vacancies: OkrVacancy[] = positionNames.map((p) => ({
    position:      p,
    project:       '',
    hiringManager: '',
    recruiter:     '',
    level:         '',
    openedDate:    '',
    rawStatus:     '',
    statusGroup:   'other',
    stages: { cvScreening: 0, hrInterview: 0, hrShortlisted: 0, competency: 0, technical: 0, finalInterview: 0, referenceCheck: 0, offerDone: 0, offerAccepted: 0, offerRejected: 0 },
  }));

  // Walk the rows in this week block
  for (let i = latestIdx + 1; i < nextIdx; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const label = (row[0] ?? '').trim();
    if (!label) continue;
    const ll = label.toLowerCase();

    for (let c = 1; c <= numVacancies; c++) {
      const v   = vacancies[c - 1];
      const val = (row[c] ?? '').trim();

      if (ll.includes('position opened'))     { v.openedDate    = val; }
      else if (ll.includes('recruiter'))      { v.recruiter     = val; }
      else if (ll.includes('project'))        { v.project       = val; }
      else if (ll.includes('hiring manager')) { v.hiringManager = val; }
      else if (ll.includes('level') && !ll.includes('skill')) { v.level = val; }
      else if (ll === 'status' || ll.startsWith('status'))    { v.rawStatus = val; v.statusGroup = normalizeOkrStatus(val); }
      else {
        const key = stageKey(label);
        if (key) {
          const n = parseNum(val);
          if (n != null && n > v.stages[key]) v.stages[key] = n;
        }
      }
    }
  }

  // Alveda/Ayurveda: keep hired/closed; filter out active-pipeline only
  const filtered = vacancies.filter(
    (v) => !isFilteredDept(v.project) || ['hired', 'closed'].includes(v.statusGroup)
  );

  return { weekRange, startDate, totalDeclared, vacancies: filtered };
}

/** Parse ALL OKR weeks — returns full snapshot for each week block */
export function parseOkrAllWeeks(rows: string[][]): OkrWeekSnapshot[] {
  const headerIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.[0] && isWeekHeader(rows[i][0])) headerIndices.push(i);
  }
  if (headerIndices.length === 0) return [];

  return headerIndices.map((startIdx, weekNum) => {
    const endIdx = headerIndices[weekNum + 1] ?? rows.length;
    const headerRow = rows[startIdx];
    const weekRange    = (headerRow[0] ?? '').split('\n')[0].trim();
    const startDate    = weekRange.split(/[-–]/)[0].trim();
    const totalMatch   = (headerRow[0] ?? '').match(/#\s*(\d+)/);
    const totalDeclared = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    const positionNames: string[] = [];
    for (let c = 1; c < headerRow.length; c++)
      positionNames.push((headerRow[c] ?? '').replace('\n', ' ').trim());
    const numVacancies = positionNames.length;
    if (numVacancies === 0) return { weekRange, startDate, totalDeclared, vacancies: [] };

    const vacancies: OkrVacancy[] = positionNames.map((p) => ({
      position: p, project: '', hiringManager: '', recruiter: '', level: '', openedDate: '',
      rawStatus: '', statusGroup: 'other' as const,
      stages: { cvScreening: 0, hrInterview: 0, hrShortlisted: 0, competency: 0, technical: 0,
                finalInterview: 0, referenceCheck: 0, offerDone: 0, offerAccepted: 0, offerRejected: 0 },
    }));

    for (let i = startIdx + 1; i < endIdx; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const label = (row[0] ?? '').trim();
      if (!label) continue;
      const ll = label.toLowerCase();
      for (let c = 1; c <= numVacancies; c++) {
        const v = vacancies[c - 1];
        const val = (row[c] ?? '').trim();
        if      (ll.includes('position opened'))  { v.openedDate    = val; }
        else if (ll.includes('recruiter'))        { v.recruiter     = val; }
        else if (ll.includes('project'))          { v.project       = val; }
        else if (ll.includes('hiring manager'))   { v.hiringManager = val; }
        else if (ll.includes('level') && !ll.includes('skill')) { v.level = val; }
        else if (ll === 'status' || ll.startsWith('status'))    { v.rawStatus = val; v.statusGroup = normalizeOkrStatus(val); }
        else {
          const key = stageKey(label);
          if (key) { const n = parseNum(val); if (n != null && n > v.stages[key]) v.stages[key] = n; }
        }
      }
    }

    const filtered = vacancies.filter(
      (v) => !isFilteredDept(v.project) || ['hired', 'closed'].includes(v.statusGroup)
    );
    return { weekRange, startDate, totalDeclared, vacancies: filtered };
  });
}

/** Parse ALL week headers to build a weekly trend (vacancies per week) */
export function parseOkrWeeklyTrend(rows: string[][]): Array<{ week: string; date: string; total: number; hired: number }> {
  const trend: Array<{ week: string; date: string; total: number; hired: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i]?.[0] ?? '';
    if (!isWeekHeader(cell)) continue;
    const parts  = cell.split('\n');
    const range  = parts[0].trim();
    const date   = range.split(/[-–]/)[0].trim();
    const match  = cell.match(/#\s*(\d+)/);
    const total  = match ? parseInt(match[1], 10) : 0;
    // Count hired vacancies in this block
    let hired = 0;
    for (let j = i + 1; j < Math.min(i + 25, rows.length); j++) {
      if (rows[j]?.[0] && isWeekHeader(rows[j][0])) break;
      if ((rows[j]?.[0] ?? '').toLowerCase() === 'status') {
        for (let c = 1; c < (rows[j]?.length ?? 0); c++) {
          const s = (rows[j][c] ?? '').toLowerCase();
          if (s.includes('hired') || s.includes('position closed internally') || s.includes('rehired')) hired++;
        }
      }
    }
    // Shorten label: "DD/MM/YYYY-DD/MM/YYYY" → "DD/MM" of start
    const label = date.slice(0, 5); // "01/06"
    trend.push({ week: label, date, total, hired });
  }
  return trend;
}

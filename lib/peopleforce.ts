/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from './db';
import { detectRoleLevel } from './sla';

// Confirmed base URL from hr-buddy/peopleforce_indexer.py
const BASE_URL = 'https://app.peopleforce.io/api/public/v3';

// ── auth filter ───────────────────────────────────────────────────────────────

function isFilteredDept(dept?: string | null): boolean {
  if (!dept) return false;
  const d = dept.toLowerCase();
  return d.includes('alveda') || d.includes('ayurveda');
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  const key = process.env.PEOPLEFORCE_API_KEY;
  if (!key) throw new Error('PEOPLEFORCE_API_KEY not set');
  return { 'X-API-KEY': key, 'Accept': 'application/json', 'Content-Type': 'application/json' };
}

async function pfetch(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`PeopleForce ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Fetch every page of a paginated endpoint and return a flat array. */
async function fetchAll(path: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await pfetch(`${path}${sep}page=${page}`);
    const batch: any[] = Array.isArray(data) ? data : (data?.data ?? []);
    all.push(...batch);
    const totalPages: number = data?.metadata?.pagination?.pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

/** Read a field that might be a plain string or an object with .name */
function str(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.name) return String(val.name);
  return String(val);
}

// ── status mappers ────────────────────────────────────────────────────────────

function vacancyStatus(s: string): string {
  const sl = (s ?? '').toLowerCase();
  if (sl.includes('close') || sl.includes('filled') || sl.includes('archiv')) return 'closed';
  if (sl.includes('hold') || sl.includes('pause') || sl.includes('draft')) return 'on_hold';
  return 'open';
}

function candidateStage(s: string): string {
  const sl = (s ?? '').toLowerCase();
  if (sl.includes('hire')) return 'hired';
  if (sl.includes('offer')) return 'offer';
  if (sl.includes('interview')) return 'interview';
  if (sl.includes('screen')) return 'screened';
  if (sl.includes('reject') || sl.includes('declin')) return 'rejected';
  return 'applied';
}

function normalizeTermType(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.includes('voluntary') || s === 'resignation') return 'voluntary';
  if (s.includes('mutual') || s.includes('agreement') || s.includes('by agreement') || s.includes('mutual termination')) return 'mutual_agreement';
  return 'involuntary';
}

function probationStatus(s?: string): string | null {
  if (!s) return null;
  const sl = s.toLowerCase();
  if (sl.includes('pass')) return 'passed';
  if (sl.includes('fail')) return 'failed';
  if (sl.includes('extend')) return 'extended';
  return 'active';
}

function taskStatus(t: any): string {
  if (t.completed_at) return 'completed';
  if (t.due_date && new Date(t.due_date) < new Date()) return 'overdue';
  return 'pending';
}

// ── sync functions ────────────────────────────────────────────────────────────

export async function syncPositions() {
  // Try recruitment paths in order — stop at the first one that works
  const paths = ['/vacancies', '/recruit/vacancies', '/ats/vacancies'];
  let vacancies: any[] = [];
  let usedPath = '';

  for (const p of paths) {
    try {
      vacancies = await fetchAll(p);
      usedPath = p;
      break;
    } catch {
      // try next
    }
  }

  if (!usedPath) {
    console.warn('[PeopleForce] Vacancies: no working endpoint found, skipping');
    return;
  }

  let synced = 0, skipped = 0;
  for (const v of vacancies) {
    const dept = str(v.department);
    if (isFilteredDept(dept)) { skipped++; continue; }

    const title = str(v.title) || str(v.name) || 'Unknown';
    await prisma.position.upsert({
      where: { id: String(v.id) },
      create: {
        id: String(v.id), title, department: dept,
        level: detectRoleLevel(title),
        openedDate: v.opened_at ? new Date(v.opened_at) : new Date(v.created_at ?? Date.now()),
        status: vacancyStatus(str(v.status)),
        hiringManager: str(v.hiring_manager?.full_name) || null,
        closedDate: v.closed_at ? new Date(v.closed_at) : null,
      },
      update: {
        title, department: dept,
        level: detectRoleLevel(title),
        status: vacancyStatus(str(v.status)),
        hiringManager: str(v.hiring_manager?.full_name) || null,
        closedDate: v.closed_at ? new Date(v.closed_at) : null,
      },
    });
    synced++;
  }
  console.log(`[PeopleForce] Positions (${usedPath}): ${synced} synced, ${skipped} filtered`);
}

export async function syncCandidates() {
  const paths = ['/applications', '/recruit/applications', '/candidates', '/recruit/candidates'];
  let applications: any[] = [];
  let usedPath = '';

  for (const p of paths) {
    try {
      applications = await fetchAll(p);
      usedPath = p;
      break;
    } catch {
      // try next
    }
  }

  if (!usedPath) {
    console.warn('[PeopleForce] Candidates: no working endpoint found, skipping');
    return;
  }

  let synced = 0, skipped = 0;
  for (const c of applications) {
    const dept = str(c.vacancy?.department) || str(c.department);
    if (isFilteredDept(dept)) { skipped++; continue; }

    const positionId = String(c.vacancy_id ?? c.vacancy?.id ?? '');
    if (!positionId) continue;
    const posExists = await prisma.position.findUnique({ where: { id: positionId } });
    if (!posExists) continue;

    await prisma.candidate.upsert({
      where: { id: String(c.id) },
      create: {
        id: String(c.id), positionId,
        stage: candidateStage(str(c.stage) || str(c.status)),
        source: str(c.source) || null,
        appliedDate: c.applied_at ? new Date(c.applied_at) : null,
        screenedDate: c.screened_at ? new Date(c.screened_at) : null,
        interviewDate: c.interview_at ? new Date(c.interview_at) : null,
        offerDate: c.offered_at ? new Date(c.offered_at) : null,
        hiredDate: c.hired_at ? new Date(c.hired_at) : null,
        rejectedReason: str(c.rejection_reason) || null,
        offerAccepted: c.offer_accepted ?? null,
      },
      update: {
        stage: candidateStage(str(c.stage) || str(c.status)),
        source: str(c.source) || null,
        screenedDate: c.screened_at ? new Date(c.screened_at) : null,
        interviewDate: c.interview_at ? new Date(c.interview_at) : null,
        offerDate: c.offered_at ? new Date(c.offered_at) : null,
        hiredDate: c.hired_at ? new Date(c.hired_at) : null,
        rejectedReason: str(c.rejection_reason) || null,
        offerAccepted: c.offer_accepted ?? null,
      },
    });
    synced++;
  }
  console.log(`[PeopleForce] Candidates (${usedPath}): ${synced} synced, ${skipped} filtered`);
}

export async function syncEmployees() {
  // Confirmed working in hr-buddy/peopleforce_indexer.py
  const employees = await fetchAll('/employees');
  let synced = 0, skipped = 0;

  for (const e of employees) {
    const dept = str(e.department);

    // v3: position is an object { name: "..." }
    const jobTitle = str(e.position) || str(e.job_title) || '';
    // Mark inactive ONLY when status explicitly means the person left.
    // Employees on leave, parental leave, probation, etc. are still active headcount.
    const statusVal = str(e.status).toLowerCase();
    const DEPARTED = ['terminated', 'dismissed', 'fired', 'resigned', 'left', 'inactive', 'archived'];
    // Alveda/Ayurveda are separate business entities — exclude from active headcount
    const isActive = !DEPARTED.some((s) => statusVal.includes(s)) && !isFilteredDept(dept);
    const fullName = str(e.full_name) || `${str(e.first_name)} ${str(e.last_name)}`.trim();

    await prisma.employee.upsert({
      where: { id: String(e.id) },
      create: {
        id: String(e.id), name: fullName,
        startDate: e.hired_on ? new Date(e.hired_on) : new Date(e.start_date ?? Date.now()),
        probationEndDate: e.probation_ends_on ? new Date(e.probation_ends_on) : null,
        probationStatus: probationStatus(str(e.probation_status)),
        department: dept, level: detectRoleLevel(jobTitle), isActive,
      },
      update: {
        name: fullName,
        probationEndDate: e.probation_ends_on ? new Date(e.probation_ends_on) : null,
        probationStatus: probationStatus(str(e.probation_status)),
        department: dept, level: detectRoleLevel(jobTitle), isActive,
      },
    });

    // Clean up any stale termination record for active employees
    if (isActive) {
      await prisma.termination.deleteMany({ where: { employeeId: String(e.id) } });
    }

    // Termination record for inactive employees
    if (!isActive) {
      const exitDate = e.terminated_on ? new Date(e.terminated_on) : new Date();
      const startDate = e.hired_on ? new Date(e.hired_on) : new Date(e.start_date ?? Date.now());
      const tenureDays = Math.floor((exitDate.getTime() - startDate.getTime()) / 86400000);
      await prisma.termination.upsert({
        where: { employeeId: String(e.id) },
        create: {
          id: `term-${e.id}`, employeeId: String(e.id), exitDate,
          type: normalizeTermType(str(e.termination_type)),
          reason: str(e.termination_reason) || null, tenureDays,
        },
        update: {
          exitDate,
          type: normalizeTermType(str(e.termination_type)),
          reason: str(e.termination_reason) || null, tenureDays,
        },
      });
    }

    // Onboarding tasks (optional endpoint — ignore 404s)
    try {
      const tasksData = await pfetch(`/employees/${e.id}/onboarding`);
      const tasks: any[] = Array.isArray(tasksData) ? tasksData : (tasksData?.data ?? tasksData?.tasks ?? []);
      for (const t of tasks) {
        await prisma.onboardingTask.upsert({
          where: { id: String(t.id) },
          create: {
            id: String(t.id), employeeId: String(e.id),
            taskName: str(t.name) || str(t.title) || 'Task',
            dueDate: t.due_date ? new Date(t.due_date) : null,
            completedDate: t.completed_at ? new Date(t.completed_at) : null,
            status: taskStatus(t),
          },
          update: {
            taskName: str(t.name) || str(t.title) || 'Task',
            dueDate: t.due_date ? new Date(t.due_date) : null,
            completedDate: t.completed_at ? new Date(t.completed_at) : null,
            status: taskStatus(t),
          },
        });
      }
    } catch { /* onboarding endpoint optional */ }

    synced++;
  }
  console.log(`[PeopleForce] Employees: ${synced} synced, ${skipped} filtered`);
}

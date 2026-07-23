import { prisma } from './db';

const BASE = 'https://app.asana.com/api/1.0';

async function afetch(path: string, params = '') {
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) throw new Error('ASANA_ACCESS_TOKEN not set');
  const res = await fetch(`${BASE}${path}${params ? '?' + params : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Asana ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()).data;
}

async function afetchAll(path: string, params: string): Promise<RawAsanaTask[]> {
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) throw new Error('ASANA_ACCESS_TOKEN not set');
  const results: RawAsanaTask[] = [];
  let url: string | null = `${BASE}${path}?${params}&limit=100`;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Asana ${path} → ${res.status}`);
    const json = await res.json() as { data: RawAsanaTask[]; next_page: { uri: string } | null };
    results.push(...(json.data ?? []));
    url = json.next_page?.uri ?? null;
  }
  return results;
}

interface RawAsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  due_on: string | null;
  modified_at: string;
  assignee: { name: string } | null;
  memberships: Array<{ section: { name: string } | null }>;
  num_subtasks?: number;
}

const EXCLUDED_SECTIONS = ['Templates'];
const EXCLUDED_ASSIGNEES = ['darya', 'daria']; // no longer in company

function deriveQuarter(dueOn: string | null): string | null {
  if (!dueOn) return null;
  const m = new Date(dueOn).getUTCMonth();
  if (m <= 2) return 'Q1';
  if (m <= 5) return 'Q2';
  if (m <= 8) return 'Q3';
  return 'Q4';
}

function isExcludedAssignee(name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return EXCLUDED_ASSIGNEES.some((ex) => lower.includes(ex));
}

function isNewsletterTask(name: string): boolean {
  return name.toLowerCase().includes('newsletter');
}

function shouldIncludeTask(task: RawAsanaTask, startDate: Date): boolean {
  const section = task.memberships?.[0]?.section?.name ?? '';
  if (EXCLUDED_SECTIONS.some((s) => section.includes(s))) return false;
  if (isExcludedAssignee(task.assignee?.name ?? null)) return false;
  if (!task.completed) return true;
  if (task.completed_at && new Date(task.completed_at) >= startDate) return true;
  if (task.due_on && new Date(task.due_on) >= startDate) return true;
  return false;
}

// Keep only 1 newsletter task per calendar month (the completed one if available, else most recent)
function deduplicateNewsletterTasks(tasks: RawAsanaTask[]): RawAsanaTask[] {
  const newsletter: Map<string, RawAsanaTask> = new Map();
  const regular: RawAsanaTask[] = [];
  for (const t of tasks) {
    if (!isNewsletterTask(t.name)) { regular.push(t); continue; }
    const dateStr = t.due_on ?? t.completed_at ?? t.created_at;
    const monthKey = dateStr ? dateStr.slice(0, 7) : 'unknown'; // "YYYY-MM"
    const existing = newsletter.get(monthKey);
    if (!existing) { newsletter.set(monthKey, t); continue; }
    // Prefer completed over not completed; if both same status, keep most recently modified
    if (t.completed && !existing.completed) { newsletter.set(monthKey, t); continue; }
    if (!t.completed && existing.completed) continue;
    if (t.modified_at > existing.modified_at) newsletter.set(monthKey, t);
  }
  return [...regular, ...Array.from(newsletter.values())];
}

// Fetch quarterly milestone plan from HR Workflow map-2026 subtasks (live, small set)
export async function fetchQuarterlyMilestones(): Promise<Array<{
  gid: string; name: string; quarter: string;
  completed: boolean; completedAt: string | null; dueOn: string | null;
}>> {
  const parentTaskId = process.env.ASANA_OKRS_PARENT_TASK_ID;
  if (!parentTaskId) return [];
  const tasks = await afetchAll(`/tasks/${parentTaskId}/subtasks`,
    'opt_fields=gid,name,completed,completed_at,due_on');
  return tasks.map((t) => {
    const nameUp = t.name.toUpperCase();
    const quarter = nameUp.includes('1') ? 'Q1' : nameUp.includes('2') ? 'Q2'
      : nameUp.includes('3') ? 'Q3' : 'Q4';
    return {
      gid: t.gid, name: t.name, quarter,
      completed: t.completed, completedAt: t.completed_at, dueOn: t.due_on,
    };
  });
}

function mapRAG(raw?: string): 'green' | 'amber' | 'red' {
  if (!raw) return 'green';
  const r = raw.toLowerCase();
  if (r.includes('red')) return 'red';
  if (r.includes('amber') || r.includes('yellow') || r.includes('orange')) return 'amber';
  return 'green';
}

function mapStatus(task: Record<string, unknown>): string {
  if (task.completed) return 'done';
  const fields = (task.custom_fields as Record<string, unknown>[]) ?? [];
  const f = fields.find((f: Record<string, unknown>) =>
    typeof f.name === 'string' && f.name.toLowerCase().includes('status')
  ) as Record<string, unknown> | undefined;
  if (!f) return 'todo';
  const val = String((f.display_value as string) ?? (f.enum_value as Record<string, unknown>)?.name ?? '').toLowerCase();
  if (val.includes('progress') || val.includes('doing')) return 'in_progress';
  if (val.includes('done') || val.includes('complete')) return 'done';
  return 'todo';
}

function getCustomField(task: Record<string, unknown>, name: string): string {
  const fields = (task.custom_fields as Record<string, unknown>[]) ?? [];
  const f = fields.find((f: Record<string, unknown>) =>
    typeof f.name === 'string' && f.name.toLowerCase().includes(name.toLowerCase())
  ) as Record<string, unknown> | undefined;
  if (!f) return '';
  return String((f.display_value as string) ?? (f.enum_value as Record<string, unknown>)?.name ?? f.number_value ?? '');
}

function mapQuarter(raw: string): string {
  const q = raw.toUpperCase();
  if (q.includes('Q1')) return 'Q1';
  if (q.includes('Q2')) return 'Q2';
  if (q.includes('Q3')) return 'Q3';
  if (q.includes('Q4')) return 'Q4';
  return 'Q1';
}

function cleanPillar(raw: string): string {
  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    recruitment: 'Recruitment', onboarding: 'Onboarding', performance: 'Performance',
    compliance: 'Compliance', compensation: 'Compensation', org: 'OrgDesign', design: 'OrgDesign',
  };
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return raw;
}

export async function syncAsanaRoadmap() {
  const projectId = process.env.ASANA_ROADMAP_PROJECT_ID;
  if (!projectId) throw new Error('ASANA_ROADMAP_PROJECT_ID not set');
  const tasks = await afetch(`/projects/${projectId}/tasks`,
    'opt_fields=name,completed,due_on,custom_fields,memberships.section.name');
  let synced = 0;

  for (const task of tasks ?? []) {
    const pillar = (task.memberships?.[0]?.section?.name as string) ?? 'General';
    const quarterRaw = getCustomField(task, 'quarter');
    const ragRaw = getCustomField(task, 'rag');
    const progress = Math.min(100, Math.max(0, parseInt(getCustomField(task, 'progress'), 10) || 0));

    await prisma.hRInitiative.upsert({
      where: { asanaTaskId: String(task.gid) },
      create: {
        asanaTaskId: String(task.gid), title: task.name, pillar: cleanPillar(pillar),
        quarter: quarterRaw ? mapQuarter(quarterRaw) : 'Q1', status: mapStatus(task),
        ragStatus: mapRAG(ragRaw), progressPercent: progress,
        dueDate: task.due_on ? new Date(task.due_on) : null,
      },
      update: {
        title: task.name, pillar: cleanPillar(pillar),
        quarter: quarterRaw ? mapQuarter(quarterRaw) : 'Q1', status: mapStatus(task),
        ragStatus: mapRAG(ragRaw), progressPercent: progress,
        dueDate: task.due_on ? new Date(task.due_on) : null,
      },
    });
    synced++;
  }
  console.log(`[Asana] Roadmap: ${synced} initiatives synced`);
}

export async function syncAsanaOKRs() {
  // OKRs live as subtasks of a single parent task, not as top-level project tasks.
  // ASANA_OKRS_PARENT_TASK_ID is the GID of that parent task in the Roadmap project.
  const parentTaskId = process.env.ASANA_OKRS_PARENT_TASK_ID;
  if (!parentTaskId) throw new Error('ASANA_OKRS_PARENT_TASK_ID not set');

  const tasks = await afetch(`/tasks/${parentTaskId}/subtasks`,
    'opt_fields=name,completed,custom_fields,memberships.section.name');
  let synced = 0;

  for (const task of tasks ?? []) {
    // Quarter is read from a custom field; fall back to parsing the task name.
    const quarterRaw = getCustomField(task, 'quarter') || task.name || 'Q1';
    const progress = Math.min(100, Math.max(0, parseInt(getCustomField(task, 'progress'), 10) || 0));
    await prisma.hROkr.upsert({
      where: { asanaTaskId: String(task.gid) },
      create: { asanaTaskId: String(task.gid), quarter: mapQuarter(quarterRaw), title: task.name, progressPercent: progress },
      update: { quarter: mapQuarter(quarterRaw), title: task.name, progressPercent: progress },
    });
    synced++;
  }
  console.log(`[Asana] OKRs: ${synced} synced`);
}

async function syncProjectTasks(
  projectId: string, mode: 'full' | 'changes', sinceIso: string | null, startDate: Date
): Promise<number> {
  // Full rebuild: wipe project tasks first so newsletter dedup starts clean
  if (mode === 'full') {
    await prisma.asanaTask.deleteMany({ where: { projectGid: projectId } });
  }
  const fields = 'gid,name,completed,due_on,completed_at,created_at,modified_at,assignee.name,memberships.section.name';
  let params = `opt_fields=${fields}`;
  if (mode === 'changes' && sinceIso) params += `&modified_since=${sinceIso}`;

  let tasks = await afetchAll(`/projects/${projectId}/tasks`, params);
  tasks = deduplicateNewsletterTasks(tasks);

  let upserted = 0;
  for (const task of tasks) {
    if (!shouldIncludeTask(task, startDate)) continue;
    const section = task.memberships?.[0]?.section?.name ?? null;
    await prisma.asanaTask.upsert({
      where: { gid: task.gid },
      create: {
        gid: task.gid, projectGid: projectId, name: task.name,
        completed: task.completed,
        completedAt: task.completed_at ? new Date(task.completed_at) : null,
        createdAt: new Date(task.created_at),
        dueOn: task.due_on ? new Date(task.due_on) : null,
        modifiedAt: new Date(task.modified_at),
        assignee: task.assignee?.name ?? null, section,
        quarter: deriveQuarter(task.due_on),
      },
      update: {
        name: task.name, completed: task.completed,
        completedAt: task.completed_at ? new Date(task.completed_at) : null,
        dueOn: task.due_on ? new Date(task.due_on) : null,
        modifiedAt: new Date(task.modified_at),
        assignee: task.assignee?.name ?? null, section,
        quarter: deriveQuarter(task.due_on),
      },
    });
    upserted++;
  }

  // Asana's project-tasks endpoint returns only top-level tasks. Subtasks (e.g.
  // items assigned to a specific person under a parent) must be fetched per parent.
  upserted += await syncSubtasks(projectId, startDate);
  return upserted;
}

/**
 * Fetch and upsert subtasks for a project's tasks. Parents are enumerated with a
 * cheap field set regardless of sync mode, so a subtask is discovered even when
 * its parent task itself wasn't modified since the last sync.
 */
async function syncSubtasks(projectId: string, startDate: Date): Promise<number> {
  const parents = await afetchAll(
    `/projects/${projectId}/tasks`,
    'opt_fields=gid,num_subtasks,memberships.section.name'
  );
  const subFields = 'gid,name,completed,due_on,completed_at,created_at,modified_at,assignee.name';
  let upserted = 0;

  for (const parent of parents) {
    if (!parent.num_subtasks || parent.num_subtasks < 1) continue;
    const parentSection = parent.memberships?.[0]?.section?.name ?? null;
    // Skip subtasks of parents in excluded sections (e.g. Templates).
    if (parentSection && EXCLUDED_SECTIONS.some((s) => parentSection.includes(s))) continue;

    const subs = await afetchAll(`/tasks/${parent.gid}/subtasks`, `opt_fields=${subFields}`);
    for (const sub of subs) {
      if (!shouldIncludeTask(sub, startDate)) continue;
      await prisma.asanaTask.upsert({
        where: { gid: sub.gid },
        create: {
          gid: sub.gid, projectGid: projectId, name: sub.name,
          completed: sub.completed,
          completedAt: sub.completed_at ? new Date(sub.completed_at) : null,
          createdAt: new Date(sub.created_at),
          dueOn: sub.due_on ? new Date(sub.due_on) : null,
          modifiedAt: new Date(sub.modified_at),
          assignee: sub.assignee?.name ?? null,
          section: parentSection,
          quarter: deriveQuarter(sub.due_on),
        },
        update: {
          name: sub.name, completed: sub.completed,
          completedAt: sub.completed_at ? new Date(sub.completed_at) : null,
          dueOn: sub.due_on ? new Date(sub.due_on) : null,
          modifiedAt: new Date(sub.modified_at),
          assignee: sub.assignee?.name ?? null,
          section: parentSection,
          quarter: deriveQuarter(sub.due_on),
        },
      });
      upserted++;
    }
  }
  return upserted;
}

export async function syncRoadmapTasks(mode: 'full' | 'changes'): Promise<{ upserted: number; totalCount: number }> {
  const hrProjectId = process.env.ASANA_ROADMAP_PROJECT_ID;
  const recruitProjectId = process.env.ASANA_RECRUITING_PROJECT_ID;
  if (!hrProjectId) throw new Error('ASANA_ROADMAP_PROJECT_ID not set');

  const startDate = new Date(process.env.ROADMAP_START_DATE ?? '2026-01-01');
  const meta = await prisma.roadmapSyncMeta.findUnique({ where: { id: 'singleton' } });
  const sinceIso = mode === 'changes' && meta?.lastSyncedAt ? meta.lastSyncedAt.toISOString() : null;

  // Sync HR Management project
  let upserted = await syncProjectTasks(hrProjectId, mode, sinceIso, startDate);

  // Sync Recruiting project if configured
  if (recruitProjectId) {
    upserted += await syncProjectTasks(recruitProjectId, mode, sinceIso, startDate);
  }

  const totalCount = await prisma.asanaTask.count();
  await prisma.roadmapSyncMeta.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', lastSyncedAt: new Date(), lastMode: mode, taskCount: totalCount },
    update: { lastSyncedAt: new Date(), lastMode: mode, taskCount: totalCount },
  });

  console.log(`[Asana] Tasks: ${upserted} upserted (${mode}), total DB: ${totalCount}`);
  return { upserted, totalCount };
}

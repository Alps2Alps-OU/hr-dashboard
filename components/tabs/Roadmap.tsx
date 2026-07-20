'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import EmployeeEngagement from '@/components/EmployeeEngagement';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncMeta { lastSyncedAt: string | null; lastMode: string | null; taskCount: number; }
interface KPIs {
  doneThisWeek: number; doneLastWeek: number; plannedThisWeek: number;
  inProgress: number; overdue: number; dueThisWeek: number; avgClosureTime: number | null;
}
interface QuarterStats { planned: number; completed: number; remaining: number; }
interface Task {
  id: string; gid: string; projectGid: string; name: string; completed: boolean;
  dueOn: string | null; completedAt: string | null; createdAt: string;
  assignee: string | null; section: string | null; quarter: string | null;
  daysOpen: number; daysOverdue: number | null;
}
interface OKR { id: string; title: string; quarter: string; progressPercent: number; }
interface RoadmapData {
  isEmpty: boolean;
  sync?: SyncMeta;
  kpis?: KPIs;
  byQuarter?: Record<string, QuarterStats>;
  roadmapYear?: number;
  bottlenecks?: Task[];
  tasks?: Task[];
  okrsByQuarter?: Record<string, OKR[]>;
  lastAsanaSync?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUARTER_MONTHS: Record<string, string[]> = {
  Q1: ['Jan', 'Feb', 'Mar'],
  Q2: ['Apr', 'May', 'Jun'],
  Q3: ['Jul', 'Aug', 'Sep'],
  Q4: ['Oct', 'Nov', 'Dec'],
};

const MONTH_IDX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentQ(): string {
  const m = new Date().getMonth();
  return m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
}

function getWeekBounds(offset = 0): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const toMon = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + toMon + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function weekOptionLabel(offset: number): string {
  const { start, end } = getWeekBounds(offset);
  const range = `${fmtShort(start)} – ${fmtShort(end)}`;
  if (offset === 0) return `This Week  (${range})`;
  if (offset === -1) return `Last Week  (${range})`;
  return range;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function matchAssignee(task: Task, filter: string): boolean {
  if (filter === 'All') return true;
  return (task.assignee ?? '').toLowerCase().includes(filter.toLowerCase());
}

function statusOf(task: Task): 'done' | 'overdue' | 'open' | 'nodue' {
  if (task.completed) return 'done';
  if ((task.daysOverdue ?? 0) > 0) return 'overdue';
  if (!task.dueOn) return 'nodue';
  return 'open';
}

function asanaUrl(task: Task): string {
  return `https://app.asana.com/0/${task.projectGid}/${task.gid}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({ label, value, color = 'blue' }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.slate}`}>
      <div className="text-xs font-medium opacity-70 mb-1 leading-tight">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function QuarterBar({ q, stats }: { q: string; stats: QuarterStats }) {
  const pct = stats.planned > 0 ? Math.round((stats.completed / stats.planned) * 100) : 0;
  const isCurrentQ = q === currentQ();
  return (
    <div className={`rounded-xl border p-4 ${isCurrentQ ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          {q}{isCurrentQ && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
        </span>
        <span className="text-sm font-bold text-slate-600">{pct}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#f59e0b' }} />
      </div>
      <div className="flex gap-3 text-xs text-slate-500">
        <span>Planned <strong className="text-slate-700">{stats.planned}</strong></span>
        <span>Done <strong className="text-green-600">{stats.completed}</strong></span>
        <span>Remaining <strong className="text-slate-600">{stats.remaining}</strong></span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof statusOf> }) {
  const styles = { done: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', open: 'bg-blue-100 text-blue-700', nodue: 'bg-slate-100 text-slate-500' };
  const labels = { done: 'Done', overdue: 'Overdue', open: 'Open', nodue: 'No Due Date' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>{labels[status]}</span>;
}

function KanbanCard({ task }: { task: Task }) {
  const st = statusOf(task);
  return (
    <a href={asanaUrl(task)} target="_blank" rel="noopener noreferrer"
      className="block rounded-lg border border-slate-100 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition-all group">
      <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
        {task.name}
      </p>
      <div className="flex items-center justify-between gap-1 flex-wrap">
        {task.assignee && <span className="text-xs text-slate-400 truncate">{task.assignee}</span>}
        <div className="flex items-center gap-1 ml-auto">
          {task.dueOn && <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(task.dueOn)}</span>}
          {st === 'overdue' && <span className="text-xs font-semibold text-red-500">{task.daysOverdue}d late</span>}
        </div>
      </div>
    </a>
  );
}

function KanbanColumn({ title, tasks, colorClass, emptyText }: {
  title: string; tasks: Task[]; colorClass: string; emptyText: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tasks : tasks.slice(0, 8);
  return (
    <div className="flex flex-col rounded-xl border border-slate-100 overflow-hidden bg-slate-50 min-h-48">
      <div className={`px-4 py-3 flex items-center justify-between border-b ${colorClass}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="p-3 space-y-2 flex-1">
        {visible.length === 0
          ? <p className="text-xs text-slate-300 text-center py-6">{emptyText}</p>
          : visible.map((t) => <KanbanCard key={t.id} task={t} />)
        }
      </div>
      {tasks.length > 8 && (
        <button onClick={() => setShowAll((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium py-2 px-4 border-t border-slate-100 bg-white text-center">
          {showAll ? 'Show less' : `Show all ${tasks.length}`}
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Roadmap() {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<'changes' | 'full' | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState('Lilya');
  const [quarterFilter, setQuarterFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [showAllBottlenecks, setShowAllBottlenecks] = useState(false);
  const [doneWeekOffset, setDoneWeekOffset] = useState(0);
  const [avgClosureScope, setAvgClosureScope] = useState<'all' | 'quarter'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => { setMonthFilter(null); }, [quarterFilter]);

  const fetchData = useCallback(async (): Promise<RoadmapData> => {
    const r = await fetch('/api/roadmap');
    return r.json();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      if (d.isEmpty) {
        setLoading(false);
        setAutoSyncing(true);
        await fetch('/api/roadmap?type=full', { method: 'POST' });
        setAutoSyncing(false);
        setData(await fetchData());
      } else {
        setData(d);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async (type: 'changes' | 'full') => {
    setSyncing(type);
    try {
      await fetch(`/api/roadmap?type=${type}`, { method: 'POST' });
      setData(await fetchData());
    } finally {
      setSyncing(null);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const availableYears = useMemo((): string[] => {
    const years = new Set<string>();
    for (const t of data?.tasks ?? []) {
      const d = t.dueOn ?? t.completedAt ?? t.createdAt;
      if (d) years.add(d.slice(0, 4));
    }
    return Array.from(years).sort().reverse();
  }, [data?.tasks]);

  const filteredTasks = useMemo(() => {
    const doneWeek = getWeekBounds(doneWeekOffset);
    const prevWeek = getWeekBounds(doneWeekOffset - 1);
    const thisWeek = getWeekBounds(0);
    const now = new Date();
    const next7 = new Date(now.getTime() + 7 * 86_400_000);
    return (data?.tasks ?? []).filter((t) => {
      if (!matchAssignee(t, assigneeFilter)) return false;
      if (quarterFilter !== 'All' && t.quarter !== quarterFilter) return false;
      if (monthFilter !== null) {
        const idx = MONTH_IDX[monthFilter];
        const d = t.dueOn ?? t.completedAt;
        if (!d || new Date(d).getUTCMonth() !== idx) return false;
      }
      if (yearFilter !== 'All') {
        const d = t.dueOn ?? t.completedAt;
        if (!d || !d.startsWith(yearFilter)) return false;
      }
      const st = statusOf(t);
      if (statusFilter === 'Done This Week') {
        if (st !== 'done' || !t.completedAt) return false;
        const d = new Date(t.completedAt);
        if (d < doneWeek.start || d > doneWeek.end) return false;
      } else if (statusFilter === 'Done Last Week') {
        if (st !== 'done' || !t.completedAt) return false;
        const d = new Date(t.completedAt);
        if (d < prevWeek.start || d > prevWeek.end) return false;
      } else if (statusFilter === 'Planned This Week') {
        if (!t.dueOn) return false;
        const d = new Date(t.dueOn);
        if (d < thisWeek.start || d > thisWeek.end) return false;
      } else if (statusFilter === 'In Progress') {
        if (st !== 'open') return false;
      } else if (statusFilter === 'Overdue') {
        if (st !== 'overdue') return false;
      } else if (statusFilter === 'Due This Week') {
        if (t.completed || !t.dueOn) return false;
        const d = new Date(t.dueOn);
        if (d <= now || d > next7) return false;
      } else if (statusFilter === 'No Due Date') {
        if (st !== 'nodue') return false;
      }
      // Date range filter — uses completedAt for done tasks, dueOn for others
      if (dateFrom || dateTo) {
        const relevantDate = t.completed ? t.completedAt : t.dueOn;
        if (!relevantDate) return false;
        const d = new Date(relevantDate);
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }
      }
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data?.tasks, assigneeFilter, quarterFilter, monthFilter, yearFilter, statusFilter, search, doneWeekOffset, dateFrom, dateTo]);

  const kpis = useMemo((): KPIs | null => {
    if (!data?.tasks) return data?.kpis ?? null;
    const now = new Date();
    const doneWeek = getWeekBounds(doneWeekOffset);
    const prevWeek = getWeekBounds(doneWeekOffset - 1);
    const next7 = new Date(now.getTime() + 7 * 86_400_000);
    const q = quarterFilter !== 'All' ? quarterFilter : currentQ();

    const base = data.tasks.filter((t) =>
      matchAssignee(t, assigneeFilter) && (quarterFilter === 'All' || t.quarter === quarterFilter)
    );
    const done = base.filter((t) => t.completed && t.completedAt);
    return {
      doneThisWeek: done.filter((t) => { const d = new Date(t.completedAt!); return d >= doneWeek.start && d <= doneWeek.end; }).length,
      doneLastWeek: done.filter((t) => { const d = new Date(t.completedAt!); return d >= prevWeek.start && d <= prevWeek.end; }).length,
      plannedThisWeek: base.filter((t) => t.dueOn && new Date(t.dueOn) >= doneWeek.start && new Date(t.dueOn) <= doneWeek.end).length,
      inProgress: base.filter((t) => !t.completed).length,
      overdue: base.filter((t) => !t.completed && (t.daysOverdue ?? 0) > 0).length,
      dueThisWeek: base.filter((t) => !t.completed && t.dueOn && new Date(t.dueOn) > now && new Date(t.dueOn) <= next7).length,
      avgClosureTime: (() => {
        const scoped = avgClosureScope === 'quarter' ? done.filter((t) => t.quarter === q) : done;
        if (!scoped.length) return null;
        const total = scoped.reduce((s, t) =>
          s + Math.floor(Math.abs(new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86_400_000), 0);
        return Math.round(total / scoped.length);
      })(),
    };
  }, [data, assigneeFilter, quarterFilter, doneWeekOffset, avgClosureScope]);

  const filteredBottlenecks = useMemo(() =>
    (data?.bottlenecks ?? []).filter((t) => matchAssignee(t, assigneeFilter)),
    [data?.bottlenecks, assigneeFilter]
  );

  const kanban = useMemo(() => {
    const now = new Date();
    const thisWeek = getWeekBounds(0);
    const lastWeek = getWeekBounds(-1);
    const twoWeeksOut = new Date(now.getTime() + 14 * 86_400_000);
    const base = (data?.tasks ?? []).filter((t) => matchAssignee(t, assigneeFilter));
    return {
      doneLastWeek: base.filter((t) =>
        t.completed && t.completedAt &&
        new Date(t.completedAt) >= lastWeek.start && new Date(t.completedAt) <= lastWeek.end
      ),
      thisWeek: base.filter((t) =>
        !t.completed && t.dueOn &&
        new Date(t.dueOn) >= thisWeek.start && new Date(t.dueOn) <= thisWeek.end
      ),
      upcoming: base
        .filter((t) => !t.completed && t.dueOn && new Date(t.dueOn) > thisWeek.end && new Date(t.dueOn) <= twoWeeksOut)
        .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? '')),
    };
  }, [data?.tasks, assigneeFilter]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (autoSyncing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm text-center">
          Performing initial sync with Asana…<br />
          <span className="text-slate-400 text-xs">This takes about 30 seconds</span>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="grid grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}</div>
        <div className="grid grid-cols-7 gap-3">{Array(7).fill(0).map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div>
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!data) return <div className="text-slate-500 text-center py-16">Failed to load roadmap data.</div>;

  const activeKpis = kpis ?? data.kpis;
  const byQuarter = data.byQuarter ?? {};
  const okrsByQuarter = (data.okrsByQuarter ?? {}) as Record<string, OKR[]>;
  const visibleBottlenecks = showAllBottlenecks ? filteredBottlenecks : filteredBottlenecks.slice(0, 20);

  // Week label for KPI cards
  const doneWeekLabel = doneWeekOffset === 0 ? 'Done This Week'
    : doneWeekOffset === -1 ? 'Done Last Week'
    : `Done ${fmtShort(getWeekBounds(doneWeekOffset).start)}–${fmtShort(getWeekBounds(doneWeekOffset).end)}`;
  const prevWeekLabel = doneWeekOffset === 0 ? 'Done Last Week'
    : `Done ${fmtShort(getWeekBounds(doneWeekOffset - 1).start)}–${fmtShort(getWeekBounds(doneWeekOffset - 1).end)}`;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">HR Roadmap</h1>
          {data.sync && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last synced: {fmtSync(data.sync.lastSyncedAt)} · {data.sync.taskCount} tasks in DB
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => triggerSync('changes')} disabled={syncing !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">
            {syncing === 'changes' ? '⟳ Syncing…' : '⟳ Sync Changes'}
          </button>
          <button onClick={() => triggerSync('full')} disabled={syncing !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all">
            {syncing === 'full' ? '⟳ Rebuilding…' : '↺ Full Rebuild'}
          </button>
        </div>
      </div>

      {/* ── Strategic Roadmap ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Strategic Roadmap {data.roadmapYear ?? 2026}</h2>
          <p className="text-xs text-slate-400 mt-0.5">Tasks due in {data.roadmapYear ?? 2026}, grouped by quarter</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => (
            <QuarterBar key={q} q={q} stats={byQuarter[q] ?? { planned: 0, completed: 0, remaining: 0 }} />
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Assignee: Lilya only */}
        <div className="flex gap-1">
          {(['All', 'Lilya'] as const).map((a) => (
            <button key={a} onClick={() => setAssigneeFilter(a)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${assigneeFilter === a ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {a}
            </button>
          ))}
        </div>

        {/* Year */}
        {availableYears.length > 1 && (
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="All">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {/* Quarter */}
        <div className="flex gap-1">
          {(['All', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => (
            <button key={q} onClick={() => setQuarterFilter(q)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${quarterFilter === q ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {q !== 'All' && q === currentQ()
                ? <>{q}<span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /></>
                : q}
            </button>
          ))}
        </div>

        {/* Month sub-filter */}
        {quarterFilter !== 'All' && (
          <div className="flex gap-1">
            <button onClick={() => setMonthFilter(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${monthFilter === null ? 'bg-slate-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              All
            </button>
            {(QUARTER_MONTHS[quarterFilter] ?? []).map((m) => (
              <button key={m} onClick={() => setMonthFilter(monthFilter === m ? null : m)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${monthFilter === m ? 'bg-slate-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Week picker + KPI cards ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Done week:</span>
          <select value={doneWeekOffset} onChange={(e) => setDoneWeekOffset(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            {Array.from({ length: 12 }, (_, i) => -i).map((i) => (
              <option key={i} value={i}>{weekOptionLabel(i)}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-xs ml-auto">
            <span className="text-slate-400">Avg Closure:</span>
            {(['all', 'quarter'] as const).map((s) => (
              <button key={s} onClick={() => setAvgClosureScope(s)}
                className={`px-2 py-0.5 rounded font-medium transition-all ${avgClosureScope === s ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>
                {s === 'all' ? 'All Time' : `${quarterFilter !== 'All' ? quarterFilter : currentQ()} Only`}
              </button>
            ))}
          </div>
        </div>

        {activeKpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <KPICard label={doneWeekLabel} value={activeKpis.doneThisWeek} color="green" />
            <KPICard label={prevWeekLabel} value={activeKpis.doneLastWeek} color="slate" />
            <KPICard label="Planned This Week" value={activeKpis.plannedThisWeek} color="blue" />
            <KPICard label="In Progress" value={activeKpis.inProgress} color="purple" />
            <KPICard label="Overdue" value={activeKpis.overdue} color={activeKpis.overdue > 0 ? 'red' : 'slate'} />
            <KPICard label="Due This Week" value={activeKpis.dueThisWeek} color={activeKpis.dueThisWeek > 0 ? 'amber' : 'slate'} />
            <KPICard label="Avg Closure" value={activeKpis.avgClosureTime != null ? `${activeKpis.avgClosureTime}d` : '—'} color="slate" />
          </div>
        )}
      </div>

      {/* ── Kanban Board ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Task Board</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live view · click any task to open in Asana
            {assigneeFilter !== 'All' && <span className="ml-2 font-medium text-slate-500">· {assigneeFilter}</span>}
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KanbanColumn
            title="Done Last Week"
            tasks={kanban.doneLastWeek}
            colorClass="bg-green-50 border-green-100 text-green-700"
            emptyText="No completed tasks last week"
          />
          <KanbanColumn
            title="Due This Week"
            tasks={kanban.thisWeek}
            colorClass="bg-blue-50 border-blue-100 text-blue-700"
            emptyText="No tasks due this week"
          />
          <KanbanColumn
            title="Upcoming (next 2 weeks)"
            tasks={kanban.upcoming}
            colorClass="bg-amber-50 border-amber-100 text-amber-700"
            emptyText="No upcoming tasks"
          />
        </div>
      </div>

      {/* ── Bottlenecks ── */}
      {filteredBottlenecks.length > 0 && (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
            <span className="text-red-500">⚠</span>
            <h2 className="text-sm font-semibold text-slate-700">Bottlenecks — Overdue Tasks</h2>
            <span className="ml-auto text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {filteredBottlenecks.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Task</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignee</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {visibleBottlenecks.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800 max-w-xs">
                      <a href={asanaUrl(t)} target="_blank" rel="noopener noreferrer"
                        className="hover:text-blue-600 transition-colors line-clamp-2 block">
                        {t.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.assignee ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(t.dueOn)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${(t.daysOverdue ?? 0) > 14 ? 'text-red-600' : 'text-amber-600'}`}>
                        {t.daysOverdue}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredBottlenecks.length > 20 && (
            <div className="px-5 py-3 border-t border-slate-100 text-center">
              <button onClick={() => setShowAllBottlenecks((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                {showAllBottlenecks ? 'Show less' : `Show all ${filteredBottlenecks.length} overdue tasks`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── All Tasks Table ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          {/* Row 1: title + search */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">All Tasks</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-48" />
          </div>
          {/* Row 2: status tabs matching KPI cards */}
          <div className="flex flex-wrap gap-1.5">
            {(['All', 'Done This Week', 'Done Last Week', 'Planned This Week', 'In Progress', 'Overdue', 'Due This Week', 'No Due Date'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
          {/* Row 3: date range filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Date range:</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-slate-400 hover:text-red-500 font-medium transition-colors">
                × Clear
              </button>
            )}
            <span className="text-xs text-slate-300 ml-1">completion date for done · due date for others</span>
          </div>
          <div className="text-xs text-slate-400">{filteredTasks.length} tasks shown</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Task</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignee</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Section</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No tasks match the current filters.</td></tr>
              ) : filteredTasks.slice(0, 200).map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800 max-w-sm">
                    <a href={asanaUrl(t)} target="_blank" rel="noopener noreferrer"
                      className="hover:text-blue-600 transition-colors line-clamp-2 block">
                      {t.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{t.assignee ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{t.section ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(t.dueOn)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {t.completedAt
                      ? <span className="text-green-600 font-medium">{fmtDate(t.completedAt)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={statusOf(t)} /></td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums text-xs">{t.daysOpen}d</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length > 200 && (
            <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
              Showing 200 of {filteredTasks.length} — use filters or search to narrow down
            </div>
          )}
        </div>
      </div>

      {/* ── Employee Engagement (Milestone 3) ── */}
      <EmployeeEngagement />

      {/* ── OKR Progress ── */}
      {Object.keys(okrsByQuarter).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">OKR Progress</h2>
          </div>
          <div className="p-5 space-y-6">
            {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
              const qOkrs = okrsByQuarter[q];
              if (!qOkrs?.length) return null;
              return (
                <div key={q}>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{q}</div>
                  <div className="space-y-3">
                    {qOkrs.map((okr) => (
                      <div key={okr.id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-slate-700">{okr.title}</span>
                          <span className="font-bold text-slate-600 tabular-nums">{okr.progressPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${okr.progressPercent}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

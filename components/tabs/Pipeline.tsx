'use client';

import { useEffect, useState } from 'react';
import KPICard from '../KPICard';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

type HiringStatusGroup = 'open' | 'active' | 'offered' | 'on_hold' | 'hired' | 'cancelled' | 'other';
type OkrStatusGroup    = 'hired' | 'new' | 'ongoing' | 'on_hold' | 'closed' | 'other';

interface HiringRecord {
  position: string; department: string; recruiter: string; hiringManager: string;
  rawStatus: string; statusGroup: HiringStatusGroup; openedDate: string;
  runningDays: number | null; complexity: string; priority: string;
  closedDate: string; timeToHire: number | null; timeToFill: number | null;
  source: string; quarter: string; candidateName: string;
}

interface OkrVacancy {
  position: string; project: string; hiringManager: string; recruiter: string;
  level: string; openedDate: string; rawStatus: string; statusGroup: OkrStatusGroup;
  stages: {
    cvScreening: number; hrInterview: number; hrShortlisted: number;
    competency: number; technical: number; finalInterview: number;
    referenceCheck: number; offerDone: number; offerAccepted: number; offerRejected: number;
  };
}

interface OkrWeekSnapshot {
  weekRange: string; startDate: string; totalDeclared: number;
  vacancies: OkrVacancy[];
}

interface PipelineData {
  summary: {
    totalActive: number; openCount: number; activeCount: number;
    offeredCount: number; onHoldCount: number; hired2026: number;
    avgRunningDays: number; currentWeekVacancies: number;
  };
  active: HiringRecord[];
  hired2026: HiringRecord[];
  sourceBreakdown: Array<{ source: string; count: number }>;
  byDept: Array<{ dept: string; total: number; open: number; active: number; offered: number; on_hold: number }>;
  hiresPerMonth: Array<{ month: string; count: number }>;
  currentWeek: OkrWeekSnapshot | null;
  allWeeks: OkrWeekSnapshot[];
  weeklyTrend: Array<{ week: string; date: string; total: number; hired: number }>;
}

// ── Styling ───────────────────────────────────────────────────────────────────

const HIRING_STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  open:    { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: '#3b82f6' },
  active:  { bg: 'bg-violet-100', text: 'text-violet-700', dot: '#8b5cf6' },
  offered: { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: '#f59e0b' },
  on_hold: { bg: 'bg-orange-100', text: 'text-orange-700', dot: '#f97316' },
  other:   { bg: 'bg-slate-100',  text: 'text-slate-500',  dot: '#94a3b8' },
};

const OKR_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  hired:   { bg: 'bg-green-100',  text: 'text-green-700'  },
  new:     { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  ongoing: { bg: 'bg-violet-100', text: 'text-violet-700' },
  on_hold: { bg: 'bg-orange-100', text: 'text-orange-700' },
  closed:  { bg: 'bg-slate-100',  text: 'text-slate-500'  },
  other:   { bg: 'bg-slate-100',  text: 'text-slate-500'  },
};

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  Urgent: { bg: 'bg-red-100',    text: 'text-red-700'    },
  High:   { bg: 'bg-orange-100', text: 'text-orange-700' },
  Mid:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Low:    { bg: 'bg-slate-100',  text: 'text-slate-500'  },
};

const COMPLEXITY_COLORS: Record<string, string> = {
  A: 'text-blue-600 bg-blue-50',
  B: 'text-violet-600 bg-violet-50',
  C: 'text-amber-600 bg-amber-50',
};

const SRC_COLORS  = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
const DEPT_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];

const STAGE_LABELS: Array<{ key: keyof OkrVacancy['stages']; label: string; color: string }> = [
  { key: 'cvScreening',    label: 'CV Screening',    color: '#e2e8f0' },
  { key: 'hrInterview',    label: 'HR Interview',    color: '#bfdbfe' },
  { key: 'hrShortlisted',  label: 'Shortlisted',     color: '#a5b4fc' },
  { key: 'competency',     label: 'Competency',      color: '#8b5cf6' },
  { key: 'technical',      label: 'Technical',       color: '#6366f1' },
  { key: 'finalInterview', label: 'Final Interview', color: '#f59e0b' },
  { key: 'referenceCheck', label: 'Reference Check', color: '#10b981' },
  { key: 'offerDone',      label: 'Offer Done',      color: '#22c55e' },
  { key: 'offerAccepted',  label: 'Offer Accepted',  color: '#16a34a' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function HiringStatusBadge({ status }: { status: HiringStatusGroup }) {
  const s = HIRING_STATUS_STYLE[status] ?? HIRING_STATUS_STYLE.other;
  const labels: Record<string, string> = { open: 'Open', active: 'Ongoing', offered: 'Offered', on_hold: 'On Hold', other: 'Other' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {labels[status] ?? status}
    </span>
  );
}

function OkrStatusBadge({ status, raw }: { status: OkrStatusGroup; raw: string }) {
  const s = OKR_STATUS_STYLE[status] ?? OKR_STATUS_STYLE.other;
  const short = raw.split('\n')[0].slice(0, 40);
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>{short}</span>;
}

// Mini stage bar for a vacancy
function StageBar({ stages }: { stages: OkrVacancy['stages'] }) {
  const cells = STAGE_LABELS.filter((s) => stages[s.key] > 0);
  if (cells.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {cells.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ background: s.color + '40', color: s.color === '#e2e8f0' ? '#64748b' : s.color }}>
          {s.label} <strong>{stages[s.key]}</strong>
        </span>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function okrRunningDays(openedDate: string): number | null {
  if (!openedDate) return null;
  const parts = openedDate.split('/');
  if (parts.length !== 3) return null;
  const start = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  if (isNaN(start.getTime())) return null;
  const days = Math.round((Date.now() - start.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

export default function Pipeline() {
  const [data, setData]       = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [tab, setTab]         = useState<'active' | 'hired'>('active');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);

  useEffect(() => {
    fetch('/api/pipeline')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-xl" />)}</div>
      <div className="h-64 bg-slate-200 rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="text-4xl">⚠️</div>
      <div className="font-semibold text-slate-700">Could not load pipeline data</div>
      <div className="text-xs max-w-lg text-center bg-red-50 text-red-600 p-3 rounded-lg font-mono">{error}</div>
    </div>
  );

  if (!data) return null;

  const { summary, active, hired2026, sourceBreakdown, byDept, hiresPerMonth, weeklyTrend, allWeeks = [] } = data;

  // Week selector — most recent week first
  const weeksDesc = [...allWeeks].reverse();
  const selectedWeek = weeksDesc[selectedWeekIdx] ?? data.currentWeek ?? null;

  // Sort & filter active pipeline
  const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Mid: 2, Low: 3 };
  const filtered = active
    .filter((r) => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.position.toLowerCase().includes(q) || r.department.toLowerCase().includes(q) || r.hiringManager.toLowerCase().includes(q);
      const matchStatus = filterStatus === 'all' || r.statusGroup === filterStatus;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 9, pb = priorityOrder[b.priority] ?? 9;
      return pa !== pb ? pa - pb : (b.runningDays ?? 0) - (a.runningDays ?? 0);
    });

  const statusOptions = ['all', 'open', 'active', 'offered', 'on_hold'];

  // OKR current week — active vacancies only (filter out already hired/closed)
  const okrActive = currentWeek?.vacancies.filter((v) => v.statusGroup !== 'hired' && v.statusGroup !== 'closed') ?? [];
  const okrHired  = currentWeek?.vacancies.filter((v) => v.statusGroup === 'hired') ?? [];

  // Weekly trend — last 20 weeks
  const trendData = weeklyTrend.slice(-20).map((w) => ({
    week: w.week,
    'Open': w.total - w.hired,
    'Hired': w.hired,
  }));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Recruitment Pipeline</h1>
        <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">Live · Hirings + OKR 2026</span>
      </div>

      {/* KPIs — active pipeline (from Hirings) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Open / New"   value={summary.openCount}       gradient="bg-gradient-to-br from-blue-500 to-indigo-600"   icon="🎯" subtitle="actively searching" />
        <KPICard title="Ongoing"      value={summary.activeCount}     gradient="bg-gradient-to-br from-violet-500 to-purple-600" icon="🔍" subtitle="search in progress" />
        <KPICard title="Offer Stage"  value={summary.offeredCount}    gradient="bg-gradient-to-br from-amber-500 to-orange-600"  icon="📋" subtitle="offer sent" />
        <KPICard title="On Hold"      value={summary.onHoldCount}     gradient="bg-gradient-to-br from-slate-500 to-slate-700"   icon="⏸️" subtitle="paused" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Hired in 2026"   value={summary.hired2026}        gradient="bg-gradient-to-br from-emerald-500 to-teal-600"  icon="✅" subtitle="this year" />
        <KPICard title="Avg Running"     value={`${summary.avgRunningDays}d`} gradient="bg-gradient-to-br from-sky-500 to-cyan-600" icon="⏱️" subtitle="active positions" warning={summary.avgRunningDays > 45} />
        <KPICard title="This Week (OKR)" value={summary.currentWeekVacancies} gradient="bg-gradient-to-br from-indigo-500 to-blue-600" icon="📅" subtitle="active vacancies" />
        <KPICard title="Total Active"    value={summary.totalActive}      gradient="bg-gradient-to-br from-slate-400 to-slate-600"  icon="📊" subtitle="hirings tracker" />
      </div>

      {/* OKR 2026 — Week snapshot with selector */}
      {weeksDesc.length > 0 && (
        <SectionCard
          title={`Pipeline Snapshot — ${selectedWeek?.weekRange ?? ''}`}
          subtitle={selectedWeek ? `OKR 2026 tracker · ${selectedWeek.vacancies.length} vacancies · ${selectedWeek.vacancies.filter((v) => v.statusGroup === 'hired').length} hired/closed` : ''}
          action={
            <select
              value={selectedWeekIdx}
              onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {weeksDesc.map((w, i) => (
                <option key={i} value={i}>{w.weekRange}{i === 0 ? ' (current)' : ''}</option>
              ))}
            </select>
          }
        >
          {(() => {
            const okrActive = selectedWeek?.vacancies.filter((v) => v.statusGroup !== 'hired' && v.statusGroup !== 'closed') ?? [];
            const okrHired  = selectedWeek?.vacancies.filter((v) => v.statusGroup === 'hired') ?? [];
            return (
              <>
                {okrActive.length === 0 ? (
                  <div className="text-slate-400 text-sm py-4 text-center">All vacancies this week are hired or closed.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-left">Position</th>
                          <th className="px-4 py-3 text-left">Open Date</th>
                          <th className="px-4 py-3 text-right">Running</th>
                          <th className="px-4 py-3 text-center">Level</th>
                          <th className="px-4 py-3 text-left">Project</th>
                          <th className="px-4 py-3 text-left">Hiring Manager</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Pipeline Stages</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {okrActive.map((v, i) => {
                          const running = okrRunningDays(v.openedDate);
                          return (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-medium text-slate-800">{v.position}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs font-mono">{v.openedDate || '—'}</td>
                              <td className="px-4 py-3 text-right">
                                {running != null
                                  ? <span className={`font-mono text-xs font-semibold ${running > 60 ? 'text-red-600' : running > 30 ? 'text-amber-600' : 'text-slate-600'}`}>{running}d</span>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {v.level
                                  ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${COMPLEXITY_COLORS[v.level] ?? 'text-slate-500 bg-slate-50'}`}>{v.level}</span>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{v.project || '—'}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{v.hiringManager || '—'}</td>
                              <td className="px-4 py-3"><OkrStatusBadge status={v.statusGroup} raw={v.rawStatus} /></td>
                              <td className="px-4 py-3"><StageBar stages={v.stages} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {okrHired.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    <span className="text-xs text-slate-500 font-medium self-center">Hired/Closed this week:</span>
                    {okrHired.map((v, i) => (
                      <span key={i} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
                        ✓ {v.position}{v.rawStatus ? ` — ${v.rawStatus.split('\n')[0].replace(/hired\s*[-–]\s*/i, '').trim()}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </SectionCard>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Weekly trend from OKR */}
        {trendData.length > 0 && (
          <SectionCard title="Weekly Vacancies (OKR 2026)" subtitle="Open vs. hired per week">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="Open"  fill="#3b82f6" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="Hired" fill="#10b981" radius={[3,3,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* Hires per month (Hirings tab) */}
        <SectionCard title="Monthly Hires (Hirings tracker)" subtitle="Closed/start dates — last 12 months">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hiresPerMonth} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Hires" fill="#8b5cf6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Source of hire */}
        {sourceBreakdown.length > 0 && (
          <SectionCard title="Source of Hire" subtitle="All hires (Hirings tracker)">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="45%" height={180}>
                <PieChart>
                  <Pie data={sourceBreakdown} dataKey="count" nameKey="source"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {sourceBreakdown.map((_, i) => <Cell key={i} fill={SRC_COLORS[i % SRC_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {sourceBreakdown.slice(0, 7).map((s, i) => (
                  <div key={s.source} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SRC_COLORS[i % SRC_COLORS.length] }} />
                    <span className="text-slate-600 flex-1 truncate">{s.source}</span>
                    <span className="font-bold text-slate-800">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        {/* Open by dept */}
        {byDept.length > 0 && (
          <SectionCard title="Open Roles by Department" subtitle="Active pipeline (Hirings tracker)">
            <ResponsiveContainer width="100%" height={Math.max(180, byDept.length * 32)}>
              <BarChart data={byDept} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="dept" width={130} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="open"    name="Open"    fill="#3b82f6" stackId="a" />
                <Bar dataKey="active"  name="Ongoing" fill="#8b5cf6" stackId="a" />
                <Bar dataKey="offered" name="Offered" fill="#f59e0b" stackId="a" />
                <Bar dataKey="on_hold" name="On Hold" fill="#f97316" stackId="a" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}
      </div>

      {/* Pipeline table */}
      <SectionCard
        title="Full Pipeline (Hirings tracker)"
        subtitle={`${filtered.length} of ${active.length} active · ${hired2026.length} hired in 2026`}
        action={
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
            {(['active', 'hired'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'active' ? `Active (${active.length})` : `Hired 2026 (${hired2026.length})`}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'active' && (
          <>
            <div className="flex gap-3 mb-4 flex-wrap">
              <input type="text" placeholder="Search role, dept, manager…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-1 flex-wrap">
                {statusOptions.map((s) => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s === 'all' ? 'All' : s === 'on_hold' ? 'On Hold' : s === 'active' ? 'Ongoing' : s.charAt(0).toUpperCase() + s.slice(1)}
                    {s !== 'all' && <span className="ml-1 opacity-70">({active.filter((r) => r.statusGroup === s).length})</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Position</th>
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Priority</th>
                    <th className="px-4 py-3 text-center">Level</th>
                    <th className="px-4 py-3 text-right">Running</th>
                    <th className="px-4 py-3 text-left">Hiring Manager</th>
                    <th className="px-4 py-3 text-left">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0
                    ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No roles match</td></tr>
                    : filtered.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-800">{r.position}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.department || '—'}</td>
                        <td className="px-4 py-3"><HiringStatusBadge status={r.statusGroup} /></td>
                        <td className="px-4 py-3">
                          {r.priority
                            ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${(PRIORITY_STYLE[r.priority] ?? { bg: 'bg-slate-100', text: 'text-slate-500' }).bg} ${(PRIORITY_STYLE[r.priority] ?? { bg: 'bg-slate-100', text: 'text-slate-500' }).text}`}>{r.priority}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.complexity
                            ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${COMPLEXITY_COLORS[r.complexity] ?? 'text-slate-500 bg-slate-50'}`}>{r.complexity}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.runningDays != null
                            ? <span className={`font-mono text-xs font-semibold ${r.runningDays > 60 ? 'text-red-600' : r.runningDays > 30 ? 'text-amber-600' : 'text-slate-600'}`}>{r.runningDays}d</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.hiringManager || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.openedDate || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'hired' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Position</th>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-left">Candidate</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-center">Level</th>
                  <th className="px-4 py-3 text-right">Time to Hire</th>
                  <th className="px-4 py-3 text-right">Time to Fill</th>
                  <th className="px-4 py-3 text-left">Start Date</th>
                  <th className="px-4 py-3 text-left">Quarter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {hired2026.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No 2026 hires yet</td></tr>
                  : hired2026.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.position}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{r.candidateName || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.source || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.complexity
                          ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${COMPLEXITY_COLORS[r.complexity] ?? 'text-slate-500 bg-slate-50'}`}>{r.complexity}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">{r.timeToHire != null ? `${r.timeToHire}d` : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">{r.timeToFill != null ? `${r.timeToFill}d` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.closedDate || r.openedDate || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.quarter || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

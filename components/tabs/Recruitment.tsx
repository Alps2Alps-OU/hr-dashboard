'use client';

import { useEffect, useState } from 'react';
import KPICard from '../KPICard';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecruitData {
  kpis: {
    totalActive: number; totalEmployees: number;
    hiresLast30: number; hiresLast90: number; exitsLast90: number;
    voluntaryExitsLast90: number; involuntaryExitsLast90: number; mutualAgreementExitsLast90: number;
    avgTenureMonths: number;
    voluntaryExits: number; involuntaryExits: number; mutualAgreementExits: number;
    probationInProgress: number;
  };
  hiringTrend: Array<{ month: string; hires: number; exits: number; net: number }>;
  headcountByDept: Array<{ dept: string; count: number }>;
  levelDist: Array<{ level: string; label: string; count: number }>;
  tenureDist: Array<{ bucket: string; count: number }>;
  recentHires: Array<{ id: string; name: string; department: string; level: string; startDate: string; isActive: boolean }>;
}

type HiringStatus = 'open' | 'active' | 'offered' | 'on_hold' | 'hired' | 'cancelled' | 'other';
type OkrStatus    = 'hired' | 'new' | 'ongoing' | 'on_hold' | 'closed' | 'other';

interface HiringRecord {
  position: string; department: string; recruiter: string; hiringManager: string;
  rawStatus: string; statusGroup: HiringStatus; openedDate: string;
  runningDays: number | null; complexity: string; priority: string;
  closedDate: string; timeToHire: number | null; timeToFill: number | null;
  source: string; quarter: string; candidateName: string;
}

interface OkrVacancy {
  position: string; project: string; hiringManager: string; recruiter: string;
  openedDate: string; rawStatus: string; statusGroup: OkrStatus;
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
    totalActive: number; ongoingCount: number;
    offeredCount: number; onHoldCount: number; refCheckCount: number;
    hiredThisWeek: number; hiredLastWeek: number;
    openByLevel: Record<string, number>;
    avgRunningDays: number;
    avgRunningByLevel: { A: number; B: number; C: number };
    currentWeekVacancies: number;
  };
  hiredByYear: Record<string, { byQ: Record<string, number>; byM: Record<string, number> }>;
  active: HiringRecord[];
  hired2026Table: HiringRecord[];
  sourceBreakdown: Array<{ source: string; count: number }>;
  byDept: Array<{ dept: string; total: number; open: number; active: number; offered: number; on_hold: number }>;
  hiresPerMonth: Array<{ month: string; count: number }>;
  currentWeek: OkrWeekSnapshot | null;
  weeklyTrend: Array<{ week: string; date: string; total: number; hired: number }>;
  allWeeks: OkrWeekSnapshot[];
  allVacancies: UnifiedVacancy[];
}

type UnifiedVacancy = HiringRecord & { year: string; okrStages: OkrVacancy['stages'] | null };

// ── Styling ───────────────────────────────────────────────────────────────────

const DEPT_COLORS  = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#f97316','#a855f7'];
const LEVEL_COLORS: Record<string, string> = { A: '#3b82f6', B: '#8b5cf6', C: '#f59e0b' };
const SRC_COLORS   = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];

const HIRE_STATUS: Record<string, { bg: string; text: string; dot: string }> = {
  open:      { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: '#3b82f6' },
  active:    { bg: 'bg-violet-100', text: 'text-violet-700', dot: '#8b5cf6' },
  offered:   { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: '#f59e0b' },
  on_hold:   { bg: 'bg-orange-100', text: 'text-orange-700', dot: '#f97316' },
  hired:     { bg: 'bg-green-100',  text: 'text-green-700',  dot: '#22c55e' },
  cancelled: { bg: 'bg-slate-100',  text: 'text-slate-400',  dot: '#cbd5e1' },
  other:     { bg: 'bg-slate-100',  text: 'text-slate-500',  dot: '#94a3b8' },
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

const STAGE_LABELS: Array<{ key: keyof OkrVacancy['stages']; label: string; color: string }> = [
  { key: 'cvScreening',    label: 'CV Screening',    color: '#94a3b8' },
  { key: 'hrInterview',    label: 'HR Interview',    color: '#60a5fa' },
  { key: 'hrShortlisted',  label: 'Shortlisted',     color: '#818cf8' },
  { key: 'competency',     label: 'Competency',      color: '#8b5cf6' },
  { key: 'technical',      label: 'Technical/Test',  color: '#6366f1' },
  { key: 'finalInterview', label: 'Final Interview', color: '#f59e0b' },
  { key: 'referenceCheck', label: 'Ref Check',       color: '#10b981' },
  { key: 'offerDone',      label: 'Offer Done',      color: '#22c55e' },
  { key: 'offerAccepted',  label: 'Offer Accepted',  color: '#16a34a' },
  { key: 'offerRejected',  label: 'Offer Rejected',  color: '#ef4444' },
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

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function StatTile({ label, value, sub, accent }: {
  label: string; value: React.ReactNode; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</div>
      <div className={`text-2xl font-bold leading-tight ${accent ?? 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">{sub}</div>}
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StatusBadge({ status }: { status: HiringStatus }) {
  // 'open' and 'active' are both displayed as "Ongoing"
  const displayStatus = status === 'open' ? 'active' : status;
  const s = HIRE_STATUS[displayStatus] ?? HIRE_STATUS.other;
  const labels: Record<string, string> = { active: 'Open/Ongoing', offered: 'Offered', on_hold: 'On Hold', other: 'Other', hired: 'Hired', cancelled: 'Cancelled' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {labels[displayStatus] ?? displayStatus}
    </span>
  );
}

function StageBar({ stages }: { stages: OkrVacancy['stages'] }) {
  const cells = STAGE_LABELS.filter((s) => stages[s.key] > 0);
  if (cells.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {cells.map((s) => (
        <span key={s.key}
          className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ background: s.color + '25', color: s.color === '#94a3b8' ? '#64748b' : s.color }}>
          {s.label} <strong>{stages[s.key]}</strong>
        </span>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Recruitment() {
  const [rData, setRData] = useState<RecruitData | null>(null);
  const [pData, setPData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  // Unified vacancy table filters
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | ongoing | offered | on_hold | hired | cancelled
  const [vYear, setVYear]               = useState<string>('all');
  const [vPeriod, setVPeriod]           = useState<string>('all');
  // Source of Hire filters
  const [srcYear, setSrcYear]           = useState<string>('all');
  const [srcPeriod, setSrcPeriod]       = useState<string>('all');
  // Weekly Vacancies chart filter
  const [weekFilter, setWeekFilter]     = useState<string>('all'); // 'all' | 'Q1'… | 'Jan'…

  useEffect(() => {
    Promise.all([
      fetch('/api/recruitment').then((r) => r.json()),
      fetch('/api/pipeline').then((r) => r.json()),
    ]).then(([rd, pd]) => {
      if (!rd.error) setRData(rd);
      if (!pd.error) setPData(pd);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-64" />
      <div className="grid grid-cols-4 gap-4">{Array(8).fill(0).map((_,i)=><div key={i} className="h-28 bg-slate-200 rounded-xl"/>)}</div>
      <div className="h-64 bg-slate-200 rounded-xl" />
    </div>
  );

  const kpis    = rData?.kpis;
  const summary = pData?.summary;

  // ── Shared period helpers (DD/MM/YYYY) ─────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periodOptions = [
    { value: 'all', label: 'All periods' },
    { value: 'Q1',  label: 'Q1' }, { value: 'Q2', label: 'Q2' },
    { value: 'Q3',  label: 'Q3' }, { value: 'Q4', label: 'Q4' },
    ...MONTHS.map((m) => ({ value: m, label: m })),
  ];
  const monthOf = (ds: string) => {
    const p = (ds || '').split('/');
    return p.length >= 2 ? parseInt(p[1], 10) : 0;
  };
  const tsOf = (ds: string) => {
    const p = (ds || '').split('/');
    return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() : 0;
  };
  const inPeriod = (ds: string, period: string) => {
    if (period === 'all') return true;
    const mo = monthOf(ds);
    if (period === 'Q1') return mo >= 1 && mo <= 3;
    if (period === 'Q2') return mo >= 4 && mo <= 6;
    if (period === 'Q3') return mo >= 7 && mo <= 9;
    if (period === 'Q4') return mo >= 10 && mo <= 12;
    const idx = MONTHS.indexOf(period);
    return idx >= 0 && mo === idx + 1;
  };

  // Offer stats from last 8 weeks of OKR data
  const allWeeks = pData?.allWeeks ?? [];
  const recentOffers = (() => {
    const recent = allWeeks.slice(-8);
    return recent.reduce((acc, w) => {
      for (const v of w.vacancies) {
        acc.done     += v.stages.offerDone     ?? 0;
        acc.accepted += v.stages.offerAccepted ?? 0;
        acc.rejected += v.stages.offerRejected ?? 0;
      }
      return acc;
    }, { done: 0, accepted: 0, rejected: 0 });
  })();

  // ── Unified vacancy table ──────────────────────────────────────────────────────
  const allVacancies = pData?.allVacancies ?? [];
  const dateKey = (v: UnifiedVacancy) => v.closedDate || v.openedDate || '';
  const statusOf = (v: UnifiedVacancy) =>
    (v.statusGroup === 'open' || v.statusGroup === 'active') ? 'ongoing' : v.statusGroup;

  const yearOptions = [
    { value: 'all', label: 'All years' },
    ...Array.from(new Set(allVacancies.map((v) => v.year).filter(Boolean)))
      .sort().reverse().map((y) => ({ value: y, label: y })),
  ];

  // Base set = year + period + search (status counts are computed from this scope)
  const baseVacs = allVacancies.filter((v) => {
    const okYear = vYear === 'all' || v.year === vYear;
    const okPeriod = inPeriod(dateKey(v), vPeriod);
    const q = search.toLowerCase().trim();
    const okSearch = !q || [v.position, v.department, v.hiringManager, v.recruiter, v.candidateName, v.complexity, v.priority, v.source]
      .some((f) => (f || '').toLowerCase().includes(q));
    return okYear && okPeriod && okSearch;
  });

  const statusFilters = [
    { id: 'all',       label: 'All' },
    { id: 'ongoing',   label: 'Open/Ongoing' },
    { id: 'offered',   label: 'Offered' },
    { id: 'on_hold',   label: 'On Hold' },
    { id: 'hired',     label: 'Hired' },
    { id: 'cancelled', label: 'Cancelled' },
  ].map((s) => ({ ...s, count: s.id === 'all' ? baseVacs.length : baseVacs.filter((v) => statusOf(v) === s.id).length }));

  const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Mid: 2, Low: 3 };
  const statusRank: Record<string, number> = { ongoing: 0, offered: 1, on_hold: 2, hired: 3, cancelled: 4, other: 5 };
  const vacancies = baseVacs
    .filter((v) => filterStatus === 'all' || statusOf(v) === filterStatus)
    .sort((a, b) => {
      const ra = statusRank[statusOf(a)] ?? 5, rb = statusRank[statusOf(b)] ?? 5;
      if (ra !== rb) return ra - rb;
      if (ra <= 2) { // active roles → priority, then longest-running first
        const pa = priorityOrder[a.priority] ?? 9, pb = priorityOrder[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.runningDays ?? 0) - (a.runningDays ?? 0);
      }
      return tsOf(dateKey(b)) - tsOf(dateKey(a)); // closed roles → most recent first
    });

  // ── Source of Hire (filterable by year + period) ───────────────────────────────
  const srcBreakdown = (() => {
    const map: Record<string, number> = {};
    for (const v of allVacancies) {
      if (v.statusGroup !== 'hired' || !v.source?.trim()) continue;
      if (srcYear !== 'all' && v.year !== srcYear) continue;
      if (!inPeriod(dateKey(v), srcPeriod)) continue;
      const s = v.source.trim();
      map[s] = (map[s] ?? 0) + 1;
    }
    return Object.entries(map).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  })();
  const srcTotal = srcBreakdown.reduce((s, x) => s + x.count, 0);

  // ── Weekly Vacancies trend — filterable by quarter or month ─────────────────────
  const weekFilterOptions = [
    { value: 'all',  label: 'All' },
    { value: 'Q1',   label: 'Q1' }, { value: 'Q2', label: 'Q2' },
    { value: 'Q3',   label: 'Q3' }, { value: 'Q4', label: 'Q4' },
    ...MONTHS.map((m) => ({ value: m, label: m })),
  ];
  const trendData = (pData?.weeklyTrend ?? [])
    .filter((w) => inPeriod(w.date, weekFilter))
    .map((w) => ({ week: w.week, 'Open': w.total - w.hired, 'Hired': w.hired }));

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Recruitment & Pipeline</h1>
        <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded-full">PeopleForce + Google Sheets</span>
      </div>

      {/* ══════════════════════════ WORKFORCE SECTION ══════════════════════════ */}
      {kpis && <>
        <Divider label="Workforce" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Active Employees" value={kpis.totalActive}      gradient="bg-gradient-to-br from-blue-500 to-indigo-600"   icon="👥" />
          <KPICard title="New Hires (30d)"  value={kpis.hiresLast30}     gradient="bg-gradient-to-br from-emerald-500 to-teal-600"  icon="🆕" />
          <KPICard title="New Hires (90d)"  value={kpis.hiresLast90}     gradient="bg-gradient-to-br from-violet-500 to-purple-600" icon="📈" />
          <KPICard title="Avg Tenure"       value={`${kpis.avgTenureMonths}mo`} gradient="bg-gradient-to-br from-slate-500 to-slate-700" icon="📅" subtitle="active employees" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="Hiring & Exits — Last 12 Months">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rData!.hiringTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend iconType="circle" iconSize={8} />
                <Bar dataKey="hires" name="New Hires" fill="#3b82f6" radius={[3,3,0,0]} />
                <Bar dataKey="exits" name="Exits"     fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title="Headcount by Department" subtitle="Active employees">
            <ResponsiveContainer width="100%" height={Math.max(180, (rData?.headcountByDept.length ?? 0) * 28)}>
              <BarChart data={rData!.headcountByDept} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="dept" width={160} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" radius={[0,3,3,0]}>
                  {rData!.headcountByDept.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title="Role Level Distribution" subtitle="A = Specialists · B = Managers · C = Directors+">
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={rData!.levelDist} dataKey="count" nameKey="level" cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70} paddingAngle={3}
                    label={({ level, count }) => `${level}: ${count}`} labelLine={false}>
                    {rData!.levelDist.map((e) => <Cell key={e.level} fill={LEVEL_COLORS[e.level] ?? '#94a3b8'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2.5 flex-1">
                {rData!.levelDist.map((l) => (
                  <div key={l.level}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium">{l.label}</span>
                      <span className="font-bold text-slate-800">{l.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{
                        width: `${kpis.totalActive > 0 ? (l.count / kpis.totalActive) * 100 : 0}%`,
                        backgroundColor: LEVEL_COLORS[l.level] ?? '#94a3b8',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Tenure Distribution">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rData!.tenureDist} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" fill="#8b5cf6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>
      </>}

      {/* ══════════════════════════ PIPELINE SECTION ══════════════════════════ */}
      {summary && pData && <>
        <Divider label="Pipeline" />

        {/* Compact pipeline stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100 shadow-sm">
          <StatTile label="Open / Ongoing" value={summary.ongoingCount}   accent="text-violet-600" sub="active search" />
          <StatTile label="On Hold"        value={summary.onHoldCount}    accent="text-slate-500"  sub="paused" />
          <StatTile label="Offer Stage"    value={summary.offeredCount}   accent="text-amber-600"  sub="offer sent" />
          <StatTile label="Ref Check"      value={summary.refCheckCount}  accent="text-teal-600"   sub="reference stage" />
          <StatTile label="Hired / wk"     value={summary.hiredThisWeek}  accent="text-emerald-600" sub={`last wk: ${summary.hiredLastWeek}`} />
          <StatTile label="Offers Acc."    value={recentOffers.accepted}  accent="text-green-600"  sub={`${recentOffers.done} sent · 8wk`} />
          <StatTile label="Offers Rej."    value={recentOffers.rejected}  accent={recentOffers.rejected > 0 ? 'text-rose-600' : 'text-slate-400'} sub="last 8wk" />
          <StatTile label="Avg Running"    value={`${summary.avgRunningDays}d`} accent={summary.avgRunningDays > 30 ? 'text-amber-600' : 'text-slate-700'} sub={`A ${summary.avgRunningByLevel.A} · B ${summary.avgRunningByLevel.B} · C ${summary.avgRunningByLevel.C}`} />
        </div>

        {/* Open roles by level — compact */}
        <div className="grid grid-cols-3 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100 shadow-sm">
          <StatTile label="Open A — Specialists" value={summary.openByLevel?.A ?? 0} accent="text-blue-600"   sub="active pipeline" />
          <StatTile label="Open B — Managers"    value={summary.openByLevel?.B ?? 0} accent="text-violet-600" sub="active pipeline" />
          <StatTile label="Open C — Directors+"  value={summary.openByLevel?.C ?? 0} accent="text-amber-600"  sub="active pipeline" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(pData?.weeklyTrend?.length ?? 0) > 0 && (
            <SectionCard
              title="Weekly Vacancies (OKR 2026)"
              subtitle={`${trendData.length} week${trendData.length !== 1 ? 's' : ''} shown — open vs. hired`}
              action={
                <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {weekFilterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              }
            >
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={36} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip /><Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="Open"  fill="#3b82f6" radius={[3,3,0,0]} stackId="a" />
                  <Bar dataKey="Hired" fill="#10b981" radius={[3,3,0,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          <SectionCard title="Monthly Hires (Hirings tracker)" subtitle="Last 12 months">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pData.hiresPerMonth} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
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
          <SectionCard
            title="Source of Hire"
            subtitle={`${srcTotal} hire${srcTotal !== 1 ? 's' : ''} · ${srcYear === 'all' ? 'all years' : srcYear}${srcPeriod !== 'all' ? ` · ${srcPeriod}` : ''}`}
            action={
              <div className="flex gap-1.5">
                <FilterSelect value={srcYear}   onChange={setSrcYear}   options={yearOptions} />
                <FilterSelect value={srcPeriod} onChange={setSrcPeriod} options={periodOptions} />
              </div>
            }
          >
            {srcBreakdown.length === 0 ? (
              <div className="text-slate-400 text-sm py-10 text-center">No hires match this period.</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="45%" height={170}>
                  <PieChart>
                    <Pie data={srcBreakdown} dataKey="count" nameKey="source"
                      cx="50%" cy="50%" innerRadius={38} outerRadius={65} paddingAngle={3}>
                      {srcBreakdown.map((_, i) => <Cell key={i} fill={SRC_COLORS[i % SRC_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 max-h-[170px] overflow-y-auto">
                  {srcBreakdown.map((s, i) => (
                    <div key={s.source} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SRC_COLORS[i % SRC_COLORS.length] }} />
                      <span className="text-slate-600 flex-1 truncate">{s.source}</span>
                      <span className="font-bold text-slate-800">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {pData.byDept.length > 0 && (
            <SectionCard title="Open Roles by Department" subtitle="Active pipeline">
              <ResponsiveContainer width="100%" height={Math.max(180, pData.byDept.length * 30)}>
                <BarChart data={pData.byDept} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="dept" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip /><Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="open"    name="Open"    fill="#3b82f6" stackId="a" />
                  <Bar dataKey="active"  name="Ongoing" fill="#8b5cf6" stackId="a" />
                  <Bar dataKey="offered" name="Offered" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="on_hold" name="On Hold" fill="#f97316" stackId="a" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </div>

        {/* Unified vacancy table — Hirings tracker + OKR pipeline stages */}
        <SectionCard
          title="Vacancies"
          subtitle={`${vacancies.length} shown · ${allVacancies.length} total (2025–2026, all statuses)`}
        >
          {/* Filters */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input type="text" placeholder="Search role, dept, manager, recruiter, candidate, source…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[220px] text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <FilterSelect value={vYear}   onChange={setVYear}   options={yearOptions} />
            <FilterSelect value={vPeriod} onChange={setVPeriod} options={periodOptions} />
          </div>
          <div className="flex gap-1 flex-wrap mb-4">
            {statusFilters.map(({ id, label, count }) => (
              <button key={id} onClick={() => setFilterStatus(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label} <span className="ml-1 opacity-70">({count})</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-left">Position</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-center">Level</th>
                  <th className="px-3 py-3 text-left">Priority</th>
                  <th className="px-3 py-3 text-right">Age</th>
                  <th className="px-3 py-3 text-left">Pipeline Stages</th>
                  <th className="px-3 py-3 text-left">Recruiter / Manager</th>
                  <th className="px-3 py-3 text-left">Opened / Closed</th>
                  <th className="px-3 py-3 text-left">Hire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vacancies.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No vacancies match these filters</td></tr>
                  : vacancies.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{v.position}</div>
                        <div className="text-xs text-slate-400">{v.department || '—'}</div>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={v.statusGroup} /></td>
                      <td className="px-3 py-3 text-center">
                        {v.complexity
                          ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${COMPLEXITY_COLORS[v.complexity] ?? 'text-slate-500 bg-slate-50'}`}>{v.complexity}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {v.priority
                          ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${(PRIORITY_STYLE[v.priority] ?? { bg:'bg-slate-100',text:'text-slate-500' }).bg} ${(PRIORITY_STYLE[v.priority] ?? { bg:'bg-slate-100',text:'text-slate-500' }).text}`}>{v.priority}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {v.runningDays != null
                          ? <span className={`font-mono text-xs font-semibold ${v.runningDays > 60 ? 'text-red-600' : v.runningDays > 30 ? 'text-amber-600' : 'text-slate-600'}`}>{v.runningDays}d</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3">{v.okrStages ? <StageBar stages={v.okrStages} /> : <span className="text-slate-300 text-xs">—</span>}</td>
                      <td className="px-3 py-3 text-xs">
                        <div className="text-slate-600">{v.recruiter || '—'}</div>
                        {v.hiringManager && <div className="text-slate-400">{v.hiringManager}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">
                        <div className="text-slate-500">{v.openedDate || '—'}</div>
                        {v.closedDate && <div className="text-slate-400">→ {v.closedDate}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {v.candidateName || v.source
                          ? <>
                              <div className="text-slate-700 font-medium">{v.candidateName || '—'}</div>
                              {v.source && <div className="text-slate-400">{v.source}</div>}
                            </>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </>}
    </div>
  );
}

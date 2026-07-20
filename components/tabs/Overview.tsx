'use client';

import { useEffect, useState, useMemo } from 'react';
import KPICard from '../KPICard';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, LineChart, ReferenceArea,
} from 'recharts';
import ExploreBar from '../ExploreBar';
import {
  TimeWindow, buildBuckets, bucketItems, itemsInWindow, todayISO, presetWindow,
} from '@/lib/dateWindow';

interface HireEvent {
  date: string; level: string;
  ttf: number | null; tth: number | null;
  offerDecided: boolean; offerAccepted: boolean;
}

const avgOf = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyRec {
  month: string; yearMonth: string; hiredCount: number;
  avgTimeToFill: number | null; avgTimeToHire: number | null;
  offerAcceptancePct: number | null;
  offerSentCount: number; offerRejectedCount: number;
}

interface Metrics {
  totalHeadcount: number; openRoles: number;
  avgTimeToFill: number | null; avgTimeToHire: number | null;
  avgTTFByLevel: { A: number | null; B: number | null; C: number | null };
  avgTTHByLevel: { A: number | null; B: number | null; C: number | null };
  offerAcceptanceRate: number | null;
  probationInProgress?: number;
  offerSentCount: number;
  offerAcceptedCount: number;
  offerRejectedCount: number;
  monthlyRecruitment: MonthlyRec[];
  hireEvents: HireEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Overview() {
  const [data, setData]       = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Shared Explore window — drives every time-based panel below.
  const [win, setWin] = useState<TimeWindow | null>(null);

  useEffect(() => {
    fetch('/api/metrics').then((r) => r.json()).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const hireEvents = useMemo(() => data?.hireEvents ?? [], [data]);

  // Earliest data date drives the "All" preset and clamps the pickers.
  const minDate = useMemo(() => {
    if (!hireEvents.length) return todayISO();
    return hireEvents.reduce((min, e) => (e.date < min ? e.date : min), hireEvents[0].date);
  }, [hireEvents]);

  // Default window: everything, monthly buckets (recruiting data is naturally monthly).
  useEffect(() => {
    if (!win && hireEvents.length) {
      setWin({ ...presetWindow('all', minDate), granularity: 'month' });
    }
  }, [win, hireEvents, minDate]);

  // Windowed aggregates for the Recruitment Metrics card.
  const winEvents = useMemo(() => win ? itemsInWindow(hireEvents, win) : [], [hireEvents, win]);
  const winTTF = avgOf(winEvents.map((e) => e.ttf).filter((v): v is number => v != null));
  const winTTH = avgOf(winEvents.map((e) => e.tth).filter((v): v is number => v != null));
  const winDecided = winEvents.filter((e) => e.offerDecided);
  const winAccepted = winDecided.filter((e) => e.offerAccepted).length;
  const winOfferPct = winDecided.length ? Math.round((winAccepted / winDecided.length) * 100) : null;
  const levelAvg = (lvl: string, key: 'ttf' | 'tth') =>
    avgOf(winEvents.filter((e) => e.level === lvl).map((e) => e[key]).filter((v): v is number => v != null));

  // Per-bucket trend series + which trailing buckets are incomplete (shaded).
  const buckets = useMemo(() => win ? buildBuckets(win) : [], [win]);
  const trendData = useMemo(() => {
    const grouped = bucketItems(hireEvents, buckets);
    return buckets.map((b, i) => {
      const evs = grouped[i];
      const dec = evs.filter((e) => e.offerDecided);
      const acc = dec.filter((e) => e.offerAccepted).length;
      return {
        label: b.label,
        avgTimeToFill: avgOf(evs.map((e) => e.ttf).filter((v): v is number => v != null)),
        avgTimeToHire: avgOf(evs.map((e) => e.tth).filter((v): v is number => v != null)),
        hiredCount: evs.length,
        offerAcceptancePct: dec.length ? Math.round((acc / dec.length) * 100) : null,
        incomplete: b.incomplete,
      };
    });
  }, [hireEvents, buckets]);
  const shadeFrom = trendData.find((d) => d.incomplete)?.label;
  const shadeTo = trendData[trendData.length - 1]?.label;

  if (loading || !data || !win) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-40" />
      <div className="grid grid-cols-3 gap-4">{Array.from({length:6}).map((_,i)=><div key={i} className="h-24 bg-slate-200 rounded-xl"/>)}</div>
    </div>
  );

  const offerSubtitle = `${winAccepted} accepted · ${winDecided.length - winAccepted} rejected · ${winDecided.length} sent`;
  const emptyTrend = trendData.every((r) => r.avgTimeToFill === null && r.avgTimeToHire === null && r.hiredCount === 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Overview</h1>

      {/* ── Top KPIs (current snapshot — not windowed) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KPICard title="Total Headcount"   value={data.totalHeadcount}  gradient="bg-gradient-to-br from-blue-500 to-blue-700"     icon="👥" />
        <KPICard title="Open Positions"    value={data.openRoles}       gradient="bg-gradient-to-br from-indigo-500 to-indigo-700"  icon="📋" subtitle="from Hirings sheet" />
        <KPICard title="In Probation"      value={data.probationInProgress ?? 0} subtitle="active employees" gradient="bg-gradient-to-br from-sky-500 to-blue-600" icon="🔍" />
      </div>

      {/* ── Shared Explore window ── */}
      <ExploreBar value={win} onChange={setWin} minDate={minDate} />

      {/* ── Recruitment metrics (windowed) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Recruitment Metrics</h2>
          <p className="text-xs text-slate-400 mt-0.5">Averages for hires within the Explore window · {winEvents.length} hire{winEvents.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Avg Time to Fill */}
          <div className="rounded-lg border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">⏱️</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Time to Fill</span>
              <span className="text-xs text-slate-400 ml-1">open date → hire date</span>
            </div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-3xl font-bold text-violet-700">{winTTF != null ? `${winTTF}d` : '—'}</span>
              <span className="text-xs text-slate-400 mb-1 ml-1">overall</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['A','B','C'] as const).map((lvl) => {
                const val = levelAvg(lvl, 'ttf');
                const colors: Record<string, string> = { A: 'text-blue-700 bg-blue-50 border-blue-100', B: 'text-violet-700 bg-violet-100 border-violet-200', C: 'text-amber-700 bg-amber-50 border-amber-100' };
                const names: Record<string, string> = { A: 'Specialists', B: 'Managers', C: 'Directors+' };
                return (
                  <div key={lvl} className={`rounded-lg border p-2 text-center ${colors[lvl]}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{lvl} · {names[lvl]}</div>
                    <div className="text-lg font-bold mt-0.5">{val != null ? `${val}d` : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Avg Time to Hire */}
          <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🗓️</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Time to Hire</span>
              <span className="text-xs text-slate-400 ml-1">offer sent → hire date</span>
            </div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-3xl font-bold text-purple-700">{winTTH != null ? `${winTTH}d` : '—'}</span>
              <span className="text-xs text-slate-400 mb-1 ml-1">overall</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['A','B','C'] as const).map((lvl) => {
                const val = levelAvg(lvl, 'tth');
                const colors: Record<string, string> = { A: 'text-blue-700 bg-blue-50 border-blue-100', B: 'text-violet-700 bg-violet-100 border-violet-200', C: 'text-amber-700 bg-amber-50 border-amber-100' };
                const names: Record<string, string> = { A: 'Specialists', B: 'Managers', C: 'Directors+' };
                return (
                  <div key={lvl} className={`rounded-lg border p-2 text-center ${colors[lvl]}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{lvl} · {names[lvl]}</div>
                    <div className="text-lg font-bold mt-0.5">{val != null ? `${val}d` : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Offer Acceptance */}
          <MetricBox
            label="Offer Acceptance"
            value={winOfferPct}
            unit="%" subtitle={offerSubtitle}
            color="emerald" icon="✅"
            warning={winOfferPct !== null && winOfferPct < 80}
          />
        </div>
      </div>

      {/* ── Recruitment trends (windowed, bucketed) ── */}
      <SectionCard
        title="Recruitment Trends"
        subtitle={`Time to Fill, Time to Hire and Offer Acceptance · ${win.granularity} buckets`}
      >
        {emptyTrend ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No recruitment data for this window</div>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-2 font-medium">Time to Fill &amp; Time to Hire (days)</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 24, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} unit="d" />
                <Tooltip formatter={(v: number) => `${v}d`} />
                <Legend iconType="circle" iconSize={8} />
                {shadeFrom && <ReferenceArea x1={shadeFrom} x2={shadeTo} fill="#94a3b8" fillOpacity={0.14} />}
                <Line type="monotone" dataKey="avgTimeToFill" name="Time to Fill" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="avgTimeToHire" name="Time to Hire" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>

            <p className="text-xs text-slate-400 mt-4 mb-2 font-medium">Offer Acceptance % &amp; Hires</p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={trendData} margin={{ top: 4, right: 24, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                {shadeFrom && <ReferenceArea yAxisId="left" x1={shadeFrom} x2={shadeTo} fill="#94a3b8" fillOpacity={0.14} />}
                <Bar yAxisId="left"  dataKey="hiredCount"         name="Hires"            fill="#3b82f6" radius={[3,3,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="offerAcceptancePct" name="Offer Acceptance %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ── MetricBox ─────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-100' },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-100' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
};

function MetricBox({ label, value, unit, subtitle, color, icon, warning }: {
  label: string; value: number | null | undefined; unit: string;
  subtitle?: string; color: string; icon: string; warning?: boolean;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.violet;
  return (
    <div className={`rounded-lg border p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        {warning && <span className="ml-auto text-xs text-red-500 font-bold">⚠</span>}
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>
        {value != null ? `${value}${unit}` : '—'}
      </div>
      {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

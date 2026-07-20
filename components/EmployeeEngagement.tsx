'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';

// ── Types (mirror /api/engagement response) ─────────────────────────────────────

type Band = 'red' | 'amber' | 'green';

interface Survey {
  id: string; period: string; surveyDate: string; enps: number; band: Band;
  avgScore: number | null; hasEnps: boolean;
  promoters: number; passives: number; detractors: number; responses: number;
  invitedCount: number | null; participationRate: number | null;
  categoryScores: Record<string, number> | null; commentThemes: string[] | null;
  sourceType: string;
}

interface Delta { latest: number | null; previous: number | null; delta: number | null; }

interface Comparison {
  fromPeriod: string; toPeriod: string;
  enps: Delta; promoters: Delta; passives: Delta; detractors: Delta; participationRate: Delta;
  categories: Array<{ name: string; latest: number | null; previous: number | null; delta: number | null }>;
}

interface TrendPoint { period: string; enps: number; promoterPct: number; passivePct: number; detractorPct: number; }

interface EngagementData {
  isEmpty: boolean;
  latest: Survey | null;
  previous: Survey | null;
  comparison: Comparison | null;
  trend: TrendPoint[];
  surveys: Survey[];
  insight: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const BAND_TEXT: Record<Band, string> = { green: 'text-emerald-600', amber: 'text-amber-500', red: 'text-red-600' };
const BAND_GRAD: Record<Band, string> = {
  green: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-400 to-orange-500',
  red:   'from-rose-500 to-red-600',
};
const BAND_LABEL: Record<Band, string> = { green: 'Healthy', amber: 'Needs attention', red: 'At risk' };

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DeltaChip({ delta, invert = false, suffix = '' }: { delta: number | null; invert?: boolean; suffix?: string }) {
  if (delta == null) return <span className="text-xs text-slate-400">—</span>;
  if (delta === 0) return <span className="text-xs text-slate-400">no change</span>;
  const good = invert ? delta < 0 : delta > 0;
  return (
    <span className={`text-xs font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}{suffix}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EmployeeEngagement() {
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/engagement')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-slate-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Empty state — no surveys yet
  if (!data || data.isEmpty || !data.latest) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold text-slate-800">Employee Engagement</h2>
          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">eNPS</span>
        </div>
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <div className="text-4xl mb-3 text-slate-300">📊</div>
          <div className="text-sm font-medium text-slate-500">No engagement surveys yet</div>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Run a sync to extract survey presentations from Asana, or add a survey manually via
            <code className="mx-1 px-1 py-0.5 bg-slate-100 rounded">POST /api/engagement</code>.
          </p>
        </div>
      </div>
    );
  }

  const { latest, comparison, trend, surveys, insight } = data;
  const total = latest.promoters + latest.passives + latest.detractors;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const categoryData = latest.categoryScores
    ? Object.entries(latest.categoryScores).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-800">Employee Engagement</h2>
        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">eNPS</span>
        <span className="text-xs text-slate-400 ml-auto">Latest: {latest.period}</span>
      </div>

      {/* ── Top row: headline + distribution + comparison ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* eNPS headline */}
        <div className={`relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br ${BAND_GRAD[latest.band]}`}>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">Employee NPS</div>
          <div className="text-5xl font-bold tracking-tight">{latest.enps > 0 ? `+${latest.enps}` : latest.enps}</div>
          <div className="text-sm font-medium opacity-90 mt-1">{BAND_LABEL[latest.band]}</div>
          <div className="text-xs opacity-75 mt-3">
            {latest.responses} responses
            {latest.participationRate != null && ` · ${latest.participationRate}% participation`}
          </div>
          {comparison && (
            <div className="text-xs opacity-90 mt-1">
              {comparison.enps.delta != null && comparison.enps.delta !== 0
                ? `${comparison.enps.delta > 0 ? '▲' : '▼'} ${Math.abs(comparison.enps.delta)} pts vs ${comparison.fromPeriod}`
                : `vs ${comparison.fromPeriod}: no change`}
            </div>
          )}
        </div>

        {/* Promoter / Passive / Detractor distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Response Mix</div>
          <div className="flex h-4 rounded-full overflow-hidden mb-4">
            <div className="bg-emerald-500" style={{ width: `${pct(latest.promoters)}%` }} title={`Promoters ${pct(latest.promoters)}%`} />
            <div className="bg-slate-300"  style={{ width: `${pct(latest.passives)}%` }}  title={`Passives ${pct(latest.passives)}%`} />
            <div className="bg-red-500"    style={{ width: `${pct(latest.detractors)}%` }} title={`Detractors ${pct(latest.detractors)}%`} />
          </div>
          <div className="space-y-2">
            {[
              { label: 'Promoters (9–10)', n: latest.promoters, dot: 'bg-emerald-500' },
              { label: 'Passives (7–8)',   n: latest.passives,  dot: 'bg-slate-300' },
              { label: 'Detractors (0–6)', n: latest.detractors, dot: 'bg-red-500' },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${r.dot}`} />
                <span className="text-slate-600">{r.label}</span>
                <span className="ml-auto font-semibold text-slate-800">{r.n}</span>
                <span className="text-xs text-slate-400 w-9 text-right">{pct(r.n)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison vs previous */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {comparison ? `${comparison.toPeriod} vs ${comparison.fromPeriod}` : 'Comparison'}
          </div>
          {comparison ? (
            <div className="space-y-2.5">
              <Row label="eNPS"            d={comparison.enps} />
              <Row label="Promoters"       d={comparison.promoters} />
              <Row label="Detractors"      d={comparison.detractors} invert />
              <Row label="Participation"   d={comparison.participationRate} suffix="%" />
            </div>
          ) : (
            <div className="text-sm text-slate-400 py-6 text-center">Only one survey so far — no prior period to compare.</div>
          )}
        </div>
      </div>

      {/* ── eNPS trend ── */}
      <SectionCard title="eNPS Trend" subtitle="Employee Net Promoter Score across survey periods">
        {trend.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}`, 'eNPS']} />
              <Line type="monotone" dataKey="enps" name="eNPS" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Need at least two surveys to show a trend.</div>
        )}
      </SectionCard>

      {/* ── Category / driver scores ── */}
      {categoryData.length > 0 && (
        <SectionCard title="Engagement Drivers" subtitle={`Pulse scores from the ${latest.period} survey (0–100 · green ≥78, amber 68–77, red <68)`}>
          <ResponsiveContainer width="100%" height={Math.max(160, categoryData.length * 34)}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v}/100`, 'Score']} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {categoryData.map((c) => (
                  <Cell key={c.name} fill={c.score >= 78 ? '#10b981' : c.score >= 68 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* ── AI leadership insight ── */}
      {insight && (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🧠</span>
            <h3 className="text-sm font-semibold text-slate-700">Leadership Insight</h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium uppercase tracking-wide">AI generated</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{insight}</p>
        </div>
      )}

      {/* ── Survey history ── */}
      <SectionCard title="Survey History" subtitle={`${surveys.length} survey${surveys.length === 1 ? '' : 's'} on record`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <tr>
                <th className="py-2 text-left">Period</th>
                <th className="py-2 text-right">eNPS</th>
                <th className="py-2 text-right">Avg /10</th>
                <th className="py-2 text-right">Promoters</th>
                <th className="py-2 text-right">Passives</th>
                <th className="py-2 text-right">Detractors</th>
                <th className="py-2 text-right">Responses</th>
                <th className="py-2 text-right">Participation</th>
                <th className="py-2 text-left pl-4">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...surveys].reverse().map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 font-medium text-slate-800">{s.period}</td>
                  <td className={`py-2.5 text-right font-mono font-semibold ${s.hasEnps ? BAND_TEXT[s.band] : 'text-slate-300'}`}>{s.hasEnps ? (s.enps > 0 ? `+${s.enps}` : s.enps) : '—'}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.avgScore != null ? s.avgScore.toFixed(1) : '—'}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.promoters}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.passives}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.detractors}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.responses}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.participationRate != null ? `${s.participationRate}%` : '—'}</td>
                  <td className="py-2.5 text-left pl-4"><span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded capitalize">{s.sourceType}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({ label, d, invert = false, suffix = '' }: { label: string; d: Delta; invert?: boolean; suffix?: string }) {
  return (
    <div className="flex items-center text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto font-semibold text-slate-800 mr-3">
        {d.latest != null ? `${d.latest}${suffix}` : '—'}
      </span>
      <span className="w-20 text-right"><DeltaChip delta={d.delta} invert={invert} suffix={suffix} /></span>
    </div>
  );
}

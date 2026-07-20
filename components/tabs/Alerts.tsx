'use client';

import { useEffect, useState } from 'react';

interface AlertsData {
  slaRed: Array<{ id: string; title: string; level: string; daysOpen: number; slaLimit: number; daysOverLimit: number }>;
  slaAmber: Array<{ id: string; title: string; level: string; daysOpen: number; slaLimit: number }>;
  offerAlert: boolean; recentOfferRate: number | null;
  probationExpiring: Array<{ id: string; name: string; probationEndDate: string | null; daysRemaining: number }>;
  overdueTasks: Array<{ id: string; taskName: string; daysOverdue: number; employee: { name: string } }>;
  blockedInitiatives: Array<{ id: string; title: string; pillar: string; notionNotes: string | null }>;
}

function Section({ icon, title, count, color, children }: { icon: string; title: string; count: number; color: string; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${color} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${color.includes('red')?'bg-red-100 text-red-800':color.includes('amber')||color.includes('yellow')?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700'}`}>{count}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export default function Alerts() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/alerts').then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-48" /><div className="h-32 bg-slate-200 rounded-xl" /></div>;
  if (!data) return <div className="text-slate-500 flex items-center justify-center h-64">Failed to load alerts.</div>;

  const total = data.slaRed.length + data.slaAmber.length + (data.offerAlert?1:0) + data.probationExpiring.length + data.overdueTasks.length + data.blockedInitiatives.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Alerts</h1>
        {total > 0 && <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">{total} active</span>}
      </div>

      {total === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-lg font-semibold text-slate-700">All clear</div>
          <div className="text-sm text-slate-400 mt-1">No alerts at this time</div>
        </div>
      )}

      <Section icon="🔴" title="SLA Breaches" count={data.slaRed.length} color="border-red-500">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr><th className="px-4 py-3 text-left">Position</th><th className="px-4 py-3 text-left">Level</th><th className="px-4 py-3 text-right">Days Open</th><th className="px-4 py-3 text-right">SLA Limit</th><th className="px-4 py-3 text-right">Days Over</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.slaRed.map((p) => (
              <tr key={p.id} className="hover:bg-red-50/30">
                <td className="px-4 py-3 font-medium text-slate-800">{p.title}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">{p.level}</span></td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">{p.daysOpen}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{p.slaLimit}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-700">+{p.daysOverLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="🟡" title="SLA Warnings" count={data.slaAmber.length} color="border-amber-400">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr><th className="px-4 py-3 text-left">Position</th><th className="px-4 py-3 text-left">Level</th><th className="px-4 py-3 text-right">Days Open</th><th className="px-4 py-3 text-right">SLA Limit</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.slaAmber.map((p) => (
              <tr key={p.id} className="hover:bg-amber-50/30">
                <td className="px-4 py-3 font-medium text-slate-800">{p.title}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">{p.level}</span></td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-600">{p.daysOpen}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{p.slaLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {data.offerAlert && (
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-orange-400 overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3">
            <span className="text-lg">📉</span>
            <div>
              <div className="text-sm font-semibold text-slate-700">Offer Acceptance Below Target</div>
              <div className="text-xs text-slate-500 mt-0.5">Last 30 days: <span className="font-bold text-orange-600">{data.recentOfferRate}%</span> vs 80% target</div>
            </div>
          </div>
        </div>
      )}

      <Section icon="⏰" title="Probation Expiring Soon (≤7 days)" count={data.probationExpiring.length} color="border-yellow-400">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr><th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Probation End</th><th className="px-4 py-3 text-right">Days Remaining</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.probationExpiring.map((e) => (
              <tr key={e.id} className="hover:bg-yellow-50/30">
                <td className="px-4 py-3 font-medium text-slate-800">{e.name}</td>
                <td className="px-4 py-3 text-slate-500">{e.probationEndDate ? new Date(e.probationEndDate).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{e.daysRemaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="📋" title="Overdue Onboarding Tasks" count={data.overdueTasks.length} color="border-slate-400">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr><th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Task</th><th className="px-4 py-3 text-right">Days Overdue</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.overdueTasks.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{t.employee.name}</td>
                <td className="px-4 py-3 text-slate-600">{t.taskName}</td>
                <td className="px-4 py-3 text-right font-mono text-red-600 font-semibold">{t.daysOverdue}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="🚫" title="Blocked HR Initiatives" count={data.blockedInitiatives.length} color="border-red-400">
        <div className="p-4 space-y-3">
          {data.blockedInitiatives.map((init) => (
            <div key={init.id} className="p-3 bg-red-50/30 rounded-lg border border-red-100">
              <div className="font-semibold text-sm text-slate-800">{init.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{init.pillar}</div>
              {init.notionNotes && <div className="text-xs text-slate-600 mt-1.5 italic line-clamp-2">{init.notionNotes.slice(0,120)}{init.notionNotes.length>120?'…':''}</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import KPICard from '../KPICard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';

interface OffboardingData {
  exitsThisMonth: number; exitsLast90Days: number; voluntaryPct: number | null; avgTenureDays: number | null;
  voluntaryCount: number; involuntaryCount: number; mutualAgreementCount: number;
  exitReasons: Array<{ reason: string; count: number }>;
  headcountDelta: Array<{ month: string; hires: number; exits: number; net: number }>;
  terminations: Array<{ id: string; exitDate: string; type: string; reason: string | null; tenureDays: number; employee: { name: string; department: string } }>;
}

export default function Offboarding() {
  const [data, setData] = useState<OffboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/offboarding').then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-48" /><div className="h-64 bg-slate-200 rounded-xl" /></div>;
  if (!data) return <div className="text-slate-500 flex items-center justify-center h-64">Failed to load offboarding data.</div>;

  const volPie = [
    { name: 'Voluntary',        value: data.voluntaryCount,        color: '#3b82f6' },
    { name: 'Involuntary',      value: data.involuntaryCount,      color: '#ef4444' },
    { name: 'Mutual Agreement', value: data.mutualAgreementCount ?? 0, color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Offboarding</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Exits This Month"   value={data.exitsThisMonth}  gradient="bg-gradient-to-br from-rose-500 to-red-600"    icon="🚪" />
        <KPICard title="Exits Last 90 Days" value={data.exitsLast90Days} gradient="bg-gradient-to-br from-orange-500 to-rose-600" icon="📉" />
        <KPICard title="Voluntary Exit %"   value={data.voluntaryPct !== null ? `${data.voluntaryPct}%` : null} gradient="bg-gradient-to-br from-blue-500 to-indigo-600"  icon="✋" />
        <KPICard title="Avg Tenure at Exit" value={data.avgTenureDays   !== null ? `${data.avgTenureDays}d`    : null} gradient="bg-gradient-to-br from-slate-500 to-slate-700" icon="⏱️" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Voluntary vs Involuntary</h2>
          {volPie.length === 0
            ? <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No exits recorded</div>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={volPie} dataKey="value" cx="50%" cy="50%" outerRadius={75} label={({name,percent})=>`${name} ${Math.round((percent??0)*100)}%`} labelLine={false} style={{fontSize:11}}>
                    {volPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
          }
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Exit Reasons</h2>
          {data.exitReasons.length === 0
            ? <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No exit reasons recorded</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.exitReasons.slice(0,8)} layout="vertical">
                  <XAxis type="number" tick={{fontSize:10}} />
                  <YAxis type="category" dataKey="reason" width={120} tick={{fontSize:9}} />
                  <Tooltip />
                  <Bar dataKey="count" name="Count" fill="#f87171" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Headcount Delta — Last 6 Months</h2>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data.headcountDelta}>
              <XAxis dataKey="month" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} />
              <Tooltip /><Legend />
              <Bar dataKey="hires" name="Hires" fill="#3b82f6" radius={[3,3,0,0]} />
              <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[3,3,0,0]} />
              <Line dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot={{r:3}} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">Termination Log</h2></div>
        {data.terminations.length === 0
          ? <div className="px-5 py-8 text-center text-slate-400 text-sm">No terminations recorded</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Exit Date</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Reason</th><th className="px-4 py-3 text-right">Tenure</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.terminations.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.employee.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t.employee.department}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(t.exitDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${t.type==='voluntary'?'bg-blue-100 text-blue-800':t.type==='mutual_agreement'?'bg-amber-100 text-amber-800':'bg-red-100 text-red-800'}`}>{t.type === 'mutual_agreement' ? 'Mutual Agreement' : t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span></td>
                    <td className="px-4 py-3 text-slate-500">{t.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{t.tenureDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
        }
      </div>
    </div>
  );
}

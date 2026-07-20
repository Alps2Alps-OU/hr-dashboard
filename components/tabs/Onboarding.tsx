'use client';

import { useEffect, useState } from 'react';
import KPICard from '../KPICard';

interface OnboardingData {
  newHires: Array<{ id: string; name: string; department: string; startDate: string; level: string }>;
  newHiresCount: number; inProbationCount: number;
  probationSuccessRate: number | null; completionRate: number | null;
  overdueTasks: Array<{ id: string; taskName: string; daysOverdue: number; employee: { name: string } }>;
  probationTracker: Array<{ id: string; name: string; department: string; startDate: string; probationEndDate: string | null; daysRemaining: number | null }>;
  earlyAttrition: Array<{ id: string; tenureDays: number; type: string; reason: string | null; employee: { name: string; department: string } }>;
  earlyAttritionCount: number;
}

function rowColor(days: number | null) {
  if (days === null) return '';
  if (days <= 7)  return 'border-l-4 border-red-400 bg-red-50/20';
  if (days <= 30) return 'border-l-4 border-amber-400 bg-amber-50/20';
  return 'border-l-4 border-green-400 bg-green-50/20';
}
function daysColor(days: number | null) {
  if (days === null) return 'text-slate-600';
  if (days <= 7)  return 'text-red-700 font-semibold';
  if (days <= 30) return 'text-amber-700 font-semibold';
  return 'text-green-700';
}

export default function Onboarding() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/onboarding').then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-48" /><div className="h-64 bg-slate-200 rounded-xl" /></div>;
  if (!data) return <div className="text-slate-500 flex items-center justify-center h-64">Failed to load onboarding data.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Onboarding</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard title="New Hires This Month" value={data.newHiresCount}      gradient="bg-gradient-to-br from-green-500 to-emerald-600"  icon="🌱" />
        <KPICard title="In Probation"          value={data.inProbationCount}   gradient="bg-gradient-to-br from-blue-500 to-indigo-600"     icon="⏳" />
        <KPICard title="Probation Success"     value={data.probationSuccessRate !== null ? `${data.probationSuccessRate}%` : null} gradient="bg-gradient-to-br from-teal-500 to-cyan-600"    icon="✅" />
        <KPICard title="Onboarding Complete"   value={data.completionRate       !== null ? `${data.completionRate}%`       : null} gradient="bg-gradient-to-br from-indigo-500 to-purple-600" icon="📋" />
        <KPICard title="Early Attrition"       value={data.earlyAttritionCount} subtitle="left within 90 days" gradient="bg-gradient-to-br from-rose-500 to-red-600" icon="🚪" />
      </div>

      {data.newHires.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">New Hires This Month</h2></div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.newHires.map((emp) => (
              <div key={emp.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50">
                <div className="font-semibold text-sm text-slate-800">{emp.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{emp.department}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">{emp.level}</span>
                  <span className="text-xs text-slate-400">{new Date(emp.startDate).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Probation Tracker</h2>
          <p className="text-xs text-slate-400 mt-0.5">🟢 &gt;30 days · 🟡 8–30 days · 🔴 ≤7 days remaining</p>
        </div>
        {data.probationTracker.length === 0
          ? <div className="px-5 py-8 text-center text-slate-400 text-sm">No employees currently in probation</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Start Date</th><th className="px-4 py-3 text-left">Probation End</th><th className="px-4 py-3 text-right">Days Remaining</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.probationTracker.map((emp) => (
                  <tr key={emp.id} className={rowColor(emp.daysRemaining)}>
                    <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.department}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(emp.startDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.probationEndDate ? new Date(emp.probationEndDate).toLocaleDateString() : '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono ${daysColor(emp.daysRemaining)}`}>{emp.daysRemaining ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
        }
      </div>

      {data.overdueTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Overdue Onboarding Tasks</h2>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{data.overdueTasks.length}</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr><th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Task</th><th className="px-4 py-3 text-right">Days Overdue</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.overdueTasks.map((t) => (
                <tr key={t.id} className="hover:bg-red-50/30">
                  <td className="px-4 py-3 font-medium text-slate-800">{t.employee.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.taskName}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-semibold">{t.daysOverdue}d</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {data.earlyAttrition.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">Early Attrition — Left Within 90 Days</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-right">Tenure</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Reason</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.earlyAttrition.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{t.employee.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.employee.department}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-600 font-semibold">{t.tenureDays}d</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${t.type==='voluntary'?'bg-blue-100 text-blue-800':'bg-red-100 text-red-800'}`}>{t.type}</span></td>
                  <td className="px-4 py-3 text-slate-500">{t.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

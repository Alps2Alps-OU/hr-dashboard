/**
 * ARCHIVED SECTIONS — removed 2026-07-16 per user request.
 * These will be rebuilt when the data is available and the feature is ready.
 * To restore, copy the relevant blocks back into Overview.tsx or Recruitment.tsx.
 */

// ════════════════════════════════════════════════════════════════════════════
// FROM Overview.tsx
// ════════════════════════════════════════════════════════════════════════════

// ── Early Attrition KPI card ─────────────────────────────────────────────────
// Was the 4th card in the top "grid grid-cols-2 lg:grid-cols-4 gap-4" row.
// Needs: data.earlyAttritionCount from /api/metrics
/*
<KPICard
  title="Early Attrition"
  value={data.earlyAttritionCount}
  subtitle="left within 90 days"
  gradient="bg-gradient-to-br from-orange-500 to-rose-600"
  icon="🚪"
/>
*/

// ── Probation Success + SLA Breaches (red) MetricBoxes ───────────────────────
// Were the 2-col grid below the 3-col Recruitment Metrics grid.
// Needs: data.probationSuccessRate and data.slaBreakdown from /api/metrics
/*
<div className="grid grid-cols-2 gap-4 mt-4">
  <MetricBox label="Probation Success"  value={data.probationSuccessRate}  unit="%" subtitle="completed probation" color="teal"  icon="🎓" />
  <MetricBox label="SLA Breaches (red)" value={data.slaBreakdown.red}      unit=""  subtitle={`${data.slaBreakdown.amber} amber, ${data.slaBreakdown.green} green`} color="red" icon="🔴" />
</div>
*/

// ── Headcount Delta — Last 6 Months + Open Roles SLA Status ─────────────────
// Were a 2-col block below Recruitment Metrics.
// Needs: data.headcountDelta and data.slaBreakdown from /api/metrics
/*
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-100">
    <h2 className="text-sm font-semibold text-slate-700 mb-4">Headcount Delta — Last 6 Months</h2>
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data.headcountDelta}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
        <Bar dataKey="hires" name="Hires" fill="#3b82f6" radius={[3,3,0,0]} />
        <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[3,3,0,0]} />
        <Line dataKey="net" name="Net" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>

  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
    <h2 className="text-sm font-semibold text-slate-700 mb-4">Open Roles SLA Status</h2>
    {slaPie.length > 0 ? (
      <>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie data={slaPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={62}>
              {slaPie.map((e) => <Cell key={e.name} fill={e.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-3 mt-2">
          {slaPie.map((e) => (
            <div key={e.name} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-3 h-3 rounded-full" style={{ background: e.color }} />
              {e.name}: <strong>{e.value}</strong>
            </div>
          ))}
        </div>
      </>
    ) : <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No open roles</div>}
  </div>
</div>
*/
// Also needs: const slaPie = [ { name: 'Green', ... }, { name: 'Amber', ... }, { name: 'Red', ... } ].filter(d => d.value > 0);

// ── Probation Outcomes & Company Exits — Monthly ─────────────────────────────
// Was a SectionCard below the Recruitment Trends chart.
// Needs: monthlyProbation from /api/metrics and probData state
/*
<SectionCard
  title="Probation Outcomes &amp; Company Exits — Monthly"
  subtitle="Who passed/left probation and who left the company each month"
  action={
    <select value={probPeriod} onChange={(e) => setProbPeriod(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="all">All time</option>
      <option value="Q1">Q1</option><option value="Q2">Q2</option>
      <option value="Q3">Q3</option><option value="Q4">Q4</option>
    </select>
  }
>
  {probData.length === 0 ? (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No probation or exit data for this period</div>
  ) : (
    <>
      <p className="text-xs text-slate-400 mb-2 font-medium">Probation outcomes per month</p>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={probData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip /><Legend iconType="circle" iconSize={8} />
          <Bar dataKey="probationPassed"   name="Passed"   fill="#22c55e" stackId="prob" />
          <Bar dataKey="probationFailed"   name="Failed"   fill="#ef4444" stackId="prob" />
          <Bar dataKey="probationExtended" name="Extended" fill="#f59e0b" stackId="prob" radius={[3,3,0,0]} />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs text-slate-400 mt-4 mb-2 font-medium">Company exits per month (by type)</p>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={probData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip /><Legend iconType="circle" iconSize={8} />
          <Bar dataKey="exitsVoluntary"   name="Voluntary"        fill="#f59e0b" stackId="ex" />
          <Bar dataKey="exitsInvoluntary" name="Involuntary"      fill="#ef4444" stackId="ex" />
          <Bar dataKey="exitsMutual"      name="Mutual Agreement" fill="#3b82f6" stackId="ex" radius={[3,3,0,0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )}
</SectionCard>
*/
// Also needs: const [probPeriod, setProbPeriod] = useState('all');
//             const probData = filterByPeriod(monthlyProb, probPeriod).filter(r => ...)

// ── Top SLA Breaches — Most Urgent table ─────────────────────────────────────
// Was at the bottom of Overview.tsx.
// Needs: data.topSLABreaches from /api/metrics and RAGBadge component
/*
<div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
  <div className="px-5 py-4 border-b border-slate-100">
    <h2 className="text-sm font-semibold text-slate-700">Top SLA Breaches — Most Urgent</h2>
  </div>
  {data.topSLABreaches.length === 0
    ? <div className="px-5 py-8 text-center text-slate-400 text-sm">No SLA breaches — all positions on track ✓</div>
    : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Position</th>
              <th className="px-4 py-3 text-left">Dept</th>
              <th className="px-4 py-3 text-center">Level</th>
              <th className="px-4 py-3 text-right">Days Open</th>
              <th className="px-4 py-3 text-right">SLA Limit</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left">Hiring Manager</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.topSLABreaches.map((pos) => (
              <tr key={pos.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{pos.title}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{pos.department}</td>
                <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{pos.level}</span></td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{pos.daysOpen}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{pos.slaLimit}</td>
                <td className="px-4 py-3 text-center"><RAGBadge status={pos.rag as 'green'|'amber'|'red'} /></td>
                <td className="px-4 py-3 text-slate-600 text-xs">{pos.hiringManager ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
</div>
*/

// ════════════════════════════════════════════════════════════════════════════
// FROM Recruitment.tsx
// ════════════════════════════════════════════════════════════════════════════

// ── 3 Exit Type Cards ────────────────────────────────────────────────────────
// Were in Recruitment.tsx after the 4 KPI cards.
// Needs: kpis.voluntaryExitsLast90, kpis.involuntaryExitsLast90, kpis.mutualAgreementExitsLast90,
//        kpis.voluntaryExits, kpis.involuntaryExits, kpis.mutualAgreementExits
/*
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
    <div className="flex items-center gap-2 mb-1">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Voluntary Exits (90d)</span>
    </div>
    <div className="text-3xl font-bold text-amber-600">{kpis.voluntaryExitsLast90}</div>
    <div className="text-xs text-slate-400 mt-1">Resignations · All-time: {kpis.voluntaryExits}</div>
  </div>
  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
    <div className="flex items-center gap-2 mb-1">
      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Involuntary Exits (90d)</span>
    </div>
    <div className="text-3xl font-bold text-red-600">{kpis.involuntaryExitsLast90}</div>
    <div className="text-xs text-slate-400 mt-1">Terminations · All-time: {kpis.involuntaryExits}</div>
  </div>
  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
    <div className="flex items-center gap-2 mb-1">
      <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mutual Agreement (90d)</span>
    </div>
    <div className="text-3xl font-bold text-blue-600">{kpis.mutualAgreementExitsLast90}</div>
    <div className="text-xs text-slate-400 mt-1">By agreement · All-time: {kpis.mutualAgreementExits}</div>
  </div>
</div>
*/

// ── 3 Turnover Rate Cards ────────────────────────────────────────────────────
// Were below the 3 exit cards.
// Needs: kpis.voluntaryExitsLast90, kpis.involuntaryExitsLast90, kpis.mutualAgreementExitsLast90, kpis.totalActive
/*
<div className="grid grid-cols-3 gap-4">
  {kpis.totalActive > 0 && [
    { label: 'Voluntary Turnover',    count: kpis.voluntaryExitsLast90,         color: 'bg-amber-500', textColor: 'text-amber-700' },
    { label: 'Involuntary Turnover',  count: kpis.involuntaryExitsLast90,       color: 'bg-red-500',   textColor: 'text-red-700'   },
    { label: 'Mutual Agr. Turnover',  count: kpis.mutualAgreementExitsLast90,   color: 'bg-blue-500',  textColor: 'text-blue-700'  },
  ].map(({ label, count, color, textColor }) => {
    const pct = Math.round((count / kpis.totalActive) * 100);
    return (
      <div key={label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="text-xs text-slate-500 mb-1">{label} (90d)</div>
        <div className={`text-2xl font-bold ${textColor}`}>{pct}%</div>
        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
          <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    );
  })}
</div>
*/

'use client';

import { TimeWindow, Granularity, PresetId, presetWindow, matchPreset, formatRange, todayISO, formatDay } from '@/lib/dateWindow';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: '7d',    label: '7d' },
  { id: '14d',   label: '14d' },
  { id: '28d',   label: '28d' },
  { id: 'month', label: 'This month' },
  { id: 'all',   label: 'All' },
];

const GRANS: Array<{ id: Granularity; label: string }> = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
];

/**
 * Shared time-window control. Every time-based panel below it reads the same
 * {from, to, granularity}, so figures never have to be reconciled across panels.
 */
export default function ExploreBar({ value, onChange, minDate }: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
  minDate: string; // earliest data date (ISO) — drives the "All" preset
}) {
  const today = todayISO();
  const activePreset = matchPreset(value, minDate, today);

  const applyPreset = (id: PresetId) => onChange({ ...value, ...presetWindow(id, minDate, today) });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <h2 className="text-sm font-semibold text-slate-700">Explore</h2>
      <p className="text-xs text-slate-400 mt-0.5">
        Every panel below shares one window, so a figure from one never has to be reconciled against a figure from another.
      </p>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-4">
        {/* Presets */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 text-xs font-medium border-r border-slate-200 last:border-r-0 transition-colors ${
                activePreset === p.id ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {p.id === 'all' ? `All (from ${shortDay(minDate)})` : p.label}
            </button>
          ))}
        </div>

        {/* Granularity */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {GRANS.map((g) => (
            <button key={g.id} onClick={() => onChange({ ...value, granularity: g.id })}
              className={`px-3 py-1.5 text-xs font-medium border-r border-slate-200 last:border-r-0 transition-colors ${
                value.granularity === g.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {g.label}
            </button>
          ))}
        </div>

        {/* From / To */}
        <div className="flex items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">From</span>
            <input type="date" value={value.from} max={value.to} min={minDate}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">To</span>
            <input type="date" value={value.to} min={value.from} max={today}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4">{formatRange(value)}</p>
    </div>
  );
}

function shortDay(iso: string): string {
  return formatDay(iso).replace(/ \d{4}$/, ''); // "5 Jun"
}

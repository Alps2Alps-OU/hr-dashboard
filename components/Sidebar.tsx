'use client';

import { useState, useCallback } from 'react';

const NAV_ITEMS = [
  { id: 'overview',    label: 'Overview',               icon: '📊' },
  { id: 'recruitment', label: 'Recruitment & Pipeline', icon: '🎯' },
  { id: 'onboarding',  label: 'Onboarding',             icon: '🌱' },
  { id: 'offboarding', label: 'Offboarding',            icon: '🚪' },
  { id: 'roadmap',     label: 'HR Roadmap',             icon: '🗺️' },
  { id: 'alerts',      label: 'Alerts',                 icon: '⚠️' },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  lastSynced: string | null;
  alertCount?: number;
  autoSyncing?: boolean;
  onSynced?: () => void;
}

export default function Sidebar({ activeTab, onTabChange, lastSynced, alertCount = 0, autoSyncing = false, onSynced }: SidebarProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true); setSyncStatus(null);
    try {
      const res = await fetch('/api/sync?source=all', { method: 'POST' });
      const data = await res.json();
      setSyncStatus(data.ok ? '✓ Synced' : '✗ Error');
      if (data.ok) onSynced?.(); // refresh the active tab with freshly synced data
    } catch { setSyncStatus('✗ Failed'); }
    finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(null), 3000);
    }
  }, [onSynced]);

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col fixed top-0 left-0 z-40">

      {/* Header — Amitours Group */}
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          {logoErr ? (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold">AM</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="https://amitours.com/img/logo.png"
              alt="Amitours"
              className="h-8 w-auto object-contain"
              onError={() => setLogoErr(true)}
            />
          )}
          <div>
            <div className="font-semibold text-sm tracking-wide">Amitours Group</div>
            <div className="text-xs text-slate-400">HR Analytics</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'alerts' && alertCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Business streams strip */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-2">Business Streams</div>
        <div className="space-y-1.5">
          <StreamRow name="Alps2Alps"    logoSrc="https://www.alps2alps.com/wp-content/uploads/logo-summer-1.svg" initials="A2" color="bg-sky-600" />
          <StreamRow name="MyPeak Finance" initials="MP" color="bg-emerald-700" />
          <StreamRow name="Mountly"        initials="ML" color="bg-violet-700" />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        {lastSynced && (
          <div className="text-xs text-slate-400">
            <div className="font-medium text-slate-300">Last synced</div>
            <div>{new Date(lastSynced).toLocaleString()}</div>
          </div>
        )}
        <button
          onClick={handleSync}
          disabled={syncing || autoSyncing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {(syncing || autoSyncing) ? (<><span className="animate-spin inline-block">⟳</span>Syncing...</>) : syncStatus ?? (<><span>⟳</span>Sync Now</>)}
        </button>
      </div>
    </aside>
  );
}

function StreamRow({ name, logoSrc, initials, color }: { name: string; logoSrc?: string; initials: string; color: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {logoSrc && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc} alt={name} className="h-4 w-auto object-contain brightness-200 opacity-80" onError={() => setErr(true)} />
      ) : (
        <div className={`w-4 h-4 rounded ${color} flex items-center justify-center text-white text-[7px] font-bold flex-shrink-0`}>{initials}</div>
      )}
      <span className="text-[11px] text-slate-400 truncate">{name}</span>
    </div>
  );
}

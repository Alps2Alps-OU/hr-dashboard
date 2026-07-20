'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Overview from '@/components/tabs/Overview';
import Recruitment from '@/components/tabs/Recruitment';
import Onboarding from '@/components/tabs/Onboarding';
import Offboarding from '@/components/tabs/Offboarding';
import Roadmap from '@/components/tabs/Roadmap';
import Alerts from '@/components/tabs/Alerts';

type Tab = 'overview' | 'recruitment' | 'onboarding' | 'offboarding' | 'roadmap' | 'alerts';

const TAB_COMPONENTS: Record<Tab, React.ComponentType> = {
  overview: Overview,
  recruitment: Recruitment,
  onboarding: Onboarding,
  offboarding: Offboarding,
  roadmap: Roadmap,
  alerts: Alerts,
};

const STALE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8 hours

export default function Dashboard() {
  const [activeTab, setActiveTab]     = useState<Tab>('overview');
  const [lastSynced, setLastSynced]   = useState<string | null>(null);
  const [alertCount, setAlertCount]   = useState(0);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [syncBanner, setSyncBanner]   = useState<'syncing' | 'done' | null>(null);
  // Bumped after any successful sync to remount the active tab so it re-fetches fresh data.
  const [refreshKey, setRefreshKey]   = useState(0);

  useEffect(() => {
    // 1. Fetch last sync time
    fetch('/api/sync')
      .then((r) => r.json())
      .then(async (d) => {
        const firstOk = d.logs?.find((l: { status: string; syncedAt: string }) => l.status === 'ok');
        const lastSyncTime = firstOk?.syncedAt ?? null;
        if (lastSyncTime) setLastSynced(lastSyncTime);

        // 2. Auto-sync if data is stale (> 8 hours old or never synced)
        const isStale = !lastSyncTime ||
          (Date.now() - new Date(lastSyncTime).getTime()) > STALE_THRESHOLD_MS;

        if (isStale) {
          setAutoSyncing(true);
          setSyncBanner('syncing');
          try {
            const res = await fetch('/api/sync?source=all', { method: 'POST' });
            const result = await res.json();
            if (result.ok) {
              const now = new Date().toISOString();
              setLastSynced(now);
              setSyncBanner('done');
              setRefreshKey((k) => k + 1); // remount active tab with fresh data
              setTimeout(() => setSyncBanner(null), 4000);
            }
          } catch { /* silent */ }
          setAutoSyncing(false);
        }
      })
      .catch(() => {});

    // 3. Alert count
    fetch('/api/alerts')
      .then((r) => r.json())
      .then((d) => {
        setAlertCount(
          (d.slaRed?.length ?? 0) + (d.slaAmber?.length ?? 0) + (d.offerAlert ? 1 : 0) +
          (d.probationExpiring?.length ?? 0) + (d.overdueTasks?.length ?? 0) + (d.blockedInitiatives?.length ?? 0)
        );
      })
      .catch(() => {});
  }, []);

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as Tab)}
        lastSynced={lastSynced}
        alertCount={alertCount}
        autoSyncing={autoSyncing}
        onSynced={() => setRefreshKey((k) => k + 1)}
      />
      <main className="flex-1 ml-64 min-h-screen bg-slate-50">
        {/* Auto-sync banner */}
        {syncBanner && (
          <div className={`fixed top-0 left-64 right-0 z-50 text-center text-xs font-semibold py-2 transition-all ${
            syncBanner === 'syncing'
              ? 'bg-blue-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}>
            {syncBanner === 'syncing'
              ? '⟳  Auto-syncing all data sources…  This takes a few seconds.'
              : '✓  Data is up to date — all sources synced just now'}
          </div>
        )}
        <div className={`max-w-7xl mx-auto px-6 py-8 ${syncBanner ? 'pt-14' : ''}`}>
          <ActiveComponent key={refreshKey} />
        </div>
      </main>
    </div>
  );
}

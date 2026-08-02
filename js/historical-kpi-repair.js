/* ZEZMS v3.4.21 — historical KPI snapshot repair publisher */
(function () {
  'use strict';

  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      let changed = false;
      if (typeof repairHistoricalKPISnapshots === 'function') {
        changed = !!repairHistoricalKPISnapshots();
      }
      if (changed && typeof saveDB === 'function') {
        saveDB();
        try {
          if (typeof render === 'function' && (currentView === 'dashboard' || currentView === 'kpiCharts' || currentView === 'reports')) {
            render();
          }
        } catch (_) {}
      }

      const sync = window.ZEZMS && window.ZEZMS.cloudSync;
      if (sync && typeof sync.publishHistoricalKPIRepairs === 'function') {
        await sync.publishHistoricalKPIRepairs();
      }
    } catch (error) {
      console.warn('Historical KPI repair could not be published yet.', error);
    } finally {
      running = false;
    }
  }

  window.addEventListener('load', function () {
    setTimeout(run, 1800);
  }, { once: true });
  window.addEventListener('online', function () {
    setTimeout(run, 800);
  }, { passive: true });

  window.ZEZMSHistoricalKPIRepair = { run: run };
}());

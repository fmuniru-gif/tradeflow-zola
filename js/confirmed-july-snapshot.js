/* ZEZMS v3.4.23 — user-confirmed July 2026 month-end KPI totals */
(function () {
  'use strict';

  const SNAPSHOT_ID = 'KPI-202607-CONFIRMED';
  const CONFIRMED = Object.freeze({
    debt: 5860,
    creditors: 134659,
    deposits: 5700,
    cashBuckets: 78101
  });

  let running = false;

  function sameNumber(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.000001;
  }

  function buildConfirmedRecord() {
    return {
      id: SNAPSHOT_ID,
      year: 2026,
      month: 7,
      debt: CONFIRMED.debt,
      creditors: CONFIRMED.creditors,
      deposits: CONFIRMED.deposits,
      cashBuckets: CONFIRMED.cashBuckets,
      confirmedClosing: true,
      confirmationSource: 'User-confirmed July 2026 closing balances',
      correctionRelease: '3.4.23',
      snapshotVersion: 3,
      automatic: false
    };
  }

  function applyConfirmedJulySnapshot() {
    if (typeof DB === 'undefined' || !DB) return false;
    if (!Array.isArray(DB.kpiHistory)) DB.kpiHistory = [];

    let record = DB.kpiHistory.find(function (item) {
      return item && String(item.id || '') === SNAPSHOT_ID;
    });

    const expected = buildConfirmedRecord();
    let changed = false;

    if (!record) {
      DB.kpiHistory.push(expected);
      changed = true;
    } else {
      Object.keys(expected).forEach(function (key) {
        const value = expected[key];
        const equal = typeof value === 'number'
          ? sameNumber(record[key], value)
          : record[key] === value;
        if (!equal) {
          record[key] = value;
          changed = true;
        }
      });
    }

    return changed;
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      const sync = window.ZEZMS && window.ZEZMS.cloudSync;
      if (sync && typeof sync.waitUntilReady === 'function') {
        try { await sync.waitUntilReady(7000); } catch (_) {}
      }

      if (applyConfirmedJulySnapshot()) {
        if (typeof saveDB === 'function') saveDB();
        else if (window.ZEZMS && ZEZMS.db && typeof ZEZMS.db.save === 'function') {
          ZEZMS.db.save(DB_KEY, DB);
        }

        try {
          if (typeof render === 'function'
              && typeof currentView !== 'undefined'
              && (currentView === 'dashboard' || currentView === 'kpiCharts'
                  || currentView === 'reports' || currentView === 'accounts')) {
            render();
          }
        } catch (_) {}
      }
    } catch (error) {
      console.warn('The confirmed July snapshot could not be applied yet.', error);
    } finally {
      running = false;
    }
  }

  window.addEventListener('load', function () {
    setTimeout(run, 900);
  }, { once: true });

  window.addEventListener('zezms-cloud-ready', function () {
    setTimeout(run, 250);
  }, { once: true });

  window.ZEZMSConfirmedJulySnapshot = {
    run: run,
    apply: applyConfirmedJulySnapshot,
    values: CONFIRMED
  };
}());

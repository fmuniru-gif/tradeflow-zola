(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260805-secure-device-enrollment-r28';
  const MAX_CATCHUP_MONTHS = 120;
  const CHECK_INTERVAL_MS = 60 * 1000;

  let running = false;
  let lastNoticeKey = '';
  let checkTimer = null;

  function getDatabase() {
    try { return (typeof DB !== 'undefined' && DB) ? DB : null; } catch (_) { return null; }
  }

  function pad2(value) {
    return String(Number(value) || 0).padStart(2, '0');
  }

  function periodKey(year, month) {
    return String(Number(year) || 0) + pad2(month);
  }

  function periodValue(year, month) {
    return (Number(year) || 0) * 12 + (Number(month) || 0) - 1;
  }

  function comparePeriods(a, b) {
    return periodValue(a.year, a.month) - periodValue(b.year, b.month);
  }

  function nextPeriod(period) {
    const month = Number(period.month) || 1;
    const year = Number(period.year) || new Date().getFullYear();
    return month >= 12 ? { year: year + 1, month: 1 } : { year: year, month: month + 1 };
  }

  function calendarPeriod(now) {
    const date = now ? new Date(now) : new Date();
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }

  function validPeriod(year, month) {
    return Number.isFinite(Number(year)) && Number(year) > 1900
      && Number.isFinite(Number(month)) && Number(month) >= 1 && Number(month) <= 12;
  }

  function hashText(value) {
    const text = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase();
  }

  function entitySourceKey(row) {
    return String((row && (row.id || row._syncId)) || [
      row && row.productId,
      row && row.productName,
      row && row.uCost,
      row && row.year,
      row && row.month
    ].join('|'));
  }

  function ensureModel(database) {
    if (!database) return false;
    if (!Array.isArray(database.monthRollovers)) database.monthRollovers = [];
    ['debtorsMonthly', 'creditorsMonthly', 'depositorsMonthly', 'kpiHistory', 'stockRows'].forEach(function (key) {
      if (!Array.isArray(database[key])) database[key] = [];
    });
    return true;
  }

  function latestBusinessPeriod(database) {
    const candidates = [];

    function add(year, month) {
      if (validPeriod(year, month)) candidates.push({ year: Number(year), month: Number(month) });
    }

    (database.stockRows || []).forEach(function (row) { add(row.year, row.month); });
    (database.monthRollovers || []).forEach(function (rollover) {
      add(rollover.targetYear, rollover.targetMonth);
    });

    if (!candidates.length) add(database.selectedYear, database.selectedMonth);
    if (!candidates.length) return calendarPeriod();

    return candidates.reduce(function (best, current) {
      return comparePeriods(current, best) > 0 ? current : best;
    });
  }

  function markerForTarget(database, target) {
    return (database.monthRollovers || []).find(function (entry) {
      return entry && Number(entry.targetYear) === target.year
        && Number(entry.targetMonth) === target.month;
    }) || null;
  }

  function latestRolloverMarker(database) {
    const list = (database.monthRollovers || []).filter(Boolean);
    if (!list.length) return null;
    return list.reduce(function (best, current) {
      if (!best) return current;
      const a = { year: Number(current.targetYear) || 0, month: Number(current.targetMonth) || 0 };
      const b = { year: Number(best.targetYear) || 0, month: Number(best.targetMonth) || 0 };
      return comparePeriods(a, b) > 0 ? current : best;
    }, null);
  }

  function rolloverSourcePeriod(database, target) {
    const candidates = [];
    function addBefore(year, month) {
      if (!validPeriod(year, month)) return;
      const period = { year: Number(year), month: Number(month) };
      if (comparePeriods(period, target) < 0) candidates.push(period);
    }

    // A marker or stock row in an earlier month is valid evidence of the
    // previous working period. Current-month sales/transactions are deliberately
    // ignored because they must never suppress a missing rollover.
    (database.monthRollovers || []).forEach(function (entry) {
      addBefore(entry.targetYear, entry.targetMonth);
    });
    (database.stockRows || []).forEach(function (row) {
      addBefore(row.year, row.month);
    });
    if (!candidates.length) {
      (database.sales || []).forEach(function (sale) { addBefore(sale.year, sale.month); });
      (database.inventoryTxns || []).forEach(function (txn) { addBefore(txn.year, txn.month); });
    }
    addBefore(database.selectedYear, database.selectedMonth);

    if (!candidates.length) return target;
    return candidates.reduce(function (best, current) {
      return comparePeriods(current, best) > 0 ? current : best;
    });
  }

  function markerId(source, target) {
    return 'MONTH-ROLLOVER-' + periodKey(source.year, source.month) + '-TO-' + periodKey(target.year, target.month);
  }

  function existingMarker(database, source, target) {
    const id = markerId(source, target);
    return (database.monthRollovers || []).find(function (entry) {
      return entry && (entry.id === id
        || (Number(entry.sourceYear) === source.year
          && Number(entry.sourceMonth) === source.month
          && Number(entry.targetYear) === target.year
          && Number(entry.targetMonth) === target.month));
    }) || null;
  }

  function hasCurrentRolloverDue(now) {
    const database = getDatabase();
    if (!ensureModel(database)) return false;
    const target = calendarPeriod(now);
    if (markerForTarget(database, target)) return false;
    return comparePeriods(rolloverSourcePeriod(database, target), target) < 0;
  }

  function withSelectedPeriod(database, period, callback) {
    const previous = { year: database.selectedYear, month: database.selectedMonth };
    database.selectedYear = period.year;
    database.selectedMonth = period.month;
    try {
      return callback();
    } finally {
      database.selectedYear = previous.year;
      database.selectedMonth = previous.month;
    }
  }

  function snapshotAccountCollection(database, accountKey, monthlyKey, prefix, source) {
    const list = Array.isArray(database[accountKey]) ? database[accountKey] : [];
    const monthly = Array.isArray(database[monthlyKey]) ? database[monthlyKey] : (database[monthlyKey] = []);
    let added = 0;

    list.forEach(function (account) {
      const accountKeyValue = String(account.id || account._syncId || account.name || 'ACCOUNT');
      const already = monthly.some(function (snapshot) {
        const snapshotAccount = String(snapshot.accountId || snapshot.originalId || snapshot.id || snapshot.name || '');
        return Number(snapshot.snapYear) === source.year
          && Number(snapshot.snapMonth) === source.month
          && (snapshotAccount === accountKeyValue || (snapshot.name && snapshot.name === account.name));
      });
      if (already) return;

      monthly.push({
        id: 'SNAP-' + prefix + '-' + periodKey(source.year, source.month) + '-' + hashText(accountKeyValue),
        accountId: account.id || account._syncId || '',
        name: account.name || '',
        phone: account.contact || account.phone || '',
        snapYear: source.year,
        snapMonth: source.month,
        bal: Number(account.balance) || 0,
        closingBalance: Number(account.balance) || 0,
        automatic: true
      });
      added += 1;
    });

    return added;
  }

  function snapshotKPI(database, source) {
    const exists = (database.kpiHistory || []).some(function (entry) {
      return Number(entry.year) === source.year && Number(entry.month) === source.month;
    });
    if (exists) return false;

    const values = withSelectedPeriod(database, source, function () {
      return {
        qtyIn: typeof KPI_QtyIn === 'function' ? KPI_QtyIn() : 0,
        qtyOut: typeof KPI_QtyOut === 'function' ? KPI_QtyOut() : 0,
        qtyRem: typeof KPI_QtyRem === 'function' ? KPI_QtyRem() : 0,
        totalSales: typeof KPI_TotalSales === 'function' ? KPI_TotalSales() : 0,
        crStock: typeof KPI_CRStock === 'function' ? KPI_CRStock() : 0,
        gross: typeof GetGrossProfit_CurrentMonth === 'function' ? GetGrossProfit_CurrentMonth() : 0,
        expenses: typeof KPI_TotalExpenses_CurrentMonth === 'function' ? KPI_TotalExpenses_CurrentMonth() : 0,
        net: typeof KPI_NetProfit === 'function' ? KPI_NetProfit() : 0,
        cashBuckets: typeof KPI_CashBuckets_Total === 'function' ? KPI_CashBuckets_Total() : 0,
        liquidCash: typeof KPI_LiquidCash === 'function' ? KPI_LiquidCash() : 0,
        zakaat: typeof KPI_Zakaat === 'function' ? KPI_Zakaat() : 0,
        debt: typeof KPI_TotalOutstandingDebt === 'function' ? KPI_TotalOutstandingDebt() : 0,
        creditors: typeof KPI_TotalCreditors === 'function' ? KPI_TotalCreditors() : 0,
        deposits: typeof KPI_TotalDeposits === 'function' ? KPI_TotalDeposits() : 0,
        snapshotVersion: 2
      };
    });

    database.kpiHistory.push(Object.assign({
      id: 'KPI-' + periodKey(source.year, source.month),
      year: source.year,
      month: source.month,
      automatic: true
    }, values));
    return true;
  }

  function carryStock(database, source, target, rolloverId) {
    const sourceRows = (database.stockRows || []).filter(function (row) {
      return Number(row.year) === source.year
        && Number(row.month) === source.month
        && (Number(row.rStock) || 0) >= 1;
    });
    let added = 0;

    sourceRows.forEach(function (row) {
      const sourceKey = entitySourceKey(row);
      const carryId = 'AUTO-STKIN-' + periodKey(target.year, target.month) + '-' + hashText(sourceKey);
      const already = database.stockRows.some(function (candidate) {
        return candidate.id === carryId
          || (Number(candidate.year) === target.year
            && Number(candidate.month) === target.month
            && String(candidate.carriedFrom || '') === sourceKey);
      });
      if (already) return;

      const remaining = Number(row.rStock) || 0;
      database.stockRows.push({
        id: carryId,
        productId: row.productId || '',
        productName: row.productName || '',
        category: row.category || '',
        year: target.year,
        month: target.month,
        qtyIn: remaining,
        rStock: remaining,
        uCost: Number(row.uCost) || 0,
        qtyOut: 0,
        uPrice: Number(row.uPrice) || 0,
        disc: 0,
        tSales: 0,
        profit: 0,
        aPrice: 0,
        carriedFrom: sourceKey,
        rolloverId: rolloverId,
        automaticRollover: true
      });
      added += 1;
    });

    return { sourceCount: sourceRows.length, added: added };
  }

  function performOneRollover(database, source, target) {
    ensureModel(database);
    const prior = existingMarker(database, source, target);
    if (prior) {
      database.selectedYear = target.year;
      database.selectedMonth = target.month;
      return { changed: false, marker: prior, carried: Number(prior.carriedCount) || 0 };
    }

    const id = markerId(source, target);
    const accountSnapshots = {
      debtors: snapshotAccountCollection(database, 'debtors', 'debtorsMonthly', 'DEB', source),
      creditors: snapshotAccountCollection(database, 'creditors', 'creditorsMonthly', 'CRD', source),
      depositors: snapshotAccountCollection(database, 'depositors', 'depositorsMonthly', 'DEP', source)
    };
    const kpiAdded = snapshotKPI(database, source);
    const carry = carryStock(database, source, target, id);

    const marker = {
      id: id,
      sourceYear: source.year,
      sourceMonth: source.month,
      targetYear: target.year,
      targetMonth: target.month,
      carriedCount: carry.added,
      eligibleCarryCount: carry.sourceCount,
      accountSnapshots: accountSnapshots,
      kpiArchived: kpiAdded,
      completedAt: new Date().toISOString(),
      mode: 'automatic'
    };
    database.monthRollovers.push(marker);
    database.selectedYear = target.year;
    database.selectedMonth = target.month;

    if (typeof saveDB !== 'function') throw new Error('Database save service is unavailable.');
    saveDB();
    return { changed: true, marker: marker, carried: carry.added };
  }

  function safeRenderAfterRollover(options) {
    if (options && options.render === false) {
      try { if (typeof updatePeriodUI === 'function') updatePeriodUI(); } catch (_) {}
      return;
    }
    try {
      const shell = document.getElementById('appShell');
      if (shell && shell.style.display !== 'none' && typeof render === 'function') render();
      else if (typeof updatePeriodUI === 'function') updatePeriodUI();
    } catch (_) {}
  }

  function notifyResult(result, options) {
    if (!result || !result.count || (options && options.silent)) return;
    const database = getDatabase();
    const target = { year: database.selectedYear, month: database.selectedMonth };
    const key = periodKey(target.year, target.month) + ':' + result.carried;
    if (key === lastNoticeKey) return;
    lastNoticeKey = key;
    const label = typeof monthName === 'function' ? monthName(target.month) + ' ' + target.year : periodKey(target.year, target.month);
    const message = 'New month opened automatically: ' + label + ' · carried ' + result.carried + ' stock batch' + (result.carried === 1 ? '' : 'es') + '.';
    if (typeof toast === 'function') toast(message, 'ok');
  }

  function ensureAutomaticMonthRollover(options) {
    if (running) return { changed: false, running: true, count: 0, carried: 0 };
    const database = getDatabase();
    if (!ensureModel(database)) return { changed: false, unavailable: true, count: 0, carried: 0 };
    if (window.ZEZMS.cloudSync && typeof ZEZMS.cloudSync.isApplyingRemote === 'function'
        && ZEZMS.cloudSync.isApplyingRemote()) {
      return { changed: false, deferred: true, count: 0, carried: 0 };
    }
    if (window.ZEZMS.cloudSync && typeof ZEZMS.cloudSync.getState === 'function'
        && typeof ZEZMS.cloudSync.isReadyForLocalOperations === 'function') {
      const syncState = ZEZMS.cloudSync.getState();
      if (syncState && syncState.initialized && !ZEZMS.cloudSync.isReadyForLocalOperations()) {
        return { changed: false, deferred: true, count: 0, carried: 0 };
      }
    }

    const target = calendarPeriod(options && options.now);
    if (markerForTarget(database, target)) {
      return { changed: false, count: 0, carried: 0, target: target, alreadyCompleted: true };
    }
    let source = rolloverSourcePeriod(database, target);
    if (comparePeriods(source, target) >= 0) return { changed: false, count: 0, carried: 0 };

    running = true;
    let count = 0;
    let carried = 0;
    try {
      while (comparePeriods(source, target) < 0) {
        if (count >= MAX_CATCHUP_MONTHS) {
          throw new Error('Automatic rollover stopped after ' + MAX_CATCHUP_MONTHS + ' months. Check the stored period dates.');
        }
        const next = nextPeriod(source);
        const result = performOneRollover(database, source, next);
        if (result.changed) {
          count += 1;
          carried += Number(result.carried) || 0;
        }
        source = next;
      }
      safeRenderAfterRollover(options);
      const summary = { changed: count > 0, count: count, carried: carried, target: target };
      notifyResult(summary, options);
      return summary;
    } catch (error) {
      console.error('ZEZMS automatic month rollover failed', error);
      if (!(options && options.silent) && typeof toast === 'function') {
        toast('Automatic month rollover failed: ' + (error.message || error), 'err');
      }
      return { changed: false, error: error, count: count, carried: carried };
    } finally {
      running = false;
    }
  }

  async function prepareFromCloudThenRollover() {
    const cloud = window.ZEZMS && ZEZMS.cloudSync;
    try {
      if (cloud && typeof cloud.waitUntilReady === 'function') {
        await cloud.waitUntilReady(7000);
      }
      if (cloud && typeof cloud.getState === 'function') {
        const state = cloud.getState();
        if (navigator.onLine && state.initialized && state.signedInEmail
            && typeof cloud.pullNow === 'function') {
          await cloud.pullNow(true);
        }
      }
    } catch (error) {
      console.warn('Cloud refresh before automatic month rollover was unavailable', error);
    }

    const result = ensureAutomaticMonthRollover({ silent: false });

    // Repair the first-day startup race from earlier releases. If a rollover
    // exists locally but its deterministic operation was never uploaded, this
    // republishes the complete rollover once. Supabase deduplicates it safely
    // when the operation already exists.
    try {
      const database = getDatabase();
      const marker = database ? latestRolloverMarker(database) : null;
      if (marker && cloud && typeof cloud.publishMonthRollover === 'function') {
        await cloud.publishMonthRollover(marker, { silent: true });
      }
    } catch (error) {
      console.warn('Automatic rollover cloud reconciliation was deferred', error);
    }
    return result;
  }

  function wrapTransactionFunction(name, before) {
    const original = window[name];
    if (typeof original !== 'function' || original.__autoMonthWrapped) return;
    const wrapped = function () {
      if (hasCurrentRolloverDue()) {
        const result = ensureAutomaticMonthRollover({ silent: false, render: false });
        if (result && result.deferred) {
          prepareFromCloudThenRollover();
          if (typeof toast === 'function') toast('Preparing the new working month. Please try the transaction again in a moment.', 'warn');
          return false;
        }
        if (before) before(result);
      }
      return original.apply(this, arguments);
    };
    wrapped.__autoMonthWrapped = true;
    window[name] = wrapped;
  }

  function installGuards() {
    wrapTransactionFunction('addItemToList');
    wrapTransactionFunction('quickSaleOut');
    wrapTransactionFunction('printReceiptSale');
    wrapTransactionFunction('doStockIn', function () {
      const database = getDatabase();
      const yearField = document.getElementById('siYear');
      const monthField = document.getElementById('siMonth');
      if (database && yearField) yearField.value = database.selectedYear;
      if (database && monthField) monthField.value = database.selectedMonth;
    });

    const originalLogin = window.doLogin;
    if (typeof originalLogin === 'function' && !originalLogin.__autoMonthWrapped) {
      const wrappedLogin = function () {
        const result = originalLogin.apply(this, arguments);
        setTimeout(function () { prepareFromCloudThenRollover(); }, 0);
        return result;
      };
      wrappedLogin.__autoMonthWrapped = true;
      window.doLogin = wrappedLogin;
    }

    const originalNav = window.nav;
    if (typeof originalNav === 'function' && !originalNav.__autoMonthWrapped) {
      const wrappedNav = function (view) {
        if (view === 'monthend') view = 'dashboard';
        ensureAutomaticMonthRollover({ silent: true, render: false });
        return originalNav.call(this, view);
      };
      wrappedNav.__autoMonthWrapped = true;
      window.nav = wrappedNav;
    }
  }

  function removeManualMonthUI() {
    const button = document.getElementById('navMonthEnd');
    if (button) button.remove();
    try { if (typeof TITLES !== 'undefined') delete TITLES.monthend; } catch (_) {}
  }

  function addSettingsStatus() {
    const original = window.viewSettings;
    if (typeof original !== 'function' || original.__autoMonthWrapped) return;
    const wrapped = function () {
      let html = original.apply(this, arguments);
      const database = getDatabase();
      ensureModel(database);
      const latest = database ? latestBusinessPeriod(database) : calendarPeriod();
      const last = database ? latestRolloverMarker(database) : null;
      const latestLabel = typeof monthName === 'function' ? monthName(latest.month) + ' ' + latest.year : periodKey(latest.year, latest.month);
      const lastLabel = last
        ? (typeof monthName === 'function' ? monthName(last.targetMonth) + ' ' + last.targetYear : periodKey(last.targetYear, last.targetMonth))
        : 'Not required yet';
      const card = '<div class="card" style="margin-top:12px">'
        + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Automatic Month Rollover</h3><span class="badge ok">ACTIVE</span></div>'
        + '<p class="muted" style="font-size:12px">At the first app check in a new calendar month, ZEZMS archives the previous month and carries only stock batches with remaining quantity greater than or equal to 1. No manual month-opening action is required.</p>'
        + '<div class="statline"><span>Current working period</span><b>' + String(latestLabel) + '</b></div>'
        + '<div class="statline"><span>Most recent automatic rollover</span><b>' + String(lastLabel) + '</b></div>'
        + '<div class="statline"><span>Recorded rollovers</span><b>' + String(database ? database.monthRollovers.length : 0) + '</b></div>'
        + '</div>';
      return html + card;
    };
    wrapped.__autoMonthWrapped = true;
    window.viewSettings = wrapped;
  }

  function scheduleChecks() {
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(function () {
      if (!document.hidden) ensureAutomaticMonthRollover({ silent: false });
    }, CHECK_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) prepareFromCloudThenRollover();
    });
    window.addEventListener('focus', function () {
      prepareFromCloudThenRollover();
    });
    window.addEventListener('online', function () {
      setTimeout(prepareFromCloudThenRollover, 500);
    });
    window.addEventListener('zezms-cloud-ready', function () {
      setTimeout(prepareFromCloudThenRollover, 100);
    });
  }

  function init() {
    const database = getDatabase();
    if (ensureModel(database) && typeof ZEZMS.db !== 'undefined' && ZEZMS.db && typeof ZEZMS.db.save === 'function') {
      try { ZEZMS.db.save(DB_KEY, database); } catch (_) {}
    }
    removeManualMonthUI();
    installGuards();
    addSettingsStatus();
    scheduleChecks();
    setTimeout(prepareFromCloudThenRollover, 1500);
  }

  ZEZMS.autoMonth = {
    version: '3.4.20',
    build: BUILD,
    ensure: ensureAutomaticMonthRollover,
    isDue: hasCurrentRolloverDue,
    getLatestPeriod: function () {
      const database = getDatabase();
      return database ? latestBusinessPeriod(database) : calendarPeriod();
    },
    _test: {
      nextPeriod: nextPeriod,
      comparePeriods: comparePeriods,
      latestBusinessPeriod: latestBusinessPeriod,
      rolloverSourcePeriod: rolloverSourcePeriod,
      markerForTarget: markerForTarget,
      markerId: markerId,
      carryStock: carryStock,
      performOneRollover: performOneRollover
    }
  };

  init();
}());

(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260807-access-controls-r29';
  const STATE_KEY = 'zezms_cloud_sync_m4_state';
  const LEGACY_STATE_KEY = 'zezms_cloud_sync_m3_state';
  const QUEUE_KEY = 'zezms_cloud_sync_m4_queue';
  const REJECTED_KEY = 'zezms_cloud_sync_m4_rejected';
  const SNAPSHOT_TABLE = 'zezms_sync_state';
  const OPERATIONS_TABLE = 'zezms_sync_operations';
  const PUSH_DEBOUNCE_MS = 900;
  const PULL_PAGE_SIZE = 500;

  const COLLECTIONS = [
    'products', 'stockRows', 'debtors', 'creditors', 'depositors',
    'sales', 'receipts', 'invoices', 'waybills', 'saleLines', 'accountTxns', 'cashLog',
    'expenses', 'inventoryTxns', 'undoLog', 'debtorsMonthly',
    'creditorsMonthly', 'depositorsMonthly', 'kpiHistory', 'monthRollovers'
  ];

  const ADDITIVE_FIELDS = {
    stockRows: new Set(['qtyIn', 'rStock', 'qtyOut', 'disc', 'tSales', 'profit', 'aPrice']),
    debtors: new Set(['balance']),
    creditors: new Set(['balance']),
    depositors: new Set(['balance'])
  };

  const LOCAL_ONLY_ROOTS = new Set([
    'backupHistory', 'backupSettings', 'syncSettings', 'syncMeta', 'syncRejectedTransactions'
  ]);

  let state = loadState();
  let queue = loadJSON(QUEUE_KEY, []);
  let rejected = loadJSON(REJECTED_KEY, []);
  let observedSnapshot = null;
  let client = null;
  let session = null;
  let channel = null;
  let authSubscription = null;
  let cloudMfaPromptPromise = null;
  let pushTimer = null;
  let pushInFlight = false;
  let pullInFlight = false;
  let applyingRemote = false;
  let initPromise = null;
  let initSettled = false;

  function makeUUID() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'M4-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  function defaults() {
    const cfg = window.ZEZMS_CONFIG && ZEZMS_CONFIG.cloud && ZEZMS_CONFIG.cloud.supabase;
    return {
      version: 4,
      build: BUILD,
      deviceId: makeUUID(),
      deviceName: 'ZEZMS Device',
      supabaseUrl: cfg && cfg.url ? cfg.url : '',
      publishableKey: cfg && cfg.publishableKey ? cfg.publishableKey : '',
      liveSyncEnabled: false,
      initialized: false,
      cursor: 0,
      deviceSeq: 0,
      pending: false,
      status: 'not-configured',
      lastPushAt: '',
      lastPullAt: '',
      lastRemoteAt: '',
      signedInEmail: '',
      syncOwnerId: '',
      businessId: '',
      branchId: '',
      deviceAccessMode: 'OWNER',
      deviceAccessStatus: '',
      pairingId: '',
      lastError: '',
      lastRejected: null,
      mergeWarnings: [],
      announcedRollovers: []
    };
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function loadState() {
    try {
      const modern = localStorage.getItem(STATE_KEY);
      if (modern) return Object.assign(defaults(), JSON.parse(modern));
      const legacy = localStorage.getItem(LEGACY_STATE_KEY);
      if (legacy) {
        const old = JSON.parse(legacy);
        return Object.assign(defaults(), {
          deviceId: old.deviceId || makeUUID(),
          deviceName: old.deviceName || 'ZEZMS Device',
          supabaseUrl: old.supabaseUrl || '',
          publishableKey: old.publishableKey || '',
          signedInEmail: old.signedInEmail || '',
          status: old.supabaseUrl ? 'upgrade-required' : 'not-configured'
        });
      }
    } catch (_) {}
    return defaults();
  }

  function persistState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function persistQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (error) {
      console.warn('M4 operation queue could not be saved', error);
    }
  }

  function persistRejected() {
    rejected = rejected.slice(-50);
    try { localStorage.setItem(REJECTED_KEY, JSON.stringify(rejected)); } catch (_) {}
  }

  function setState(patch, shouldRender) {
    state = Object.assign({}, state, patch || {}, { pending: queue.length > 0 });
    persistState();
    if (shouldRender !== false) safeRender();
  }

  function safeRender() {
    try {
      if (typeof render === 'function' && typeof currentView !== 'undefined'
          && (currentView === 'sync' || currentView === 'settings')) render();
    } catch (_) {}
  }

  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
    else console.log(message);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function stableString(value) {
    if (value === undefined) return 'undefined';
    return JSON.stringify(value);
  }

  function equal(a, b) {
    return stableString(a) === stableString(b);
  }

  function whenText(value) {
    return value ? new Date(value).toLocaleString() : 'Never';
  }

  function configured() {
    return /^https:\/\/.+\.supabase\.co\/?$/i.test((state.supabaseUrl || '').trim())
      && !!(state.publishableKey || '').trim();
  }

  function libraryReady() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getDatabase() {
    try { if (typeof DB !== 'undefined' && DB) return DB; } catch (_) {}
    return null;
  }

  function rawSaveDatabase() {
    const database = getDatabase();
    if (!database) throw new Error('The local database is unavailable.');
    if (window.ZEZMS && ZEZMS.db && typeof ZEZMS.db.save === 'function') {
      ZEZMS.db.save(DB_KEY, database);
      return;
    }
    throw new Error('The database save service is unavailable.');
  }

  function preparePayload() {
    const database = getDatabase();
    if (!database) throw new Error('The local ZEZMS database is unavailable.');
    const payload = clone(database);
    try { if (typeof APP_VERSION !== 'undefined') payload.version = APP_VERSION; } catch (_) {}
    LOCAL_ONLY_ROOTS.forEach(function (key) { delete payload[key]; });
    return payload;
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('The cloud master is not a valid ZEZMS database.');
    }
    const expected = ['products', 'stockRows', 'sales', 'receipts'];
    if (expected.filter(function (key) { return Array.isArray(payload[key]); }).length < 2) {
      throw new Error('The cloud master does not contain the expected business records.');
    }
  }

  function entityKey(item) {
    if (!item || typeof item !== 'object') return '';
    return String(item.id || item.receiptNo || item._syncId || '');
  }

  function ensureSyncIds(database) {
    let changed = false;
    COLLECTIONS.forEach(function (collection) {
      if (!Array.isArray(database[collection])) database[collection] = [];
      database[collection].forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        if (!entityKey(item)) {
          item._syncId = makeUUID();
          changed = true;
        }
      });
    });
    return changed;
  }

  function cleanSnapshot(database) {
    const copy = clone(database || {});
    LOCAL_ONLY_ROOTS.forEach(function (key) { delete copy[key]; });
    return copy;
  }

  function rolloverIdFromOperation(operation) {
    if (!operation || !Array.isArray(operation.patches)) return '';
    const patch = operation.patches.find(function (item) {
      return item && item.action === 'insert' && item.collection === 'monthRollovers'
        && item.value && item.value.id;
    });
    return patch && patch.value ? String(patch.value.id || '') : '';
  }

  function markRolloverAnnounced(rolloverId) {
    const id = String(rolloverId || '');
    if (!id) return;
    const list = Array.isArray(state.announcedRollovers) ? state.announcedRollovers.slice() : [];
    if (list.indexOf(id) < 0) list.push(id);
    state.announcedRollovers = list.slice(-36);
    persistState();
  }

  function buildRolloverRepairOperation(marker) {
    const database = getDatabase();
    if (!database || !marker || !marker.id) return null;
    const patches = [];
    const sourceYear = Number(marker.sourceYear) || 0;
    const sourceMonth = Number(marker.sourceMonth) || 0;
    const targetYear = Number(marker.targetYear) || 0;
    const targetMonth = Number(marker.targetMonth) || 0;

    function addInsert(collection, item) {
      if (!item || !entityKey(item)) return;
      patches.push({
        action: 'insert', collection: collection,
        key: entityKey(item), value: clone(item)
      });
    }

    ['debtorsMonthly', 'creditorsMonthly', 'depositorsMonthly'].forEach(function (collection) {
      (database[collection] || []).forEach(function (item) {
        if (Number(item.snapYear) === sourceYear && Number(item.snapMonth) === sourceMonth) {
          addInsert(collection, item);
        }
      });
    });

    (database.kpiHistory || []).forEach(function (item) {
      if (Number(item.year) === sourceYear && Number(item.month) === sourceMonth) {
        addInsert('kpiHistory', item);
      }
    });

    (database.stockRows || []).forEach(function (row) {
      const belongs = String(row.rolloverId || '') === String(marker.id)
        || (row.automaticRollover === true
          && Number(row.year) === targetYear
          && Number(row.month) === targetMonth
          && !!row.carriedFrom);
      if (belongs) addInsert('stockRows', row);
    });

    addInsert('monthRollovers', marker);
    patches.push({ action: 'root-set', root: 'selectedYear', value: targetYear, before: clone(database.selectedYear) });
    patches.push({ action: 'root-set', root: 'selectedMonth', value: targetMonth, before: clone(database.selectedMonth) });

    state.deviceSeq = (Number(state.deviceSeq) || 0) + 1;
    persistState();
    return {
      opId: 'AUTO-' + String(marker.id),
      deviceId: state.deviceId,
      deviceSeq: state.deviceSeq,
      createdAt: marker.completedAt || new Date().toISOString(),
      reason: 'month-rollover-repair',
      kind: 'MONTH_ROLLOVER_REPAIR',
      appVersion: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
      repairRolloverId: String(marker.id),
      patches: patches
    };
  }

  function additiveField(collection, field) {
    return !!(ADDITIVE_FIELDS[collection] && ADDITIVE_FIELDS[collection].has(field));
  }

  function diffEntity(collection, before, after) {
    const changes = [];
    const fields = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    fields.forEach(function (field) {
      if (field === '_syncId') return;
      const oldValue = before ? before[field] : undefined;
      const newValue = after ? after[field] : undefined;
      if (equal(oldValue, newValue)) return;
      if (additiveField(collection, field)
          && typeof oldValue === 'number' && Number.isFinite(oldValue)
          && typeof newValue === 'number' && Number.isFinite(newValue)) {
        changes.push({ field: field, mode: 'delta', value: newValue - oldValue, before: oldValue });
      } else {
        changes.push({ field: field, mode: 'set', value: clone(newValue), before: clone(oldValue) });
      }
    });
    return changes;
  }

  function diffCollection(collection, beforeList, afterList, patches) {
    const beforeMap = new Map();
    const afterMap = new Map();
    (beforeList || []).forEach(function (item) { beforeMap.set(entityKey(item), item); });
    (afterList || []).forEach(function (item) { afterMap.set(entityKey(item), item); });

    afterMap.forEach(function (after, key) {
      if (!key) return;
      if (!beforeMap.has(key)) {
        patches.push({ action: 'insert', collection: collection, key: key, value: clone(after) });
        return;
      }
      const before = beforeMap.get(key);
      const changes = diffEntity(collection, before, after);
      if (changes.length) {
        patches.push({
          action: 'update', collection: collection, key: key,
          changes: changes, fallback: clone(after)
        });
      }
    });

    beforeMap.forEach(function (before, key) {
      if (key && !afterMap.has(key)) {
        patches.push({ action: 'delete', collection: collection, key: key, before: clone(before) });
      }
    });
  }

  function diffRoot(before, after, patches) {
    const beforeCash = before.cashBalances || {};
    const afterCash = after.cashBalances || {};
    new Set(Object.keys(beforeCash).concat(Object.keys(afterCash))).forEach(function (wallet) {
      const oldValue = Number(beforeCash[wallet]) || 0;
      const newValue = Number(afterCash[wallet]) || 0;
      if (Math.abs(newValue - oldValue) > 1e-9) {
        patches.push({
          action: 'root-object', root: 'cashBalances', key: wallet,
          mode: 'delta', value: newValue - oldValue, before: oldValue
        });
      }
    });

    ['selectedYear', 'selectedMonth', 'business', 'settings', 'security', 'sharedDeviceDirectory'].forEach(function (root) {
      if (!equal(before[root], after[root])) {
        patches.push({ action: 'root-set', root: root, value: clone(after[root]), before: clone(before[root]) });
      }
    });
  }

  function inferKind(patches) {
    if (patches.some(function (patch) {
      return patch.action === 'root-set' && patch.root === 'sharedDeviceDirectory';
    })) return 'SHARED_DEVICE_DIRECTORY';

    const insert = function (collection) {
      return patches.find(function (patch) { return patch.action === 'insert' && patch.collection === collection; });
    };
    const rollover = insert('monthRollovers');
    if (rollover) return 'MONTH_ROLLOVER';
    const inventory = insert('inventoryTxns');
    if (inventory && inventory.value && inventory.value.type) return String(inventory.value.type).toUpperCase();
    if (insert('invoices')) return 'INVOICE';
    if (insert('waybills')) return 'WAYBILL';
    if (insert('sales') || insert('receipts')) return 'SALE_OUT';
    const account = insert('accountTxns');
    if (account && account.value) return 'ACCOUNT_' + String(account.value.txnType || 'CHANGE').toUpperCase().replace(/\s+/g, '_');
    if (insert('expenses')) return 'EXPENSE';
    if (patches.some(function (patch) {
      return patch.collection === 'stockRows' && patch.action === 'update'
        && patch.changes.some(function (change) { return change.field === 'qtyIn' && change.mode === 'delta' && change.value > 0; });
    })) return 'STOCK_IN';
    if (patches.some(function (patch) { return patch.action === 'delete'; })) return 'DELETE';
    return 'DATABASE_CHANGE';
  }

  function buildOperation(before, after, reason) {
    const patches = [];
    COLLECTIONS.forEach(function (collection) {
      diffCollection(collection, before[collection] || [], after[collection] || [], patches);
    });
    diffRoot(before, after, patches);
    if (!patches.length) return null;
    state.deviceSeq = (Number(state.deviceSeq) || 0) + 1;
    persistState();
    const rolloverPatch = patches.find(function (patch) {
      return patch.action === 'insert' && patch.collection === 'monthRollovers';
    });
    const operationId = rolloverPatch && rolloverPatch.key
      ? 'AUTO-' + String(rolloverPatch.key)
      : makeUUID();
    return {
      opId: operationId,
      deviceId: state.deviceId,
      deviceSeq: state.deviceSeq,
      createdAt: new Date().toISOString(),
      reason: reason || 'database-save',
      kind: inferKind(patches),
      appVersion: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
      patches: patches
    };
  }

  function findEntity(collection, key) {
    const database = getDatabase();
    const list = database && Array.isArray(database[collection]) ? database[collection] : null;
    if (!list) return { list: null, index: -1, item: null };
    const index = list.findIndex(function (item) { return entityKey(item) === String(key); });
    return { list: list, index: index, item: index >= 0 ? list[index] : null };
  }

  function addMergeWarning(message, operation) {
    const warning = {
      at: new Date().toISOString(),
      message: message,
      opId: operation && operation.opId ? operation.opId : '',
      kind: operation && operation.kind ? operation.kind : ''
    };
    const warnings = (state.mergeWarnings || []).concat([warning]).slice(-20);
    setState({ mergeWarnings: warnings, lastError: message }, false);
  }

  function applyPatch(patch, operation) {
    const database = getDatabase();
    if (!database) throw new Error('Local database is unavailable while applying a cloud operation.');

    if (patch.action === 'insert') {
      if (!Array.isArray(database[patch.collection])) database[patch.collection] = [];
      const found = findEntity(patch.collection, patch.key);
      if (found.item) {
        if (!equal(found.item, patch.value)) {
          addMergeWarning('Duplicate record key ignored in ' + patch.collection + ': ' + patch.key, operation);
        }
        return;
      }
      database[patch.collection].push(clone(patch.value));
      return;
    }

    if (patch.action === 'delete') {
      const found = findEntity(patch.collection, patch.key);
      if (found.index >= 0) found.list.splice(found.index, 1);
      return;
    }

    if (patch.action === 'update') {
      let found = findEntity(patch.collection, patch.key);
      if (!found.item) {
        if (!patch.fallback) throw new Error('Missing record ' + patch.collection + '/' + patch.key);
        if (!Array.isArray(database[patch.collection])) database[patch.collection] = [];
        database[patch.collection].push(clone(patch.fallback));
        return;
      }
      patch.changes.forEach(function (change) {
        if (change.mode === 'delta') {
          const next = (Number(found.item[change.field]) || 0) + (Number(change.value) || 0);
          if (patch.collection === 'stockRows' && change.field === 'rStock' && next < -1e-6) {
            throw new Error('Stock merge would make remaining quantity negative for ' + (found.item.productName || patch.key));
          }
          found.item[change.field] = Math.abs(next) < 1e-9 ? 0 : next;
        } else {
          if (change.value === undefined) delete found.item[change.field];
          else found.item[change.field] = clone(change.value);
        }
      });
      return;
    }

    if (patch.action === 'root-object') {
      if (!database[patch.root] || typeof database[patch.root] !== 'object') database[patch.root] = {};
      if (patch.mode === 'delta') {
        const next = (Number(database[patch.root][patch.key]) || 0) + (Number(patch.value) || 0);
        if (patch.root === 'cashBalances' && next < -1e-6) {
          throw new Error('Cash merge would make ' + patch.key + ' negative.');
        }
        database[patch.root][patch.key] = Math.abs(next) < 1e-9 ? 0 : next;
      } else {
        database[patch.root][patch.key] = clone(patch.value);
      }
      return;
    }

    if (patch.action === 'root-set') {
      database[patch.root] = clone(patch.value);
    }
  }

  function inversePatch(patch) {
    if (patch.action === 'insert') {
      return { action: 'delete', collection: patch.collection, key: patch.key, before: clone(patch.value) };
    }
    if (patch.action === 'delete') {
      return { action: 'insert', collection: patch.collection, key: patch.key, value: clone(patch.before) };
    }
    if (patch.action === 'update') {
      return {
        action: 'update', collection: patch.collection, key: patch.key,
        fallback: null,
        changes: patch.changes.map(function (change) {
          return change.mode === 'delta'
            ? { field: change.field, mode: 'delta', value: -(Number(change.value) || 0), before: null }
            : { field: change.field, mode: 'set', value: clone(change.before), before: clone(change.value) };
        })
      };
    }
    if (patch.action === 'root-object') {
      return patch.mode === 'delta'
        ? { action: 'root-object', root: patch.root, key: patch.key, mode: 'delta', value: -(Number(patch.value) || 0), before: null }
        : { action: 'root-object', root: patch.root, key: patch.key, mode: 'set', value: clone(patch.before), before: clone(patch.value) };
    }
    if (patch.action === 'root-set') {
      return { action: 'root-set', root: patch.root, value: clone(patch.before), before: clone(patch.value) };
    }
    return null;
  }

  function applyOperation(operation, options) {
    if (!operation || !Array.isArray(operation.patches)) return false;
    applyingRemote = true;
    try {
      operation.patches.forEach(function (patch) { applyPatch(patch, operation); });
      ensureSyncIds(getDatabase());
      rawSaveDatabase();
      observedSnapshot = cleanSnapshot(getDatabase());
      const appliedRolloverId = rolloverIdFromOperation(operation) || operation.repairRolloverId;
      if (appliedRolloverId) markRolloverAnnounced(appliedRolloverId);
    } finally {
      applyingRemote = false;
    }
    try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}
    try { if (typeof sharedDeviceRefreshUsers === 'function') sharedDeviceRefreshUsers(false); } catch (_) {}
    try {
      if (operation.patches.some(function (patch) {
        return patch.action === 'root-set' && patch.root === 'sharedDeviceDirectory';
      })) {
        window.dispatchEvent(new CustomEvent('zezms-shared-device-directory-updated'));
      }
    } catch (_) {}
    try { if (!(options && options.silent) && typeof render === 'function') render(); } catch (_) {}
    return true;
  }

  function rollbackRejectedOperation(operation, message) {
    const inverse = clone(operation);
    inverse.opId = 'ROLLBACK-' + operation.opId;
    inverse.kind = 'LOCAL_ROLLBACK';
    inverse.patches = operation.patches.slice().reverse().map(inversePatch).filter(Boolean);
    applyOperation(inverse, { silent: false });
    const record = {
      at: new Date().toISOString(), opId: operation.opId, kind: operation.kind,
      reason: message || 'Cloud rejected this transaction.'
    };
    const database = getDatabase();
    if (database) {
      if (!Array.isArray(database.syncRejectedTransactions)) database.syncRejectedTransactions = [];
      database.syncRejectedTransactions.push(clone(record));
      database.syncRejectedTransactions = database.syncRejectedTransactions.slice(-100);
      rawSaveDatabase();
      observedSnapshot = cleanSnapshot(database);
    }
    rejected.push(record);
    persistRejected();
    setState({ lastRejected: record, lastError: record.reason }, false);
  }

  async function disposeClient() {
    stopRealtime();
    if (authSubscription) {
      try { authSubscription.unsubscribe(); } catch (_) {}
      authSubscription = null;
    }
    if (client && client.auth && typeof client.auth.stopAutoRefresh === 'function') {
      try { client.auth.stopAutoRefresh(); } catch (_) {}
    }
    client = null;
    session = null;
  }

  async function buildClient() {
    if (!configured()) {
      await disposeClient();
      setState({ status: 'not-configured', signedInEmail: '' }, false);
      return null;
    }
    if (!libraryReady()) {
      setState({ status: 'library-unavailable', lastError: 'Supabase JavaScript library did not load.' }, false);
      return null;
    }

    await disposeClient();
    client = window.supabase.createClient(state.supabaseUrl.replace(/\/$/, ''), state.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'zezms-m3-supabase-auth'
      }
    });

    const authResult = client.auth.onAuthStateChange(function (_event, newSession) {
      session = newSession || null;
      setState({
        signedInEmail: session && session.user ? session.user.email || '' : '',
        status: session ? (state.liveSyncEnabled ? 'connecting' : 'ready') : 'signed-out',
        lastError: session ? '' : state.lastError
      }, false);
      if (session && state.liveSyncEnabled && state.initialized) startLiveSync(false).catch(handleError);
      else if (!session) stopRealtime();
      safeRender();
    });
    authSubscription = authResult && authResult.data ? authResult.data.subscription : null;

    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data && result.data.session ? result.data.session : null;
    setState({
      signedInEmail: session && session.user ? session.user.email || '' : '',
      status: session ? (state.initialized ? 'ready' : 'upgrade-required') : 'signed-out'
    }, false);
    return client;
  }

  function requireClient() {
    if (!client) throw new Error('Save the Supabase configuration first.');
    if (!session || !session.user) throw new Error(
      state.deviceAccessMode === 'PAIRED'
        ? 'The paired-device session is missing. Pair this device again.'
        : 'Sign in to the ZEZMS cloud account first.'
    );
    if (state.deviceAccessMode === 'PAIRED' && !state.syncOwnerId) {
      throw new Error('The paired device has no owner sync context. Pair this device again.');
    }
  }

  function currentSyncOwnerId() {
    if (state.deviceAccessMode === 'PAIRED' && state.syncOwnerId) {
      return String(state.syncOwnerId);
    }
    return session && session.user ? String(session.user.id || '') : '';
  }

  function isAnonymousSession(value) {
    const active = value || session;
    return !!(active && active.user && (
      active.user.is_anonymous === true
      || active.user.app_metadata && active.user.app_metadata.provider === 'anonymous'
    ));
  }

  async function validatePairedAccess() {
    if (state.deviceAccessMode !== 'PAIRED') return null;
    requireClient();
    const result = await client.rpc('zezms_m5a3_device_context', {
      p_device_id: state.deviceId,
      p_device_name: state.deviceName,
      p_platform: String(navigator.userAgent || '').slice(0, 240),
      p_app_version: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '3.7.0'
    });
    if (result.error) throw result.error;
    const context = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!context || String(context.device_status || '').toUpperCase() !== 'ACTIVE') {
      throw new Error('ZEZMS_DEVICE_REVOKED');
    }
    setState({
      syncOwnerId: String(context.owner_id || state.syncOwnerId || ''),
      businessId: String(context.business_id || state.businessId || ''),
      branchId: String(context.branch_id || state.branchId || ''),
      deviceAccessStatus: 'ACTIVE',
      status: state.initialized ? (state.liveSyncEnabled ? 'connecting' : 'ready') : 'master-available',
      lastError: ''
    }, false);
    return context;
  }

  async function fetchMaster() {
    requireClient();
    const response = await client
      .from(SNAPSHOT_TABLE)
      .select('owner_id,payload,revision,operation_cursor,sync_mode,updated_at,updated_by')
      .eq('owner_id', currentSyncOwnerId())
      .maybeSingle();
    if (response.error) throw response.error;
    return response.data || null;
  }

  function recordFromResult(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  async function bootstrapFromThisDevice() {
    requireClient();
    if (state.deviceAccessMode === 'PAIRED') {
      throw new Error('Only the primary OWNER cloud session may activate or replace the M4 cloud master.');
    }
    const confirmed = confirm(
      'Activate transaction-level merging using the COMPLETE records on this device as the cloud baseline?\n\n'
      + 'All devices must be upgraded to M4. Other devices must then download this cloud master before recording new transactions.'
    );
    if (!confirmed) return false;

    setState({ status: 'syncing', lastError: '' });
    const response = await client.rpc('zezms_ops_bootstrap', {
      p_payload: preparePayload(),
      p_device_id: state.deviceId
    });
    if (response.error) throw response.error;
    const record = recordFromResult(response.data) || {};
    queue = [];
    persistQueue();
    observedSnapshot = cleanSnapshot(getDatabase());
    setState({
      initialized: true,
      cursor: Number(record.operation_cursor) || 0,
      pending: false,
      status: state.liveSyncEnabled ? 'connecting' : 'ready',
      lastPushAt: record.updated_at || new Date().toISOString(),
      lastError: ''
    });
    if (state.liveSyncEnabled) await startLiveSync(false);
    notify('Transaction-level cloud merging is now active.');
    return true;
  }

  function persistMasterDatabase(payload) {
    validatePayload(payload);
    const local = getDatabase();
    const backupSettings = local && local.backupSettings ? clone(local.backupSettings) : null;
    const backupHistory = local && Array.isArray(local.backupHistory) ? clone(local.backupHistory) : [];
    applyingRemote = true;
    try {
      if (typeof defaultDB !== 'function') throw new Error('Database initializer is unavailable.');
      DB = Object.assign(defaultDB(), clone(payload));
      if (backupSettings) DB.backupSettings = backupSettings;
      DB.backupHistory = backupHistory;
      ensureSyncIds(DB);
      rawSaveDatabase();
      observedSnapshot = cleanSnapshot(DB);
    } finally {
      applyingRemote = false;
    }
    try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}
    try { if (typeof sharedDeviceRefreshUsers === 'function') sharedDeviceRefreshUsers(false); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('zezms-shared-device-directory-updated')); } catch (_) {}
    try { if (typeof render === 'function') render(); } catch (_) {}
  }

  async function downloadCloudMaster() {
    requireClient();
    const confirmed = confirm(
      'Replace this device’s business data with the M4 cloud master and then apply all later transactions?\n\n'
      + 'Use this on every additional device before recording transactions.'
    );
    if (!confirmed) return false;
    const master = await fetchMaster();
    if (!master || !master.payload) throw new Error('No cloud master exists. Activate M4 on the main device first.');
    if (master.sync_mode !== 'operations') throw new Error('The cloud account has not been upgraded with SUPABASE_UPGRADE_M4.sql and M4 activation.');

    queue = [];
    persistQueue();
    persistMasterDatabase(master.payload);
    setState({
      initialized: true,
      cursor: Number(master.operation_cursor) || 0,
      status: 'syncing',
      lastPullAt: new Date().toISOString(),
      lastError: ''
    }, false);
    await pullNow(true);
    notify('Cloud master and transaction history downloaded.');
    return true;
  }

  function isStockConflict(error) {
    const text = String((error && (error.message || error.details || error.hint)) || error || '');
    return text.indexOf('ZEZMS_STOCK_CONFLICT') >= 0
      || text.indexOf('ZEZMS_CASH_CONFLICT') >= 0
      || text.indexOf('ZEZMS_COUNTER_MISSING') >= 0
      || text.indexOf('ZEZMS_ID_CONFLICT') >= 0;
  }

  async function pushOne(operation) {
    const response = await client.rpc('zezms_ops_push', { p_operations: [operation] });
    if (response.error) throw response.error;
    const rows = Array.isArray(response.data) ? response.data : [response.data];
    return rows[0] || null;
  }

  async function publishRoot(root, value, kind) {
    const rootName = String(root || '').trim();
    if (!rootName) throw new Error('A cloud root name is required.');

    await waitUntilReady(7000);
    if (!state.initialized) {
      throw new Error('Activate or download the M4 cloud master first.');
    }

    state.deviceSeq = (Number(state.deviceSeq) || 0) + 1;
    persistState();

    const database = getDatabase();
    const operation = {
      opId: makeUUID(),
      deviceId: state.deviceId,
      deviceSeq: state.deviceSeq,
      createdAt: new Date().toISOString(),
      reason: 'publish-' + rootName,
      kind: String(kind || 'ROOT_PUBLISH'),
      appVersion: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
      patches: [{
        action: 'root-set',
        root: rootName,
        value: clone(value),
        before: clone(database ? database[rootName] : undefined)
      }]
    };

    queueOperation(operation);
    if (navigator.onLine && session && configured()) {
      await flushQueue(false);
    }
    return true;
  }

  async function publishMonthRollover(marker, options) {
    if (!marker || !marker.id) return false;
    const rolloverId = String(marker.id);
    const announced = Array.isArray(state.announcedRollovers) ? state.announcedRollovers : [];
    if (announced.indexOf(rolloverId) >= 0) return true;

    await waitUntilReady(7000);
    if (!state.initialized) return false;

    const operation = buildRolloverRepairOperation(marker);
    if (!operation) return false;
    if (!queue.some(function (item) { return item && item.opId === operation.opId; })) {
      queueOperation(operation);
    }

    if (navigator.onLine && session && configured()) {
      await flushQueue(false);
    }
    return true;
  }

  async function rolloverAcceptedByAnotherDevice(operation) {
    if (!operation || operation.kind !== 'MONTH_ROLLOVER' || !operation.opId) return false;
    const response = await client
      .from(OPERATIONS_TABLE)
      .select('device_id')
      .eq('owner_id', currentSyncOwnerId())
      .eq('op_id', operation.opId)
      .maybeSingle();
    if (response.error) throw response.error;
    return !!(response.data && response.data.device_id && response.data.device_id !== state.deviceId);
  }

  async function flushQueue(showNotice) {
    if (pushInFlight) return false;
    requireClient();
    if (!state.initialized) throw new Error('Activate or download the M4 cloud master first.');
    if (!navigator.onLine) {
      setState({ status: 'pending-offline' });
      return false;
    }
    if (!queue.length) {
      setState({ status: state.liveSyncEnabled ? 'live' : 'ready', lastError: '' });
      if (showNotice) notify('There are no unsent transactions.');
      return true;
    }

    pushInFlight = true;
    setState({ status: 'syncing', lastError: '' });
    try {
      while (queue.length) {
        const operation = queue[0];
        try {
          const result = await pushOne(operation);
          const pushedRolloverId = rolloverIdFromOperation(operation) || operation.repairRolloverId;
          if (pushedRolloverId) markRolloverAnnounced(pushedRolloverId);
          const rolloverOwnedElsewhere = await rolloverAcceptedByAnotherDevice(operation);
          if (rolloverOwnedElsewhere) {
            // Another device completed the same deterministic monthly rollover first.
            // Remove this device's duplicate local rollover, then download and apply
            // the accepted cloud version so account/KPI snapshots have one authority.
            applyInverseOperation(operation);
            queue.shift();
            persistQueue();
            await pullNow(true);
            setState({
              lastPushAt: (result && result.created_at) || new Date().toISOString(),
              status: state.liveSyncEnabled ? 'live' : 'ready',
              lastError: ''
            }, false);
            continue;
          }
          if (result && result.server_seq) state.cursor = Math.max(Number(state.cursor) || 0, Number(result.server_seq) || 0);
          queue.shift();
          persistQueue();
          setState({
            lastPushAt: (result && result.created_at) || new Date().toISOString(),
            lastRemoteAt: (result && result.created_at) || new Date().toISOString(),
            status: state.liveSyncEnabled ? 'live' : 'ready',
            lastError: ''
          }, false);
        } catch (error) {
          if (isStockConflict(error)) {
            const message = (error && (error.message || error.details)) || 'The cloud rejected this transaction because another device used the same available balance first.';
            rollbackRejectedOperation(operation, message);
            queue.shift();
            persistQueue();
            setState({ status: 'rejected', lastError: message }, false);
            notify('Transaction rolled back: cloud stock or cash was already used by another device.', 'err');
            await pullNow(true).catch(function () {});
            continue;
          }
          throw error;
        }
      }
      setState({ status: state.liveSyncEnabled ? 'live' : 'ready', lastError: '' });
      if (showNotice) notify('All queued transactions uploaded.');
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      pushInFlight = false;
    }
  }

  async function fetchOperationsAfter(cursor) {
    const response = await client
      .from(OPERATIONS_TABLE)
      .select('seq,op_id,device_id,device_seq,kind,payload,client_created_at,created_at')
      .eq('owner_id', currentSyncOwnerId())
      .gt('seq', Number(cursor) || 0)
      .order('seq', { ascending: true })
      .limit(PULL_PAGE_SIZE);
    if (response.error) throw response.error;
    return response.data || [];
  }

  function applyInverseOperation(operation) {
    const inverse = clone(operation);
    inverse.opId = 'REBASE-' + operation.opId;
    inverse.kind = 'LOCAL_REBASE_ROLLBACK';
    inverse.patches = operation.patches.slice().reverse().map(inversePatch).filter(Boolean);
    applyOperation(inverse, { silent: true });
  }

  async function pullNow(silent) {
    if (pullInFlight) return false;
    requireClient();
    if (!state.initialized) throw new Error('Download or activate the M4 cloud master first.');
    if (!navigator.onLine) throw new Error('Internet connection is required to receive cloud transactions.');

    pullInFlight = true;
    setState({ status: 'syncing', lastError: '' });
    let applied = 0;
    try {
      const rowsToApply = [];
      let fetchCursor = Number(state.cursor) || 0;
      while (true) {
        const rows = await fetchOperationsAfter(fetchCursor);
        if (!rows.length) break;
        rowsToApply.push.apply(rowsToApply, rows);
        fetchCursor = Math.max(fetchCursor, Number(rows[rows.length - 1].seq) || fetchCursor);
        if (rows.length < PULL_PAGE_SIZE) break;
      }

      if (rowsToApply.length) {
        const originalQueue = queue.slice();
        const queuedIds = new Set(originalQueue.map(function (op) { return op.opId; }));
        const acceptedOwnIds = new Set(rowsToApply
          .filter(function (row) { return row.device_id === state.deviceId && queuedIds.has(row.op_id); })
          .map(function (row) { return row.op_id; }));

        // Temporarily remove unsent local operations, apply cloud operations in
        // authoritative server order, then reapply the still-unsent operations.
        // This preserves last-writer order for non-numeric fields while numeric
        // stock/account/cash deltas continue to merge additively.
        originalQueue.slice().reverse().forEach(applyInverseOperation);
        queue = originalQueue.filter(function (op) { return !acceptedOwnIds.has(op.opId); });
        persistQueue();

        rowsToApply.forEach(function (row) {
          const operation = row.payload || {};
          operation.opId = operation.opId || row.op_id;
          operation.deviceId = operation.deviceId || row.device_id;
          operation.kind = operation.kind || row.kind;
          const ownAcceptedFromQueue = acceptedOwnIds.has(row.op_id);
          if (row.device_id !== state.deviceId || ownAcceptedFromQueue) {
            applyOperation(operation, { silent: true });
            applied += row.device_id !== state.deviceId ? 1 : 0;
          }
          state.cursor = Math.max(Number(state.cursor) || 0, Number(row.seq) || 0);
          state.lastRemoteAt = row.created_at || state.lastRemoteAt;
        });

        queue.forEach(function (operation) { applyOperation(operation, { silent: true }); });
        persistQueue();
        persistState();
      }

      setState({
        lastPullAt: new Date().toISOString(),
        status: state.liveSyncEnabled ? 'live' : 'ready',
        lastError: ''
      });
      if (!silent) notify(applied ? applied + ' cloud transaction(s) merged.' : 'This device is already up to date.');
      if (applied) {
        try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}
        try { if (typeof render === 'function') render(); } catch (_) {}
      }
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      pullInFlight = false;
    }
  }

  function queueOperation(operation) {
    if (!operation) return;
    queue.push(operation);
    persistQueue();
    setState({ status: navigator.onLine ? 'queued' : 'pending-offline' }, false);
    if (!state.liveSyncEnabled || !session || !configured() || !state.initialized) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      flushQueue(false).catch(handleError);
    }, PUSH_DEBOUNCE_MS);
  }

  function onLocalSave(reason) {
    if (applyingRemote) return;
    const database = getDatabase();
    if (!database) return;
    const idChanged = ensureSyncIds(database);
    if (idChanged) rawSaveDatabase();
    const current = cleanSnapshot(database);
    if (!observedSnapshot) {
      observedSnapshot = current;
      return;
    }
    const operation = buildOperation(observedSnapshot, current, reason || 'database-save');
    observedSnapshot = current;
    if (operation) queueOperation(operation);
  }

  function stopRealtime() {
    if (channel && client) {
      try { client.removeChannel(channel); } catch (_) {}
    }
    channel = null;
  }

  function subscribeRealtime() {
    requireClient();
    stopRealtime();
    channel = client
      .channel('zezms-m4-' + currentSyncOwnerId() + '-' + state.deviceId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: OPERATIONS_TABLE,
        filter: 'owner_id=eq.' + currentSyncOwnerId()
      }, function (event) {
        const row = event && event.new ? event.new : null;
        if (!row || Number(row.seq) <= (Number(state.cursor) || 0)) return;
        pullNow(true).catch(handleError);
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') setState({ status: 'live', lastError: '' });
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState({ status: 'error', lastError: 'Realtime connection failed: ' + status });
        }
      });
  }

  async function startLiveSync(showNotice) {
    requireClient();
    if (!state.initialized) {
      setState({ status: 'upgrade-required' });
      throw new Error('Activate M4 on the main device or download the M4 cloud master first.');
    }
    setState({ liveSyncEnabled: true, status: 'connecting', lastError: '' });
    subscribeRealtime();
    await pullNow(true);
    if (queue.length) await flushQueue(false);
    setState({ status: 'live' });
    if (showNotice !== false) notify('Transaction-level live sync enabled.');
    return true;
  }

  function stopLiveSync() {
    stopRealtime();
    setState({ liveSyncEnabled: false, status: session ? 'disabled' : 'signed-out' });
    notify('Live transaction sync paused on this device.');
  }

  async function saveConfiguration() {
    const urlField = document.getElementById('m4SupabaseUrl');
    const keyField = document.getElementById('m4SupabaseKey');
    const nameField = document.getElementById('m4DeviceName');
    const nextUrl = urlField ? urlField.value.trim().replace(/\/$/, '') : state.supabaseUrl;
    const nextKey = keyField ? keyField.value.trim() : state.publishableKey;
    const projectChanged = nextUrl !== state.supabaseUrl || nextKey !== state.publishableKey;
    setState({
      supabaseUrl: nextUrl,
      publishableKey: nextKey,
      deviceName: nameField && nameField.value.trim() ? nameField.value.trim() : state.deviceName,
      liveSyncEnabled: projectChanged ? false : state.liveSyncEnabled,
      initialized: projectChanged ? false : state.initialized,
      cursor: projectChanged ? 0 : state.cursor,
      lastError: ''
    }, false);
    await buildClient();
    notify('Cloud Sync M4 configuration saved.');
    safeRender();
    return true;
  }

  function credentialsFromUI() {
    const email = document.getElementById('m4CloudEmail');
    const password = document.getElementById('m4CloudPassword');
    return { email: email ? email.value.trim() : '', password: password ? password.value : '' };
  }

  async function signUp() {
    if (!client) await buildClient();
    if (!client) throw new Error('Save valid Supabase settings first.');
    const credentials = credentialsFromUI();
    if (!credentials.email || credentials.password.length < 8) throw new Error('Enter a valid email and a password of at least 8 characters.');
    const result = await client.auth.signUp(credentials);
    if (result.error) throw result.error;
    notify(result.data && result.data.session ? 'Cloud account created and signed in.' : 'Cloud account created. Confirm the email, then sign in.');
  }

  function verifiedCloudTotpFactors(data) {
    const list = data && data.totp ? data.totp : [];
    return (Array.isArray(list) ? list : []).filter(function (factor) {
      return factor && (!factor.status || factor.status === 'verified');
    });
  }

  async function ensureCloudMfa() {
    if (!client || !session) return true;

    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    const level = assurance.data || {};

    if (level.currentLevel === 'aal2' || level.nextLevel !== 'aal2') return true;

    const factorResult = await client.auth.mfa.listFactors();
    if (factorResult.error) throw factorResult.error;
    const available = verifiedCloudTotpFactors(factorResult.data || {});
    if (!available.length) return true;

    if (cloudMfaPromptPromise) return cloudMfaPromptPromise;

    cloudMfaPromptPromise = new Promise(function (resolve) {
      openModal(
        '<h3>Cloud account authenticator verification</h3>'
        + '<p class="muted">Enter the current code from the authenticator app to complete this device&#39;s M4 cloud session.</p>'
        + '<div class="field"><label>Authenticator code</label>'
        + '<input id="m4MfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></div>'
        + '<div class="row"><button class="btn" id="m4MfaVerifyBtn">Verify</button>'
        + '<button class="btn ghost" id="m4MfaCancelBtn">Cancel</button></div>'
      );

      document.getElementById('m4MfaCancelBtn').onclick = function () {
        closeModal();
        cloudMfaPromptPromise = null;
        resolve(false);
      };

      document.getElementById('m4MfaVerifyBtn').onclick = async function () {
        const code = String((document.getElementById('m4MfaCode') || {}).value || '').trim();
        const button = document.getElementById('m4MfaVerifyBtn');

        if (!/^\d{6,8}$/.test(code)) {
          notify('Enter the current authenticator code.', 'err');
          return;
        }

        if (button) button.disabled = true;

        try {
          const verified = await client.auth.mfa.challengeAndVerify({
            factorId: available[0].id,
            code: code
          });
          if (verified.error) throw verified.error;

          if (verified.data && verified.data.session) {
            session = verified.data.session;
          } else {
            const current = await client.auth.getSession();
            if (!current.error && current.data) {
              session = current.data.session || session;
            }
          }

          closeModal();
          cloudMfaPromptPromise = null;
          resolve(true);
        } catch (error) {
          if (button) button.disabled = false;
          handleError(error);
        }
      };
    });

    return cloudMfaPromptPromise;
  }

  async function signIn() {
    if (!client) await buildClient();
    if (!client) throw new Error('Save valid Supabase settings first.');
    const credentials = credentialsFromUI();
    if (!credentials.email || !credentials.password) throw new Error('Enter the cloud email and password.');
    const result = await client.auth.signInWithPassword(credentials);
    if (result.error) throw result.error;
    session = result.data.session;

    const mfaOk = await ensureCloudMfa();
    if (!mfaOk) {
      setState({
        status: 'signed-out',
        lastError: 'Cloud MFA verification was cancelled.'
      });
      return;
    }

    const master = await fetchMaster().catch(function () { return null; });
    const m4Ready = !!(master && master.sync_mode === 'operations');
    setState({
      signedInEmail: session && session.user ? session.user.email || '' : '',
      initialized: m4Ready && state.initialized,
      status: m4Ready ? (state.initialized ? 'ready' : 'master-available') : 'upgrade-required',
      lastError: ''
    });
    notify('Signed in to the ZEZMS cloud account.');
  }

  async function signOut() {
    if (state.deviceAccessMode === 'PAIRED') {
      throw new Error('This is a paired device identity. Revoke the device from an OWNER device instead of signing it out locally.');
    }
    stopRealtime();
    if (client) {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
    }
    session = null;
    setState({ signedInEmail: '', liveSyncEnabled: false, status: 'signed-out' });
    notify('Signed out of cloud sync on this device.');
  }


  function normalizeEnrollmentText(value) {
    return String(value == null ? '' : value).trim();
  }

  async function enrollPairedDevice(options) {
    const values = options || {};
    const url = normalizeEnrollmentText(values.supabaseUrl).replace(/\/$/, '');
    const key = normalizeEnrollmentText(values.publishableKey);
    const code = normalizeEnrollmentText(values.pairingCode);
    const name = normalizeEnrollmentText(values.deviceName) || 'New ZEZMS Device';

    if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
      throw new Error('Enter the Supabase project URL included in the pairing setup.');
    }
    if (!key) throw new Error('Enter the Supabase publishable key included in the pairing setup.');
    if (!code) throw new Error('Enter the one-time device pairing code.');

    stopRealtime();
    setState({
      supabaseUrl: url,
      publishableKey: key,
      deviceName: name,
      deviceAccessMode: 'PAIRING',
      deviceAccessStatus: 'PAIRING',
      syncOwnerId: '',
      businessId: '',
      branchId: '',
      initialized: false,
      cursor: 0,
      liveSyncEnabled: false,
      status: 'connecting',
      lastError: ''
    }, false);

    await buildClient();
    if (!client) throw new Error('The Supabase client could not be created.');

    if (session && session.user && !isAnonymousSession(session)) {
      throw new Error('This browser already contains a permanent cloud login. Use a fresh browser profile for new-device pairing.');
    }

    if (!session || !session.user) {
      const anonymous = await client.auth.signInAnonymously({
        options: {
          data: {
            purpose: 'zezms_device_pairing',
            device_id: state.deviceId,
            device_name: name
          }
        }
      });
      if (anonymous.error) {
        const message = String(anonymous.error.message || anonymous.error);
        if (/anonymous.*disabled|signups.*disabled|provider.*disabled/i.test(message)) {
          throw new Error('Anonymous Sign-Ins are disabled in Supabase. Enable Authentication → Providers → Anonymous Sign-Ins, then retry.');
        }
        throw anonymous.error;
      }
      session = anonymous.data && anonymous.data.session ? anonymous.data.session : null;
    }

    if (!session || !session.user || !isAnonymousSession(session)) {
      throw new Error('Supabase did not create the required anonymous device identity.');
    }

    const claim = await client.rpc('zezms_m5a3_claim_device_pairing', {
      p_pairing_code: code,
      p_device_id: state.deviceId,
      p_device_name: name,
      p_platform: String(navigator.userAgent || '').slice(0, 240),
      p_app_version: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '3.7.0'
    });
    if (claim.error) throw claim.error;
    const context = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (!context || !context.owner_id) throw new Error('The pairing claim did not return an owner sync context.');

    setState({
      syncOwnerId: String(context.owner_id),
      businessId: String(context.business_id || ''),
      branchId: String(context.branch_id || ''),
      pairingId: String(context.pairing_id || ''),
      deviceAccessMode: 'PAIRED',
      deviceAccessStatus: String(context.device_status || 'ACTIVE'),
      signedInEmail: 'Paired device',
      status: 'master-available',
      lastError: ''
    }, false);

    await validatePairedAccess();
    const master = await fetchMaster();
    if (!master || !master.payload) {
      throw new Error('The OWNER has not activated an M4 cloud master yet.');
    }
    if (master.sync_mode !== 'operations') {
      throw new Error('The cloud account is not operating in M4 transaction-merge mode.');
    }

    queue = [];
    persistQueue();
    persistMasterDatabase(master.payload);
    setState({
      initialized: true,
      cursor: Number(master.operation_cursor) || 0,
      status: 'syncing',
      lastPullAt: new Date().toISOString(),
      lastError: ''
    }, false);

    await pullNow(true);
    setState({ liveSyncEnabled: true, status: 'connecting' }, false);
    await startLiveSync(false);

    try {
      localStorage.setItem('zezms_commercial_m5a1_state', JSON.stringify({
        version: 1,
        build: BUILD,
        status: 'ready',
        businessId: String(context.business_id || ''),
        context: {
          business_id: String(context.business_id || ''),
          trading_name: String(context.trading_name || ''),
          legal_name: '',
          business_status: 'ACTIVE',
          member_role: 'PAIRED_DEVICE',
          member_status: 'ACTIVE',
          branch_id: String(context.branch_id || ''),
          branch_name: String(context.branch_name || ''),
          branch_code: String(context.branch_code || ''),
          device_status: 'ACTIVE'
        },
        lastCheckedAt: new Date().toISOString(),
        lastError: ''
      }));
    } catch (_) {}

    try { window.dispatchEvent(new CustomEvent('zezms-device-enrollment-complete', { detail: context })); } catch (_) {}
    return context;
  }

  async function repairPairedDeviceSession() {
    if (state.deviceAccessMode !== 'PAIRED') return false;
    await buildClient();
    await validatePairedAccess();
    if (!state.initialized) {
      const master = await fetchMaster();
      if (!master || !master.payload) throw new Error('No M4 cloud master is available.');
      persistMasterDatabase(master.payload);
      setState({ initialized: true, cursor: Number(master.operation_cursor) || 0 }, false);
    }
    await startLiveSync(false);
    return true;
  }

  function statusLabel() {
    const labels = {
      'not-configured': 'Not configured',
      'library-unavailable': 'Sync library unavailable',
      'signed-out': 'Cloud account not signed in',
      'upgrade-required': 'M4 activation required',
      'master-available': 'M4 cloud master available — download it',
      'connecting': 'Connecting…',
      'ready': 'Ready',
      'queued': 'Transaction queued for upload',
      'live': 'Live transaction merging connected',
      'syncing': 'Synchronising transactions…',
      'pending-offline': 'Offline — transaction queued',
      'rejected': 'Transaction rejected and rolled back',
      'error': 'Sync error',
      'disabled': 'Live sync paused'
    };
    return labels[state.status] || state.status || 'Unknown';
  }

  function handleError(error) {
    const message = (error && (error.message || error.details || error.hint)) || String(error || 'Unknown cloud sync error');
    console.error('ZEZMS Cloud Sync M4', error);
    setState({ status: 'error', lastError: message });
    notify('Cloud sync error: ' + message, 'err');
  }

  async function initCore() {
    state = loadState();
    queue = loadJSON(QUEUE_KEY, []);
    rejected = loadJSON(REJECTED_KEY, []);
    const database = getDatabase();
    if (database) {
      if (ensureSyncIds(database)) rawSaveDatabase();
      observedSnapshot = cleanSnapshot(database);
    }
    if (!configured()) {
      setState({ status: 'not-configured' }, false);
      return false;
    }
    try {
      await buildClient();
      if (session) {
        if (state.deviceAccessMode === 'PAIRED') {
          await validatePairedAccess();
        } else if (!state.syncOwnerId && session.user) {
          setState({ syncOwnerId: String(session.user.id || ''), deviceAccessMode: 'OWNER' }, false);
        }
        const master = await fetchMaster().catch(function () { return null; });
        if (master && master.sync_mode === 'operations' && !state.initialized) {
          setState({ status: 'master-available' }, false);
        }
        if (state.liveSyncEnabled && state.initialized) await startLiveSync(false);
      }
      safeRender();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  function dispatchCloudReady() {
    try { window.dispatchEvent(new CustomEvent('zezms-cloud-ready')); } catch (_) {}
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = Promise.resolve().then(initCore).then(function (result) {
      initSettled = true;
      dispatchCloudReady();
      return result;
    }, function (error) {
      initSettled = true;
      dispatchCloudReady();
      throw error;
    });
    return initPromise;
  }

  function waitUntilReady(timeoutMs) {
    if (!initPromise) init();
    const wait = initPromise.catch(function () { return false; });
    const timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(false); }, Math.max(250, Number(timeoutMs) || 5000));
    });
    return Promise.race([wait, timeout]);
  }

  function isReadyForLocalOperations() {
    return !!observedSnapshot && initSettled;
  }

  function recentQueueHtml() {
    if (!queue.length) return '<p class="muted" style="font-size:11px">No queued transactions.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Changes</th></tr></thead><tbody>'
      + queue.slice().reverse().slice(0, 10).map(function (op) {
        return '<tr><td style="font-size:11px">' + esc(whenText(op.createdAt)) + '</td><td>' + esc(op.kind) + '</td><td>' + esc(op.patches.length) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function warningHtml() {
    const last = state.lastRejected;
    if (!last) return '';
    return '<div style="margin-top:10px;padding:10px;border:1px solid rgba(239,68,68,.55);border-radius:10px;background:rgba(239,68,68,.08)">'
      + '<b>Most recent rejected transaction</b><p class="muted" style="font-size:12px;margin:6px 0">'
      + esc(whenText(last.at)) + ' · ' + esc(last.kind) + '<br>' + esc(last.reason) + '</p></div>';
  }

  function syncCardHtml() {
    return '<div class="card">'
      + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Transaction-Level Cloud Sync</h3><span class="badge ok">M4 ACTIVE</span></div>'
      + '<p class="muted" style="font-size:13px">Each saved transaction is uploaded as an idempotent operation. Transactions from different devices are merged instead of replacing the complete database.</p>'
      + '<div class="statline"><span>Status</span><b>' + esc(statusLabel()) + '</b></div>'
      + '<div class="statline"><span>Cloud account</span><b>' + esc(state.signedInEmail || (state.deviceAccessMode === 'PAIRED' ? 'Paired device' : 'Not signed in')) + '</b></div>'
      + '<div class="statline"><span>Device</span><b>' + esc(state.deviceName) + '</b></div>'
      + '<div class="statline"><span>Last cloud operation</span><b class="mono">' + esc(state.cursor || 0) + '</b></div>'
      + '<div class="statline"><span>Queued transactions</span><b>' + esc(queue.length) + '</b></div>'
      + '<div class="statline"><span>Last upload</span><b>' + esc(whenText(state.lastPushAt)) + '</b></div>'
      + '<div class="statline"><span>Last download</span><b>' + esc(whenText(state.lastPullAt)) + '</b></div>'
      + (state.lastError ? '<p style="font-size:12px;color:#fca5a5">' + esc(state.lastError) + '</p>' : '')
      + '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">'
      + (state.liveSyncEnabled
        ? '<button class="btn ghost" onclick="m4StopLiveSync()">Pause live sync</button>'
        : '<button class="btn" onclick="m4StartLiveSync()">Enable live sync</button>')
      + '<button class="btn ghost" onclick="m4PushNow()">Upload queued transactions</button>'
      + '<button class="btn ghost" onclick="m4PullNow()">Receive transactions now</button>'
      + '<button class="btn ghost" onclick="nav(\'settings\')">Cloud settings</button>'
      + '</div>' + warningHtml()
      + '<hr class="hr"><h3>Local operation queue</h3>' + recentQueueHtml()
      + '</div>';
  }

  function settingsHtml() {
    if (state.deviceAccessMode === 'PAIRED') {
      return '<div class="card" style="margin-top:12px">'
        + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Cloud Sync M4</h3><span class="badge ok">PAIRED DEVICE</span></div>'
        + '<p class="muted" style="font-size:12px">This device has its own anonymous Supabase identity and does not store the OWNER cloud password.</p>'
        + '<div class="statline"><span>Status</span><b>' + esc(statusLabel()) + '</b></div>'
        + '<div class="statline"><span>Device</span><b>' + esc(state.deviceName) + '</b></div>'
        + '<div class="statline"><span>Device ID</span><b class="mono" style="font-size:10px">' + esc(state.deviceId) + '</b></div>'
        + '<div class="statline"><span>Tenant</span><b class="mono" style="font-size:10px">' + esc(state.businessId || '—') + '</b></div>'
        + '<div class="statline"><span>Branch</span><b class="mono" style="font-size:10px">' + esc(state.branchId || '—') + '</b></div>'
        + '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">'
        + '<button class="btn ghost" onclick="m4PullNow()">Receive transactions now</button>'
        + '<button class="btn ghost" onclick="m4StartLiveSync()">Reconnect live sync</button>'
        + '</div>'
        + '<p class="muted" style="font-size:11px;margin-top:10px">To remove this device, use Revoke on an OWNER-authenticated device.</p>'
        + '</div>';
    }
    return '<div class="card" style="margin-top:12px">'
      + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Cloud Sync M4</h3><span class="badge ok">TRANSACTION MERGE</span></div>'
      + '<p class="muted" style="font-size:12px">Run <code>SUPABASE_UPGRADE_M4.sql</code> once in the same Supabase project. Upgrade every device before recording new transactions.</p>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Supabase project URL</label><input id="m4SupabaseUrl" value="' + esc(state.supabaseUrl) + '" placeholder="https://your-project.supabase.co"></div>'
      + '<div class="field"><label>Supabase publishable key</label><input id="m4SupabaseKey" type="password" value="' + esc(state.publishableKey) + '" placeholder="sb_publishable_..."></div>'
      + '<div class="field"><label>This device name</label><input id="m4DeviceName" value="' + esc(state.deviceName) + '" placeholder="Main till / Office laptop"></div>'
      + '<div class="field"><label>Merge status</label><input value="' + esc(state.initialized ? 'Initialized' : 'Not initialized') + '" disabled></div>'
      + '</div>'
      + '<button class="btn" onclick="m4SaveConfiguration()">Save cloud configuration</button>'
      + '<hr class="hr"><h3>ZEZMS cloud account</h3>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Email</label><input id="m4CloudEmail" type="email" value="' + esc(state.signedInEmail) + '" autocomplete="username"></div>'
      + '<div class="field"><label>Cloud password</label><input id="m4CloudPassword" type="password" autocomplete="current-password" placeholder="At least 8 characters"></div>'
      + '</div>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn" onclick="m4CreateCloudAccount()">Create cloud account</button>'
      + '<button class="btn ghost" onclick="m4SignIn()">Sign in</button>'
      + '<button class="btn ghost" onclick="m4SignOut()">Sign out</button></div>'
      + '<hr class="hr"><h3>M4 initialization</h3>'
      + '<p class="muted" style="font-size:11px"><b>Main device:</b> activate from the device containing the complete correct records. <b>Other devices:</b> download the M4 cloud master before entering any transaction.</p>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn warn" onclick="m4BootstrapThisDevice()">Activate M4 from this device</button>'
      + '<button class="btn ghost" onclick="m4DownloadCloudMaster()">Download M4 cloud master</button></div>'
      + '<hr class="hr">'
      + '<div class="statline"><span>Status</span><b>' + esc(statusLabel()) + '</b></div>'
      + '<div class="statline"><span>Live sync</span><b>' + (state.liveSyncEnabled ? 'Enabled' : 'Disabled') + '</b></div>'
      + '<div class="statline"><span>Device ID</span><b class="mono" style="font-size:10px">' + esc(state.deviceId) + '</b></div>'
      + '<div class="statline"><span>Queued operations</span><b>' + esc(queue.length) + '</b></div>'
      + warningHtml() + '</div>';
  }

  window.m4SaveConfiguration = function () { saveConfiguration().catch(handleError); };
  window.m4CreateCloudAccount = function () { signUp().catch(handleError); };
  window.m4SignIn = function () { signIn().catch(handleError); };
  window.m4SignOut = function () { signOut().catch(handleError); };
  window.m4BootstrapThisDevice = function () { bootstrapFromThisDevice().catch(handleError); };
  window.m4DownloadCloudMaster = function () { downloadCloudMaster().catch(handleError); };
  window.m4StartLiveSync = function () { startLiveSync(true).catch(handleError); };
  window.m4StopLiveSync = stopLiveSync;
  window.m4PushNow = function () { flushQueue(true).catch(handleError); };
  window.m4PullNow = function () { pullNow(false).catch(handleError); };

  window.addEventListener('online', function () {
    if (state.liveSyncEnabled && session && state.initialized) {
      startLiveSync(false).catch(handleError);
    }
  });
  window.addEventListener('offline', function () {
    if (state.liveSyncEnabled) setState({ status: queue.length ? 'pending-offline' : 'ready' });
  });

  ZEZMS.cloudSync = {
    version: 4,
    build: BUILD,
    init: init,
    waitUntilReady: waitUntilReady,
    isReadyForLocalOperations: isReadyForLocalOperations,
    publishMonthRollover: publishMonthRollover,
    publishRoot: publishRoot,
    onLocalSave: onLocalSave,
    isApplyingRemote: function () { return applyingRemote; },
    getState: function () { return Object.assign({}, state, { queueLength: queue.length }); },
    getClient: function () { return client; },
    getSession: function () { return session; },
    ensureMfa: ensureCloudMfa,
    syncCardHtml: syncCardHtml,
    settingsHtml: settingsHtml,
    pushNow: flushQueue,
    pullNow: pullNow,
    start: startLiveSync,
    stop: stopLiveSync,
    enrollPairedDevice: enrollPairedDevice,
    validatePairedAccess: validatePairedAccess,
    repairPairedDeviceSession: repairPairedDeviceSession,
    currentSyncOwnerId: currentSyncOwnerId,
    _test: {
      buildOperation: buildOperation,
      applyOperation: applyOperation,
      inversePatch: inversePatch,
      ensureSyncIds: ensureSyncIds,
      cleanSnapshot: cleanSnapshot,
      buildRolloverRepairOperation: buildRolloverRepairOperation,
      rolloverIdFromOperation: rolloverIdFromOperation
    }
  };
}());

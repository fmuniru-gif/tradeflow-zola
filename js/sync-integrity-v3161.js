(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  var VERSION = '3.16.1';
  var BUILD = '20260823-sync-integrity-r52';
  var SNAPSHOT_FORMAT = 'ZEZMS-INTEGRITY-SNAPSHOT/1';
  var IMPORT_KEY = 'zezms_integrity_imports_v3161';
  var BACKUP_KEY = 'zezms_integrity_backup_at_v3161';
  var COLLECTIONS = [
    'sales', 'receipts', 'inventoryTxns', 'stockRows', 'purchaseOrders', 'cashLog', 'expenses',
    'debtors', 'creditors', 'depositors', 'accountTxns', 'products', 'stockCorrections',
    'customers', 'customerFollowups', 'quotations', 'salesOpportunities', 'warranties',
    'warrantyClaims', 'invoices', 'waybills', 'undoLog', 'saleLines', 'monthRollovers'
  ];
  var LABELS = {
    sales:'Sales', receipts:'Receipts', inventoryTxns:'Inventory Txns', stockRows:'Stock In / FIFO Rows',
    purchaseOrders:'Purchase Orders', cashLog:'Cash', expenses:'Expenses', debtors:'Debtors',
    creditors:'Creditors', depositors:'Depositors', accountTxns:'Account Transactions', products:'Products',
    stockCorrections:'Stock Corrections', customers:'Customers', customerFollowups:'Follow-ups',
    quotations:'Quotations', salesOpportunities:'Opportunities', warranties:'Warranties',
    warrantyClaims:'Claims', invoices:'Invoices', waybills:'Waybills', undoLog:'Undo / Reversal Records',
    saleLines:'Sale Lines', monthRollovers:'Month Rollovers'
  };
  var REVERSED = new Set(['VOID', 'UNDONE', 'REVERSED', 'CANCELLED', 'CANCELED', 'REJECTED']);
  var state = {
    localAudit:null, cloudReport:null, cloudBundle:null, cloudDatabase:null, reconciliation:null,
    imports:loadImports(), crossDevice:null, busy:'', message:'', messageType:'ok'
  };

  function db() { try { return typeof DB !== 'undefined' ? DB : null; } catch (_) { return null; } }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ' '); }
  function number(value) { return Number(value) || 0; }
  function money(value) { return 'GH₵ ' + number(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function round(value) { return Math.round((number(value) + Number.EPSILON) * 100) / 100; }
  function statusOf(record) { return String(record && record.status || 'ACTIVE').trim().toUpperCase(); }
  function isReversed(record) { return !!(record && (record.voided === true || REVERSED.has(statusOf(record)))); }
  function entityKey(item) {
    if (!item || typeof item !== 'object') return '';
    return String(item.id || item.followupId || item.opportunityId || item.quotationId || item.correctionId
      || item.warrantyId || item.claimId || item.customerId || item.receiptNo || item._syncId || '');
  }
  function recordDate(item) {
    var raw = item && (item.date || item.createdAt || item.at || item.updatedAt || item.completedAt || item.committedAt);
    var value = Date.parse(raw || '');
    return Number.isFinite(value) ? new Date(value).toISOString() : '';
  }
  function canonicalize(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    var result = {};
    Object.keys(value).sort().forEach(function (key) {
      if (!/password|secret|token|publishableKey|adminPIN|pricePIN/i.test(key)) result[key] = canonicalize(value[key]);
    });
    return result;
  }
  function stableText(value) { return JSON.stringify(canonicalize(value)); }
  function fingerprint(value) {
    var text = stableText(value);
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8).toUpperCase();
  }
  async function sha256(value) {
    var text = typeof value === 'string' ? value : stableText(value);
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return 'FNV1A-' + fingerprint(text);
    var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes)).map(function (item) { return item.toString(16).padStart(2, '0'); }).join('');
  }
  function sortedRecords(database, collection) {
    return (Array.isArray(database && database[collection]) ? database[collection] : []).slice().sort(function (left, right) {
      return entityKey(left).localeCompare(entityKey(right)) || stableText(left).localeCompare(stableText(right));
    });
  }
  function summarizeCollection(database, collection) {
    var records = sortedRecords(database, collection);
    var dates = records.map(recordDate).filter(Boolean).sort();
    var reversed = records.filter(isReversed).length;
    var keys = new Map();
    records.forEach(function (item) {
      var key = entityKey(item);
      if (key) keys.set(key, (keys.get(key) || 0) + 1);
    });
    return {
      collection:collection, label:LABELS[collection] || collection, count:records.length,
      active:records.length - reversed, reversed:reversed, earliest:dates[0] || '', latest:dates[dates.length - 1] || '',
      fingerprint:fingerprint(records), duplicateIds:Array.from(keys.entries()).filter(function (entry) { return entry[1] > 1; }).map(function (entry) { return entry[0]; })
    };
  }
  function saleCost(sale) {
    return round((sale.lines || []).reduce(function (total, line) {
      return total + (line.fifo || []).reduce(function (sum, allocation) {
        return sum + number(allocation.qty) * number(allocation.uCost);
      }, 0);
    }, 0));
  }
  function saleMetrics(database) {
    var sales = (database.sales || []).filter(function (sale) { return !isReversed(sale); });
    var quick = (database.inventoryTxns || []).filter(function (txn) {
      return !isReversed(txn) && String(txn.type || '').toUpperCase() === 'SALE_OUT' && String(txn.subtype || '').toUpperCase() === 'QUICK';
    });
    var receiptQty = sales.reduce(function (sum, sale) {
      return sum + (sale.lines || []).reduce(function (lineSum, line) { return lineSum + number(line.qty); }, 0);
    }, 0);
    var quickQty = quick.reduce(function (sum, txn) { return sum + number(txn.qty); }, 0);
    var gross = sales.reduce(function (sum, sale) { return sum + number(sale.subtotal != null ? sale.subtotal : sale.total); }, 0)
      + quick.reduce(function (sum, txn) { return sum + number(txn.amount); }, 0);
    var cost = sales.reduce(function (sum, sale) { return sum + saleCost(sale); }, 0)
      + quick.reduce(function (sum, txn) {
        return sum + (((txn.details || {}).lines) || []).reduce(function (lineSum, line) {
          return lineSum + (line.fifo || []).reduce(function (fifoSum, part) { return fifoSum + number(part.qty) * number(part.uCost); }, 0);
        }, 0);
      }, 0);
    return {
      completedTransactions:sales.length + quick.length,
      receiptSales:sales.length, quickSales:quick.length,
      activeLines:sales.reduce(function (sum, sale) { return sum + (sale.lines || []).length; }, 0)
        + quick.reduce(function (sum, txn) { return sum + ((((txn.details || {}).lines) || []).length); }, 0),
      totalQuantity:round(receiptQty + quickQty), totalGrossSales:round(gross), totalCost:round(cost),
      grossProfit:round(gross - cost), reversedTransactions:(database.sales || []).filter(isReversed).length
        + (database.inventoryTxns || []).filter(function (txn) { return String(txn.type || '').toUpperCase() === 'SALE_OUT' && isReversed(txn); }).length
    };
  }
  function inventoryMetrics(database) {
    var rows = database.stockRows || [];
    var corrections = (database.stockCorrections || []).filter(function (item) { return statusOf(item) === 'COMPLETED'; });
    return {
      qtyIn:round(rows.reduce(function (sum, row) { return sum + number(row.qtyIn); }, 0)),
      qtyOut:round(rows.reduce(function (sum, row) { return sum + number(row.qtyOut); }, 0)),
      correctionIncrease:round(corrections.filter(function (item) { return item.correctionType === 'Quantity Increase'; }).reduce(function (sum, item) { return sum + number(item.quantity); }, 0)),
      correctionDecrease:round(corrections.filter(function (item) { return item.correctionType === 'Quantity Decrease'; }).reduce(function (sum, item) { return sum + number(item.quantity); }, 0)),
      remainingQty:round(rows.reduce(function (sum, row) { return sum + number(row.rStock); }, 0)),
      stockValue:round(rows.reduce(function (sum, row) { return sum + number(row.rStock) * number(row.uCost); }, 0))
    };
  }
  function financialMetrics(database) {
    var selectedYear = Number(database.selectedYear);
    var selectedMonth = Number(database.selectedMonth);
    return {
      cashBalance:round(Object.keys(database.cashBalances || {}).reduce(function (sum, key) { return sum + number(database.cashBalances[key]); }, 0)),
      debtorOutstanding:round((database.debtors || []).reduce(function (sum, item) { return sum + number(item.balance); }, 0)),
      creditorOutstanding:round((database.creditors || []).reduce(function (sum, item) { return sum + number(item.balance); }, 0)),
      depositorOutstanding:round((database.depositors || []).reduce(function (sum, item) { return sum + number(item.balance); }, 0)),
      openMonthExpenses:round((database.expenses || []).filter(function (item) {
        var date = new Date(item.date || '');
        return !isReversed(item) && !Number.isNaN(date.getTime()) && date.getFullYear() === selectedYear && date.getMonth() + 1 === selectedMonth;
      }).reduce(function (sum, item) { return sum + number(item.amount); }, 0))
    };
  }
  function recordIndex(database, collection) {
    var map = new Map();
    var duplicates = [];
    var invalid = [];
    sortedRecords(database, collection).forEach(function (record, index) {
      var key = entityKey(record);
      if (!key) { key = 'INVALID:' + fingerprint(record) + ':' + index; invalid.push(key); }
      if (map.has(key)) duplicates.push(key);
      else map.set(key, record);
    });
    return { map:map, duplicates:duplicates, invalid:invalid };
  }
  function findOrphans(database) {
    var items = [];
    (database.receipts || []).forEach(function (receipt) {
      var id = String(receipt.receiptNo || receipt.id || '');
      if (id && !(database.sales || []).some(function (sale) { return String(sale.receiptNo || sale.id || '') === id; })) items.push({ category:'Orphan Reference', collection:'receipts', id:id, detail:'Receipt Without Sale' });
    });
    (database.warranties || []).forEach(function (warranty) {
      if (warranty.customerId && !(database.customers || []).some(function (customer) { return String(customer.customerId || customer.id || '') === String(warranty.customerId); })) items.push({ category:'Orphan Reference', collection:'warranties', id:entityKey(warranty), detail:'Missing Customer' });
      if (warranty.productId && !(database.products || []).some(function (product) { return String(product.id || '') === String(warranty.productId); })) items.push({ category:'Orphan Reference', collection:'warranties', id:entityKey(warranty), detail:'Missing Product' });
    });
    (database.warrantyClaims || []).forEach(function (claim) {
      if (claim.warrantyId && !(database.warranties || []).some(function (warranty) { return String(warranty.warrantyId || warranty.id || '') === String(claim.warrantyId); })) items.push({ category:'Orphan Reference', collection:'warrantyClaims', id:entityKey(claim), detail:'Missing Warranty' });
    });
    (database.accountTxns || []).forEach(function (txn) {
      var all = [].concat(database.debtors || [], database.creditors || [], database.depositors || []);
      if (txn.accountID && !all.some(function (account) { return String(account.id || '') === String(txn.accountID); })) items.push({ category:'Orphan Reference', collection:'accountTxns', id:entityKey(txn), detail:'Missing Account' });
    });
    return items;
  }
  function localAudit(database) {
    var started = performance.now();
    var summaries = {};
    COLLECTIONS.forEach(function (collection) { summaries[collection] = summarizeCollection(database, collection); });
    var audit = {
      generatedAt:new Date().toISOString(), collections:summaries, sales:saleMetrics(database),
      inventory:inventoryMetrics(database), financial:financialMetrics(database),
      salesAudit:buildSalesAudit(database), invariants:buildInvariants(database)
    };
    audit.durationMs = round(performance.now() - started);
    audit.fingerprint = fingerprint({ collections:summaries, sales:audit.sales, inventory:audit.inventory, financial:audit.financial });
    return audit;
  }
  function findByKey(database, collection, key) {
    var list = Array.isArray(database[collection]) ? database[collection] : [];
    return list.find(function (item) { return entityKey(item) === String(key); });
  }
  function applyProjectedPatch(database, patch, operation, conflicts, indexes) {
    if (patch.action === 'insert') {
      if (!Array.isArray(database[patch.collection])) database[patch.collection] = [];
      if (!indexes[patch.collection]) indexes[patch.collection] = new Map();
      var found = indexes[patch.collection].get(String(patch.key));
      if (!found) { var inserted = clone(patch.value); database[patch.collection].push(inserted); indexes[patch.collection].set(String(patch.key), inserted); }
      else if (stableText(found) !== stableText(patch.value)) conflicts.push({ category:'Duplicate ID', operationId:operation.opId, entityType:patch.collection, entityId:patch.key });
      return;
    }
    if (patch.action === 'delete') {
      if (!Array.isArray(database[patch.collection])) return;
      database[patch.collection] = database[patch.collection].filter(function (item) { return entityKey(item) !== String(patch.key); });
      if (indexes[patch.collection]) indexes[patch.collection].delete(String(patch.key));
      return;
    }
    if (patch.action === 'update') {
      if (!Array.isArray(database[patch.collection])) database[patch.collection] = [];
      if (!indexes[patch.collection]) indexes[patch.collection] = new Map();
      var target = indexes[patch.collection].get(String(patch.key));
      if (!target && patch.fallback) { target = clone(patch.fallback); database[patch.collection].push(target); indexes[patch.collection].set(String(patch.key), target); return; }
      if (!target) { conflicts.push({ category:'Orphan Update', operationId:operation.opId, entityType:patch.collection, entityId:patch.key }); return; }
      (patch.changes || []).forEach(function (change) {
        if (change.mode === 'delta') target[change.field] = round(number(target[change.field]) + number(change.value));
        else if (change.value === undefined) delete target[change.field];
        else target[change.field] = clone(change.value);
      });
      return;
    }
    if (patch.action === 'root-object') {
      if (!database[patch.root] || typeof database[patch.root] !== 'object') database[patch.root] = {};
      database[patch.root][patch.key] = patch.mode === 'delta'
        ? round(number(database[patch.root][patch.key]) + number(patch.value)) : clone(patch.value);
      return;
    }
    if (patch.action === 'root-set') database[patch.root] = clone(patch.value);
  }
  function projectCloud(bundle) {
    var database = clone(bundle.baseline || {});
    var conflicts = [];
    var indexes = {};
    Object.keys(database).forEach(function (collection) {
      if (!Array.isArray(database[collection])) return;
      indexes[collection] = new Map();
      database[collection].forEach(function (item) { var key = entityKey(item); if (key && !indexes[collection].has(key)) indexes[collection].set(key, item); });
    });
    (bundle.operations || []).slice().sort(function (left, right) { return number(left.seq) - number(right.seq); }).forEach(function (row) {
      var operation = clone(row.payload || {});
      operation.opId = operation.opId || row.op_id;
      (operation.patches || []).forEach(function (patch) { applyProjectedPatch(database, patch, operation, conflicts, indexes); });
    });
    return { database:database, conflicts:conflicts };
  }
  function fieldDifferences(localRecord, cloudRecord) {
    var keys = Array.from(new Set(Object.keys(localRecord || {}).concat(Object.keys(cloudRecord || {})))).sort();
    return keys.filter(function (key) { return !/password|secret|token|PIN/i.test(key) && stableText(localRecord[key]) !== stableText(cloudRecord[key]); })
      .slice(0, 20).map(function (key) { return { field:key, local:clone(localRecord[key]), cloud:clone(cloudRecord[key]) }; });
  }
  function compareDatabases(localDatabase, cloudDatabase, bundle) {
    var started = performance.now();
    var differences = [];
    var collectionResults = {};
    COLLECTIONS.forEach(function (collection) {
      var local = recordIndex(localDatabase, collection);
      var cloud = recordIndex(cloudDatabase, collection);
      var counts = { match:0, missingLocally:0, missingInCloud:0, mismatch:0, duplicateId:local.duplicates.length + cloud.duplicates.length, invalid:0, orphanReference:0 };
      local.duplicates.forEach(function (key) { differences.push({ category:'Duplicate ID', collection:collection, id:key, side:'Local' }); });
      cloud.duplicates.forEach(function (key) { differences.push({ category:'Duplicate ID', collection:collection, id:key, side:'Cloud projection' }); });
      local.invalid.forEach(function (key) { counts.invalid += 1; differences.push({ category:'Invalid', collection:collection, id:key, side:'Local' }); });
      cloud.invalid.forEach(function (key) { counts.invalid += 1; differences.push({ category:'Invalid', collection:collection, id:key, side:'Cloud projection' }); });
      var keys = new Set(Array.from(local.map.keys()).concat(Array.from(cloud.map.keys())));
      keys.forEach(function (key) {
        var localRecord = local.map.get(key);
        var cloudRecord = cloud.map.get(key);
        if (!localRecord) { counts.missingLocally += 1; differences.push({ category:'Missing Locally', collection:collection, id:key, cloudHash:fingerprint(cloudRecord) }); return; }
        if (!cloudRecord) { counts.missingInCloud += 1; differences.push({ category:'Missing in Cloud', collection:collection, id:key, localHash:fingerprint(localRecord) }); return; }
        if (stableText(localRecord) === stableText(cloudRecord)) counts.match += 1;
        else { counts.mismatch += 1; differences.push({ category:'Payload Mismatch', collection:collection, id:key, localHash:fingerprint(localRecord), cloudHash:fingerprint(cloudRecord), fields:fieldDifferences(localRecord, cloudRecord) }); }
      });
      collectionResults[collection] = counts;
    });
    findOrphans(localDatabase).forEach(function (item) {
      differences.push(item);
      if (collectionResults[item.collection]) collectionResults[item.collection].orphanReference += 1;
    });
    var applied = window.ZEZMS.cloudSync && ZEZMS.cloudSync.getAppliedOperations ? ZEZMS.cloudSync.getAppliedOperations() : {};
    var cursor = window.ZEZMS.cloudSync && ZEZMS.cloudSync.getState ? number(ZEZMS.cloudSync.getState().cursor) : 0;
    var unapplied = (bundle.operations || []).filter(function (row) { return number(row.seq) <= cursor && !applied[row.op_id]; }).map(function (row) {
      return { seq:number(row.seq), opId:String(row.op_id || ''), kind:row.kind || ((row.payload || {}).kind) || 'TRANSACTION', deviceId:row.device_id || '' };
    });
    var outbox = window.ZEZMS.cloudSync && ZEZMS.cloudSync.getOutbox ? ZEZMS.cloudSync.getOutbox() : [];
    var oldProtocolOperations = (bundle.operations || []).filter(function (row) { return String((row.payload || {}).protocolVersion || 'M4/1') !== 'M4/2'; }).map(function (row) { return String(row.op_id || ''); });
    return {
      generatedAt:new Date().toISOString(), collections:collectionResults, differences:differences,
      unappliedCloudOperations:unapplied, unacknowledgedLocalOperations:outbox,
      oldProtocolOperations:oldProtocolOperations,
      conflictCount:differences.filter(function (item) { return /Mismatch|Duplicate|Invalid|Orphan/.test(item.category); }).length,
      durationMs:round(performance.now() - started)
    };
  }
  function buildSalesAudit(database) {
    var rows = [];
    (database.sales || []).forEach(function (sale) {
      var id = String(sale.receiptNo || sale.id || '');
      var receipt = (database.receipts || []).find(function (item) { return String(item.receiptNo || item.id || '') === id; });
      var qty = (sale.lines || []).reduce(function (sum, line) { return sum + number(line.qty); }, 0);
      var cost = saleCost(sale);
      var gross = number(sale.subtotal != null ? sale.subtotal : sale.total);
      var flags = [];
      if (!receipt) flags.push('Sale Without Receipt');
      if (!(sale.lines || []).some(function (line) { return (line.fifo || []).length; })) flags.push('Sale Without FIFO Evidence');
      if (number(sale.balance) > 0 && !(database.accountTxns || []).some(function (txn) { return String(txn.receiptNo || '') === id; })) flags.push('Credit Sale Without Debtor Effect');
      rows.push({ id:id, receiptId:receipt ? id : '', date:recordDate(sale), originDeviceId:sale.originDeviceId || '', customer:sale.customer || sale.customerName || '', qty:round(qty), salesValue:round(gross), cost:cost, grossProfit:round(gross - cost), status:statusOf(sale), flags:flags });
    });
    (database.inventoryTxns || []).filter(function (txn) { return String(txn.type || '').toUpperCase() === 'SALE_OUT' && String(txn.subtype || '').toUpperCase() === 'QUICK'; }).forEach(function (txn) {
      var lines = ((txn.details || {}).lines) || [];
      var cost = lines.reduce(function (sum, line) { return sum + (line.fifo || []).reduce(function (partSum, part) { return partSum + number(part.qty) * number(part.uCost); }, 0); }, 0);
      rows.push({ id:String(txn.id || ''), receiptId:'', date:recordDate(txn), originDeviceId:txn.originDeviceId || '', customer:txn.customerName || '', qty:round(txn.qty), salesValue:round(txn.amount), cost:round(cost), grossProfit:round(number(txn.amount) - cost), status:statusOf(txn), flags:lines.length ? [] : ['Quick Sale Without Line Evidence'] });
    });
    return rows.sort(function (left, right) { return String(right.date).localeCompare(String(left.date)); });
  }
  function buildInvariants(database) {
    var sales = saleMetrics(database);
    var inventory = inventoryMetrics(database);
    var stockSales = round((database.stockRows || []).reduce(function (sum, row) { return sum + number(row.tSales); }, 0));
    var stockProfit = round((database.stockRows || []).reduce(function (sum, row) { return sum + number(row.profit); }, 0));
    var saleDiff = round(stockSales - sales.totalGrossSales);
    var profitDiff = round(stockProfit - sales.grossProfit);
    var negativeStock = (database.stockRows || []).filter(function (row) { return number(row.rStock) < -0.000001; });
    var latestAccountMismatch = [];
    ['debtors', 'creditors', 'depositors'].forEach(function (collection) {
      (database[collection] || []).forEach(function (account) {
        var txns = (database.accountTxns || []).filter(function (txn) { return !isReversed(txn) && String(txn.accountID || '') === String(account.id || ''); });
        if (txns.length && Math.abs(number(txns[txns.length - 1].balanceAfter) - number(account.balance)) > 0.01) latestAccountMismatch.push(collection + '/' + account.id);
      });
    });
    return [
      { name:'Sales totals reconcile with FIFO rows', status:Math.abs(saleDiff) <= 0.01 ? 'PASS' : 'FAIL', explanation:'FIFO row sales less canonical Sale Out + Quick Sale = ' + money(saleDiff) },
      { name:'Gross profit reconciles with FIFO rows', status:Math.abs(profitDiff) <= 0.01 ? 'PASS' : 'FAIL', explanation:'FIFO row profit less transaction-derived profit = ' + money(profitDiff) },
      { name:'No negative remaining stock', status:negativeStock.length ? 'FAIL' : 'PASS', explanation:negativeStock.length ? negativeStock.length + ' stock row(s) are negative.' : 'All FIFO rows have non-negative remaining quantity.' },
      { name:'Account balances match latest active posting', status:latestAccountMismatch.length ? 'WARNING' : 'PASS', explanation:latestAccountMismatch.length ? latestAccountMismatch.length + ' account(s) differ from their latest active balance-after evidence.' : 'Account registers match their latest active postings where postings exist.' },
      { name:'Inventory fingerprint available', status:'PASS', explanation:'Qty In ' + inventory.qtyIn + ', Qty Out ' + inventory.qtyOut + ', Remaining ' + inventory.remainingQty + '.' }
    ];
  }
  function syncInfo() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    var value = sync && sync.getState ? sync.getState() : {};
    return {
      deviceId:value.deviceId || '', deviceName:value.deviceName || 'ZEZMS Device', appVersion:typeof APP_VERSION !== 'undefined' ? APP_VERSION : VERSION,
      build:BUILD, protocolVersion:sync && sync.protocolVersion || 'M4/1', cursor:number(value.cursor),
      lastSuccessfulSync:value.lastPullAt || value.lastPushAt || '', pendingOutbox:number(value.queueLength),
      failedOperations:number(value.failedCount), lastFullIntegrityCheck:value.lastIntegrityCheckAt || '',
      oldClientDetected:!!value.oldClientDetected, integrityWarning:!!value.integrityWarning
    };
  }
  function setMessage(message, type) { state.message = message || ''; state.messageType = type || 'ok'; tryRender(); }
  function tryRender() { try { if (typeof currentView !== 'undefined' && currentView === 'integrity' && typeof render === 'function') render(); } catch (_) {} }
  async function runLocalAudit(showNotice) {
    state.busy = 'Running local integrity audit…'; tryRender();
    try {
      state.localAudit = localAudit(db());
      var sync = window.ZEZMS && ZEZMS.cloudSync;
      var localWarning = state.localAudit.invariants.some(function (item) { return item.status !== 'PASS'; });
      var existingWarning = sync && sync.getState ? !!sync.getState().integrityWarning : false;
      if (sync && sync.markIntegrityCheck) sync.markIntegrityCheck(state.localAudit.generatedAt, localWarning || existingWarning);
      if (showNotice !== false) setMessage('Local read-only integrity audit completed in ' + state.localAudit.durationMs + ' ms.', 'ok');
      return state.localAudit;
    } finally { state.busy = ''; tryRender(); }
  }
  async function compareCloud() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.fetchCloudAuditBundle) throw new Error('Cloud Sync M4/2 is unavailable.');
    state.busy = 'Reconstructing the Cloud dataset in server order…'; tryRender();
    try {
      var bundle = await sync.fetchCloudAuditBundle();
      var projection = projectCloud(bundle);
      var report = compareDatabases(db(), projection.database, bundle);
      report.cloudProjectionConflicts = projection.conflicts;
      report.cloudFingerprint = localAudit(projection.database);
      state.cloudBundle = bundle;
      state.cloudDatabase = projection.database;
      state.crossDevice = null;
      state.cloudReport = report;
      state.localAudit = localAudit(db());
      if (sync.markIntegrityCheck) sync.markIntegrityCheck(state.localAudit.generatedAt, !!(report.differences.length || report.unappliedCloudOperations.length));
      setMessage(report.differences.length || report.unappliedCloudOperations.length
        ? 'Integrity differences detected. Review the preview; no data was changed.'
        : 'Local records match the reconstructed Cloud operation set.', report.differences.length ? 'warn' : 'ok');
      return report;
    } finally { state.busy = ''; tryRender(); }
  }
  function snapshotRecord(database, collection) {
    return sortedRecords(database, collection).map(function (record) {
      return { id:entityKey(record), hash:fingerprint(record), status:statusOf(record), date:recordDate(record), reversed:isReversed(record) };
    });
  }
  async function buildSnapshot() {
    var audit = state.localAudit || await runLocalAudit(false);
    var info = syncInfo();
    var collections = {};
    COLLECTIONS.forEach(function (collection) {
      collections[collection] = { summary:clone(audit.collections[collection]), records:snapshotRecord(db(), collection) };
    });
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    var applied = sync && sync.getAppliedOperations ? sync.getAppliedOperations() : {};
    var outbox = sync && sync.getOutbox ? sync.getOutbox() : [];
    var reversals = [];
    (db().stockCorrections || []).filter(function (item) { return item.reversalOf; }).forEach(function (item) { reversals.push({ type:'stockCorrection', id:entityKey(item), target:String(item.reversalOf), status:statusOf(item) }); });
    (db().inventoryTxns || []).filter(isReversed).forEach(function (item) { reversals.push({ type:'inventoryTxn', id:entityKey(item), target:entityKey(item), status:statusOf(item) }); });
    var snapshot = {
      format:SNAPSHOT_FORMAT, generatedAt:new Date().toISOString(), device:info,
      overallFingerprint:audit.fingerprint, collections:collections, sales:audit.sales,
      inventory:audit.inventory, financial:audit.financial,
      operationIds:{ applied:Object.keys(applied).sort(), outbox:outbox.map(function (op) { return op.opId; }).filter(Boolean).sort() },
      reversalRelationships:reversals
    };
    snapshot.snapshotHash = await sha256(snapshot);
    return snapshot;
  }
  function downloadJSON(value, name) {
    var blob = new Blob([JSON.stringify(value, null, 2)], { type:'application/json' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function exportSnapshot() {
    state.busy = 'Building integrity snapshot…'; tryRender();
    try {
      var snapshot = await buildSnapshot();
      downloadJSON(snapshot, 'ZEZMS_Integrity_' + String(snapshot.device.deviceName || 'Device').replace(/[^a-z0-9_-]+/gi, '_') + '_' + snapshot.generatedAt.replace(/[:.]/g, '-') + '.json');
      setMessage('Integrity Snapshot downloaded. It contains hashes and IDs, not passwords or tokens.', 'ok');
    } finally { state.busy = ''; tryRender(); }
  }
  function loadImports() { try { var value = JSON.parse(localStorage.getItem(IMPORT_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function persistImports() { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(state.imports.slice(-4))); } catch (_) {} }
  function importSnapshots(input) {
    var files = Array.from(input && input.files || []);
    if (!files.length) return;
    Promise.all(files.map(function (file) { return file.text().then(JSON.parse); })).then(function (snapshots) {
      snapshots.forEach(function (snapshot) {
        if (!snapshot || snapshot.format !== SNAPSHOT_FORMAT || !snapshot.device || !snapshot.collections) throw new Error('One selected file is not a ZEZMS Integrity Snapshot.');
      });
      state.imports = state.imports.concat(snapshots).slice(-4); persistImports(); buildCrossDeviceComparison();
      setMessage(snapshots.length + ' read-only Integrity Snapshot(s) imported.', 'ok');
    }).catch(function (error) { setMessage(error.message || String(error), 'err'); });
  }
  function compareSnapshotDocuments(snapshots) {
    snapshots = (snapshots || []).slice();
    var indexedSnapshots = snapshots.map(function (snapshot) {
      var indexes = {};
      Object.keys(snapshot.collections || {}).forEach(function (collection) {
        indexes[collection] = new Map((snapshot.collections[collection].records || []).map(function (record) { return [record.id, record]; }));
      });
      return indexes;
    });
    var rows = [];
    var collections = new Set();
    snapshots.forEach(function (snapshot) { Object.keys(snapshot.collections || {}).forEach(function (name) { collections.add(name); }); });
    collections.forEach(function (collection) {
      var ids = new Set();
      indexedSnapshots.forEach(function (indexes) {
        if (indexes[collection]) indexes[collection].forEach(function (_record, id) { ids.add(id); });
      });
      ids.forEach(function (id) {
        var cells = indexedSnapshots.map(function (indexes) { return indexes[collection] && indexes[collection].get(id) || null; });
        var hashes = new Set(cells.filter(Boolean).map(function (cell) { return cell.hash; }));
        if (cells.some(function (cell) { return !cell; }) || hashes.size > 1) rows.push({ collection:collection, id:id, cells:cells, mismatch:hashes.size > 1 });
      });
    });
    return { devices:snapshots.map(function (snapshot) { return snapshot.device; }), rows:rows, generatedAt:new Date().toISOString() };
  }
  function buildCrossDeviceComparison() {
    var snapshots = state.imports.slice();
    if (state.cloudDatabase) {
      var cloudCollections = {};
      COLLECTIONS.forEach(function (collection) {
        cloudCollections[collection] = { summary:summarizeCollection(state.cloudDatabase, collection), records:snapshotRecord(state.cloudDatabase, collection) };
      });
      snapshots.push({ device:{ deviceName:'Cloud operation set', deviceId:'CLOUD' }, collections:cloudCollections });
    }
    state.crossDevice = compareSnapshotDocuments(snapshots);
    tryRender(); return state.crossDevice;
  }
  function clearImportedSnapshots() { state.imports = []; state.crossDevice = null; persistImports(); setMessage('Imported comparison snapshots cleared.', 'ok'); }
  function prepareReconciliation() {
    if (!state.cloudReport) { setMessage('Run Compare Local vs Cloud first.', 'warn'); return; }
    var safeCandidates = state.cloudReport.unappliedCloudOperations.filter(function (row) {
      var cloudRow = (state.cloudBundle.operations || []).find(function (item) { return String(item.op_id) === row.opId; });
      if (!cloudRow) return false;
      var sync = window.ZEZMS && ZEZMS.cloudSync;
      var preview = sync && sync.previewMissingOperation ? sync.previewMissingOperation(cloudRow.payload || {}) : { safe:false };
      row.preview = preview;
      return preview.safe;
    });
    state.reconciliation = {
      preparedAt:new Date().toISOString(), safeMissingLocal:safeCandidates,
      missingCloud:state.cloudReport.differences.filter(function (item) { return item.category === 'Missing in Cloud'; }),
      conflicts:state.cloudReport.differences.filter(function (item) { return item.category === 'Payload Mismatch' || item.category === 'Duplicate ID'; }),
      orphaned:state.cloudReport.differences.filter(function (item) { return /Orphan/.test(item.category); })
    };
    setMessage('Reconciliation preview prepared. Nothing was changed.', state.reconciliation.conflicts.length ? 'warn' : 'ok');
  }
  function downloadSafetyBackup() {
    var database = clone(db());
    var now = new Date().toISOString();
    downloadJSON({ type:'ZEZMS_FULL_SAFETY_BACKUP', version:VERSION, createdAt:now, database:database }, 'ZEZMS_Pre_Reconciliation_Backup_' + now.replace(/[:.]/g, '-') + '.tradeflow.json');
    localStorage.setItem(BACKUP_KEY, now);
    setMessage('Fresh full local safety backup downloaded. Keep it before applying any repair.', 'ok');
  }
  async function applySafeMissingLocal() {
    if (!state.reconciliation || !state.reconciliation.safeMissingLocal.length) throw new Error('No safely recoverable Missing Local Cloud operations are in the preview.');
    var backupAt = Date.parse(localStorage.getItem(BACKUP_KEY) || '');
    if (!Number.isFinite(backupAt) || Date.now() - backupAt > 30 * 60 * 1000) throw new Error('Download a fresh pre-reconciliation backup first (valid for 30 minutes).');
    if (!confirm('Apply only the previewed Cloud operation effects that match before/after evidence?\n\nConflicts will remain blocked for manual review.')) return;
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.recoverCloudOperations) throw new Error('M4/2 recovery service is unavailable.');
    state.busy = 'Applying evidence-safe missing Cloud effects…'; tryRender();
    try {
      var result = await sync.recoverCloudOperations(state.reconciliation.safeMissingLocal.map(function (item) { return item.opId; }));
      await compareCloud();
      setMessage('Reconciliation applied ' + result.applied.length + ' operation(s); ' + result.blocked.length + ' remained blocked for review.', result.blocked.length ? 'warn' : 'ok');
      return result;
    } finally { state.busy = ''; tryRender(); }
  }
  async function fullCatchUp() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.pullNow) throw new Error('Cloud Sync is unavailable.');
    state.busy = 'Receiving all operations after the safe cursor…'; tryRender();
    try { await sync.pullNow(true); return await compareCloud(); }
    finally { state.busy = ''; tryRender(); }
  }
  async function retryOutbox() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.pushNow) throw new Error('Cloud Sync is unavailable.');
    await sync.pushNow(true); await compareCloud();
  }
  function call(action) {
    Promise.resolve().then(action).catch(function (error) { state.busy = ''; setMessage(error.message || String(error), 'err'); });
  }
  function badge(value) { return '<span class="badge ' + (value === 'PASS' ? 'ok' : value === 'FAIL' ? 'danger' : 'warn') + '">' + esc(value) + '</span>'; }
  function summaryTable(audit) {
    if (!audit) return '<p class="muted">Run Local Integrity Audit to calculate deterministic collection fingerprints.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Collection</th><th class="right">Records</th><th class="right">Active</th><th class="right">Reversed</th><th>Earliest</th><th>Latest</th><th>Fingerprint</th></tr></thead><tbody>'
      + COLLECTIONS.map(function (collection) { var item = audit.collections[collection]; return '<tr><td>' + esc(item.label) + '</td><td class="right mono">' + item.count + '</td><td class="right mono">' + item.active + '</td><td class="right mono">' + item.reversed + '</td><td>' + esc(item.earliest ? item.earliest.slice(0, 10) : '—') + '</td><td>' + esc(item.latest ? item.latest.slice(0, 10) : '—') + '</td><td class="mono">' + esc(item.fingerprint) + (item.duplicateIds.length ? '<br><small style="color:#fca5a5">' + item.duplicateIds.length + ' duplicate ID(s)</small>' : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }
  function metricsHTML(audit) {
    if (!audit) return '';
    var sale = audit.sales, inv = audit.inventory, fin = audit.financial;
    return '<div class="grid g3">'
      + '<div class="card"><h3>Sales fingerprint</h3><div class="statline"><span>Completed transactions</span><b>' + sale.completedTransactions + '</b></div><div class="statline"><span>Active lines</span><b>' + sale.activeLines + '</b></div><div class="statline"><span>Total quantity</span><b>' + sale.totalQuantity + '</b></div><div class="statline"><span>Gross sales</span><b>' + money(sale.totalGrossSales) + '</b></div><div class="statline"><span>Cost</span><b>' + money(sale.totalCost) + '</b></div><div class="statline"><span>Gross profit</span><b>' + money(sale.grossProfit) + '</b></div><div class="statline"><span>Reversed</span><b>' + sale.reversedTransactions + '</b></div></div>'
      + '<div class="card"><h3>Inventory fingerprint</h3><div class="statline"><span>Qty In</span><b>' + inv.qtyIn + '</b></div><div class="statline"><span>Qty Out</span><b>' + inv.qtyOut + '</b></div><div class="statline"><span>Correction Increase</span><b>' + inv.correctionIncrease + '</b></div><div class="statline"><span>Correction Decrease</span><b>' + inv.correctionDecrease + '</b></div><div class="statline"><span>Remaining Qty</span><b>' + inv.remainingQty + '</b></div><div class="statline"><span>Current Stock Value</span><b>' + money(inv.stockValue) + '</b></div></div>'
      + '<div class="card"><h3>Financial fingerprint</h3><div class="statline"><span>Cash Balance</span><b>' + money(fin.cashBalance) + '</b></div><div class="statline"><span>Debtor Outstanding</span><b>' + money(fin.debtorOutstanding) + '</b></div><div class="statline"><span>Creditor Outstanding</span><b>' + money(fin.creditorOutstanding) + '</b></div><div class="statline"><span>Depositor Outstanding</span><b>' + money(fin.depositorOutstanding) + '</b></div><div class="statline"><span>Open Month Expenses</span><b>' + money(fin.openMonthExpenses) + '</b></div></div></div>';
  }
  function comparisonHTML() {
    var report = state.cloudReport;
    if (!report) return '<p class="muted">No Cloud comparison has been run. The comparison is read-only.</p>';
    var totals = { match:0, missingLocally:0, missingInCloud:0, mismatch:0, duplicateId:0, invalid:0, orphanReference:0 };
    Object.keys(report.collections).forEach(function (name) { Object.keys(totals).forEach(function (key) { totals[key] += number(report.collections[name][key]); }); });
    return '<div class="grid g3"><div class="card"><div class="statline"><span>Match</span><b>' + totals.match + '</b></div><div class="statline"><span>Missing Locally</span><b>' + totals.missingLocally + '</b></div><div class="statline"><span>Missing in Cloud</span><b>' + totals.missingInCloud + '</b></div></div><div class="card"><div class="statline"><span>Payload Mismatch</span><b>' + totals.mismatch + '</b></div><div class="statline"><span>Duplicate ID</span><b>' + totals.duplicateId + '</b></div><div class="statline"><span>Unapplied Cloud Operations</span><b>' + report.unappliedCloudOperations.length + '</b></div></div><div class="card"><div class="statline"><span>Unacknowledged Local Operations</span><b>' + report.unacknowledgedLocalOperations.length + '</b></div><div class="statline"><span>Cloud replay conflicts</span><b>' + report.cloudProjectionConflicts.length + '</b></div><div class="statline"><span>Compare time</span><b>' + report.durationMs + ' ms</b></div></div></div>'
      + '<div class="statline"><span>Invalid / Orphan Reference</span><b>' + totals.invalid + ' / ' + totals.orphanReference + '</b></div><div class="statline"><span>Legacy protocol operations in replay window</span><b>' + report.oldProtocolOperations.length + '</b></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Category</th><th>Collection</th><th>ID</th><th>Safe field differences</th></tr></thead><tbody>'
      + report.differences.slice(0, 500).map(function (item) { return '<tr><td>' + esc(item.category) + '</td><td>' + esc(LABELS[item.collection] || item.collection) + '</td><td class="mono">' + esc(item.id) + '</td><td><small>' + esc((item.fields || []).map(function (field) { return field.field; }).join(', ') || '—') + '</small></td></tr>'; }).join('')
      + (report.differences.length ? '' : '<tr><td colspan="4">No record differences detected.</td></tr>') + '</tbody></table></div>';
  }
  function failedHTML() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    var failed = sync && sync.getFailedOperations ? sync.getFailedOperations() : [];
    if (!failed.length) return '<p class="muted">No failed sync operations recorded on this device.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Operation ID</th><th>Entity</th><th>Failure stage</th><th>Category</th><th>Attempts</th><th>Last attempt</th></tr></thead><tbody>' + failed.map(function (item) { return '<tr><td class="mono">' + esc(item.opId) + '</td><td>' + esc(item.entityType) + '<br><small>' + esc(item.entityId) + '</small></td><td>' + esc(item.stage) + '</td><td>' + esc(item.category) + '<br><small>' + esc(item.message) + '</small></td><td>' + item.attempts + '</td><td>' + esc(item.lastAttempt) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function salesAuditHTML() {
    var audit = state.localAudit;
    if (!audit) return '<p class="muted">Run the local audit first.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Date</th><th>Customer</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">Cost</th><th class="right">Profit</th><th>Status / flags</th></tr></thead><tbody>' + audit.salesAudit.slice(0, 500).map(function (item) { return '<tr><td class="mono">' + esc(item.id) + '</td><td>' + esc(item.date ? item.date.slice(0, 10) : '—') + '</td><td>' + esc(item.customer || '—') + '</td><td class="right">' + item.qty + '</td><td class="right">' + money(item.salesValue) + '</td><td class="right">' + money(item.cost) + '</td><td class="right">' + money(item.grossProfit) + '</td><td>' + esc(item.status) + (item.flags.length ? '<br><small style="color:#fca5a5">' + esc(item.flags.join('; ')) + '</small>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function crossDeviceHTML() {
    if (!state.imports.length) return '<p class="muted">Import Integrity Snapshots from any two to four devices. Full business payloads are not required.</p>';
    var comparison = state.crossDevice || buildCrossDeviceComparison();
    return '<div class="table-wrap"><table><thead><tr><th>Collection / ID</th>' + comparison.devices.map(function (device) { return '<th>' + esc(device.deviceName || device.deviceId) + '</th>'; }).join('') + '</tr></thead><tbody>' + comparison.rows.slice(0, 1000).map(function (row) { return '<tr><td>' + esc(LABELS[row.collection] || row.collection) + '<br><small class="mono">' + esc(row.id) + '</small></td>' + row.cells.map(function (cell) { return '<td>' + (cell ? '<span class="badge ' + (row.mismatch ? 'warn' : 'ok') + '">Present</span><br><small class="mono">' + esc(cell.hash) + '</small>' : '<span class="badge danger">Missing</span>') + '</td>'; }).join('') + '</tr>'; }).join('') + (comparison.rows.length ? '' : '<tr><td colspan="5">Imported devices have matching record IDs and hashes.</td></tr>') + '</tbody></table></div>';
  }
  function reconciliationHTML() {
    if (!state.reconciliation) return '<p class="muted">Run Compare Local vs Cloud, then Prepare Reconciliation. No repair runs automatically.</p>';
    var item = state.reconciliation;
    return '<div class="grid g3"><div class="card"><div class="statline"><span>Evidence-safe Missing Local operations</span><b>' + item.safeMissingLocal.length + '</b></div></div><div class="card"><div class="statline"><span>Missing Cloud records</span><b>' + item.missingCloud.length + '</b><p class="muted" style="font-size:11px">Only the same durable outbox operation may be retried automatically. Records without operation evidence remain manual review.</p></div><div class="card"><div class="statline"><span>Conflicting IDs / payloads</span><b>' + item.conflicts.length + '</b><p class="muted" style="font-size:11px">Never auto-resolved.</p></div></div>';
  }
  function viewHTML() {
    var info = syncInfo();
    var audit = state.localAudit;
    var message = state.message ? '<div class="card" style="border-color:' + (state.messageType === 'err' ? '#ef4444' : state.messageType === 'warn' ? '#f59e0b' : '#10b981') + '"><b>' + esc(state.message) + '</b></div>' : '';
    var warning = (info.failedOperations || info.pendingOutbox || info.oldClientDetected || info.integrityWarning || state.cloudReport && (state.cloudReport.differences.length || state.cloudReport.unappliedCloudOperations.length))
      ? '<div class="card" style="border-color:#f59e0b;background:rgba(245,158,11,.08)"><h3>Data integrity issue detected — review Sync Integrity.</h3><p class="muted">Diagnostics and previews are read-only until you explicitly confirm an evidence-safe recovery.</p></div>' : '';
    return '<section id="syncIntegrityCenter" data-version="' + VERSION + '" data-build="' + BUILD + '">'
      + '<div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Data Integrity &amp; Sync</h2><p class="muted">Cross-device forensics, fingerprints and evidence-safe reconciliation. No majority-device overwrite.</p></div><span class="badge ok">' + esc(info.protocolVersion) + '</span></div>'
      + (state.busy ? '<div class="card"><b>' + esc(state.busy) + '</b></div>' : '') + message + warning
      + '<div class="grid g3"><div class="card"><h3>Device identity</h3><div class="statline"><span>Local Device ID</span><b class="mono" style="font-size:10px">' + esc(info.deviceId || 'Unavailable') + '</b></div><div class="statline"><span>Device Name</span><b>' + esc(info.deviceName) + '</b></div><div class="statline"><span>App / Build</span><b>v' + esc(info.appVersion) + '<br><small>' + esc(info.build) + '</small></b></div></div><div class="card"><h3>Sync state</h3><div class="statline"><span>Protocol</span><b>' + esc(info.protocolVersion) + '</b></div><div class="statline"><span>Server cursor</span><b>' + info.cursor + '</b></div><div class="statline"><span>Last successful sync</span><b>' + esc(info.lastSuccessfulSync || 'Never') + '</b></div></div><div class="card"><h3>Safety state</h3><div class="statline"><span>Pending Outbox</span><b>' + info.pendingOutbox + '</b></div><div class="statline"><span>Failed Operations</span><b>' + info.failedOperations + '</b></div><div class="statline"><span>Old-client operations detected</span><b>' + (info.oldClientDetected ? 'YES — upgrade all devices' : 'No') + '</b></div><div class="statline"><span>Last full integrity check</span><b>' + esc(audit ? audit.generatedAt : 'Never') + '</b></div></div></div>'
      + '<div class="card"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="ZEZMS.syncIntegrity.runLocalAudit()">Run Local Integrity Audit</button><button class="btn ghost" onclick="ZEZMS.syncIntegrity.compareCloud()">Compare Local vs Cloud</button><button class="btn ghost" onclick="ZEZMS.syncIntegrity.fullCatchUp()">Full Sync Audit / Catch Up</button><button class="btn ghost" onclick="ZEZMS.syncIntegrity.exportSnapshot()">Export Integrity Snapshot</button><button class="btn ghost" onclick="ZEZMS.syncIntegrity.retryOutbox()">Retry Pending Uploads</button></div></div>'
      + metricsHTML(audit)
      + '<div class="card"><h3>Collection fingerprints</h3>' + summaryTable(audit) + '</div>'
      + '<div class="card"><h3>Machine-checkable invariants</h3>' + (audit ? audit.invariants.map(function (item) { return '<div class="statline"><span>' + esc(item.name) + '<br><small>' + esc(item.explanation) + '</small></span><b>' + badge(item.status) + '</b></div>'; }).join('') : '<p class="muted">Run the local audit first.</p>') + '</div>'
      + '<div class="card"><h3>Cloud-vs-Local audit</h3>' + comparisonHTML() + '</div>'
      + '<div class="card"><h3>Sales Integrity Audit</h3>' + salesAuditHTML() + '</div>'
      + '<div class="card"><h3>Failed Sync Operations</h3>' + failedHTML() + '</div>'
      + '<div class="card"><h3>Cross-Device Comparison</h3><div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><input id="integritySnapshotFiles" type="file" accept="application/json,.json" multiple onchange="ZEZMS.syncIntegrity.importSnapshots(this)"><button class="btn ghost" onclick="ZEZMS.syncIntegrity.clearImportedSnapshots()">Clear imported snapshots</button></div>' + crossDeviceHTML() + '</div>'
      + '<div class="card"><h3>Reconciliation preview</h3><p class="muted">Missing Local effects are recoverable only when every affected field matches the Cloud operation’s recorded before/after evidence. Same-ID conflicts are blocked for manual review.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" onclick="ZEZMS.syncIntegrity.prepareReconciliation()">Prepare Reconciliation</button><button class="btn ghost" onclick="ZEZMS.syncIntegrity.downloadSafetyBackup()">Download Backup Before Repair</button><button class="btn warn" onclick="ZEZMS.syncIntegrity.applySafeMissingLocal()">Apply Safe Missing Local</button></div>' + reconciliationHTML() + '</div>'
      + '<div class="card"><h3>Safety guarantees</h3><ul class="muted"><li>No device, majority, newest copy or Cloud snapshot is automatically declared authoritative.</li><li>No Stock Correction is used as a sync repair.</li><li>No conflicting same-ID payload is auto-resolved.</li><li>No local or Cloud business data changes during audit, export, import, comparison or preview.</li><li>Missing-in-Cloud records without their original durable outbox operation remain manual review.</li></ul></div>'
      + '</section>';
  }

  ZEZMS.syncIntegrity = {
    version:VERSION, build:BUILD, format:SNAPSHOT_FORMAT, viewHTML:viewHTML,
    runLocalAudit:function () { call(function () { return runLocalAudit(true); }); },
    compareCloud:function () { call(compareCloud); }, fullCatchUp:function () { call(fullCatchUp); },
    retryOutbox:function () { call(retryOutbox); }, exportSnapshot:function () { call(exportSnapshot); },
    importSnapshots:importSnapshots, clearImportedSnapshots:clearImportedSnapshots,
    prepareReconciliation:prepareReconciliation, downloadSafetyBackup:downloadSafetyBackup,
    applySafeMissingLocal:function () { call(applySafeMissingLocal); },
    getState:function () { return clone(state); },
    _test:{ canonicalize:canonicalize, fingerprint:fingerprint, entityKey:entityKey, summarizeCollection:summarizeCollection,
      saleMetrics:saleMetrics, inventoryMetrics:inventoryMetrics, financialMetrics:financialMetrics,
      localAudit:localAudit, projectCloud:projectCloud, compareDatabases:compareDatabases,
       buildSalesAudit:buildSalesAudit, buildInvariants:buildInvariants,
       compareSnapshotDocuments:compareSnapshotDocuments }
  };
}());

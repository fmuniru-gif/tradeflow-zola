(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  var VERSION = '3.20.0';
  var BUILD = '20260906-controlled-decision-integrity-r67';
  var SNAPSHOT_FORMAT = 'ZEZMS-INTEGRITY-V2-SNAPSHOT/1';

  var COLLECTIONS = [
    'sales','receipts','inventoryTxns','stockRows','purchaseOrders','cashLog','expenses',
    'debtors','creditors','depositors','accountTxns','products','stockCorrections','customers',
    'customerFollowups','quotations','salesOpportunities','warranties','warrantyClaims',
    'invoices','waybills','undoLog','saleLines','monthRollovers',
    'managementTargets','managementTargetHistory','managementScenarios',
    'managementAlertStates','managementAlertHistory',
    'managementActionPlans','managementActionTasks','managementActionHistory',
    'managementExecutionHandoffs'
  ];

  var LABELS = {
    sales:'Sales',receipts:'Receipts',inventoryTxns:'Inventory Txns',stockRows:'Stock In / FIFO Rows',
    purchaseOrders:'Purchase Orders',cashLog:'Cash',expenses:'Expenses',debtors:'Debtors',
    creditors:'Creditors',depositors:'Depositors',accountTxns:'Account Transactions',products:'Products',
    stockCorrections:'Stock Corrections',customers:'Customers',customerFollowups:'Follow-ups',
    quotations:'Quotations',salesOpportunities:'Opportunities',warranties:'Warranties',
    warrantyClaims:'Claims',invoices:'Invoices',waybills:'Waybills',undoLog:'Undo / Reversal Records',
    saleLines:'Sale Lines',monthRollovers:'Month Rollovers',
    managementTargets:'Management Targets',managementTargetHistory:'Target Revision History',managementScenarios:'Planning Scenarios',
    managementAlertStates:'Management Alert States',managementAlertHistory:'Management Alert History',
    managementActionPlans:'Management Action Plans',managementActionTasks:'Management Action Tasks',managementActionHistory:'Management Action History',
    managementExecutionHandoffs:'Management Execution Handoffs'
  };

  var IDENTITY_REGISTRY = {
    products:['id','_syncId'], customers:['customerId','id','_syncId'],
    customerFollowups:['followupId','id','_syncId'], salesOpportunities:['opportunityId','id','_syncId'],
    quotations:['quotationId','id','_syncId'], stockRows:['id','_syncId'],
    stockCorrections:['correctionId','id','_syncId'], warranties:['warrantyId','id','_syncId'],
    warrantyClaims:['claimId','id','_syncId'], debtors:['id','_syncId'], creditors:['id','_syncId'],
    depositors:['id','_syncId'], sales:['id','receiptNo','_syncId'], receipts:['receiptNo','id','_syncId'],
    invoices:['id','invoiceNo','_syncId'], waybills:['id','waybillNo','_syncId'],
    purchaseOrders:['id','poNo','purchaseOrderNo','_syncId'], saleLines:['_syncId','id'],
    accountTxns:['id','_syncId'], cashLog:['id','_syncId'], expenses:['id','_syncId'],
    inventoryTxns:['id','_syncId'], undoLog:['id','_syncId'], monthRollovers:['id','_syncId'],
    managementTargets:['targetId','id','_syncId'], managementTargetHistory:['historyId','id','_syncId'],
    managementScenarios:['scenarioId','id','_syncId'], managementAlertStates:['alertKey','id','_syncId'],
    managementAlertHistory:['eventId','id','_syncId'], managementActionPlans:['planId','id','_syncId'],
    managementActionTasks:['taskId','id','_syncId'], managementActionHistory:['historyId','id','_syncId'],
    managementExecutionHandoffs:['handoffId','id','_syncId']
  };

  var REVERSED = new Set(['VOID','UNDONE','REVERSED','CANCELLED','CANCELED','REJECTED']);

  var state = {
    localAudit:null,
    cloudBundle:null,
    cloudDatabase:null,
    cloudReport:null,
    busy:'',
    message:'',
    messageType:'ok'
  };

  function db() { try { return typeof DB !== 'undefined' ? DB : null; } catch (_) { return null; } }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function number(value) { return Number(value) || 0; }
  function round(value) { return Math.round((number(value) + Number.EPSILON) * 100) / 100; }
  function money(value) { return 'GH₵ ' + number(value).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function statusOf(record) { return String(record && record.status || 'ACTIVE').trim().toUpperCase(); }
  function isReversed(record) { return !!(record && (record.voided === true || REVERSED.has(statusOf(record)))); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function canonicalize(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (!/password|secret|token|publishableKey|adminPIN|pricePIN/i.test(key)) out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function stableText(value) { return JSON.stringify(canonicalize(value)); }

  function fingerprint(value) {
    var text = stableText(value), hash = 0x811c9dc5;
    for (var i=0;i<text.length;i+=1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash,0x01000193); }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8).toUpperCase();
  }

  function entityKey(collection,item) {
    if (!item || typeof item !== 'object') return '';
    var fields = IDENTITY_REGISTRY[collection] || ['_syncId','id'];
    for (var i=0;i<fields.length;i+=1) {
      var value = item[fields[i]];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
    return '';
  }

  function recordDate(item) {
    var raw = item && (item.date || item.createdAt || item.at || item.updatedAt || item.completedAt || item.committedAt);
    var parsed = Date.parse(raw || '');
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
  }

  function sortedRecords(database,collection) {
    return (Array.isArray(database && database[collection]) ? database[collection] : []).slice().sort(function(a,b){
      return entityKey(collection,a).localeCompare(entityKey(collection,b)) || stableText(a).localeCompare(stableText(b));
    });
  }

  function recordIndex(database,collection) {
    var map = new Map(), duplicates = [], invalid = [];
    sortedRecords(database,collection).forEach(function(record,index){
      var key = entityKey(collection,record);
      if (!key) { key = 'INVALID:' + fingerprint(record) + ':' + index; invalid.push(key); }
      if (map.has(key)) duplicates.push(key);
      else map.set(key,record);
    });
    return {map:map,duplicates:duplicates,invalid:invalid};
  }

  function summarizeCollection(database,collection) {
    var records = sortedRecords(database,collection);
    var dates = records.map(recordDate).filter(Boolean).sort();
    var reversed = records.filter(isReversed).length;
    var idx = recordIndex(database,collection);
    return {
      collection:collection,label:LABELS[collection] || collection,count:records.length,
      active:records.length-reversed,reversed:reversed,earliest:dates[0] || '',
      latest:dates[dates.length-1] || '',fingerprint:fingerprint(records),
      duplicateIds:idx.duplicates.slice(),invalidIds:idx.invalid.slice()
    };
  }

  function saleCost(sale) {
    return round((sale.lines || []).reduce(function(total,line){
      return total + (line.fifo || []).reduce(function(sum,part){ return sum + number(part.qty)*number(part.uCost); },0);
    },0));
  }

  function saleMetrics(database) {
    var sales = (database.sales || []).filter(function(sale){ return !isReversed(sale); });
    var quick = (database.inventoryTxns || []).filter(function(txn){
      return !isReversed(txn) && String(txn.type || '').toUpperCase()==='SALE_OUT' &&
        String(txn.subtype || '').toUpperCase()==='QUICK';
    });
    var receiptQty = sales.reduce(function(sum,sale){
      return sum + (sale.lines || []).reduce(function(s,l){ return s + number(l.qty); },0);
    },0);
    var quickQty = quick.reduce(function(sum,txn){ return sum + number(txn.qty); },0);
    var gross = sales.reduce(function(sum,sale){ return sum + number(sale.subtotal != null ? sale.subtotal : sale.total); },0) +
      quick.reduce(function(sum,txn){ return sum + number(txn.amount); },0);
    var cost = sales.reduce(function(sum,sale){ return sum + saleCost(sale); },0) +
      quick.reduce(function(sum,txn){
        return sum + ((((txn.details || {}).lines) || []).reduce(function(lineSum,line){
          return lineSum + (line.fifo || []).reduce(function(fifoSum,part){
            return fifoSum + number(part.qty)*number(part.uCost);
          },0);
        },0));
      },0);
    return {
      completedTransactions:sales.length+quick.length,
      activeLines:sales.reduce(function(sum,sale){ return sum+(sale.lines || []).length; },0) +
        quick.reduce(function(sum,txn){ return sum+((((txn.details || {}).lines) || []).length); },0),
      totalQuantity:round(receiptQty+quickQty),totalGrossSales:round(gross),totalCost:round(cost),
      grossProfit:round(gross-cost),
      reversedTransactions:(database.sales || []).filter(isReversed).length +
        (database.inventoryTxns || []).filter(function(txn){
          return String(txn.type || '').toUpperCase()==='SALE_OUT' && isReversed(txn);
        }).length
    };
  }

  function inventoryMetrics(database) {
    var rows = database.stockRows || [];
    return {
      qtyIn:round(rows.reduce(function(sum,row){ return sum+number(row.qtyIn); },0)),
      qtyOut:round(rows.reduce(function(sum,row){ return sum+number(row.qtyOut); },0)),
      remainingQty:round(rows.reduce(function(sum,row){ return sum+number(row.rStock); },0)),
      stockValue:round(rows.reduce(function(sum,row){ return sum+number(row.rStock)*number(row.uCost); },0))
    };
  }

  function financialMetrics(database) {
    return {
      cashBalance:round(Object.keys(database.cashBalances || {}).reduce(function(sum,key){
        return sum+number(database.cashBalances[key]);
      },0)),
      debtorOutstanding:round((database.debtors || []).reduce(function(sum,item){ return sum+number(item.balance); },0)),
      creditorOutstanding:round((database.creditors || []).reduce(function(sum,item){ return sum+number(item.balance); },0)),
      depositorOutstanding:round((database.depositors || []).reduce(function(sum,item){ return sum+number(item.balance); },0))
    };
  }

  function syncInfo() {
    var sync = window.ZEZMS && ZEZMS.cloudSync;
    var value = sync && sync.getState ? sync.getState() : {};
    return {
      deviceId:value.deviceId || '',deviceName:value.deviceName || 'ZEZMS Device',
      protocolVersion:sync && sync.protocolVersion || 'M4/3',cursor:number(value.cursor),
      lastSuccessfulSync:value.lastPullAt || value.lastPushAt || '',
      pendingOutbox:number(value.queueLength),failedOperations:number(value.failedCount),
      oldClientDetected:!!value.oldClientDetected,lastError:String(value.lastError || ''),
      rejected:!!value.lastRejected,integrityWarning:!!value.integrityWarning
    };
  }

  function localInvariants(database) {
    var rows = database.stockRows || [];
    var negativeStock = rows.filter(function(row){ return number(row.rStock) < -1e-6; });
    var protectedCashNegative = Object.keys(database.cashBalances || {}).filter(function(wallet){
      return wallet !== 'Others' && number(database.cashBalances[wallet]) < -1e-6;
    });
    var info = syncInfo();
    var invalidIdentityCount = COLLECTIONS.reduce(function(total,collection){
      return total + recordIndex(database,collection).invalid.length;
    },0);
    var cp = window.ZEZMS && ZEZMS.cloudSync && ZEZMS.cloudSync.getM43CheckpointState
      ? ZEZMS.cloudSync.getM43CheckpointState() : null;

    return [
      {name:'No negative remaining stock',status:negativeStock.length ? 'FAIL':'PASS',
        explanation:negativeStock.length ? negativeStock.length+' stock row(s) have negative remaining quantity.' : 'All FIFO rows have non-negative remaining quantity.'},
      {name:'Protected cash wallets are non-negative',status:protectedCashNegative.length ? 'FAIL':'PASS',
        explanation:protectedCashNegative.length ? protectedCashNegative.join(', ')+' below zero.' : 'All protected wallets are non-negative. Others is intentionally allowed to overdraft.'},
      {name:'Stable collection identities available',status:invalidIdentityCount ? 'WARNING':'PASS',
        explanation:invalidIdentityCount ? invalidIdentityCount+' record(s) lack a stable collection identity.' : 'All audited records have stable collection identities.'},
      {name:'M4/3 operational queue state',status:(info.pendingOutbox || info.failedOperations || info.oldClientDetected || info.lastError || info.rejected) ? 'WARNING':'PASS',
        explanation:'Queued '+info.pendingOutbox+', failed '+info.failedOperations+', old-client '+(info.oldClientDetected?'yes':'no')+'.'},
      {name:'Clean M4/3 checkpoint available',status:cp && cp.exists ? 'PASS':'INFO',
        explanation:cp && cp.exists ? 'Checkpoint cursor '+number(cp.cursor)+', hash '+String(cp.payloadHash || '')+'.' : 'No local checkpoint status is cached yet.'}
    ];
  }

  function localAudit(database) {
    if (!database) throw new Error('Local database is unavailable.');
    var started = performance.now ? performance.now() : Date.now();
    var collections = {};
    COLLECTIONS.forEach(function(collection){ collections[collection] = summarizeCollection(database,collection); });
    var audit = {
      generatedAt:new Date().toISOString(),collections:collections,sales:saleMetrics(database),
      inventory:inventoryMetrics(database),financial:financialMetrics(database),
      invariants:localInvariants(database)
    };
    var ended = performance.now ? performance.now() : Date.now();
    audit.durationMs = round(ended-started);
    audit.fingerprint = fingerprint({collections:collections,sales:audit.sales,inventory:audit.inventory,financial:audit.financial});
    return audit;
  }

  function findOrphans(database) {
    var items = [];
    (database.receipts || []).forEach(function(receipt){
      var id = String(receipt.receiptNo || receipt.id || '');
      if (id && !(database.sales || []).some(function(sale){
        return String(sale.receiptNo || sale.id || '') === id;
      })) items.push({category:'Orphan Reference',collection:'receipts',id:id,detail:'Receipt Without Sale'});
    });

    (database.warranties || []).forEach(function(warranty){
      var wid = entityKey('warranties',warranty);
      if (warranty.customerId && !(database.customers || []).some(function(customer){
        return String(customer.customerId || customer.id || '')===String(warranty.customerId);
      })) items.push({category:'Orphan Reference',collection:'warranties',id:wid,detail:'Missing Customer'});
      if (warranty.productId && !(database.products || []).some(function(product){
        return String(product.id || '')===String(warranty.productId);
      })) items.push({category:'Orphan Reference',collection:'warranties',id:wid,detail:'Missing Product'});
    });

    (database.warrantyClaims || []).forEach(function(claim){
      if (claim.warrantyId && !(database.warranties || []).some(function(warranty){
        return String(warranty.warrantyId || warranty.id || '')===String(claim.warrantyId);
      })) items.push({category:'Orphan Reference',collection:'warrantyClaims',
        id:entityKey('warrantyClaims',claim),detail:'Missing Warranty'});
    });

    (database.accountTxns || []).forEach(function(txn){
      var accounts = [].concat(database.debtors || [],database.creditors || [],database.depositors || []);
      if (txn.accountID && !accounts.some(function(account){
        return String(account.id || '')===String(txn.accountID);
      })) items.push({category:'Orphan Reference',collection:'accountTxns',
        id:entityKey('accountTxns',txn),detail:'Missing Account'});
    });
    return items;
  }

  function historicalOrphanSet(bundle) {
    var set = new Set();
    if (!(bundle && bundle.checkpoint && bundle.baseline)) return set;
    findOrphans(bundle.baseline).forEach(function(item){
      set.add([item.collection,item.id,item.detail].join('|'));
    });
    return set;
  }

  function applyProjectedPatch(database,patch,operation,conflicts,indexes) {
    if (!patch || !patch.action) return;
    var collection = patch.collection;

    if (patch.action === 'insert') {
      if (!Array.isArray(database[collection])) database[collection] = [];
      if (!indexes[collection]) indexes[collection] = recordIndex(database,collection).map;
      var key = String(patch.key || entityKey(collection,patch.value));
      var existing = indexes[collection].get(key);
      if (!existing) {
        var inserted = clone(patch.value);
        database[collection].push(inserted);
        indexes[collection].set(key,inserted);
      } else if (stableText(existing)!==stableText(patch.value)) {
        conflicts.push({category:'Duplicate ID',operationId:operation.opId || '',collection:collection,id:key});
      }
      return;
    }

    if (patch.action === 'delete') {
      if (!Array.isArray(database[collection])) return;
      var deleteKey = String(patch.key || entityKey(collection,patch.before || patch.value));
      database[collection] = database[collection].filter(function(item){
        return entityKey(collection,item)!==deleteKey;
      });
      indexes[collection] = recordIndex(database,collection).map;
      return;
    }

    if (patch.action === 'update') {
      if (!Array.isArray(database[collection])) database[collection] = [];
      if (!indexes[collection]) indexes[collection] = recordIndex(database,collection).map;
      var evidence = patch.value || patch.fallback || patch.before;
      var updateKey = String(entityKey(collection,evidence) || patch.key || '');
      var target = indexes[collection].get(updateKey);
      if (!target && patch.fallback) {
        target = clone(patch.fallback);
        database[collection].push(target);
        indexes[collection].set(updateKey,target);
        return;
      }
      if (!target) {
        conflicts.push({category:'Orphan Update',operationId:operation.opId || '',collection:collection,id:updateKey});
        return;
      }
      (patch.changes || []).forEach(function(change){
        if (change.mode === 'delta') target[change.field] = round(number(target[change.field])+number(change.value));
        else if (change.value === undefined) delete target[change.field];
        else target[change.field] = clone(change.value);
      });
      return;
    }

    if (patch.action === 'root-object') {
      if (!database[patch.root] || typeof database[patch.root] !== 'object') database[patch.root] = {};
      database[patch.root][patch.key] = patch.mode === 'delta'
        ? round(number(database[patch.root][patch.key])+number(patch.value)) : clone(patch.value);
      return;
    }

    if (patch.action === 'root-set') database[patch.root] = clone(patch.value);
  }

  function projectCloud(bundle) {
    var database = clone(bundle.baseline || {});
    var conflicts = [], indexes = {};
    COLLECTIONS.forEach(function(collection){ indexes[collection] = recordIndex(database,collection).map; });

    (bundle.operations || []).slice().sort(function(a,b){ return number(a.seq)-number(b.seq); }).forEach(function(row){
      var operation = clone(row.payload || {});
      operation.opId = operation.opId || row.op_id || '';
      (operation.patches || []).forEach(function(patch){
        applyProjectedPatch(database,patch,operation,conflicts,indexes);
      });
    });

    return {database:database,conflicts:conflicts};
  }

  function fieldDifferences(localRecord,cloudRecord) {
    var keys = Array.from(new Set(Object.keys(localRecord || {}).concat(Object.keys(cloudRecord || {})))).sort();
    return keys.filter(function(key){
      return !/password|secret|token|PIN/i.test(key) && stableText(localRecord[key])!==stableText(cloudRecord[key]);
    }).slice(0,20);
  }

  /* productId was locally derived for historical undo entries by the compact
     product-ID migration. Undo/reversal execution uses row, product, batch,
     quantity and FIFO evidence; it does not read this field. Preserve both
     payloads verbatim and retain the difference as INFO only when it is the
     sole field difference on an undoLog record. */
  function isHistoricalDerivedUndoMetadataDifference(collection,localRecord,cloudRecord) {
    if (collection !== 'undoLog') return false;
    var fields = fieldDifferences(localRecord,cloudRecord);
    return fields.length > 0 && fields.every(function(field){ return field === 'productId'; });
  }

  function compareDatabases(localDatabase,cloudDatabase,bundle) {
    var started = performance.now ? performance.now() : Date.now();
    var differences = [], collections = {};
    var historicalSet = historicalOrphanSet(bundle);

    COLLECTIONS.forEach(function(collection){
      var local = recordIndex(localDatabase,collection);
      var cloud = recordIndex(cloudDatabase,collection);
      var counts = {match:0,missingLocally:0,missingInCloud:0,mismatch:0,duplicateId:0,invalid:0,orphanReference:0,historicalReference:0,historicalMetadata:0};

      local.duplicates.forEach(function(key){ counts.duplicateId+=1;differences.push({category:'Duplicate ID',collection:collection,id:key,side:'Local'}); });
      cloud.duplicates.forEach(function(key){ counts.duplicateId+=1;differences.push({category:'Duplicate ID',collection:collection,id:key,side:'Cloud projection'}); });
      local.invalid.forEach(function(key){ counts.invalid+=1;differences.push({category:'Invalid',collection:collection,id:key,side:'Local'}); });
      cloud.invalid.forEach(function(key){ counts.invalid+=1;differences.push({category:'Invalid',collection:collection,id:key,side:'Cloud projection'}); });

      var keys = new Set(Array.from(local.map.keys()).concat(Array.from(cloud.map.keys())));
      keys.forEach(function(key){
        var l = local.map.get(key), c = cloud.map.get(key);
        if (!l) { counts.missingLocally+=1;differences.push({category:'Missing Locally',collection:collection,id:key,cloudHash:fingerprint(c)});return; }
        if (!c) { counts.missingInCloud+=1;differences.push({category:'Missing in Cloud',collection:collection,id:key,localHash:fingerprint(l)});return; }
        if (stableText(l)===stableText(c)) counts.match+=1;
        else if (isHistoricalDerivedUndoMetadataDifference(collection,l,c)) {
          counts.historicalMetadata+=1;
          differences.push({category:'Historical Derived Metadata',collection:collection,id:key,
            localHash:fingerprint(l),cloudHash:fingerprint(c),fields:fieldDifferences(l,c),info:true});
        } else {
          counts.mismatch+=1;
          differences.push({category:'Payload Mismatch',collection:collection,id:key,
            localHash:fingerprint(l),cloudHash:fingerprint(c),fields:fieldDifferences(l,c)});
        }
      });
      collections[collection]=counts;
    });

    findOrphans(localDatabase).forEach(function(item){
      var historyKey = [item.collection,item.id,item.detail].join('|');
      if (historicalSet.has(historyKey)) {
        item.category='Historical Reference';
        item.info=true;
        if (collections[item.collection]) collections[item.collection].historicalReference+=1;
      } else if (collections[item.collection]) collections[item.collection].orphanReference+=1;
      differences.push(item);
    });

    var sync = window.ZEZMS && ZEZMS.cloudSync;
    var cursor = sync && sync.getState ? number(sync.getState().cursor) : 0;
    var applied = sync && sync.getAppliedOperations ? sync.getAppliedOperations() : {};
    var unapplied = (bundle.operations || []).filter(function(row){
      return number(row.seq)<=cursor && !applied[row.op_id];
    }).map(function(row){
      return {seq:number(row.seq),opId:String(row.op_id || ''),kind:row.kind || ((row.payload || {}).kind) || 'TRANSACTION',deviceId:row.device_id || ''};
    });
    var outbox = sync && sync.getOutbox ? sync.getOutbox() : [];
    var expectedProtocol = String(bundle.protocolVersion || (sync && sync.protocolVersion) || 'M4/3');
    var oldProtocol = (bundle.operations || []).filter(function(row){
      return String((row.payload || {}).protocolVersion || 'M4/1')!==expectedProtocol;
    }).map(function(row){ return String(row.op_id || ''); });

    var actionable = differences.filter(function(item){
      return item.category!=='Historical Reference' && item.category!=='Historical Derived Metadata';
    });
    var ended = performance.now ? performance.now() : Date.now();

    return {
      generatedAt:new Date().toISOString(),collections:collections,differences:differences,
      actionableDifferences:actionable,historicalReferences:differences.filter(function(item){return item.category==='Historical Reference';}),
      historicalMetadata:differences.filter(function(item){return item.category==='Historical Derived Metadata';}),
      unappliedCloudOperations:unapplied,unacknowledgedLocalOperations:outbox,
      oldProtocolOperations:oldProtocol,durationMs:round(ended-started)
    };
  }

  function activeLocalWarning(audit) {
    return !!(audit && (audit.invariants || []).some(function(item){
      return item.status==='FAIL' || item.status==='WARNING';
    }));
  }

  function activeSyncWarning() {
    var info = syncInfo();
    return !!(info.pendingOutbox || info.failedOperations || info.oldClientDetected || info.lastError || info.rejected);
  }

  function setMessage(message,type) {
    state.message=message || '';
    state.messageType=type || 'ok';
    tryRender();
  }

  function tryRender() {
    try {
      if (typeof currentView!=='undefined' && currentView==='integrity' && typeof render==='function') render();
    } catch (_) {}
  }

  async function runLocalAudit(showNotice) {
    state.busy='Running local integrity audit…';tryRender();
    try {
      state.localAudit=localAudit(db());
      var warning=activeLocalWarning(state.localAudit) || activeSyncWarning();
      var sync=window.ZEZMS && ZEZMS.cloudSync;
      if (sync && sync.markIntegrityCheck) sync.markIntegrityCheck(state.localAudit.generatedAt,warning);
      if (showNotice!==false) setMessage('Local read-only integrity audit completed in '+state.localAudit.durationMs+' ms.',warning?'warn':'ok');
      return state.localAudit;
    } finally { state.busy='';tryRender(); }
  }

  async function compareCloud() {
    var sync=window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.fetchCloudAuditBundle) throw new Error('Cloud Sync M4/3 audit service is unavailable.');

    state.busy='Reconstructing Cloud from the clean M4/3 checkpoint…';tryRender();
    try {
      var bundle=await sync.fetchCloudAuditBundle();
      var projection=projectCloud(bundle);
      var report=compareDatabases(db(),projection.database,bundle);
      report.cloudProjectionConflicts=projection.conflicts;
      state.cloudBundle=bundle;
      state.cloudDatabase=projection.database;
      state.cloudReport=report;
      state.localAudit=localAudit(db());

      var warning=activeLocalWarning(state.localAudit) || activeSyncWarning() ||
        report.actionableDifferences.length>0 || report.unappliedCloudOperations.length>0 ||
        report.unacknowledgedLocalOperations.length>0 || report.cloudProjectionConflicts.length>0;

      if (sync.markIntegrityCheck) sync.markIntegrityCheck(state.localAudit.generatedAt,warning);

      if (warning) setMessage('Actionable integrity difference detected. Review the read-only details; no data was changed.','warn');
      else if (report.historicalReferences.length || report.historicalMetadata.length) {
        var retainedInfo=[];
        if (report.historicalReferences.length) retainedInfo.push(report.historicalReferences.length+' checkpoint-certified historical reference(s)');
        if (report.historicalMetadata.length) retainedInfo.push(report.historicalMetadata.length+' historical undo product-ID metadata difference(s)');
        setMessage('Cloud and Local have no actionable differences. '+retainedInfo.join(' and ')+' retained as INFO.','ok');
      } else setMessage('Cloud and Local match from the clean M4/3 checkpoint.','ok');

      return report;
    } finally { state.busy='';tryRender(); }
  }

  async function fullCatchUp() {
    var sync=window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.pullNow) throw new Error('Cloud Sync is unavailable.');
    state.busy='Receiving later Cloud operations…';tryRender();
    try { await sync.pullNow(true); return await compareCloud(); }
    finally { state.busy='';tryRender(); }
  }

  async function retryOutbox() {
    var sync=window.ZEZMS && ZEZMS.cloudSync;
    if (!sync || !sync.pushNow) throw new Error('Cloud Sync is unavailable.');
    await sync.pushNow(true);
    return await compareCloud();
  }

  function downloadJSON(value,name) {
    var blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  async function exportSnapshot() {
    var audit=state.localAudit || await runLocalAudit(false);
    var info=syncInfo(),collections={};
    COLLECTIONS.forEach(function(collection){
      collections[collection]={
        summary:clone(audit.collections[collection]),
        records:sortedRecords(db(),collection).map(function(record){
          return {id:entityKey(collection,record),hash:fingerprint(record),status:statusOf(record),date:recordDate(record)};
        })
      };
    });
    var snapshot={
      format:SNAPSHOT_FORMAT,generatedAt:new Date().toISOString(),
      module:{version:VERSION,build:BUILD},device:info,overallFingerprint:audit.fingerprint,
      collections:collections,sales:audit.sales,inventory:audit.inventory,financial:audit.financial
    };
    snapshot.snapshotHash=fingerprint(snapshot);
    downloadJSON(snapshot,'ZEZMS_Integrity_v2_'+String(info.deviceName || 'Device').replace(/[^a-z0-9_-]+/gi,'_')+'_'+snapshot.generatedAt.replace(/[:.]/g,'-')+'.json');
    setMessage('Integrity Core v2 snapshot downloaded. It contains IDs and hashes, not passwords or tokens.','ok');
  }

  function call(action) {
    Promise.resolve().then(action).catch(function(error){
      state.busy='';setMessage(error.message || String(error),'err');
    });
  }

  function badge(value) {
    var cls=value==='PASS'?'ok':value==='FAIL'?'danger':value==='WARNING'?'warn':'';
    return '<span class="badge '+cls+'">'+esc(value)+'</span>';
  }

  function metricsHTML(audit) {
    if (!audit) return '';
    var sale=audit.sales,inv=audit.inventory,fin=audit.financial;
    return '<div class="grid g3">'
      +'<div class="card"><h3>Sales fingerprint</h3>'
      +'<div class="statline"><span>Completed transactions</span><b>'+sale.completedTransactions+'</b></div>'
      +'<div class="statline"><span>Active lines</span><b>'+sale.activeLines+'</b></div>'
      +'<div class="statline"><span>Total quantity</span><b>'+sale.totalQuantity+'</b></div>'
      +'<div class="statline"><span>Gross sales</span><b>'+money(sale.totalGrossSales)+'</b></div>'
      +'<div class="statline"><span>Cost</span><b>'+money(sale.totalCost)+'</b></div>'
      +'<div class="statline"><span>Gross profit</span><b>'+money(sale.grossProfit)+'</b></div></div>'
      +'<div class="card"><h3>Inventory fingerprint</h3>'
      +'<div class="statline"><span>Qty In</span><b>'+inv.qtyIn+'</b></div>'
      +'<div class="statline"><span>Qty Out</span><b>'+inv.qtyOut+'</b></div>'
      +'<div class="statline"><span>Remaining Qty</span><b>'+inv.remainingQty+'</b></div>'
      +'<div class="statline"><span>Current Stock Value</span><b>'+money(inv.stockValue)+'</b></div></div>'
      +'<div class="card"><h3>Financial fingerprint</h3>'
      +'<div class="statline"><span>Cash Balance</span><b>'+money(fin.cashBalance)+'</b></div>'
      +'<div class="statline"><span>Debtor Outstanding</span><b>'+money(fin.debtorOutstanding)+'</b></div>'
      +'<div class="statline"><span>Creditor Outstanding</span><b>'+money(fin.creditorOutstanding)+'</b></div>'
      +'<div class="statline"><span>Depositor Outstanding</span><b>'+money(fin.depositorOutstanding)+'</b></div></div>'
      +'</div>';
  }

  function summaryTable(audit) {
    if (!audit) return '<p class="muted">Run Local Integrity Audit to calculate fingerprints.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Collection</th><th>Records</th><th>Active</th><th>Reversed</th><th>Fingerprint</th></tr></thead><tbody>'
      +COLLECTIONS.map(function(collection){
        var item=audit.collections[collection];
        return '<tr><td>'+esc(item.label)+'</td><td class="mono">'+item.count+'</td><td class="mono">'+item.active+'</td>'
          +'<td class="mono">'+item.reversed+'</td><td class="mono">'+esc(item.fingerprint)
          +(item.duplicateIds.length?'<br><small style="color:#fca5a5">'+item.duplicateIds.length+' duplicate ID(s)</small>':'')
          +(item.invalidIds.length?'<br><small style="color:#fca5a5">'+item.invalidIds.length+' invalid ID(s)</small>':'')
          +'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function comparisonHTML() {
    var report=state.cloudReport;
    if (!report) return '<p class="muted">No Cloud comparison has been run. Comparison is read-only.</p>';

    var totals={match:0,missingLocally:0,missingInCloud:0,mismatch:0,duplicateId:0,invalid:0,orphanReference:0,historicalReference:0,historicalMetadata:0};
    Object.keys(report.collections || {}).forEach(function(name){
      Object.keys(totals).forEach(function(key){ totals[key]+=number(report.collections[name][key]); });
    });

    var rows=(report.differences || []).slice(0,500).map(function(item){
      return '<tr><td>'+esc(item.category)+'</td><td>'+esc(LABELS[item.collection] || item.collection)+'</td>'
        +'<td class="mono">'+esc(item.id)+'</td><td><small>'
        +esc((item.fields || []).join(', ') || item.detail || item.side || '—')+'</small></td></tr>';
    }).join('');

    return '<div class="grid g3">'
      +'<div class="card"><div class="statline"><span>Match</span><b>'+totals.match+'</b></div>'
      +'<div class="statline"><span>Missing Locally</span><b>'+totals.missingLocally+'</b></div>'
      +'<div class="statline"><span>Missing in Cloud</span><b>'+totals.missingInCloud+'</b></div></div>'
      +'<div class="card"><div class="statline"><span>Payload Mismatch</span><b>'+totals.mismatch+'</b></div>'
      +'<div class="statline"><span>Duplicate ID</span><b>'+totals.duplicateId+'</b></div>'
      +'<div class="statline"><span>Unapplied Cloud Operations</span><b>'+report.unappliedCloudOperations.length+'</b></div></div>'
      +'<div class="card"><div class="statline"><span>Unacknowledged Local Operations</span><b>'+report.unacknowledgedLocalOperations.length+'</b></div>'
      +'<div class="statline"><span>Cloud replay conflicts</span><b>'+report.cloudProjectionConflicts.length+'</b></div>'
      +'<div class="statline"><span>Compare time</span><b>'+report.durationMs+' ms</b></div></div></div>'
      +'<div class="statline"><span>Invalid / Actionable Orphan Reference</span><b>'+totals.invalid+' / '+totals.orphanReference+'</b></div>'
      +'<div class="statline"><span>Historical archival references</span><b>'+totals.historicalReference+'</b></div>'
      +'<div class="statline"><span>Historical derived undo metadata</span><b>'+totals.historicalMetadata+'</b></div>'
      +'<div class="statline"><span>Legacy protocol operations in replay window</span><b>'+report.oldProtocolOperations.length+'</b></div>'
      +'<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Category</th><th>Collection</th><th>ID</th><th>Details</th></tr></thead><tbody>'
      +(rows || '<tr><td colspan="4">No record differences detected.</td></tr>')+'</tbody></table></div>';
  }

  function failedHTML() {
    var sync=window.ZEZMS && ZEZMS.cloudSync;
    var failed=sync && sync.getFailedOperations ? sync.getFailedOperations() : [];
    if (!failed.length) return '<p class="muted">No failed sync operations recorded on this device.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Operation ID</th><th>Entity</th><th>Stage</th><th>Category</th><th>Message</th></tr></thead><tbody>'
      +failed.map(function(item){
        return '<tr><td class="mono">'+esc(item.opId)+'</td><td>'+esc(item.entityType)+'<br><small>'+esc(item.entityId)+'</small></td>'
          +'<td>'+esc(item.stage)+'</td><td>'+esc(item.category)+'</td><td><small>'+esc(item.message)+'</small></td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function checkpointHTML() {
    var cp=window.ZEZMS && ZEZMS.cloudSync && ZEZMS.cloudSync.getM43CheckpointState
      ? ZEZMS.cloudSync.getM43CheckpointState() : null;
    if (!(cp && cp.exists)) return '<div class="card"><h3>M4/3 Checkpoint Boundary</h3><p class="muted">Checkpoint status is not cached on this device yet.</p></div>';
    return '<div class="card" style="border-color:#38bdf8"><h3>M4/3 Checkpoint Boundary</h3>'
      +'<div class="statline"><span>Checkpoint cursor</span><b>'+number(cp.cursor)+'</b></div>'
      +'<div class="statline"><span>Payload hash</span><b class="mono">'+esc(cp.payloadHash || '')+'</b></div>'
      +'<p class="muted">Cloud reconstruction starts from this immutable checkpoint. Earlier history remains archived outside ordinary replay diagnostics.</p></div>';
  }

  function viewHTML() {
    var info=syncInfo(),audit=state.localAudit,report=state.cloudReport;
    var actionableReport=!!(report && (report.actionableDifferences.length || report.unappliedCloudOperations.length ||
      report.unacknowledgedLocalOperations.length || (report.cloudProjectionConflicts || []).length));
    var warning=activeLocalWarning(audit) || activeSyncWarning() || actionableReport;

    var message=state.message
      ? '<div class="card" style="border-color:'+(state.messageType==='err'?'#ef4444':state.messageType==='warn'?'#f59e0b':'#10b981')+'"><b>'+esc(state.message)+'</b></div>'
      : '';

    var warningHTML=warning
      ? '<div class="card" style="border-color:#f59e0b;background:rgba(245,158,11,.08)"><h3>Actionable integrity issue detected.</h3><p class="muted">Diagnostics are read-only. Historical checkpoint-certified references do not trigger this warning.</p></div>'
      : '';

    return '<section id="syncIntegrityCenterV2" data-version="'+VERSION+'" data-build="'+BUILD+'">'
      +'<div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div>'
      +'<h2 style="margin:0">Data Integrity &amp; Sync</h2><p class="muted">Integrity Core v2 — standalone M4/3 checkpoint-aware diagnostics. Read-only by default.</p>'
      +'</div><span class="badge ok">'+esc(info.protocolVersion)+'</span></div>'
      +(state.busy?'<div class="card"><b>'+esc(state.busy)+'</b></div>':'')+message+warningHTML
      +'<div class="grid g3"><div class="card"><h3>Device identity</h3>'
      +'<div class="statline"><span>Local Device ID</span><b class="mono" style="font-size:10px">'+esc(info.deviceId || 'Unavailable')+'</b></div>'
      +'<div class="statline"><span>Device Name</span><b>'+esc(info.deviceName)+'</b></div>'
      +'<div class="statline"><span>Integrity Core</span><b>v'+VERSION+'<br><small>'+BUILD+'</small></b></div></div>'
      +'<div class="card"><h3>Sync state</h3><div class="statline"><span>Protocol</span><b>'+esc(info.protocolVersion)+'</b></div>'
      +'<div class="statline"><span>Server cursor</span><b>'+info.cursor+'</b></div><div class="statline"><span>Last successful sync</span><b>'+esc(info.lastSuccessfulSync || 'Never')+'</b></div></div>'
      +'<div class="card"><h3>Safety state</h3><div class="statline"><span>Pending Outbox</span><b>'+info.pendingOutbox+'</b></div>'
      +'<div class="statline"><span>Failed Operations</span><b>'+info.failedOperations+'</b></div>'
      +'<div class="statline"><span>Old-client detected</span><b>'+(info.oldClientDetected?'YES':'No')+'</b></div></div></div>'
      +'<div class="card"><div class="row" style="gap:8px;flex-wrap:wrap">'
      +'<button class="btn" onclick="ZEZMS.syncIntegrity.runLocalAudit()">Run Local Integrity Audit</button>'
      +'<button class="btn ghost" onclick="ZEZMS.syncIntegrity.compareCloud()">Compare Local vs Cloud</button>'
      +'<button class="btn ghost" onclick="ZEZMS.syncIntegrity.fullCatchUp()">Full Sync Audit / Catch Up</button>'
      +'<button class="btn ghost" onclick="ZEZMS.syncIntegrity.exportSnapshot()">Export Integrity Snapshot</button>'
      +'<button class="btn ghost" onclick="ZEZMS.syncIntegrity.retryOutbox()">Retry Pending Uploads</button>'
      +'</div></div>'
      +checkpointHTML()
      +metricsHTML(audit)
      +'<div class="card"><h3>Collection fingerprints</h3>'+summaryTable(audit)+'</div>'
      +'<div class="card"><h3>Machine-checkable invariants</h3>'
      +(audit ? audit.invariants.map(function(item){
        return '<div class="statline"><span>'+esc(item.name)+'<br><small>'+esc(item.explanation)+'</small></span><b>'+badge(item.status)+'</b></div>';
      }).join('') : '<p class="muted">Run the local audit first.</p>')+'</div>'
      +'<div class="card"><h3>Cloud-vs-Local audit</h3>'+comparisonHTML()+'</div>'
      +'<div class="card"><h3>Failed Sync Operations</h3>'+failedHTML()+'</div>'
      +'<div class="card"><h3>Recovery policy</h3><p class="muted">Integrity Core v2 performs no automatic reconciliation, majority-device overwrite, Stock Correction repair, receipt reconstruction or Cloud-master replacement. Any future repair must be implemented as a separate evidence-bounded recovery tool.</p></div>'
      +'</section>';
  }

  ZEZMS.syncIntegrity = {
    version:VERSION,build:BUILD,format:SNAPSHOT_FORMAT,viewHTML:viewHTML,
    runLocalAudit:function(){ call(function(){ return runLocalAudit(true); }); },
    compareCloud:function(){ call(compareCloud); },
    fullCatchUp:function(){ call(fullCatchUp); },
    retryOutbox:function(){ call(retryOutbox); },
    exportSnapshot:function(){ call(exportSnapshot); },
    getState:function(){ return clone(state); },
    _test:{
      entityKey:entityKey,fingerprint:fingerprint,recordIndex:recordIndex,findOrphans:findOrphans,
      historicalOrphanSet:historicalOrphanSet,projectCloud:projectCloud,compareDatabases:compareDatabases,
      localAudit:localAudit
    }
  };
}());
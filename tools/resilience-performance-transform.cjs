'use strict';
// Reviewed edits to the materialized delivery; historical modules remain intact.
function transformResiliencePerformance(source, transport, presentation) {
  function replace(before, after) {
    if (source.split(before).length !== 2) throw Error('RESILIENCE_MARKER_MISMATCH: '+before.slice(0,90));
    source=source.replace(before,()=>after);
  }
  function section(start, end, edit) {
    const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
    if(from<0||to<0)throw Error('RESILIENCE_SECTION_MISSING: '+start);
    const before=source.slice(from,to),after=edit(before);
    if(before===after)throw Error('RESILIENCE_SECTION_UNCHANGED: '+start);
    replace(before,after);
  }
  const capture = "ZEZMS.syncResilience.captureContext(function () { return {client:client, session:session, state:state, ownerId:currentSyncOwnerId()}; })";
  section('  async function pushOne(operation) {','  async function publishRoot(',()=>`  async function pushOne(operation) {
    const outgoing = wireOperation(operation);
    if (!operation._legacyPayload) sealOperation(outgoing);
    const scope = ${capture}, owner = scope.ownerId, wasLive = state.liveSyncEnabled;
    return ZEZMS.syncResilience.transport.push({
      operation:outgoing, hash:deterministicHash,
      contextValid:scope.valid,
      allowed:function () { return !!(scope.valid() && state.initialized && navigator.onLine && (!wasLive || state.liveSyncEnabled)); },
      send:function (signal) { return scope.client.rpc('zezms_ops_push', {p_operations:[outgoing]}).abortSignal(signal); },
      read:function (signal) { return scope.client.from(OPERATIONS_TABLE).select('seq,op_id,payload,created_at').eq('owner_id',owner).eq('op_id',outgoing.opId).maybeSingle().abortSignal(signal); }
    });
  }

`);
  section('  async function fetchOperationsAfter(cursor) {','  async function fetchAllOperationsAfter(',()=>`  async function fetchOperationsAfter(cursor) {
    const scope = ${capture}, owner = scope.ownerId;
    const response = await ZEZMS.syncResilience.transport.read(function (signal) {
      return scope.client.from(OPERATIONS_TABLE).select('seq,op_id,device_id,device_seq,kind,payload,client_created_at,created_at')
        .eq('owner_id',owner).gt('seq',Number(cursor)||0).order('seq',{ascending:true}).limit(PULL_PAGE_SIZE).abortSignal(signal);
    }, {contextValid:scope.valid});
    return ZEZMS.syncResilience.operationPage(response.data, Number(cursor)||0);
  }

`);
  section('  async function fetchMaster() {','  function recordFromResult(',()=>`  async function fetchMaster() {
    requireClient();
    const scope = ${capture}, owner = scope.ownerId;
    const response = await ZEZMS.syncResilience.transport.read(function (signal) {
      return scope.client.from(SNAPSHOT_TABLE).select('owner_id,payload,revision,operation_cursor,sync_mode,updated_at,updated_by')
        .eq('owner_id',owner).maybeSingle().abortSignal(signal);
    }, {contextValid:scope.valid});
    return response.data || null;
  }

`);
  replace("    const response = await client.rpc('zezms_m43_checkpoint_latest');", `    const scope = ${capture};
    const response = await ZEZMS.syncResilience.transport.read(function (signal) { return scope.client.rpc('zezms_m43_checkpoint_latest').abortSignal(signal); }, {contextValid:scope.valid}).catch(function (error) { return {error:error}; });`);
  replace(`  function pullNow(silent) {
    return serializeSync(function () { return pullNowCore(silent); });
  }`, `  var resilienceQueuedPull = null;
  function pullNow(silent) {
    if (silent !== true) return serializeSync(function () { return pullNowCore(silent); });
    if (resilienceQueuedPull && !resilienceQueuedPull.started && resilienceQueuedPull.scope.valid()) return resilienceQueuedPull.promise;
    const scope = ${capture}, slot = {scope:scope, started:false, promise:null};
    const result = serializeSync(function () {
      slot.started = true;
      if (!scope.valid()) throw Error('ZEZMS_SYNC_CONTEXT_CHANGED: queued background receive belongs to an earlier Cloud context.');
      return pullNowCore(true);
    });
    slot.promise = result;
    resilienceQueuedPull = slot;
    function settled() { if (resilienceQueuedPull === slot) resilienceQueuedPull = null; }
    result.then(settled, settled);
    return result;
  }`);
  // Duplicate correction IDs must identify the same immutable event. Validation
  // precedes the historical duplicate guard, including for replay/rebase.
  replace("    if (!operation || !Array.isArray(operation.patches)) return false;\n    const correctionInsert", "    if (!operation || !Array.isArray(operation.patches)) return false;\n    validateOperationIdentity(operation);\n    const correctionInsert");
  replace("      if (alreadyApplied) {\n        observedSnapshot = cleanSnapshot(database);", "      if (alreadyApplied) {\n        ZEZMS.syncResilience.sameCorrection(database.stockCorrections.find(function (record) { return String(record.correctionId || '') === String(correctionInsert.value.correctionId || ''); }), correctionInsert.value);\n        observedSnapshot = cleanSnapshot(database);");
  // Cache formatting machinery, never formatted balances or business models.
  for(const [start,end] of [
    ['  viewReceipts = function () {','  /* ---------------- Inventory'],
    ['  viewCash = function () {','  viewAccounts = function () {'],
    ['  viewAccounts = function () {','  function viewUndoTransactions()']
  ])section(start,end,block=>block.replace(/new Date\(([^()]+)\)\.toLocaleString\(\)/g,'ZEZMS.desktopPresentation.date($1, false)').replace(/new Date\(([^()]+)\)\.toLocaleDateString\(\)/g,'ZEZMS.desktopPresentation.date($1, true)'));
  replace("    const entries = DB.cashLog\n      .slice()\n      .sort((a, b) => new Date(b.at || b.date || 0) - new Date(a.at || a.date || 0))\n      .slice(0, 100);", "    const cashLinks = ZEZMS.desktopPresentation.cashLinks(DB.accountTxns,DB.expenses);\n    const entries = ZEZMS.desktopPresentation.newest(DB.cashLog, entry => entry.at || entry.date || 0).slice(0,100);");
  replace('      const accountTxn = accountTransactionForCash(entry.id, false);\n      const expense = expenseForCash(entry.id, false);','      const accountTxn = cashLinks.account(entry.id);\n      const expense = cashLinks.expense(entry.id);');
  replace("    let list = receiptRecords.concat(quickRecords)\n      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));", "    let list = ZEZMS.desktopPresentation.newest(receiptRecords.concat(quickRecords), record => record.date || 0);");
  replace("    const tabTransactions = DB.accountTxns\n      .filter((txn) => accountTransactionKind(txn) === accTab)\n      .slice()\n      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))\n      .slice(0, 100);", "    const tabTransactions = ZEZMS.desktopPresentation.newest(DB.accountTxns.filter(txn => accountTransactionKind(txn) === accTab), txn => txn.date || 0).slice(0,100);");
  replace('const recent = DB.stockRows.slice().reverse().slice(0,30)', 'const resolveRecentProductId = ZEZMS.desktopPresentation.productIds(DB.products);\n  const recent = DB.stockRows.slice(-30).reverse()');
  replace('esc(resolveProductId(r.productName,r.productId)||\'—\')','esc(resolveRecentProductId(r.productName,r.productId)||\'—\')');
  if(source.includes('data-zezms-sync-resilience'))throw Error('RESILIENCE_ALREADY_APPLIED');
  return source.replace('</head>','<script data-zezms-sync-resilience>\n'+transport+'\n</script><script data-zezms-desktop-presentation>\n'+presentation+'\n</script></head>');
}
module.exports={transformResiliencePerformance};

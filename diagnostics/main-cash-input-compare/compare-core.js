/* Pure, read-only summaries. No storage, network, or application mutation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZEZMSMainAuditInputCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLLECTIONS = Object.freeze([
    'sales','receipts','inventoryTxns','stockRows','purchaseOrders','cashLog','expenses',
    'debtors','creditors','depositors','accountTxns','products','stockCorrections','customers',
    'customerFollowups','quotations','salesOpportunities','warranties','warrantyClaims',
    'invoices','waybills','undoLog','saleLines','monthRollovers',
    'managementTargets','managementTargetHistory','managementScenarios',
    'managementAlertStates','managementAlertHistory','managementActionPlans',
    'managementActionTasks','managementActionHistory','managementExecutionHandoffs'
  ]);
  const EXCLUDED = /password|secret|token|publishableKey|adminPIN|pricePIN/i;
  function canonical(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonical);
    const out = {};
    Object.keys(value).sort().forEach(key => { if (!EXCLUDED.test(key)) out[key] = canonical(value[key]); });
    return out;
  }
  function stable(value) { return JSON.stringify(canonical(value)); }
  async function sha(value) {
    const text = typeof value === 'string' ? value : stable(value);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function totals(report) {
    const out = { match:0, missingLocally:0, missingInCloud:0, mismatch:0,
      duplicateId:0, invalid:0, orphanReference:0, historicalReference:0, historicalMetadata:0 };
    Object.values(report.collections || {}).forEach(row => {
      Object.keys(out).forEach(key => { out[key] += Number(row[key]) || 0; });
    });
    out.actionableDifferences = Array.isArray(report.actionableDifferences)
      ? report.actionableDifferences.length : (report.differences || []).length;
    out.unappliedCloudOperations = (report.unappliedCloudOperations || []).length;
    out.unacknowledgedLocalOperations = (report.unacknowledgedLocalOperations || []).length;
    out.replayConflicts = (report.cloudProjectionConflicts || []).length;
    return out;
  }
  function differenceCategories(report) {
    const out = {};
    (report.actionableDifferences || report.differences || []).forEach(row => {
      const key = String(row.category || 'Unknown') + '/' + String(row.collection || 'Unknown');
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }
  async function collections(database, r60o) {
    const out = {};
    for (const name of COLLECTIONS) {
      const rows = database && database[name];
      if (rows !== undefined && !Array.isArray(rows)) throw Error('INVALID_COLLECTION_SHAPE_' + name);
      const sorted = (rows || []).slice().sort((a, b) => {
        const ak = r60o.entityKey(name, a), bk = r60o.entityKey(name, b);
        return ak.localeCompare(bk) || stable(a).localeCompare(stable(b));
      });
      out[name] = { count:sorted.length, sha256:await sha(sorted) };
    }
    return out;
  }
  async function snapshotComparison(snapshot, database, r60o, expectedDeviceId) {
    if (!snapshot || snapshot.format !== 'ZEZMS-INTEGRITY-V2-SNAPSHOT/1' ||
        snapshot.module?.version !== '3.20.0' || snapshot.device?.deviceId !== expectedDeviceId ||
        !snapshot.collections || typeof snapshot.snapshotHash !== 'string')
      throw Error('INVALID_NORMAL_APP_SNAPSHOT');
    const copy = { ...snapshot }; delete copy.snapshotHash;
    if (r60o.fingerprint(copy) !== snapshot.snapshotHash) throw Error('SNAPSHOT_HASH_MISMATCH');
    const result = {};
    for (const name of COLLECTIONS) {
      const source = snapshot.collections[name]?.records;
      if (!Array.isArray(source)) throw Error('SNAPSHOT_COLLECTION_MISSING_' + name);
      const runtime = source.map(row => [String(row.id || ''), String(row.hash || '')])
        .sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      const persisted = (database[name] || []).map(row =>
        [String(r60o.entityKey(name,row)), String(r60o.fingerprint(row))])
        .sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
      result[name] = { runtimeCount:runtime.length, persistedCount:persisted.length,
        runtimeSha256:await sha(runtime), persistedSha256:await sha(persisted),
        equal:stable(runtime) === stable(persisted) };
    }
    return { generatedAt:snapshot.generatedAt, cursor:Number(snapshot.device.cursor),
      collections:result, differingCollections:Object.keys(result).filter(name => !result[name].equal) };
  }
  function firstStage(input) {
    if (!input.ownerContextMatch) return 'OWNER_OR_TENANT_CONTEXT';
    if (input.snapshot && (input.snapshot.differingCollections.length ||
        input.snapshot.cursor !== input.localCursor)) return 'RUNTIME_VERSUS_PERSISTED_LOCAL';
    if (!input.baselineEqual) return 'CLOUD_BASELINE';
    if (!input.operationWindowEqual) return 'OPERATION_WINDOW';
    if (!input.projectionEqual) return 'PROJECTION_RULES';
    if (!input.comparisonEqual) return 'COMPARISON_RULES';
    return input.snapshot ? 'NO_INPUT_DIVERGENCE' : 'NO_CLOUD_DIVERGENCE_RUNTIME_UNVERIFIED';
  }
  return Object.freeze({ COLLECTIONS, canonical, stable, sha, totals,
    differenceCategories, collections, snapshotComparison, firstStage });
});

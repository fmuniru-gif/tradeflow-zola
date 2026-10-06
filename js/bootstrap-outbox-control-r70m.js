/* R70M_BOOTSTRAP_OUTBOX_CONTROL_PLANE_START
 * ZEZMS TradeFlow v3.31.13 / r70M
 *
 * Final Cloud Sync closure extension. It is deliberately scoped to an
 * uncommitted, verified Safe Bootstrap stage. It never clears an outbox by
 * type-name alone: every patch must be identified, safe, and already
 * represented by the staged candidate before it can be discarded.
 */
var R70M_BUILD = '20261006-r70m-device-control-plane-stabilization';
var R70M_STAGE_KEY = 'zezms_m5a4_safe_bootstrap_stage_v1';
var R70M_JOURNAL_KEY = 'zezms_m5a4_safe_bootstrap_journal_v2';
var R70M_QUEUE_KEY = 'zezms_cloud_sync_m4_queue';
var R70M_CONTROL_ROOTS = ['sharedDeviceDirectory','settings','selectedYear','selectedMonth'];
var R70M_BUSINESS_ROOTS = ['cashBalances','business','security','warrantySettings'];
var R70M_BUSINESS_COLLECTIONS = ['sales','receipts','stockRows','inventoryTxns','cashLog','expenses','accountTxns','purchaseOrders','quotations','invoices','waybills','customers','debtors','creditors','depositors','undoLog','stockCorrections','warranties','warrantyClaims'];

function r70mCopy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function r70mText(value) { return String(value == null ? '' : value); }
function r70mEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function r70mReadBootstrapStage() {
  var staged = r70kReadStage ? r70kReadStage() : null;
  return staged && staged.version === 1 && staged.candidate ? staged : null;
}
function r70mBusinessRecordCount(database) {
  return R70M_BUSINESS_COLLECTIONS.reduce(function (total, key) {
    return total + (database && Array.isArray(database[key]) ? database[key].length : 0);
  }, 0);
}
function r70mPatchClassification(patch, candidate) {
  var copy = r70mCopy(patch || {});
  var root = r70mText(copy.root);
  var collection = r70mText(copy.collection);
  if (copy.action === 'root-set' && R70M_CONTROL_ROOTS.indexOf(root) >= 0) {
    if (candidate && r70mEqual(candidate[root], copy.value)) {
      return { classification:'SAFE_SETUP_RESIDUE', safe:true, reason:'The verified staged candidate already contains this exact control-plane root.', root:root, collection:'' };
    }
    return { classification:'UNKNOWN / REVIEW REQUIRED', safe:false, reason:'The staged candidate does not prove this control-plane value is already represented.', root:root, collection:'' };
  }
  if (R70M_BUSINESS_COLLECTIONS.indexOf(collection) >= 0 || R70M_BUSINESS_ROOTS.indexOf(root) >= 0 || copy.action === 'root-object') {
    return { classification:'BUSINESS_OPERATION', safe:false, reason:'This patch touches a business collection or a protected business/configuration root.', root:root, collection:collection };
  }
  return { classification:'UNKNOWN / REVIEW REQUIRED', safe:false, reason:'This patch is not in the narrow, proven control-plane allow-list.', root:root, collection:collection };
}
function r70mClassifyQueuedOperation(operation, candidate) {
  var patches = Array.isArray(operation && operation.patches) ? operation.patches : [];
  var patchReports = patches.map(function (patch) { return r70mPatchClassification(patch, candidate); });
  var allSafe = patches.length > 0 && patchReports.every(function (item) { return item.safe; });
  var classification = allSafe ? 'SAFE_SETUP_RESIDUE' : (patchReports.some(function (item) { return item.classification === 'BUSINESS_OPERATION'; }) ? 'BUSINESS_OPERATION' : 'UNKNOWN / REVIEW REQUIRED');
  return {
    operationId:r70mText(operation && operation.opId),
    createdAt:r70mText(operation && operation.createdAt),
    type:r70mText(operation && (operation.kind || operation.reason) || 'UNKNOWN'),
    source:r70mText(operation && operation.reason || 'local-save'),
    classification:classification,
    safeToDiscard:allSafe,
    reason:allSafe ? 'Every exact patch is setup residue and is already represented by the verified candidate.' : (patchReports.map(function (item) { return item.reason; }).filter(Boolean)[0] || 'No positively safe patch proof exists.'),
    patches:patches.map(function (patch, index) {
      return Object.assign({ index:index + 1, patch:r70mCopy(patch) }, patchReports[index]);
    })
  };
}
function r70mInspectBootstrapOutbox() {
  var staged = r70mReadBootstrapStage();
  var database = getDatabase();
  var rows = (queue || []).map(function (operation) { return r70mClassifyQueuedOperation(operation, staged && staged.candidate); });
  var safe = !!staged && r70mBusinessRecordCount(database) === 0 && (failedOperations || []).length === 0 && rows.every(function (row) { return row.safeToDiscard; });
  return {
    build:R70M_BUILD,
    inspectedAt:new Date().toISOString(),
    bootstrapStage:staged ? { lifecycleId:r70mText(staged.lifecycleId), deviceId:r70mText(staged.deviceId), cursor:Number(staged.cursor) || 0, attestedAt:r70mText(staged.attestedAt) } : null,
    queueCount:rows.length,
    failedOperationCount:(failedOperations || []).length,
    localBusinessRecordCount:r70mBusinessRecordCount(database),
    activationEligible:safe,
    rows:rows
  };
}
function r70mRequireActivationProof(proof, staged) {
  var context = proof && proof.context || {};
  if (!staged) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_STAGE_REQUIRED: A verified, uncommitted Safe Bootstrap stage is required.');
  if (!proof || !r70mEqual(staged.candidate, proof.candidate)) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_CANDIDATE_MISMATCH: The activation candidate is not the locally verified stage.');
  if (Number(proof.cursor) !== Number(staged.cursor)) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_CURSOR_MISMATCH: The verified stage cursor does not match activation proof.');
  if (r70mText(context.lifecycle_id || context.lifecycleId) !== r70mText(staged.lifecycleId)) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_LIFECYCLE_MISMATCH: Activation context does not match the verified lifecycle.');
  if (r70mText(context.device_id || context.deviceId) && r70mText(context.device_id || context.deviceId) !== r70mText(staged.deviceId)) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_DEVICE_MISMATCH: Activation context does not match the staged device.');
  if (r70mText(context.lifecycle_state || context.device_status).toUpperCase() !== 'ACTIVE') throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_OWNER_APPROVAL_REQUIRED: Owner approval is still required.');
}
function r70mReconcileBootstrapOutbox(proof) {
  var staged = r70mReadBootstrapStage();
  r70mRequireActivationProof(proof, staged);
  var inspection = r70mInspectBootstrapOutbox();
  if ((failedOperations || []).length) throw new Error('ZEZMS_BOOTSTRAP_FAILED_OPERATIONS_NOT_EMPTY: Resolve failed operations before activation.');
  if (inspection.localBusinessRecordCount !== 0) throw new Error('ZEZMS_BOOTSTRAP_LOCAL_BUSINESS_DATA_PRESENT: Local business work prevents Safe Bootstrap replacement.');
  if (!inspection.rows.every(function (row) { return row.safeToDiscard; })) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_REVIEW_REQUIRED: The bootstrap outbox contains a business or unknown patch; inspect it and do not discard it.');
  if (inspection.rows.length) {
    queue = [];
    persistQueue();
  }
  r67hPersist({
    r70mBootstrapOutboxReconciledAt:new Date().toISOString(),
    r70mBootstrapOutboxReconciledCount:inspection.rows.length,
    r70mBootstrapOutboxLastClassification:'SAFE_SETUP_RESIDUE',
    status:'ready',
    lastError:''
  }, false);
  return inspection;
}
function r70mSnapshotActivation() {
  return {
    database:r70mCopy(getDatabase()),
    observed:r70mCopy(observedSnapshot),
    syncState:r70mCopy(state),
    queue:r70mCopy(queue),
    applied:r70mCopy(appliedOperations || {}),
    stage:localStorage.getItem(R70M_STAGE_KEY),
    journal:localStorage.getItem(R70M_JOURNAL_KEY)
  };
}
function r70mRestoreActivation(snapshot) {
  DB = r70mCopy(snapshot.database);
  rawSaveDatabase();
  observedSnapshot = r70mCopy(snapshot.observed);
  queue = r70mCopy(snapshot.queue);
  persistQueue();
  state = r70mCopy(snapshot.syncState);
  persistState();
  r70kWriteAppliedRegistry(r70mCopy(snapshot.applied));
  if (snapshot.stage == null) localStorage.removeItem(R70M_STAGE_KEY); else localStorage.setItem(R70M_STAGE_KEY, snapshot.stage);
  if (snapshot.journal == null) localStorage.removeItem(R70M_JOURNAL_KEY); else localStorage.setItem(R70M_JOURNAL_KEY, snapshot.journal);
}
async function r70mActivateVerifiedBootstrap(candidate, proof) {
  var activationProof = Object.assign({}, proof || {}, { candidate:candidate });
  var snapshot = r70mSnapshotActivation();
  try {
    var inspection = r70mReconcileBootstrapOutbox(activationProof);
    commitM5a4BootstrapCandidate(candidate, activationProof);
    await activateM5a4Live();
    if ((queue || []).length || (failedOperations || []).length || !state.liveSyncEnabled) throw new Error('ZEZMS_BOOTSTRAP_ACTIVATION_POSTCONDITION_FAILED: Activation did not reach a clean live state.');
    r67hPersist({ r70mBootstrapActivationCompletedAt:new Date().toISOString(), r70mBootstrapOutboxInspection:inspection }, false);
    return { ok:true, inspection:inspection };
  } catch (error) {
    try { r70mRestoreActivation(snapshot); } catch (rollbackError) {
      throw new Error('ZEZMS_BOOTSTRAP_ACTIVATION_ROLLBACK_FAILED: '+r70mText(error && error.message || error)+'; rollback failed: '+r70mText(rollbackError && rollbackError.message || rollbackError));
    }
    throw error;
  }
}

/* While a verified candidate is staged, settings/directory hydration must not
 * turn candidate-equivalent control metadata into business outbox work. Any
 * unproven patch still follows the inherited queue path and blocks activation. */
var r70mBaseOnLocalSave = onLocalSave;
onLocalSave = function (reason) {
  var staged = r70mReadBootstrapStage();
  if (!staged || applyingRemote) return r70mBaseOnLocalSave(reason);
  var database = getDatabase();
  if (!database) return;
  var idChanged = ensureSyncIds(database);
  if (idChanged) rawSaveDatabase();
  var current = cleanSnapshot(database);
  if (!observedSnapshot) { observedSnapshot = current; return; }
  var operation = buildOperation(observedSnapshot, current, reason || 'database-save');
  observedSnapshot = current;
  if (!operation) return;
  var report = r70mClassifyQueuedOperation(operation, staged.candidate);
  if (report.safeToDiscard) {
    r67hPersist({ r70mSuppressedBootstrapHydrationCount:(Number(state.r70mSuppressedBootstrapHydrationCount) || 0) + 1, r70mLastSuppressedBootstrapHydration:report }, false);
    return;
  }
  queueOperation(operation);
};

var r70mPublicSync = window.ZEZMS && ZEZMS.cloudSync;
if (r70mPublicSync) {
  r70mPublicSync.onLocalSave = onLocalSave;
  r70mPublicSync.inspectM5a4BootstrapOutbox = r70mInspectBootstrapOutbox;
  r70mPublicSync.activateVerifiedBootstrapR70M = r70mActivateVerifiedBootstrap;
  r70mPublicSync._test.r70m = {
    classifyPatch:r70mPatchClassification,
    classifyOperation:r70mClassifyQueuedOperation,
    inspect:r70mInspectBootstrapOutbox,
    reconcile:r70mReconcileBootstrapOutbox,
    businessRecordCount:r70mBusinessRecordCount
  };
}
/* R70M_BOOTSTRAP_OUTBOX_CONTROL_PLANE_END */

/* Included inside the M4/3 closure. Interactive canonical recovery only.
 * No operation is uploaded or acknowledged by this bridge. */
var CANONICAL_PREPARATION_KEY = 'zezms_canonical_recovery_preparation_v1';
function canonicalRecoveryPreparation() {
  var raw = localStorage.getItem(CANONICAL_PREPARATION_KEY);
  if (raw === null) return null;
  try {
    var p = JSON.parse(raw);
    if (!p || p.version !== 1 || p.deviceId !== state.deviceId || !Array.isArray(p.operations)
        || !p.archiveKey || !p.safetyBackupName) throw new Error('invalid preparation');
    return p;
  } catch (_) { throw new Error('Canonical recovery preparation needs review; its preserved evidence was not changed.'); }
}
function canonicalRecoveryPreparationSummary() {
  try { var p = canonicalRecoveryPreparation(); return p ? { pending:true, count:p.operations.length, preparedAt:p.preparedAt, safetyBackupName:p.safetyBackupName } : null; }
  catch (_) { return { pending:true, invalid:true }; }
}
function inspectCanonicalRecoveryQueue(bundle) {
  if (!bundle || String(bundle.ownerId || bundle.syncOwnerId || currentSyncOwnerId()) !== String(currentSyncOwnerId()))
    throw new Error('Canonical recovery Cloud owner mismatch.');
  var plans = queue.map(function (operation) {
    if (!r70aRolloverDescriptor(operation)) throw new Error('Canonical Restore is blocked by an unsent business operation; it will not be discarded.');
    var wire = wireOperation(operation);
    if (!wire.payloadHash || wire.payloadHash !== deterministicHash(wire)) throw new Error('Queued rollover hash is invalid.');
    var matches = (bundle.operations || []).filter(function (r) { return r.op_id === operation.opId; });
    if (matches.length !== 1) throw new Error('Queued rollover has no unique retained Cloud authority.');
    var row = Object.assign({}, matches[0], { owner_id:matches[0].owner_id || currentSyncOwnerId() });
    var winner = r70aValidateAuthoritativeRollover(operation, row);
    return { opId:operation.opId, cloudSeq:Number(row.seq), rolloverId:winner.local.rolloverId };
  });
  return { count:plans.length, operations:plans };
}
async function pauseForCanonicalRecovery() {
  requireLocalOwner();
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  r67hManualPause();
  await serializeSync(function () { return true; });
  if (state.liveSyncEnabled || r67hDesired() || pushInFlight || pullInFlight)
    throw new Error('Canonical recovery could not obtain a paused sync boundary.');
  return true;
}
function prepareCanonicalRecovery(safetyBackupName) {
  return serializeSync(async function () {
    requireLocalOwner();
    var recovery = window.ZEZMS && ZEZMS.canonicalRestore;
    if (!recovery || !recovery.getState().executing || state.liveSyncEnabled || r67hDesired())
      throw new Error('An interactive, paused Canonical Restore is required.');
    if (failedOperations.length || localStorage.getItem(APPLY_JOURNAL_KEY))
      throw new Error('Resolve failed operations or the apply journal before recovery.');
    var previous = canonicalRecoveryPreparation();
    if (!queue.length) return previous ? canonicalRecoveryPreparationSummary() : null;
    var captured = JSON.stringify(queue), originalRaw = localStorage.getItem(QUEUE_KEY);
    if (originalRaw === null || JSON.stringify(JSON.parse(originalRaw)) !== captured)
      throw new Error('The durable and runtime queues differ.');
    if (previous && (JSON.stringify(previous.operations) !== captured || previous.originalQueueRaw !== originalRaw))
      throw new Error('Queue differs from the preserved recovery preparation.');
    var winners = [];
    for (var operation of queue) {
      // Fresh authenticated read. No fallback to pushOne/flushQueue is allowed.
      var winner = await r70aFindAuthoritativeRollover(operation);
      if (!winner) throw new Error('Queued rollover is not superseded by verified other-device Cloud authority.');
      winners.push(winner);
    }
    if (captured !== JSON.stringify(queue) || originalRaw !== localStorage.getItem(QUEUE_KEY))
      throw new Error('Queue changed during canonical recovery preparation.');
    var at = new Date().toISOString();
    var preparation = previous || { version:1, deviceId:state.deviceId, preparedAt:at,
      safetyBackupName:String(safetyBackupName || ''), originalQueueRaw:originalRaw,
      operations:clone(queue), authority:winners.map(function (w) { return { opId:w.row.op_id, seq:Number(w.row.seq), deviceId:w.row.device_id }; }),
      disposition:'PRESERVED_FOR_OWNER_CONFIRMED_CANONICAL_REPLACEMENT_NOT_UPLOADED',
      archiveKey:CANONICAL_PREPARATION_KEY + ':archive:' + at };
    if (!preparation.safetyBackupName) throw new Error('A pre-recovery safety backup is required.');
    var encoded = JSON.stringify(preparation);
    localStorage.setItem(CANONICAL_PREPARATION_KEY, encoded);
    if (localStorage.getItem(CANONICAL_PREPARATION_KEY) !== encoded) throw new Error('Recovery evidence readback failed.');
    localStorage.setItem(QUEUE_KEY, '[]');
    if (localStorage.getItem(QUEUE_KEY) !== '[]') throw new Error('Recovery queue write did not persist.');
    queue = [];
    // Record a verified Cloud rollover announcement, not acceptance of our payload.
    winners.forEach(function (w) { markRolloverAnnounced(w.local.rolloverId); });
    setState({ pending:false, status:'disabled', lastError:'' }, false);
    return canonicalRecoveryPreparationSummary();
  });
}
function completeCanonicalRecoveryPreparation() {
  var p = canonicalRecoveryPreparation();
  if (!p) return;
  requireLocalOwner();
  if (!localStorage.getItem('zezms_canonical_restore_pending_v1') || queue.length || failedOperations.length
      || !window.ZEZMS.canonicalRestore.getState().executing)
    throw new Error('Only successful canonical verification can complete preparation.');
  var encoded = JSON.stringify(p);
  var old = localStorage.getItem(p.archiveKey);
  if (old !== null && old !== encoded) throw new Error('Preserved recovery archive conflict.');
  localStorage.setItem(p.archiveKey, encoded);
  if (localStorage.getItem(p.archiveKey) !== encoded) throw new Error('Preserved recovery archive readback failed.');
  localStorage.removeItem(CANONICAL_PREPARATION_KEY);
  if (localStorage.getItem(CANONICAL_PREPARATION_KEY) !== null) throw new Error('Recovery preparation hold remains active.');
}

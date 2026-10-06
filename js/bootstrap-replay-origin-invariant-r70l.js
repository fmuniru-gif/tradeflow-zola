/*
 * ZEZMS TradeFlow v3.31.12 / r70L
 * Bootstrap replay materialization invariant.
 *
 * Injected into the final Cloud Sync closure after r70K.  The r70L builder
 * changes one inherited pull-loop decision to call the plan below.  Outside
 * an immediate verified Safe Bootstrap replay this plan preserves the
 * inherited own-device queue semantics exactly.
 */

/* R70L_BOOTSTRAP_REPLAY_ORIGIN_INVARIANT */
var R70L_BUILD = '20261006-r70l-bootstrap-replay-origin-invariant';
var r70lBootstrapReplayWindow = null;
var r70lLastBootstrapReplayDiagnostic = null;

function r70lClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function r70lWindowForRow(row) {
  if (!r70lBootstrapReplayWindow || !r70kCommitActivationAllowance) return false;
  var sequence = Number(row && row.seq) || 0;
  return sequence > Number(r70lBootstrapReplayWindow.boundary || 0);
}

function r70lRememberDiagnostic(row, operation, preview, code) {
  var diagnostic = {
    at:new Date().toISOString(),
    code:String(code || 'ZEZMS_BOOTSTRAP_REPLAY_MATERIALIZATION_UNPROVEN'),
    cursor:Number(row && row.seq) || 0,
    operationId:String(row && row.op_id || operation && operation.opId || ''),
    sourceDevice:String(row && row.device_id || operation && operation.deviceId || ''),
    conflicts:r70lClone(preview && preview.conflicts || []),
    expectedPatchCount:Array.isArray(operation && operation.patches) ? operation.patches.length : 0,
    replayablePatchCount:Number(preview && preview.changes) || 0
  };
  r70lLastBootstrapReplayDiagnostic = diagnostic;
  try {
    r67hPersist({
      r70lBootstrapReplayDiagnostic:diagnostic,
      r70lBootstrapReplayDiagnosticAt:diagnostic.at,
      integrityWarning:true
    }, false);
  } catch (_) {}
  return diagnostic;
}

/* Called from the inherited pull loop for every fetched row.  The normal
 * branch is intentionally byte-for-byte equivalent to the former condition.
 * The bootstrap branch deliberately ignores device origin and decides from
 * materialization evidence in the newly committed candidate database. */
function r70lBootstrapReplayPlan(row, operation, alreadyApplied, ownAcceptedFromQueue) {
  var inherited = {
    active:false,
    shouldApply:!alreadyApplied && (row.device_id !== state.deviceId || ownAcceptedFromQueue),
    operation:operation,
    preview:null
  };
  if (!r70lWindowForRow(row)) return inherited;
  var preview = prepareMissingOperation(operation);
  if (!preview.safe) {
    return { active:true, shouldApply:false, operation:operation, preview:preview, blocked:true };
  }
  return {
    active:true,
    shouldApply:!alreadyApplied && preview.changes > 0,
    operation:preview.operation,
    preview:preview,
    blocked:false
  };
}

/* This runs immediately before acknowledgement/cursor movement.  It is the
 * final invariant check for every operation in (bootstrap boundary, head]. */
function r70lAssertBootstrapReplayMaterialized(row, operation, plan) {
  if (!plan || !plan.active) return true;
  var after = prepareMissingOperation(operation);
  if (!after.safe || after.changes !== 0) {
    r70lRememberDiagnostic(row, operation, after, 'ZEZMS_BOOTSTRAP_REPLAY_MATERIALIZATION_UNPROVEN');
    throw new Error('ZEZMS_BOOTSTRAP_REPLAY_MATERIALIZATION_UNPROVEN: cursor '+String(row && row.seq || 0)+' cannot be acknowledged until its exact local business effects are present or effect-neutral.');
  }
  return true;
}

/* During the window this uses r70K's verified readback persistence routine.
 * A durable acknowledgement is therefore written only after the above proof.
 * Normal pull behavior retains the inherited bounded registry persistence. */
function r70lAcknowledgePulledOperation(opId, sequence, row, operation, plan) {
  r70lAssertBootstrapReplayMaterialized(row, operation, plan);
  appliedOperations[String(opId || '')] = Number(sequence) || 0;
  if (plan && plan.active) r70kWriteAppliedRegistry(appliedOperations);
  else persistAppliedOperations();
  return true;
}

/* r70K reconciles the registry before the inherited commit mutates DB.  This
 * outer transaction snapshot closes the remaining gap: if that inherited
 * commit throws after assigning DB (for example a local database-save error),
 * restore the database, observed snapshot, state, queue and registry together.
 */
var r70lBaseCommitM5a4BootstrapCandidate = commitM5a4BootstrapCandidate;
commitM5a4BootstrapCandidate = function (candidate, proof) {
  var previousDatabase = r70lClone(getDatabase());
  var previousObservedSnapshot = r70lClone(observedSnapshot);
  var previousState = r70lClone(state);
  var previousQueue = r70lClone(queue);
  var previousRegistry = r70lClone(appliedOperations || {});
  var boundary = Number(proof && proof.cursor);
  if (!Number.isSafeInteger(boundary) || boundary < 0) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_INVALID_BOUNDARY');
  try {
    var result = r70lBaseCommitM5a4BootstrapCandidate(candidate, proof);
    r70lBootstrapReplayWindow = { boundary:boundary, committedAt:new Date().toISOString() };
    r67hPersist({
      r70lBootstrapReplayBoundary:boundary,
      r70lBootstrapReplayWindow:'ACTIVE',
      r70lBootstrapReplayWindowStartedAt:r70lBootstrapReplayWindow.committedAt,
      r70lBootstrapReplayDiagnostic:null
    }, false);
    return result;
  } catch (error) {
    var rollbackError = null;
    try {
      DB = previousDatabase;
      rawSaveDatabase();
      observedSnapshot = previousObservedSnapshot;
      queue = previousQueue;
      persistQueue();
      state = previousState;
      persistState();
      r70kWriteAppliedRegistry(previousRegistry);
    } catch (failure) {
      rollbackError = failure;
    }
    r70lBootstrapReplayWindow = null;
    if (rollbackError) {
      throw new Error('ZEZMS_BOOTSTRAP_COMMIT_ROLLBACK_FAILED: '+String(error && error.message || error)+'; rollback failed: '+String(rollbackError && rollbackError.message || rollbackError));
    }
    throw error;
  }
};

var r70lBaseActivateM5a4Live = activateM5a4Live;
activateM5a4Live = async function () {
  try {
    var result = await r70lBaseActivateM5a4Live();
    r67hPersist({
      r70lBootstrapReplayWindow:'COMPLETED',
      r70lBootstrapReplayCompletedAt:new Date().toISOString()
    }, false);
    return result;
  } finally {
    /* A failed activation leaves the lifecycle stage intact.  A later explicit
     * finish attempt recommits the verified candidate and opens a fresh window. */
    r70lBootstrapReplayWindow = null;
  }
};

var r70lPublicSync = window.ZEZMS && ZEZMS.cloudSync;
if (r70lPublicSync) {
  r70lPublicSync.commitM5a4BootstrapCandidate = commitM5a4BootstrapCandidate;
  r70lPublicSync.activateM5a4Live = activateM5a4Live;
  r70lPublicSync._test.r70l = {
    plan:r70lBootstrapReplayPlan,
    assertMaterialized:r70lAssertBootstrapReplayMaterialized,
    recoverInterruptedApply:recoverInterruptedApply,
    getWindow:function () { return r70lClone(r70lBootstrapReplayWindow); },
    getDiagnostic:function () { return r70lClone(r70lLastBootstrapReplayDiagnostic); }
  };
}

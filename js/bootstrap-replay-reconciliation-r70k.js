/*
 * ZEZMS TradeFlow v3.31.11 / r70K
 * Safe Bootstrap replay reconciliation.
 *
 * This fragment is injected as the final extension inside the generated
 * Cloud Sync closure.  It does not call a write RPC and it never rewrites
 * Cloud history.  Its only local business mutation is a user-confirmed,
 * read-only-audited replay of an operation whose effects are proven absent.
 */

/* R70K_SAFE_BOOTSTRAP_REPLAY_RECONCILIATION */
var R70K_BUILD = '20261006-r70k-bootstrap-replay-reconciliation';
var R70K_STAGE_KEY = 'zezms_m5a4_safe_bootstrap_stage_v1';
var r70kCommitActivationAllowance = false;
var r70kLatestAudit = null;
var r70kLastRecovery = null;

function r70kClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function r70kText(value, fallback) {
  var text = String(value == null ? (fallback || '') : value);
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function r70kInt(value, label) {
  var number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('ZEZMS_BOOTSTRAP_REPLAY_INVALID_' + String(label || 'CURSOR').toUpperCase());
  }
  return number;
}

function r70kReadStage() {
  try {
    var stage = JSON.parse(localStorage.getItem(R70K_STAGE_KEY) || 'null');
    if (!stage || stage.version !== 1 || !stage.candidate || !Number.isSafeInteger(Number(stage.cursor))) return null;
    return stage;
  } catch (_) {
    return null;
  }
}

function r70kStagePending() {
  return !!r70kReadStage();
}

function r70kRequireNoPendingStage(action) {
  if (r70kStagePending() && !r70kCommitActivationAllowance) {
    throw new Error('ZEZMS_BOOTSTRAP_STAGED_REPLAY_BLOCKED: Safe Bootstrap is verified but has not been committed locally. ' + String(action || 'Live Sync') + ' is blocked until Owner activation completes.');
  }
}

/* The applied-operation registry is independent of the database.  Persist
 * and read it back before replacing a bootstrap candidate so a storage error
 * fails closed instead of leaving a cursor-only acknowledgement behind. */
function r70kWriteAppliedRegistry(next) {
  var normalized = {};
  var entries = Object.keys(next || {}).map(function (opId) {
    var sequence = Number(next[opId]);
    return { opId:String(opId), sequence:sequence };
  }).filter(function (entry) {
    return !!entry.opId && Number.isSafeInteger(entry.sequence) && entry.sequence > 0;
  }).sort(function (left, right) {
    return left.sequence - right.sequence || left.opId.localeCompare(right.opId);
  }).slice(-50000).sort(function (left, right) {
    return left.opId.localeCompare(right.opId);
  });
  entries.forEach(function (entry) {
    normalized[entry.opId] = entry.sequence;
  });
  var serialized = JSON.stringify(normalized);
  try {
    localStorage.setItem(APPLIED_KEY, serialized);
    var confirmed = localStorage.getItem(APPLIED_KEY);
    if (confirmed !== serialized) throw new Error('readback did not match');
  } catch (error) {
    throw new Error('ZEZMS_BOOTSTRAP_APPLIED_REGISTRY_PERSIST_FAILED: ' + r70kText(error && error.message || error));
  }
  appliedOperations = normalized;
  return normalized;
}

function r70kRegistryAtOrBefore(cursor) {
  var retained = {};
  Object.keys(appliedOperations || {}).forEach(function (opId) {
    var sequence = Number(appliedOperations[opId]);
    if (Number.isSafeInteger(sequence) && sequence > 0 && sequence <= cursor) retained[String(opId)] = sequence;
  });
  return retained;
}

function r70kPendingOutboxCount() {
  return Array.isArray(queue) ? queue.length : 0;
}

function r70kFailedOperationCount() {
  return Array.isArray(failedOperations) ? failedOperations.length : 0;
}

/* A staged candidate has been reconstructed at its own cursor.  Any applied
 * acknowledgement beyond that cursor belongs to the discarded pre-commit
 * local database and must not suppress the required replay. */
var r70kBaseCommitM5a4BootstrapCandidate = commitM5a4BootstrapCandidate;
commitM5a4BootstrapCandidate = function (candidate, proof) {
  var boundary = r70kInt(proof && proof.cursor, 'BOOTSTRAP_CURSOR');
  if (r70kPendingOutboxCount() !== 0) throw new Error('ZEZMS_BOOTSTRAP_OUTBOX_NOT_EMPTY: Safe Bootstrap cannot replace a database with queued local operations.');
  if (r70kFailedOperationCount() !== 0) throw new Error('ZEZMS_BOOTSTRAP_FAILED_OPERATIONS_NOT_EMPTY: Resolve failed operations before Safe Bootstrap activation.');

  var previousRegistry = r70kClone(appliedOperations || {});
  var retainedRegistry = r70kRegistryAtOrBefore(boundary);
  var discardedCount = Math.max(0, Object.keys(previousRegistry).length - Object.keys(retainedRegistry).length);
  r70kWriteAppliedRegistry(retainedRegistry);
  try {
    var committed = r70kBaseCommitM5a4BootstrapCandidate(candidate, proof);
    r70kCommitActivationAllowance = true;
    r67hPersist({
      r70kBootstrapBoundary: boundary,
      r70kBootstrapRegistryDiscarded: discardedCount,
      r70kBootstrapCommittedAt: new Date().toISOString(),
      r70kBootstrapReplayRequired: true,
      r70kBootstrapReplayVerifiedAt: ''
    }, false);
    return committed;
  } catch (error) {
    try { r70kWriteAppliedRegistry(previousRegistry); } catch (_) {}
    r70kCommitActivationAllowance = false;
    throw error;
  }
};

/* The stage remains in localStorage until managed-device-lifecycle-r61 has
 * observed a successful activation.  Block every ordinary pull/push/reconnect
 * while it exists; only the immediate post-commit activation path is allowed. */
var r70kBaseLifecycleAllowsSync = r67hLifecycleAllowsSync;
r67hLifecycleAllowsSync = function () {
  if (r70kStagePending() && !r70kCommitActivationAllowance) return false;
  return r70kBaseLifecycleAllowsSync();
};

var r70kBasePullNowCore = pullNowCore;
pullNowCore = async function (silent) {
  r70kRequireNoPendingStage('Cloud replay');
  return r70kBasePullNowCore(silent);
};

var r70kBaseFlushQueueCore = flushQueueCore;
flushQueueCore = async function (showNotice) {
  r70kRequireNoPendingStage('Cloud upload');
  return r70kBaseFlushQueueCore(showNotice);
};

var r70kBaseStartLiveSync = startLiveSync;
startLiveSync = async function (showNotice) {
  if (r70kStagePending() && !r70kCommitActivationAllowance) {
    r67hPersist({ status:'ready', lastError:'Safe Bootstrap is awaiting local activation; Live Sync remains blocked.' }, false);
    return false;
  }
  return r70kBaseStartLiveSync(showNotice);
};

var r70kBaseActivateM5a4Live = activateM5a4Live;
activateM5a4Live = async function () {
  if (!r70kCommitActivationAllowance) {
    throw new Error('ZEZMS_BOOTSTRAP_ACTIVATION_ORDER: Commit the verified Safe Bootstrap candidate before enabling Live Sync.');
  }
  try {
    var result = await r70kBaseActivateM5a4Live();
    r67hPersist({
      r70kBootstrapReplayRequired:false,
      r70kBootstrapReplayVerifiedAt:new Date().toISOString(),
      r70kBootstrapReplayCursor:Number(state.cursor) || 0
    }, false);
    return result;
  } finally {
    r70kCommitActivationAllowance = false;
  }
};

function r70kOperationIds(operation) {
  var result = { businessId:'', saleId:'', receiptId:'' };
  var source = operation || {};
  result.businessId = String(source.transactionId || source.transaction_id || source.businessTransactionId || source.business_transaction_id || '');
  result.saleId = String(source.saleId || source.sale_id || '');
  result.receiptId = String(source.receiptId || source.receipt_id || '');
  (source.patches || []).forEach(function (patch) {
    var collection = String(patch && patch.collection || '').toLowerCase();
    var key = String(patch && patch.key || '');
    if (collection === 'sales' && !result.saleId) result.saleId = key;
    if (collection === 'receipts' && !result.receiptId) result.receiptId = key;
  });
  if (!result.businessId) result.businessId = result.saleId || result.receiptId || '';
  return result;
}

function r70kAuditRow(row) {
  var operation = r70kClone(row && row.payload || {});
  operation.opId = operation.opId || row.op_id;
  operation.deviceId = operation.deviceId || row.device_id;
  operation.kind = operation.kind || row.kind;
  var preview = prepareMissingOperation(operation);
  var opId = String(row.op_id || operation.opId || '');
  var acknowledged = !!appliedOperations[opId];
  var materializationStatus;
  if (!preview.safe) materializationStatus = 'REQUIRES_REVIEW';
  else if (preview.changes > 0) materializationStatus = 'MISSING_EFFECTS';
  else materializationStatus = 'PRESENT_OR_EFFECT_NEUTRAL';
  var duplicateReason = acknowledged
    ? (materializationStatus === 'MISSING_EFFECTS'
      ? 'STALE_APPLIED_METADATA: r70J would treat this operation as already applied even though local effects are absent.'
      : 'ACKNOWLEDGED_IN_LOCAL_METADATA')
    : 'NOT_ACKNOWLEDGED_IN_LOCAL_METADATA';
  return {
    cursor:Number(row.seq) || 0,
    operationId:opId,
    transactionType:String(row.kind || operation.kind || 'TRANSACTION'),
    businessId:r70kOperationIds(operation).businessId,
    saleId:r70kOperationIds(operation).saleId,
    receiptId:r70kOperationIds(operation).receiptId,
    sourceDevice:String(row.device_id || operation.deviceId || ''),
    operationSignature:r70kOperationSignature(row),
    appliedOperationMetadata:acknowledged,
    appliedSequence:acknowledged ? Number(appliedOperations[opId]) || 0 : 0,
    expectedPatchCount:Array.isArray(operation.patches) ? operation.patches.length : 0,
    replayablePatchCount:preview.changes,
    materializationStatus:materializationStatus,
    duplicateOrIdempotencyDecision:duplicateReason,
    conflicts:(preview.conflicts || []).slice(0,12),
    safeForTargetedReplay:preview.safe && preview.changes > 0
  };
}

function r70kSanitizeAudit(audit) {
  return r70kClone({
    format:'ZEZMS-R70K-BOOTSTRAP-REPLAY-AUDIT/1',
    build:R70K_BUILD,
    readOnly:true,
    fromCursor:audit.fromCursor,
    toCursor:audit.toCursor,
    inspectedAt:audit.inspectedAt,
    deviceId:String(state.deviceId || ''),
    currentCursor:Number(state.cursor) || 0,
    rows:audit.rows
  });
}

/* This fetches operation-log records only.  It intentionally does not alter
 * cursor, queue, acknowledgement metadata, business records or Cloud state. */
async function r70kInspectBootstrapReplay(fromCursor, toCursor) {
  return serializeSync(async function () {
    requireClient();
    var from = r70kInt(fromCursor, 'FROM_CURSOR');
    var to = r70kInt(toCursor, 'TO_CURSOR');
    if (to < from) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_RANGE_INVALID');
    if (to - from > 1000) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_RANGE_TOO_LARGE: inspect no more than 1,000 operations at a time.');
    var rows = await r70kFetchRowsInRange(from, to);
    var audit = {
      fromCursor:from,
      toCursor:to,
      inspectedAt:new Date().toISOString(),
      rows:rows.map(r70kAuditRow)
    };
    r70kLatestAudit = audit;
    return r70kSanitizeAudit(audit);
  });
}

function r70kFetchRowsInRange(fromCursor, toCursor) {
  var rows = [];
  var next = Number(fromCursor) || 0;
  var to = Number(toCursor) || 0;
  return (async function () {
    while (next < to) {
      var page = await fetchOperationsAfter(next);
      if (!page.length) break;
      page.forEach(function (row) {
        var sequence = Number(row && row.seq) || 0;
        if (sequence > next && sequence <= to) rows.push(row);
      });
      var last = Number(page[page.length - 1] && page[page.length - 1].seq) || next;
      if (last <= next || last >= to || page.length < PULL_PAGE_SIZE) break;
      next = last;
    }
    return rows.sort(function (left, right) { return Number(left.seq) - Number(right.seq); });
  }());
}

function r70kOperationSignature(row) {
  var operation = r70kClone(row && row.payload || {});
  operation.opId = operation.opId || row.op_id;
  operation.deviceId = operation.deviceId || row.device_id;
  operation.kind = operation.kind || row.kind;
  return [Number(row && row.seq) || 0, String(row && row.op_id || ''), String(row && row.device_id || ''), deterministicHash(operation)].join('|');
}

async function r70kFetchAuditedRows(audit, requested) {
  var currentRows = (await r70kFetchRowsInRange(audit.fromCursor, audit.toCursor)).filter(function (row) {
    return requested.has(String(row && row.op_id || ''));
  });
  if (currentRows.length !== requested.size) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_OPERATION_MISSING_FROM_CLOUD: the audited Cloud operation set changed. Inspect again.');
  var recorded = {};
  audit.rows.forEach(function (item) { recorded[String(item.operationId)] = item; });
  currentRows.forEach(function (row) {
    var prior = recorded[String(row.op_id || '')];
    if (!prior || Number(prior.cursor) !== Number(row.seq) || !requested.has(String(row.op_id || '')) || prior.operationSignature !== r70kOperationSignature(row)) {
      throw new Error('ZEZMS_BOOTSTRAP_REPLAY_AUDIT_CHANGED: inspect again before replay.');
    }
  });
  return currentRows;
}

/* Targeted replay is deliberately unavailable until an audit has shown a
 * selected operation to be both missing and safe.  The local cursor stays
 * unchanged: it already names the Cloud head and must never be faked down. */
async function r70kReplayAuditedMissing(operationIds) {
  return serializeSync(async function () {
    if (!r70kLatestAudit) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_AUDIT_REQUIRED: run the read-only audit first.');
    requireClient();
    var requested = new Set((operationIds || []).map(String).filter(Boolean));
    if (!requested.size) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_SELECTION_REQUIRED');
    var auditedById = {};
    r70kLatestAudit.rows.forEach(function (item) { auditedById[String(item.operationId)] = item; });
    requested.forEach(function (opId) {
      var item = auditedById[opId];
      if (!item || !item.safeForTargetedReplay || item.materializationStatus !== 'MISSING_EFFECTS') {
        throw new Error('ZEZMS_BOOTSTRAP_REPLAY_NOT_PROVEN_SAFE: ' + opId);
      }
    });
    var rows = await r70kFetchAuditedRows(r70kLatestAudit, requested);
    var prepared = rows.map(function (row) {
      var operation = r70kClone(row.payload || {});
      operation.opId = operation.opId || row.op_id;
      operation.deviceId = operation.deviceId || row.device_id;
      operation.kind = operation.kind || row.kind;
      var preview = prepareMissingOperation(operation);
      if (!preview.safe || preview.changes <= 0) {
        throw new Error('ZEZMS_BOOTSTRAP_REPLAY_REVALIDATION_FAILED: ' + String(row.op_id || '') + ' is no longer a proven missing operation.');
      }
      return { row:row, operation:operation, preview:preview, signature:r70kOperationSignature(row) };
    });

    var databaseBefore = r70kClone(getDatabase());
    var appliedBefore = r70kClone(appliedOperations || {});
    var cursorBefore = Number(state.cursor) || 0;
    var results = [];
    try {
      prepared.forEach(function (item) {
        writeApplyJournal(item.row, item.preview.operation);
        applyOperation(item.preview.operation, { silent:true });
        var after = prepareMissingOperation(item.operation);
        if (!after.safe || after.changes !== 0) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_POSTCONDITION_FAILED: ' + String(item.row.op_id || ''));
        appliedOperations[String(item.row.op_id || '')] = Number(item.row.seq) || 0;
        r70kWriteAppliedRegistry(appliedOperations);
        var database = getDatabase();
        if (!Array.isArray(database.syncReconciliationLog)) database.syncReconciliationLog = [];
        database.syncReconciliationLog.push({
          at:new Date().toISOString(),
          opId:String(item.row.op_id || ''),
          action:'R70K_TARGETED_BOOTSTRAP_REPLAY',
          source:'Verified M4 Cloud sequence '+String(item.row.seq || 0),
          result:'SUCCESS'
        });
        database.syncReconciliationLog = database.syncReconciliationLog.slice(-500);
        rawSaveDatabase();
        observedSnapshot = cleanSnapshot(database);
        clearApplyJournal();
        results.push({ cursor:Number(item.row.seq) || 0, operationId:String(item.row.op_id || ''), signature:item.signature });
      });
      if (Number(state.cursor) !== cursorBefore) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_CURSOR_CHANGED: targeted materialization must not alter the acknowledged cursor.');
    } catch (error) {
      try {
        DB = databaseBefore;
        rawSaveDatabase();
        observedSnapshot = cleanSnapshot(getDatabase());
        r70kWriteAppliedRegistry(appliedBefore);
        clearApplyJournal();
      } catch (rollbackError) {
        throw new Error(r70kText(error && error.message || error) + ' Local rollback also failed: ' + r70kText(rollbackError && rollbackError.message || rollbackError));
      }
      throw error;
    }
    r70kLastRecovery = { at:new Date().toISOString(), fromCursor:r70kLatestAudit.fromCursor, toCursor:r70kLatestAudit.toCursor, results:results };
    r67hPersist({ r70kLastTargetedReplayAt:r70kLastRecovery.at, r70kLastTargetedReplayCount:results.length, r70kLastTargetedReplayCursor:cursorBefore }, false);
    try { if (typeof render === 'function') render(); } catch (_) {}
    return r70kClone(r70kLastRecovery);
  });
}

function r70kAuditSummaryHtml() {
  if (!r70kLatestAudit) return '<p class="muted">No replay-boundary audit has been run in this page session. Inspection is read-only.</p>';
  var rows = r70kLatestAudit.rows || [];
  var missing = rows.filter(function (row) { return row.safeForTargetedReplay; });
  var review = rows.filter(function (row) { return row.materializationStatus === 'REQUIRES_REVIEW'; });
  var html = '<p class="muted">Read-only audit: '+esc(rows.length)+' Cloud operation(s), '+esc(missing.length)+' proven missing/replayable, '+esc(review.length)+' requiring review.</p>';
  if (!rows.length) return html + '<p class="muted">No Cloud operations were returned in this cursor range.</p>';
  html += '<div style="overflow:auto"><table><thead><tr><th>Cursor</th><th>Operation</th><th>Type</th><th>Sale / receipt</th><th>Applied metadata</th><th>Materialization</th><th>Replay</th></tr></thead><tbody>';
  rows.forEach(function (row) {
    var ids = [row.saleId, row.receiptId].filter(Boolean).join(' / ') || row.businessId || '—';
    var selectable = row.safeForTargetedReplay ? '<input type="checkbox" data-r70k-replay-op="'+esc(row.operationId)+'" aria-label="Replay '+esc(row.operationId)+'">' : '—';
    html += '<tr><td>'+esc(row.cursor)+'</td><td class="mono">'+esc(row.operationId)+'</td><td>'+esc(row.transactionType)+'</td><td class="mono">'+esc(ids)+'</td><td>'+esc(row.appliedOperationMetadata ? 'Yes @ '+row.appliedSequence : 'No')+'</td><td>'+esc(row.materializationStatus)+'</td><td>'+selectable+'</td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function r70kRecoveryCardHtml() {
  var boundary = Number(state.r70kBootstrapBoundary);
  var current = Number(state.cursor) || 0;
  var defaultFrom = Number.isSafeInteger(boundary) && boundary >= 0 ? String(boundary) : '';
  var defaultTo = current > 0 ? String(current) : '';
  return '<div class="card" style="margin-top:12px;border-color:#f59e0b"><h3>Safe Bootstrap replay audit</h3>'+
    '<p class="muted">For a device whose cursor advanced after Safe Bootstrap but whose records do not match, inspect the precise Cloud cursor range first. This read-only audit does not alter Cloud history, cursor, queue, backups or business records.</p>'+
    '<div class="grid two"><label>Bootstrap boundary cursor<input id="r70kBootstrapFrom" inputmode="numeric" value="'+esc(defaultFrom)+'" placeholder="Example: 3173"></label><label>Cloud head cursor<input id="r70kBootstrapTo" inputmode="numeric" value="'+esc(defaultTo)+'" placeholder="Example: 3188"></label></div>'+
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="ZEZMS.bootstrapReplayRecovery.inspectFromUi()">Inspect replay boundary (read-only)</button><button class="btn secondary" onclick="ZEZMS.bootstrapReplayRecovery.downloadAudit()">Download audit</button><button class="btn warn" onclick="ZEZMS.bootstrapReplayRecovery.replaySelectedFromUi()">Replay selected proven-missing effects</button></div>'+
    r70kAuditSummaryHtml()+
    '<p class="muted"><small>Replay is enabled only for a selected operation whose Cloud record is unchanged, whose business effects are absent, and whose safe revalidation succeeds immediately before application. It never changes the acknowledged cursor.</small></p></div>';
}

async function r70kInspectFromUi() {
  var from = (document.getElementById('r70kBootstrapFrom') || {}).value;
  var to = (document.getElementById('r70kBootstrapTo') || {}).value;
  if (String(from == null ? '' : from).trim() === '' || String(to == null ? '' : to).trim() === '') {
    throw new Error('ZEZMS_BOOTSTRAP_REPLAY_RANGE_REQUIRED: Enter both the bootstrap boundary and Cloud-head cursor. Empty values are never interpreted as zero.');
  }
  var audit = await r70kInspectBootstrapReplay(from, to);
  notify('Read-only Safe Bootstrap replay audit completed: '+audit.rows.length+' operation(s).', 'ok');
  try { if (typeof render === 'function') render(); } catch (_) {}
  return audit;
}

function r70kDownloadAudit() {
  if (!r70kLatestAudit) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_AUDIT_REQUIRED: inspect the cursor range before downloading an audit.');
  var blob = new Blob([JSON.stringify(r70kSanitizeAudit(r70kLatestAudit), null, 2)], { type:'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'ZEZMS_Bootstrap_Replay_Audit_'+r70kLatestAudit.fromCursor+'_to_'+r70kLatestAudit.toCursor+'.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return true;
}

async function r70kReplaySelectedFromUi() {
  var selected = Array.prototype.slice.call(document.querySelectorAll('[data-r70k-replay-op]:checked')).map(function (input) { return String(input.getAttribute('data-r70k-replay-op') || ''); }).filter(Boolean);
  if (!selected.length) throw new Error('ZEZMS_BOOTSTRAP_REPLAY_SELECTION_REQUIRED: select a proven-missing operation first.');
  if (!window.confirm('Replay '+selected.length+' proven-missing Cloud operation(s) into this local device? Cloud history and the current cursor will not change.')) return false;
  var result = await r70kReplayAuditedMissing(selected);
  notify('Targeted replay completed for '+result.results.length+' verified missing operation(s).', 'ok');
  return result;
}

var r70kBaseSyncCardHtml = syncCardHtml;
syncCardHtml = function () {
  return r70kBaseSyncCardHtml() + r70kRecoveryCardHtml();
};

/* The public bridge is created before this final overlay in the inherited
 * runtime, so replace only its references with the guarded implementations. */
var r70kPublicSync = window.ZEZMS && ZEZMS.cloudSync;
if (r70kPublicSync) {
  r70kPublicSync.commitM5a4BootstrapCandidate = commitM5a4BootstrapCandidate;
  r70kPublicSync.activateM5a4Live = activateM5a4Live;
  r70kPublicSync.start = startLiveSync;
  r70kPublicSync.pullNow = pullNow;
  r70kPublicSync.syncCardHtml = syncCardHtml;
  r70kPublicSync.inspectBootstrapReplay = r70kInspectBootstrapReplay;
  r70kPublicSync.replayAuditedBootstrapEffects = r70kReplayAuditedMissing;
  r70kPublicSync.getBootstrapReplayAudit = function () { return r70kLatestAudit ? r70kSanitizeAudit(r70kLatestAudit) : null; };
  r70kPublicSync._test.r70k = {
    readStage:r70kReadStage,
    stagePending:r70kStagePending,
    auditRow:r70kAuditRow,
    registryAtOrBefore:r70kRegistryAtOrBefore,
    replayInvariant:function (audit) {
      return (audit && audit.rows || []).every(function (row) {
        return row.materializationStatus === 'PRESENT_OR_EFFECT_NEUTRAL';
      });
    }
  };
}

window.ZEZMS = window.ZEZMS || {};
window.ZEZMS.bootstrapReplayRecovery = {
  inspect:r70kInspectBootstrapReplay,
  inspectFromUi:function () { return r70kInspectFromUi().catch(function (error) { notify(r70kText(error && error.message || error), 'err'); throw error; }); },
  downloadAudit:function () { try { return r70kDownloadAudit(); } catch (error) { notify(r70kText(error && error.message || error), 'err'); throw error; } },
  replayAuditedMissing:r70kReplayAuditedMissing,
  replaySelectedFromUi:function () { return r70kReplaySelectedFromUi().catch(function (error) { notify(r70kText(error && error.message || error), 'err'); throw error; }); },
  getAudit:function () { return r70kLatestAudit ? r70kSanitizeAudit(r70kLatestAudit) : null; },
  getLastRecovery:function () { return r70kClone(r70kLastRecovery); }
};

/* M43_QUEUED_REBASE_R1_BEGIN
 * Only a queued M4/3 pull uses this synchronous persistence barrier. Business
 * patches and validation are unchanged. Intermediate inverse states never
 * reach storage. The existing apply-journal key commits DB then bookkeeping.
 */
var m43QueuedRebase = null;
var m43RebaseWritingDatabase = false;
var M43_REBASE_KIND = 'M43_QUEUED_REBASE_R1';
var m43RebaseBaseSave = ZEZMS.db && ZEZMS.db.save;
if (typeof m43RebaseBaseSave === 'function') ZEZMS.db.save = function(key, database) {
  if (key === 'tradeflow_v321_zola') {
    var raw = localStorage.getItem(APPLY_JOURNAL_KEY), pending = raw === null ? null : JSON.parse(raw);
    if (pending && pending.kind && !m43RebaseWritingDatabase) throw new Error('ZEZMS_REBASE_RECOVERY_REQUIRED');
  }
  return m43RebaseBaseSave.apply(this, arguments);
};
function m43RebaseKeys() { return [STATE_KEY, QUEUE_KEY, APPLIED_KEY, FAILED_KEY]; }
function m43RebaseRaw() { return m43RebaseKeys().map(function(key) { return localStorage.getItem(key); }); }
function m43RebaseWrite(key, text) {
  localStorage.setItem(key, text);
  if (localStorage.getItem(key) !== text) throw new Error('ZEZMS_REBASE_STORAGE_READBACK');
}
function m43RebaseClear(text) {
  if (localStorage.getItem(APPLY_JOURNAL_KEY) !== text) throw new Error('ZEZMS_REBASE_JOURNAL_CHANGED');
  localStorage.removeItem(APPLY_JOURNAL_KEY);
  if (localStorage.getItem(APPLY_JOURNAL_KEY) !== null) throw new Error('ZEZMS_REBASE_JOURNAL_RETAINED');
}
function m43RebaseHash(database) { return deterministicHash(database); }
function m43RebaseFinish(journal, text) {
  if (!journal || journal.kind !== M43_REBASE_KIND || journal.version !== 1 ||
      journal.protocolVersion !== PROTOCOL_VERSION || journal.deviceId !== state.deviceId ||
      !Array.isArray(journal.before) || journal.before.length !== 4 ||
      !Array.isArray(journal.after) || journal.after.length !== 4 ||
      !journal.after.every(function(value) { return typeof value === 'string'; }) ||
      typeof journal.beforeHash !== 'string' || typeof journal.afterHash !== 'string')
    throw new Error('ZEZMS_REBASE_JOURNAL_INVALID');
  var signed = clone(journal); delete signed.checksum;
  if (journal.checksum !== deterministicHash(signed)) throw new Error('ZEZMS_REBASE_JOURNAL_INVALID');
  var hash = m43RebaseHash(getDatabase());
  if (hash === journal.afterHash) {
    var next = journal.after.map(function(value) { return JSON.parse(value); });
    if (!next[0] || next[0].deviceId !== state.deviceId || !Array.isArray(next[1]) ||
        !next[2] || Array.isArray(next[2]) || !Array.isArray(next[3]))
      throw new Error('ZEZMS_REBASE_JOURNAL_INVALID');
    next[1].forEach(function(operation) {
      validateOperationIdentity(operation);
      if (operation.payloadHash && operation.payloadHash !== deterministicHash(operation)) throw new Error('ZEZMS_REBASE_JOURNAL_INVALID');
    });
    // Repeated finalization after a crash is idempotent. No business replay.
    m43RebaseKeys().forEach(function(key, index) { m43RebaseWrite(key, journal.after[index]); });
    state = next[0]; queue = next[1]; appliedOperations = next[2]; failedOperations = next[3];
    observedSnapshot = cleanSnapshot(getDatabase());
    m43RebaseClear(text);
    return true;
  }
  if (hash !== journal.beforeHash || JSON.stringify(m43RebaseRaw()) !== JSON.stringify(journal.before))
    throw new Error('ZEZMS_REBASE_STATE_UNPROVEN');
  // DB did not commit. Exact original queue/bookkeeping remain eligible.
  m43RebaseClear(text);
  return false;
}
function m43RebaseRecover() {
  var text = localStorage.getItem(APPLY_JOURNAL_KEY);
  if (!text) return false;
  var journal = JSON.parse(text);
  if (journal && journal.kind && journal.kind !== M43_REBASE_KIND) throw new Error('ZEZMS_REBASE_JOURNAL_INVALID');
  return journal && journal.kind === M43_REBASE_KIND ? m43RebaseFinish(journal, text) : false;
}
function m43RebaseBegin(rows) {
  if (m43QueuedRebase || localStorage.getItem(APPLY_JOURNAL_KEY) !== null)
    throw new Error('ZEZMS_REBASE_JOURNAL_PENDING');
  var database = getDatabase(), saved = localStorage.getItem(DB_KEY);
  if (!database || saved !== JSON.stringify(database) ||
      localStorage.getItem(QUEUE_KEY) !== JSON.stringify(queue))
    throw new Error('ZEZMS_REBASE_LOCAL_STATE_NOT_DURABLE');
  queue.forEach(function(operation) {
    validateOperationIdentity(operation);
    if (operation.payloadHash && operation.payloadHash !== deterministicHash(operation))
      throw new Error('ZEZMS_OPERATION_HASH_MISMATCH: queued operation failed rebase verification.');
    var accepted = rows.filter(function(row) { return row.op_id === operation.opId; });
    if (accepted.length > 1 || accepted.some(function(row) {
      return row.device_id !== operation.deviceId || !row.payload || row.payload.opId !== operation.opId ||
        deterministicHash(row.payload) !== deterministicHash(operation) ||
        (row.payload.payloadHash && row.payload.payloadHash !== deterministicHash(row.payload));
    })) throw new Error('ZEZMS_OPERATION_PAYLOAD_CONFLICT: pulled acknowledgment differs from the queued operation.');
  });
  m43QueuedRebase = { database:clone(database), state:clone(state), queue:clone(queue),
    applied:clone(appliedOperations), failed:clone(failedOperations), observed:clone(observedSnapshot),
    before:m43RebaseRaw(), databaseRaw:saved, journal:null, committed:false };
}
function m43RebaseCommit() {
  var transaction = m43QueuedRebase;
  if (!transaction) return;
  if (localStorage.getItem(DB_KEY) !== transaction.databaseRaw ||
      JSON.stringify(m43RebaseRaw()) !== JSON.stringify(transaction.before))
    throw new Error('ZEZMS_REBASE_CONCURRENT_STATE_CHANGED');
  var journal = { kind:M43_REBASE_KIND, version:1, protocolVersion:PROTOCOL_VERSION,
    deviceId:state.deviceId, beforeHash:m43RebaseHash(transaction.database),
    afterHash:m43RebaseHash(getDatabase()), before:transaction.before,
    after:[JSON.stringify(state), JSON.stringify(queue), JSON.stringify(appliedOperations), JSON.stringify(failedOperations)] };
  journal.checksum = deterministicHash(journal);
  transaction.journal = JSON.stringify(journal);
  m43RebaseWrite(APPLY_JOURNAL_KEY, transaction.journal);
  // Exactly one synchronous business DB write after all inverses/replay/reapply.
  m43QueuedRebase = null;
  try {
    m43RebaseWritingDatabase = true;
    try { rawSaveDatabase(); } finally { m43RebaseWritingDatabase = false; }
    if (localStorage.getItem(DB_KEY) !== JSON.stringify(getDatabase())) throw new Error('ZEZMS_REBASE_DATABASE_READBACK');
    transaction.committed = true;
    m43RebaseFinish(journal, transaction.journal);
  } catch (error) {
    m43QueuedRebase = transaction;
    throw error;
  }
}
function m43RebaseAbort() {
  var transaction = m43QueuedRebase;
  if (!transaction) return;
  m43QueuedRebase = null;
  if ((transaction.journal && localStorage.getItem(APPLY_JOURNAL_KEY) !== null && localStorage.getItem(APPLY_JOURNAL_KEY) !== transaction.journal) ||
      (localStorage.getItem(DB_KEY) !== transaction.databaseRaw && localStorage.getItem(DB_KEY) !== JSON.stringify(getDatabase()))) {
    observedSnapshot = null; initSettled = false;
    throw new Error('ZEZMS_REBASE_STATE_UNPROVEN');
  }
  if (transaction.committed || (transaction.journal &&
      localStorage.getItem(DB_KEY) === JSON.stringify(getDatabase()))) {
    // Business commit succeeded. Keep the journal; initialization must finish
    // exact bookkeeping before any new sync/local operation is eligible.
    observedSnapshot = null; initSettled = false;
    throw new Error('ZEZMS_REBASE_COMMIT_PENDING_RESTART');
  }
  DB = transaction.database; state = transaction.state; queue = transaction.queue;
  appliedOperations = transaction.applied; failedOperations = transaction.failed;
  observedSnapshot = transaction.observed; applyingRemote = false;
  if (transaction.journal && localStorage.getItem(APPLY_JOURNAL_KEY) === transaction.journal)
    m43RebaseClear(transaction.journal);
}
/* M43_QUEUED_REBASE_R1_END */

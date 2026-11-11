/* Injected inside the existing Cloud closure. No transport or financial rule
 * is replaced: existing patches are staged, then committed once as a unit. */
var syncDurabilityStaging = false;
function syncDurabilityNotify(rows) {
  const patches=[];
  rows.forEach(function(row){if(row && row.payload && Array.isArray(row.payload.patches))patches.push.apply(patches,row.payload.patches);});
  const events=[];
  if(patches.some(function(p){return p.action==='root-set' && p.root==='sharedDeviceDirectory';}))events.push('zezms-shared-device-directory-updated');
  if(patches.some(function(p){return p.collection==='customers';}))events.push('zezms-customer-master-updated');
  if(patches.some(function(p){return p.collection==='customerFollowups';}))events.push('zezms-customer-followups-updated');
  if(patches.some(function(p){return ['salesOpportunities','quotations','stockCorrections','warranties','warrantyClaims'].indexOf(p.collection)>=0 || p.action==='root-set' && p.root==='warrantySettings';}))events.push('zezms-stage6a-records-updated');
  events.forEach(function(name){try{window.dispatchEvent(new CustomEvent(name));}catch(_){}});
}
function syncDurabilityRun(kind, work) {
  if (syncDurabilityStaging) throw Error('ZEZMS_SYNC_DURABILITY_NESTED_COMMIT');
  const service=ZEZMS.syncDurability;
  if(service.pending())throw Error('ZEZMS_SYNC_DURABILITY_REVIEW_REQUIRED: reopen the app to verify the interrupted save.');
  if(ZEZMS.db && ZEZMS.db.assertCurrent)ZEZMS.db.assertCurrent(DB_KEY);
  const beforeRaw=localStorage.getItem(DB_KEY);
  const memory={database:getDatabase(),state:state,queue:queue,applied:appliedOperations,failed:failedOperations,observed:observedSnapshot};
  state=clone(state);queue=clone(queue);appliedOperations=clone(appliedOperations);failedOperations=clone(failedOperations);
  if(kind==='receive')DB=clone(getDatabase());
  syncDurabilityStaging=true;
  try {
    const result=work();
    const afterRaw=JSON.stringify(getDatabase());
    const next={};
    next[STATE_KEY]=JSON.stringify(state);next[QUEUE_KEY]=JSON.stringify(queue);
    next[APPLIED_KEY]=JSON.stringify(appliedOperations);next[FAILED_KEY]=JSON.stringify(failedOperations);
    syncDurabilityStaging=false;
    service.commit(kind,beforeRaw,afterRaw,next);
    if(ZEZMS.db && ZEZMS.db.acceptCommittedRaw)ZEZMS.db.acceptCommittedRaw(DB_KEY,afterRaw);
    observedSnapshot=cleanSnapshot(getDatabase());
    return result;
  } catch(error) {
    syncDurabilityStaging=false;
    // Restore the actual durable image, which may be either side of the save.
    // Retain the journal on any uncertain/partial commit; never replay deltas.
    const raw=localStorage.getItem(DB_KEY);
    DB=raw?JSON.parse(raw):memory.database;
    state=service.pending()?loadState():memory.state;
    queue=service.pending()?loadJSON(QUEUE_KEY,[]):memory.queue;
    appliedOperations=service.pending()?loadJSON(APPLIED_KEY,{}):memory.applied;
    failedOperations=service.pending()?loadJSON(FAILED_KEY,[]):memory.failed;
    observedSnapshot=cleanSnapshot(getDatabase());
    if(ZEZMS.db && ZEZMS.db.acceptCommittedRaw)ZEZMS.db.acceptCommittedRaw(DB_KEY,raw);
    if(pushTimer){clearTimeout(pushTimer);pushTimer=null;}
    throw error;
  }
}
function saveLocalDatabaseDurably() {
  if(applyingRemote || syncDurabilityStaging || !state.initialized || !observedSnapshot
    || state.configurationVerificationRequired || ZEZMS.bootstrapPhaseA.pending())return false;
  syncDurabilityRun('local-save',function(){onLocalSave('database-save');});
  return true;
}

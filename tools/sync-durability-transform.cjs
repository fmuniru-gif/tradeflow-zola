'use strict';
function transformSyncDurability(html,core,runtime,dbservice,edits){
 function replace(before,after){if(html.split(before).length!==2)throw Error('SYNC_DURABILITY_MARKER: '+before.slice(0,100));if(edits)edits.push([before,after]);html=html.replace(before,()=>after);}
 function section(start,end,fn){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);if(a<0||b<0)throw Error('SYNC_DURABILITY_SECTION: '+start);replace(html.slice(a,b),fn(html.slice(a,b)));}
 const head=html.indexOf('</head>');if(head<0)throw Error('SYNC_DURABILITY_HEAD');
 const prefix=html.slice(0,head);replace(prefix,prefix+'<script data-zezms-sync-durability>\n'+core+'\n</script>');
 replace('<script src="js/dbservice.js?v=20260812-portfolio-signals-r39"></script>','<script data-zezms-durable-dbservice>\n'+dbservice+'\n</script>');
 replace('  function persistState() {',runtime+'\n  function persistState() {');
 section('  function persistState() {','  function persistRejected() {',()=>`  function persistState() {
    if (syncDurabilityStaging || ZEZMS.syncDurability.pending()) return;
    ZEZMS.syncDurability.writeJSON(STATE_KEY,state);
  }

  function persistQueue() {
    if (syncDurabilityStaging) return;
    ZEZMS.syncDurability.writeJSON(QUEUE_KEY,queue);
  }

`);
 section('  function persistAppliedOperations() {','  function readApplyJournal() {',block=>block
  .replace("    try { localStorage.setItem(APPLIED_KEY, JSON.stringify(appliedOperations)); } catch (error) {\n      console.warn('M4 applied-operation register could not be saved', error);\n    }",'    if (!syncDurabilityStaging) ZEZMS.syncDurability.writeJSON(APPLIED_KEY,appliedOperations);')
  .replace("    try { localStorage.setItem(FAILED_KEY, JSON.stringify(failedOperations)); } catch (_) {}",'    if (!syncDurabilityStaging) ZEZMS.syncDurability.writeJSON(FAILED_KEY,failedOperations);'));
 replace('  function writeApplyJournal(row, operation) {','  function writeApplyJournal(row, operation) {\n    if (syncDurabilityStaging) return null;\n    if (readApplyJournal()) throw Error("ZEZMS_INTERRUPTED_APPLY_REVIEW_REQUIRED");');
 replace('  function clearApplyJournal() {\n    try { localStorage.removeItem(APPLY_JOURNAL_KEY); } catch (_) {}\n  }',`  function clearApplyJournal() {
    if (syncDurabilityStaging) return;
    localStorage.removeItem(APPLY_JOURNAL_KEY);
    if (localStorage.getItem(APPLY_JOURNAL_KEY)!==null) throw Error('ZEZMS_APPLY_JOURNAL_CLEAR_FAILED');
  }`);
 section('  function recoverInterruptedApply(database) {','  function recordFailedOperation(',()=>`  function recoverInterruptedApply(database) {
    const journal = readApplyJournal();
    if (!journal) return false;
    if (!journal.opId || !Number.isSafeInteger(Number(journal.seq)) || Number(journal.seq)<=0)
      throw Error('ZEZMS_INTERRUPTED_APPLY_REVIEW_REQUIRED: invalid journal retained.');
    const currentHash = deterministicHash(cleanSnapshot(database));
    if (journal.afterHash && journal.afterHash !== journal.beforeHash && currentHash === journal.afterHash) {
      appliedOperations[String(journal.opId)] = Number(journal.seq);
      persistAppliedOperations();
      state.cursor = Math.max(Number(state.cursor)||0,Number(journal.seq));
      state.cloudHeadSeq = Math.max(Number(state.cloudHeadSeq)||0,Number(journal.seq));
      state.lastInterruptedApplyRecoveredAt = new Date().toISOString();
      persistState();clearApplyJournal();return true;
    }
    if (currentHash === journal.beforeHash && !appliedOperations[String(journal.opId)] && Number(state.cursor||0)<Number(journal.seq)) {
      clearApplyJournal();return false;
    }
    throw Error('ZEZMS_INTERRUPTED_APPLY_REVIEW_REQUIRED: exact committed effects are unproven; journal retained.');
  }

`);
 section('  function rawSaveDatabase() {','  function preparePayload() {',block=>block
  .replace('    const database = getDatabase();','    if (syncDurabilityStaging) return;\n    const database = getDatabase();')
  .replace("    if (window.ZEZMS && ZEZMS.db",`    const journal=readApplyJournal();
    if(journal){
      journal.afterHash=deterministicHash(cleanSnapshot(database));
      const encoded=JSON.stringify(journal);localStorage.setItem(APPLY_JOURNAL_KEY,encoded);
      if(localStorage.getItem(APPLY_JOURNAL_KEY)!==encoded)throw Error('ZEZMS_APPLY_JOURNAL_READBACK_FAILED');
    }
    if (window.ZEZMS && ZEZMS.db`));
 section('  function applyOperation(operation, options) {','  function prepareMissingOperation(',block=>block.replace("    try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}\n    try { if (typeof sharedDeviceRefreshUsers === 'function') sharedDeviceRefreshUsers(false); } catch (_) {}", "    if (syncDurabilityStaging) return true;\n    try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}\n    try { if (typeof sharedDeviceRefreshUsers === 'function') sharedDeviceRefreshUsers(false); } catch (_) {}"));
 replace('      if (rowsToApply.length) {\n        const originalQueue', "      if (rowsToApply.length) {\n        syncDurabilityRun('receive',function () {\n        const originalQueue");
 replace("          persistQueue();\n          throw error;\n        }\n      }\n\n      setState({\n        lastPullAt:", "          persistQueue();\n          throw error;\n        }\n        });\n        try { if (typeof populateLoginCashiers === 'function') populateLoginCashiers(); } catch (_) {}\n        try { if (typeof sharedDeviceRefreshUsers === 'function') sharedDeviceRefreshUsers(false); } catch (_) {}\n        ['zezms-shared-device-directory-updated','zezms-customer-master-updated','zezms-customer-followups-updated','zezms-stage6a-records-updated'].forEach(function(name){try{window.dispatchEvent(new CustomEvent(name));}catch(_){}});\n      }\n\n      setState({\n        lastPullAt:");
 replace('function r70kWriteAppliedRegistry(next) {','function r70kWriteAppliedRegistry(next) {\n  if(syncDurabilityStaging){appliedOperations=clone(next);return;}');
 replace('function saveDB(){\n  ZEZMS.db.save(DB_KEY, DB);', "function saveDB(){\n  if(ZEZMS.cloudSync && ZEZMS.cloudSync.saveLocalDatabaseDurably && ZEZMS.cloudSync.saveLocalDatabaseDurably())return;\n  ZEZMS.db.save(DB_KEY, DB);");
 replace('    onLocalSave: onLocalSave,','    onLocalSave: onLocalSave,\n    saveLocalDatabaseDurably: saveLocalDatabaseDurably,');
 replace('function loadDB(){\n',"function loadDB(){\n  if(ZEZMS.syncDurability.pending()){const raw=ZEZMS.db.load(DB_KEY);if(!raw)throw Error('ZEZMS_SYNC_DURABILITY_DATABASE_MISSING');DB=typeof raw==='string'?JSON.parse(raw):raw;return;}\n");
 replace('      const recovery = ZEZMS.canonicalRestore;','      if (ZEZMS.syncDurability && ZEZMS.syncDurability.pending()) return false;\n      const recovery = ZEZMS.canonicalRestore;');
 replace('  async function initCore() {\n',"  async function initCore() {\n    if(ZEZMS.syncDurability.pending())throw Error(ZEZMS.syncDurability.startupError || 'ZEZMS_SYNC_DURABILITY_REVIEW_REQUIRED');\n");
 return html;
}
function withoutSyncDurability(html){
 if(!html.includes('<script data-zezms-sync-durability>'))return html;
 const fs=require('node:fs'),{execFileSync}=require('node:child_process'),delivery=require('./build-pr11-delivery.cjs');
 const before=execFileSync('git',['show','505e1d8d76aefe87692dbafbd4efb4103988729f:index.html'],{maxBuffer:32*1024*1024}).toString(),edits=[];
 transformSyncDurability(delivery.assembledShell(before).replace(/<meta name="zezms-delivery" content="[^"]+">/,''),...['sync-durability','sync-durability-runtime','dbservice'].map(f=>fs.readFileSync('js/'+f+'.js','utf8')),edits);
 for(const [old,next] of edits.reverse()){
   if(html.split(next).length!==2)throw Error('SYNC_DURABILITY_REVERSE_MARKER: '+next.slice(0,80));
   html=html.replace(next,()=>old);
 }
 return html;
}
module.exports={transformSyncDurability,withoutSyncDurability};

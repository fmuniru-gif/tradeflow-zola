/* A compact write-ahead journal for the local database and sync bookkeeping.
 * It stores exact post-commit sync metadata, with no auth-session tokens or
 * second database copy. Ambiguous state is retained, never guessed or replayed. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.ZEZMS = root.ZEZMS || {};
    root.ZEZMS.syncDurability = api.create({storage:root.localStorage});
    try { root.ZEZMS.syncDurability.recover(); }
    catch (error) { root.ZEZMS.syncDurability.startupError = String(error.message || error); }
  }
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const DB = 'tradeflow_v321_zola', JOURNAL = 'zezms_sync_durable_commit_v1';
  const STATE = 'zezms_cloud_sync_m4_state', QUEUE = 'zezms_cloud_sync_m4_queue';
  const APPLIED = 'zezms_cloud_sync_m4_applied_v2', FAILED = 'zezms_cloud_sync_m4_failed_v2';
  const KEYS = [STATE, QUEUE, APPLIED, FAILED];
  // Two independent 32-bit accumulators, used only for accidental-change
  // detection of exact raw strings. This is not an authentication primitive.
  function digest(raw) {
    if (raw === null) return 'ABSENT';
    let a=2166136261,b=0x9e3779b9;
    for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}
    return raw.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
  }
  function fail(message) { throw Error('ZEZMS_SYNC_DURABILITY_REVIEW_REQUIRED: '+message); }
  function binding(raw) {
    const s=JSON.parse(raw || 'null');
    if(!s || !s.deviceId) fail('device identity is unavailable.');
    return JSON.stringify(['deviceId','syncOwnerId','businessId','branchId','deviceAccessMode'].map(k=>String(s[k]||'')));
  }
  function create(options) {
    const storage=options.storage;
    function pending(){return storage.getItem(JOURNAL)!==null;}
    function write(key,raw){
      if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);
      if(storage.getItem(key)!==raw)fail('storage read-back failed for '+key+'.');
    }
    function clear(){write(JOURNAL,null);}
    function validate(j){
      if(!j || j.version!==1 || !['receive','local-save'].includes(j.kind) || !j.beforeDB || !j.afterDB
        || typeof j.binding!=='string' || !j.before || !j.after
        || Object.keys(j.before).sort().join('|')!==KEYS.slice().sort().join('|')
        || Object.keys(j.after).sort().join('|')!==KEYS.slice().sort().join('|'))fail('the interrupted-save journal is invalid.');
      for(const key of KEYS){if(typeof j.before[key]!=='string'||typeof j.after[key]!=='string')fail('journal metadata is invalid.');JSON.parse(j.after[key]);}
      if(binding(j.after[STATE])!==j.binding)fail('journal device binding differs.');
      if(!Array.isArray(JSON.parse(j.after[QUEUE])) || !Array.isArray(JSON.parse(j.after[FAILED])))fail('journal lists are invalid.');
      const a=JSON.parse(j.after[APPLIED]);if(!a || typeof a!=='object' || Array.isArray(a))fail('journal register is invalid.');
    }
    function recover(){
      const raw=storage.getItem(JOURNAL);if(raw===null)return 'ABSENT';
      let j;try{j=JSON.parse(raw);}catch(_){fail('the interrupted-save journal cannot be read.');}validate(j);
      if(binding(storage.getItem(STATE))!==j.binding)fail('the current device binding changed.');
      const current=digest(storage.getItem(DB));
      // No business save happened: metadata must still be the exact before-
      // image. Never acknowledge an operation just because something changed.
      if(current===j.beforeDB && current!==j.afterDB){
        if(KEYS.some(k=>digest(storage.getItem(k))!==j.before[k]))fail('metadata changed before the database commit.');
        clear();return 'NOT_COMMITTED';
      }
      if(current!==j.afterDB)fail('the saved database matches neither verified result.');
      if(KEYS.some(k=>digest(storage.getItem(k))!==j.before[k] && storage.getItem(k)!==j.after[k]))
        fail('unrelated sync metadata changed during the interrupted save.');
      for(const key of KEYS)write(key,j.after[key]);
      clear();return 'COMMITTED';
    }
    function commit(kind,beforeDB,afterDB,after){
      if(pending())fail('finish the previous interrupted save first.');
      if(typeof beforeDB!=='string'||typeof afterDB!=='string')fail('the durable database is unavailable.');
      if(storage.getItem(DB)!==beforeDB)fail('another window changed the database; reopen this window.');
      const before=Object.fromEntries(KEYS.map(k=>[k,digest(storage.getItem(k))]));
      const j={version:1,kind,binding:binding(storage.getItem(STATE)),beforeDB:digest(beforeDB),afterDB:digest(afterDB),before,after,at:new Date().toISOString()};
      validate(j);
      const encoded=JSON.stringify(j);write(JOURNAL,encoded);
      // The complete database is the commit decision. Temporary inverse/rebase
      // states never reach storage. Bookkeeping is advanced only afterwards.
      if(storage.getItem(DB)!==beforeDB || KEYS.some(k=>digest(storage.getItem(k))!==before[k]))fail('storage changed before commit.');
      write(DB,afterDB);
      for(const key of KEYS)write(key,after[key]);
      clear();
      return true;
    }
    function writeJSON(key,value){
      if(pending())fail('an interrupted local save is awaiting verification.');
      write(key,JSON.stringify(value));
    }
    return {pending,recover,commit,writeJSON,startupError:'',keys:{DB,JOURNAL,STATE,QUEUE,APPLIED,FAILED}};
  }
  return {create,digest,DB,JOURNAL,STATE,QUEUE,APPLIED,FAILED,KEYS};
}));

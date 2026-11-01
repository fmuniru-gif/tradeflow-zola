'use strict';
// Scoped, reversible change to the authoritative embedded M4/3 closure.
// `before` supplies identity evidence; fallback stays null so missing rows fail.
const oldUpdate="        action: 'update', collection: patch.collection, key: patch.key,\n        fallback: null,\n        changes: patch.changes.map(function (change) {";
const newUpdate="        action: 'update', collection: patch.collection, key: patch.key,\n        before: clone(patch.fallback || patch.value || patch.before),\n        fallback: null,\n        changes: patch.changes.map(function (change) {";
function replaceOne(source,from,to){if(source.split(from).length!==2)throw Error('M43_INVERSE_FIX_SOURCE_MISMATCH');return source.replace(from,()=>to);}
function edits(){
 const fs=require('node:fs'),path=require('node:path');
 const body=fs.readFileSync(path.join(__dirname,'m43-queued-rebase-body.js'),'utf8').replace(/\r\n/g,'\n');
 return [
  [oldUpdate,newUpdate],
  ['  function persistState() {',body+'\n  function persistState() {\n    if (m43QueuedRebase) return;'],
  ['  function persistQueue() {','  function persistQueue() {\n    if (m43QueuedRebase) return;'],
  ['  function isReadyForLocalOperations() {','  function isReadyForLocalOperations() {\n    if (localStorage.getItem(\'zezms_m43_reconciliation_stage_v1\') !== null) return false;'],
  ['    try { localStorage.setItem(APPLIED_KEY, JSON.stringify(appliedOperations)); }','    if (m43QueuedRebase) return;\n    try { localStorage.setItem(APPLIED_KEY, JSON.stringify(appliedOperations)); }'],
  ['    try { localStorage.setItem(FAILED_KEY, JSON.stringify(failedOperations)); }','    if (m43QueuedRebase) return;\n    try { localStorage.setItem(FAILED_KEY, JSON.stringify(failedOperations)); }'],
  ['  function writeApplyJournal(row, operation) {','  function writeApplyJournal(row, operation) {\n    if (m43QueuedRebase) return { queuedRebase:true };'],
  ['  function clearApplyJournal() {','  function clearApplyJournal() {\n    if (m43QueuedRebase) return;'],
  ['  function rawSaveDatabase() {','  function rawSaveDatabase() {\n    if (m43QueuedRebase) return;'],
  ['  function requireClient() {','  function requireClient() {\n    if (localStorage.getItem(\'zezms_m43_reconciliation_stage_v1\') !== null) throw new Error(\'ZEZMS_RECONCILIATION_MAINTENANCE_HOLD\');\n    var pending = readApplyJournal();\n    if (pending && pending.kind === M43_REBASE_KIND) throw new Error(\'ZEZMS_REBASE_RECOVERY_REQUIRED\');'],
  ['  var serialized = JSON.stringify(normalized);\n  try {\n    localStorage.setItem(APPLIED_KEY, serialized);',
   '  if (m43QueuedRebase) { appliedOperations = normalized; return true; }\n  var serialized = JSON.stringify(normalized);\n  try {\n    localStorage.setItem(APPLIED_KEY, serialized);'],
  ['    failedOperations = loadJSON(FAILED_KEY, []);\n    if (r70sDirectoryQueueHold)', '    failedOperations = loadJSON(FAILED_KEY, []);\n    m43RebaseRecover();\n    if (r70sDirectoryQueueHold)'],
  ['        originalQueue.slice().reverse().forEach(applyInverseOperation);',
   '        if (originalQueue.length && PROTOCOL_VERSION === \'M4/3\') m43RebaseBegin(rowsToApply);\n        try {\n        originalQueue.slice().reverse().forEach(applyInverseOperation);'],
  ['          persistQueue();\n          throw error;\n        }\n      }\n\n      setState({\n        lastPullAt:',
   '          persistQueue();\n          throw error;\n        }\n        m43RebaseCommit();\n        } catch (error) {\n          m43RebaseAbort();\n          throw error;\n        }\n      }\n\n      setState({\n        lastPullAt:']
 ];
}
function patch(source){for(const [from,to]of edits())source=replaceOne(source,from,to);return source;}
function unpatch(source){for(const [from,to]of edits().reverse())source=replaceOne(source,to,from);return source;}
function originalShell(shell){return shell.replace(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/,(_all,b64)=>{let cloud=Buffer.from(b64,'base64').toString('utf8');if(cloud.includes('M43_QUEUED_REBASE_R1_BEGIN'))cloud=unpatch(cloud);return 'const CLOUD_B64="'+Buffer.from(cloud).toString('base64')+'";';});}
module.exports={patch,unpatch,originalShell};
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const root=path.resolve(__dirname,'..'),file=path.join(root,'index.html'),shell=fs.readFileSync(file,'utf8');
 const pattern=/const CLOUD_B64="([A-Za-z0-9+/=]+)";/,match=shell.match(pattern);
 if(!match)throw Error('M43_EMBEDDED_CLOUD_MISSING');
 let cloud=Buffer.from(match[1],'base64').toString('utf8');
 // The first targeted identity-only candidate may already be in the worktree.
 if(cloud.includes(newUpdate)&&!cloud.includes('M43_QUEUED_REBASE_R1_BEGIN'))cloud=replaceOne(cloud,newUpdate,oldUpdate);
 if(crypto.createHash('sha256').update(cloud).digest('hex')!=='9f2b0ee1cdd80aa280b222a9aa56c2af99e87212c060edb3120a600a5ca144f1')throw Error('M43_PRODUCTION_SOURCE_MISMATCH');
 fs.writeFileSync(file,shell.replace(pattern,()=> 'const CLOUD_B64="'+Buffer.from(patch(cloud)).toString('base64')+'";'));
}

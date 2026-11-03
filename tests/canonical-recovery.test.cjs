const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/../js/canonical-restore.js', 'utf8');
function fixture(options = {}) {
  const state = { initialized:true, deviceId:'synthetic-main', deviceName:'Synthetic Main', queueLength:0, failedCount:0, cursor:3979, liveSyncEnabled:true, liveSyncDesired:true, lastError:'' };
  const storage = new Map();
  const candidate = { products:[], stockRows:[], sales:[], cashBalances:{Cash:10}, selectedYear:2026, selectedMonth:11, business:{id:'synthetic'}, settings:{}, warrantySettings:{} };
  const original = structuredClone(candidate);
  original.sentinel = 'original';
  const counts = { durableWrites:0, safetyBackups:0, confirmations:0, auditReads:0 };
  const bundle = { headSeq:3979, baselineCursor:1267, checkpoint:{checkpointId:'synthetic-checkpoint',cursor:1267,payloadHash:'synthetic-hash'} };
  const ctx = { console:{log(){},warn(){},error(){}}, Set, Map, Date, JSON, Promise, Array, Object, Number, String, Math,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{body:null,getElementById:()=>({files:[{name:'synthetic.tradeflow.json',text:JSON.stringify(candidate)}]}),querySelectorAll:()=>[]},
    DB:original, DB_KEY:'synthetic-db', setTimeout:()=>0, addEventListener(){},
    confirm:()=>{counts.confirmations++;return true;},
    FileReader:class {readAsText(file){this.result=file.text;this.onload();}},
    location:{reload(){}}, toast(){},
  };
  ctx.window = ctx;
  ctx.m4StopLiveSync = () => {
    state.liveSyncDesired = false;
    state.liveSyncEnabled = false;
    if(options.queueOnPause) state.queueLength = 1;
    if(options.failureOnPause) state.failedCount = 1;
    return true;
  };
  ctx.ZEZMS = {
    db:{save:()=>{assert.ok(storage.get('zezms_canonical_restore_pending_v1'));counts.durableWrites++;if(options.saveFailure)throw Error('synthetic durable failure');}},
    backup:{restoreCloudBackupAt(){},restoreFromLocal(){},validateBackup(){},
      backupNow:()=>{counts.safetyBackups++;return true;},
      _test:{normalizeRestoredDatabase:d=>structuredClone(d)}},
    cloudSync:{protocolVersion:'M4/3', getState:()=>({...state}),
      waitUntilReady:async()=>true,
      fetchCloudAuditBundle:async()=>{counts.auditReads++;return bundle;},
      stop:()=>{ state.liveSyncEnabled = state.liveSyncDesired; return true; },
      pauseForCanonicalRecovery:async()=>ctx.m4StopLiveSync(),
      inspectCanonicalRecoveryQueue:()=>{if(state.queueLength && !options.recoverable)throw Error('uncertified queue');return {count:state.queueLength,operations:state.queueLength?[{opId:'synthetic-rollover'}]:[]};},
      getCanonicalRecoveryPreparation:()=>null,
      prepareCanonicalRecovery:async()=>{if(options.recoverable){assert.equal(counts.safetyBackups,1);state.queueLength=0;}},
      completeCanonicalRecoveryPreparation:()=>{}},
    syncIntegrity:{_test:{
      projectCloud:()=>({database:structuredClone(candidate),conflicts:[]}),
      compareDatabases:(a,b)=>({actionableDifferences:options.rejectCandidate||JSON.stringify(a.stockRows)!==JSON.stringify(b.stockRows)?[{category:'synthetic mismatch'}]:[],unappliedCloudOperations:[],unacknowledgedLocalOperations:state.queueLength?[{opId:'synthetic-rollover'}]:[],oldProtocolOperations:[]}),
      localAudit:()=>({invariants:[]})
    }}
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  return {ctx,state,counts,storage,original};
}
function adapt(f) { vm.runInContext('ZEZMS.cloudSync.stop = () => window.m4StopLiveSync();', f.ctx); }

const {test}=require('node:test');
test('manual pause replaces reconnect-oriented stop, without clearing a queue',async()=>{
 const f=fixture();await f.ctx.ZEZMS.canonicalRestore._test.pauseLiveSyncForRestore({bundle:{}});
 assert.equal(f.state.liveSyncEnabled,false);assert.equal(f.state.liveSyncDesired,false);assert.equal(f.counts.durableWrites,0);
});
for(const option of ['queueOnPause','failureOnPause','rejectCandidate'])test(option+' blocks before replacement',async()=>{
 const f=fixture({[option]:true});assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),false);
 assert.equal(f.counts.durableWrites,0);assert.equal(f.ctx.DB,f.original);
});
test('known rollover is preserved only after confirmation and safety download, then fresh authority is rechecked',async()=>{
 const f=fixture({recoverable:true});f.state.queueLength=1;
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),true);
 assert.equal(f.counts.confirmations,1);assert.equal(f.counts.safetyBackups,1);assert.equal(f.counts.auditReads,3);
 assert.equal(f.counts.durableWrites,1);assert.equal(f.state.queueLength,0);
 assert.ok(f.storage.get('zezms_canonical_restore_pending_v1'));
});
test('a failed database write leaves the durable verification lock',async()=>{
 const f=fixture({saveFailure:true});assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),false);
 assert.ok(f.storage.get('zezms_canonical_restore_pending_v1'));assert.equal(f.state.liveSyncDesired,false);
});
const wallet={walletId:'synthetic-zero',balanceKey:'synthetic-zero-key',displayName:'Synthetic Zero',status:'ACTIVE'};
function verifyFixture(change){
 const f=fixture();const cloud={products:[],stockRows:[{id:'row',profit:59.99}],sales:[],cashBalances:{Cash:10},selectedYear:2026,selectedMonth:11,business:{id:'synthetic'},settings:{cashWallets:[wallet]},warrantySettings:{}};
 f.ctx.DB=structuredClone(cloud);f.ctx.DB.cashBalances[wallet.balanceKey]=0;f.ctx.DB.stockRows[0].profit=59.99000000000001;
 f.state.liveSyncEnabled=false;f.state.liveSyncDesired=false;
 f.ctx.localStorage.setItem('zezms_canonical_restore_pending_v1',JSON.stringify({deviceId:'synthetic-main',expectedCursor:3979,status:'VERIFY_REQUIRED'}));
 f.ctx.ZEZMS.syncIntegrity._test.projectCloud=()=>({database:structuredClone(cloud),conflicts:[]});if(change)change(f,cloud);return {f,cloud};
}
test('registered zero slots and stock-profit ULP differences verify without editing business data',async()=>{
 const {f}=verifyFixture();const before=JSON.stringify(f.ctx.DB);
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.verify(),true);
 assert.equal(f.storage.has('zezms_canonical_restore_pending_v1'),false);
 assert.equal(JSON.stringify(f.ctx.DB),before);assert.equal(f.counts.durableWrites,0);
});
const negative={
 'one-cent cash change':f=>f.ctx.DB.cashBalances.Cash=10.01,
 'nonzero missing wallet':f=>f.ctx.DB.cashBalances[wallet.balanceKey]=0.01,
 'string zero':f=>f.ctx.DB.cashBalances[wallet.balanceKey]='0',
 'unregistered zero':f=>f.ctx.DB.cashBalances.unknown=0,
 'changed registry':f=>f.ctx.DB.settings.cashWallets[0].displayName='Changed',
 'duplicate registry':(f,c)=>{f.ctx.DB.settings.cashWallets.push(wallet);c.settings=structuredClone(f.ctx.DB.settings);},
 'real profit change':f=>f.ctx.DB.stockRows[0].profit=60,
 'sub-cent profit change':f=>f.ctx.DB.stockRows[0].profit=59.99001,
 'queued operation':f=>f.state.queueLength=1,
 'failed operation':f=>f.state.failedCount=1,
 'active error':f=>f.state.lastError='blocked',
 'old client':f=>f.state.oldClientDetected=true,
 'apply journal':f=>f.ctx.localStorage.setItem('zezms_cloud_sync_m4_apply_journal_v2','synthetic'),
 'cursor moved':f=>f.state.cursor=3978,
 'device changed':f=>f.ctx.localStorage.setItem('zezms_canonical_restore_pending_v1',JSON.stringify({deviceId:'wrong'})),
 'actionable record':f=>f.ctx.ZEZMS.syncIntegrity._test.compareDatabases=()=>({actionableDifferences:[{}]}),
 'unacknowledged local operation':f=>f.ctx.ZEZMS.syncIntegrity._test.compareDatabases=()=>({unacknowledgedLocalOperations:[{}]}),
 'unapplied operation':f=>f.ctx.ZEZMS.syncIntegrity._test.compareDatabases=()=>({unappliedCloudOperations:[{}]}),
 'legacy protocol':f=>f.ctx.ZEZMS.syncIntegrity._test.compareDatabases=()=>({oldProtocolOperations:[{}]}),
 'invariant':f=>f.ctx.ZEZMS.syncIntegrity._test.localAudit=()=>({invariants:[{status:'WARNING'}]}),
 'projection conflict':(f,c)=>f.ctx.ZEZMS.syncIntegrity._test.projectCloud=()=>({database:structuredClone(c),conflicts:[{}]}),
 'period change':f=>f.ctx.DB.selectedMonth=10
};
for(const [name,change]of Object.entries(negative))test(name+' retains the verification lock',async()=>{
 const {f}=verifyFixture(change);const before=JSON.stringify(f.ctx.DB);
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.verify(),false);
 assert.ok(f.storage.has('zezms_canonical_restore_pending_v1'));
 assert.equal(JSON.stringify(f.ctx.DB),before);assert.equal(f.counts.durableWrites,0);
});
test('corrupt verification evidence remains held and cannot verify as clean',async()=>{
 const f=fixture();f.storage.set('zezms_canonical_restore_pending_v1','malformed');
 assert.equal(f.ctx.ZEZMS.canonicalRestore.getState().pending.invalid,true);
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.verify(),false);
 assert.equal(f.storage.get('zezms_canonical_restore_pending_v1'),'malformed');
});
test('concurrent restore requests cannot race a replacement',async()=>{
 const f=fixture();let release;f.ctx.ZEZMS.cloudSync.waitUntilReady=()=>new Promise(r=>{release=r;});
 const first=f.ctx.ZEZMS.canonicalRestore.restoreLocal();
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),false);
 assert.equal(f.counts.durableWrites,0);release();
 f.ctx.ZEZMS.cloudSync.waitUntilReady=async()=>true;assert.equal(await first,true);
});

test('candidate comparison cannot exempt a different outbox entry from its certified set',async()=>{
 const f=fixture({recoverable:true});f.state.queueLength=1;
 f.ctx.ZEZMS.syncIntegrity._test.compareDatabases=()=>({unacknowledgedLocalOperations:[{opId:'ordinary-sale'}]});
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),false);
 assert.equal(f.counts.durableWrites,0);assert.equal(f.counts.safetyBackups,0);
});
test('the actual production Integrity comparison reports an outbox which only its exact recovery certificate can permit',async()=>{
 const f=fixture({recoverable:true});f.state.queueLength=1;f.ctx.performance={now:()=>0};
 f.ctx.ZEZMS.cloudSync.getOutbox=()=>f.state.queueLength?[{opId:'synthetic-rollover'}]:[];
 const prior=f.ctx.ZEZMS.syncIntegrity._test;
 const index=fs.readFileSync(__dirname+'/../index.html','utf8');
 const encoded=index.match(/const INTEGRITY_B64=([\s\S]*?);\s*(?=const|function|let|var|\/\/)/)[1];
 vm.runInContext(Buffer.from([...encoded.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(x=>x[1]).join(''),'base64').toString(),f.ctx);
 const actual=f.ctx.ZEZMS.syncIntegrity._test;
 actual.projectCloud=prior.projectCloud;actual.localAudit=prior.localAudit;
 assert.equal(actual.compareDatabases(f.original,f.original,{operations:[]}).unacknowledgedLocalOperations.length,1);
 assert.equal(await f.ctx.ZEZMS.canonicalRestore.restoreLocal(),true);
 assert.equal(f.counts.durableWrites,1);assert.equal(f.state.queueLength,0);
});

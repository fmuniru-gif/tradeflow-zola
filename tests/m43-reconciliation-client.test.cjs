const {test}=require('node:test'),assert=require('node:assert/strict');
const tool=require('../diagnostics/m43-correction-reconciliation/coordinator.js');
const {scenario,ioFor,copy,fixture}=require('./m43-reconciliation-fixture.cjs');
const restart=s=>fixture('synthetic-main',{raw:Object.fromEntries(s.f.store)});
test('browser adapter recognizes exact assembled script framing and the installed persistence guard',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{cloud}=require('./m43-reconciliation-fixture.cjs');const s=scenario();
 s.f.c.document.scripts=[{textContent:'\n'+cloud+'\n'}];vm.runInContext(fs.readFileSync(require.resolve('../diagnostics/m43-correction-reconciliation/coordinator.js'),'utf8'),s.f.c);
 assert.equal(await vm.runInContext('TradeFlowCorrectionReconciliation.browserIO(()=>DB).cloudSHA()',s.f.c),tool.CLOUD_SHA);
 s.f.c.ZEZMS.db.save=()=>{};assert.equal(await vm.runInContext('TradeFlowCorrectionReconciliation.browserIO(()=>DB).cloudSHA()',s.f.c),null);
});
function network(s){let accepted=null,calls=0;return {
 rpc:async(_id,op)=>{calls++;accepted=accepted||{owner_id:s.evidence.owner_id,op_id:op.opId,seq:3958,payload:copy(op),receipt:{op_id:op.opId,server_seq:3958,audit:copy(s.evidence.audit),payload:copy(op)}};return {op_id:op.opId,server_seq:3958};},
 readback:async()=>copy(accepted),calls:()=>calls};}
test('stage creates a new delivery identity; existing audit/zero layer and missing original queue remain unchanged',async()=>{
 const s=scenario(),before=JSON.stringify(s.f.c.DB),net=network(s),c=tool.create(ioFor(s.f,net));
 assert.notEqual(s.evidence.operation.opId,s.originalOperation.opId);assert.equal((await c.stage(s.evidence)).originalOperationRecovered,false);
 assert.equal(JSON.stringify(s.f.c.DB),before);assert.equal(s.f.store.get(tool.keys.DB),before);assert.equal(s.f.sync.getOutbox().length,0);assert.equal(net.calls(),0);
 assert.equal(s.f.sync.isReadyForLocalOperations(),false);assert.throws(()=>s.f.c.saveDB(),/RECONCILIATION_MAINTENANCE_HOLD/);
 await assert.rejects(()=>s.f.sync.pushNow(false),/RECONCILIATION_MAINTENANCE_HOLD/);
 await assert.rejects(()=>c.deliver(),/RUNTIME_STATE_MISMATCH/);
});
test('restart, lost acknowledgment and retry use one immutable operation; finalization writes registry without DB/cursor mutation',async()=>{
 const s=scenario(),net=network(s),before=s.f.store.get(tool.keys.DB);await tool.create(ioFor(s.f,net)).stage(s.evidence);
 s.f=restart(s);const io=ioFor(s.f,net),deliver=io.rpc;io.rpc=async(...args)=>{await deliver(...args);throw Error('SYNTHETIC_ACK_LOST');};
 await assert.rejects(()=>tool.create(io).deliver(),/ACK_LOST/);const staged=s.f.store.get(tool.keys.ACTIVE);s.f=restart(s);
 assert.equal((await tool.create(ioFor(s.f,net)).deliver()).status,'ACCEPTED_RESTART_REQUIRED');
 assert.equal(s.f.store.get(tool.keys.DB),before);assert.equal(s.f.store.get(tool.keys.ACTIVE),undefined);assert.equal(JSON.parse(s.f.store.get(tool.keys.APPLIED))[s.evidence.operation.opId],3958);
 assert.equal(s.f.sync.getState().cursor,3957);assert.equal(s.f.c.DB.stockRows[0].rStock,0);assert.equal(s.f.c.DB.stockCorrections.length,1);assert.equal(JSON.parse(staged).operation.opId,s.evidence.operation.opId);
});
test('changed business state, changed source, unrelated queued operation, unbound audit and bad hash fail before delivery',async()=>{
 for(const kind of ['business','source','queue','audit','hash']){
  const s=scenario();let calls=0;const io=ioFor(s.f,{rpc:async()=>{calls++;}}),e=copy(s.evidence);
  if(kind==='business')s.f.c.DB.stockRows[0].rStock=1;
  if(kind==='source')io.cloudSHA=async()=> 'wrong';
  if(kind==='queue')s.f.store.set(tool.keys.QUEUE,'[{"kind":"unrelated"}]');
  if(kind==='audit')e.audit.quantity=1;
  if(kind==='hash')e.operation.payloadHash='bad';
  await assert.rejects(()=>tool.create(io).stage(e),/RECON_/);assert.equal(calls,0);assert.equal(s.f.store.has(tool.keys.ACTIVE),false);
 }
});
test('every controlled metadata write boundary can restart without rewriting records or minting another identity',async()=>{
 const initial=scenario(),net=network(initial),snapshots=[];let f=initial.f;
 const capture=(target)=>{const saved=target.c.localStorage.setItem;target.c.localStorage.setItem=(k,v)=>{saved(k,v);snapshots.push(Object.fromEntries(target.store));};};
 capture(f);await tool.create(ioFor(f,net)).stage(initial.evidence);f=fixture('synthetic-main',{raw:Object.fromEntries(f.store)});capture(f);await tool.create(ioFor(f,net)).deliver();
 for(const raw of snapshots){if(!raw[tool.keys.ACTIVE])continue;
  const restarted=fixture('synthetic-main',{raw}),t=tool.create(ioFor(restarted,net));let result=await t.deliver();
  if(result.status==='RESERVATION_RESTART_REQUIRED'){const second=fixture('synthetic-main',{raw:Object.fromEntries(restarted.store)});result=await tool.create(ioFor(second,net)).deliver();}
  assert.equal(result.status,'ACCEPTED_RESTART_REQUIRED');assert.equal(JSON.parse(raw[tool.keys.DB]).stockRows[0].rStock,0);assert.equal(JSON.parse(raw[tool.keys.ACTIVE]).operation.opId,initial.evidence.operation.opId);
 }
});

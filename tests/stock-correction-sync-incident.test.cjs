'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./stock-correction-sync-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),total=f=>f.c.DB.stockRows.reduce((s,r)=>s+r.rStock,0);
function corrected(f){return f.api.commitCorrection(f.api.preparePhysicalCount({productId:'P1',physicalCount:'0',notes:'Synthetic only'}));}
function transport(f,server){f.c.__fixture.transport({rpc:async(name,args)=>{
 server.calls.push(name);
 if(name==='zezms_mb3_get_protocol_transition')return server.mode==='guard-error'?{error:{message:'SYNTHETIC_CAPABILITY_UNAVAILABLE',status:400}}:{data:[{protocol_version:'M4/3',rules_hash:'M43-R56-RULES-20260825-A',identity_registry_hash:'M43-IDREG-20260825-A',minimum_client_generation:31800,capabilities:{branchEnvelopeSupported:!!server.prepared}}]};
 if(name==='zezms_mb3_publish_protocol_readiness')return {error:{status:400,code:'22023',message:'SYNTHETIC_READINESS_400'}};
 if(name!=='zezms_ops_push')throw Error('Unexpected RPC '+name);
 server.pushes++;
 const op=clone(args.p_operations[0]);let row=server.rows.find(r=>r.op_id===op.opId);
 if(!row){row={seq:3958+server.rows.length,op_id:op.opId,device_id:op.deviceId,device_seq:op.deviceSeq,kind:op.kind,payload:op,created_at:new Date().toISOString()};server.rows.push(row);}
 if(server.mode==='lost-ack')return {error:{message:'SYNTHETIC_RESPONSE_LOST'}};
 return {data:[server.mode==='invalid-ack'?{}:{server_seq:row.seq,created_at:row.created_at}]};
 },from(name){assert.equal(name,'zezms_sync_operations');const filters=[];const b={select(){return b;},eq(k,v){filters.push(['eq',k,v]);return b;},gt(k,v){filters.push(['gt',k,v]);return b;},order(){return b;},limit(){return b;},read(single){let data=server.rows.filter(r=>filters.every(([a,k,v])=>k==='owner_id'||(a==='eq'?r[k]===v:r[k]>v)));if(!single)return {data:clone(data)};if(server.mode==='missing-readback')return {data:null};if(server.mode==='bad-hash')return {data:{...clone(data[0]),payload:{...clone(data[0].payload),payloadHash:'invalid-synthetic-hash'}}};return {data:clone(data[0]||null)};},maybeSingle(){return Promise.resolve(b.read(true));},then(ok,bad){return Promise.resolve(b.read(false)).then(ok,bad);}};return b;}},{user:{id:'synthetic-owner',is_anonymous:false}});}
const server=()=>({mode:'ok',rows:[],calls:[],pushes:0});
test('2 to 0 preserves layer and audit, queues one numeric delta plus correction insert, without financial effects',()=>{
 const f=fixture(),before=clone(f.c.DB);const record=corrected(f),q=clone(f.sync.getOutbox());
 assert.equal(total(f),134);assert.equal(f.c.DB.stockRows.length,2);assert.equal(f.c.DB.stockRows[0].rStock,0);assert.equal(f.c.DB.stockRows[0].qtyIn,2);assert.equal(f.c.DB.stockRows[0].qtyOut,0);assert.equal(f.c.DB.stockCorrections.length,1);
 assert.equal(record.beforeQty,2);assert.equal(record.afterQty,0);assert.equal(record.allocations[0].stockRowId,'L1');assert.equal(record.allocations[0].afterRStock,0);
 assert.equal(q.length,1);const op=q[0];assert.equal(op.kind,'STOCK_CORRECTION_UPSERT');assert.equal(op.protocolVersion,'M4/3');assert.equal(op.attempts,0);assert.equal(op.outboxState,'Pending');assert.equal(op.lastAttempt,'');assert.equal(op.payloadHash,f.sync._test.deterministicHash(op));
 assert.deepEqual(op.patches.map(p=>[p.action,p.collection]),[['update','stockRows'],['insert','stockCorrections']]);assert.deepEqual(op.patches[0].changes,[{field:'rStock',mode:'delta',value:-2,before:2}]);assert.equal(op.patches[0].fallback.rStock,0);
 assert.deepEqual(q,JSON.parse(f.store.get('zezms_cloud_sync_m4_queue')));assert.equal(JSON.parse(f.store.get('tradeflow_v321_zola')).stockRows[0].rStock,0);
 for(const k of ['sales','receipts','saleLines','cashBalances','cashLog','inventoryTxns','expenses','accountTxns'])assert.deepEqual(f.c.DB[k],before[k]);
});
test('pending correction retains 134/136/136, equal cursor3957, outbox1/0/0 and failed0 until delivery',()=>{
 const devices=[fixture(),fixture('synthetic-shop'),fixture('synthetic-camon')];corrected(devices[0]);
 assert.deepEqual(devices.map(total),[134,136,136]);assert.deepEqual(devices.map(f=>f.sync.getState().cursor),[3957,3957,3957]);assert.deepEqual(devices.map(f=>f.sync.getOutbox().length),[1,0,0]);assert.ok(devices.every(f=>f.sync.getFailedOperations().length===0));
 assert.equal(devices[0].integrity.viewHTML().includes('Actionable integrity issue detected.'),true);
 assert.equal(devices[1].integrity.viewHTML().includes('Actionable integrity issue detected.'),false);
});
test('persisted correction/outbox survive synthetic reload with identical operation/hash and no extra correction',()=>{
 const f=fixture();corrected(f);const q=clone(f.sync.getOutbox());const reloaded=fixture('synthetic-main',{database:JSON.parse(f.store.get('tradeflow_v321_zola')),queue:JSON.parse(f.store.get('zezms_cloud_sync_m4_queue'))});
 assert.deepEqual(clone(reloaded.sync.getOutbox()),q);assert.equal(total(reloaded),134);assert.equal(reloaded.c.DB.stockCorrections.length,1);assert.equal(reloaded.c.DB.stockRows[0].rStock,0);
});
test('pre-attempt capability error can leave pending1 and failed0; no upload occurs and lastError retains evidence',async()=>{
 const f=fixture(),s=server();corrected(f);s.mode='guard-error';transport(f,s);
 await assert.rejects(()=>f.sync.pushNow(false),e=>e.message==='SYNTHETIC_CAPABILITY_UNAVAILABLE');
 assert.equal(f.sync.getOutbox()[0].attempts,0);assert.equal(f.sync.getFailedOperations().length,0);assert.equal(s.pushes,0);assert.equal(total(f),134);assert.equal(f.sync.getState().lastError,'M4/4 capability validation failed.');
});
test('configuration-verification hold leaves pending1 and failed0 without even attempting capability/upload',async()=>{
 const qf=fixture();corrected(qf);const f=fixture('synthetic-main',{database:clone(qf.c.DB),queue:clone(qf.sync.getOutbox()),configurationVerificationRequired:true}),s=server();transport(f,s);
 assert.equal(await f.sync.pushNow(false),false);assert.equal(f.sync.getOutbox().length,1);assert.equal(f.sync.getOutbox()[0].attempts,0);assert.equal(f.sync.getFailedOperations().length,0);assert.equal(s.calls.length,0);
});
for(const [mode,error]of [['invalid-ack','ZEZMS_ACK_INVALID'],['missing-readback','ZEZMS_ACK_NOT_DURABLE'],['bad-hash','ZEZMS_OPERATION_PAYLOAD_CONFLICT'],['lost-ack','SYNTHETIC_RESPONSE_LOST']])test(mode+' retains exact operation for durable acknowledgment; successful retry creates no second cloud operation',async()=>{
 const f=fixture(),s=server();corrected(f);const op=clone(f.sync.getOutbox()[0]);s.mode=mode;transport(f,s);
 await assert.rejects(()=>f.sync.pushNow(false),e=>String(e.message||'').startsWith(error));const pending=clone(f.sync.getOutbox()[0]);
 assert.equal(pending.opId,op.opId);assert.equal(pending.payloadHash,op.payloadHash);assert.equal(pending.attempts,1);assert.equal(pending.outboxState,'Failed');assert.equal(f.sync.getFailedOperations().length,1);assert.equal(f.sync.getState().cursor,3957);assert.equal(total(f),134);assert.equal(s.rows.length,1);
 s.mode='ok';await f.sync.pushNow(false);assert.equal(f.sync.getOutbox().length,0);assert.equal(f.sync.getFailedOperations().length,0);assert.equal(f.sync.getState().cursor,3958);assert.equal(s.rows.length,1);assert.equal(total(f),134);assert.equal(f.c.DB.stockCorrections.length,1);assert.equal(s.rows[0].payload.payloadHash,op.payloadHash);assert.equal('attempts'in s.rows[0].payload,false);
});
test('durable acknowledgment and ordered replay converge three synthetic clients exactly, preserving zero layer and audit; duplicate pull neutral',async()=>{
 const devices=[fixture(),fixture('synthetic-shop'),fixture('synthetic-camon')],s=server();const before=clone(devices[0].c.DB);devices.forEach(f=>transport(f,s));corrected(devices[0]);await devices[0].sync.pushNow(false);
 for(const f of devices.slice(1))await f.sync.pullNow(true);
 for(const f of devices){assert.equal(total(f),134);assert.equal(f.c.DB.stockRows.length,2);assert.equal(f.c.DB.stockRows[0].rStock,0);assert.equal(f.c.DB.stockCorrections.length,1);assert.equal(f.sync.getOutbox().length,0);assert.equal(f.sync.getState().cursor,3958);assert.equal(f.sync.getFailedOperations().length,0);assert.deepEqual(clone(f.c.DB.stockRows),clone(devices[0].c.DB.stockRows));assert.deepEqual(clone(f.c.DB.stockCorrections),clone(devices[0].c.DB.stockCorrections));for(const k of ['sales','receipts','saleLines','cashBalances','cashLog','inventoryTxns','expenses','accountTxns'])assert.deepEqual(f.c.DB[k],before[k]);const snapshot=clone(f.c.DB);await f.sync.pullNow(true);assert.deepEqual(clone(f.c.DB),snapshot);}
 console.log("SYNTHETIC_THREE_DEVICE_CONVERGENCE cursor3958 total134 layer-preserved audit-preserved cloudOperations1");
});
test('historical checkpoint-certified references remain INFO; new missing references remain actionable',()=>{
 const f=fixture(),t=f.integrity._test,baseline=clone(f.c.DB);
 baseline.accountTxns=[{id:'old-orphan',accountType:'debtors',accountID:'missing-old',amount:1}];
 const local=clone(baseline),bundle={baseline,checkpoint:{cursor:3957},operations:[],protocolVersion:'M4/3'};
 const old=t.compareDatabases(local,baseline,bundle);assert.equal(old.historicalReferences.length,1);assert.equal(old.actionableDifferences.length,0);
 local.accountTxns.push({id:'new-orphan',accountType:'debtors',accountID:'missing-new',amount:1});const current=t.compareDatabases(local,baseline,bundle);
 assert.equal(current.historicalReferences.length,1);assert.ok(current.actionableDifferences.some(d=>d.category==='Orphan Reference'&&d.id==='new-orphan'));assert.ok(current.actionableDifferences.some(d=>d.category==='Missing in Cloud'));
});
test('historical undo productId-only metadata is INFO while actual stock payload mismatch remains actionable',()=>{
 const f=fixture(),t=f.integrity._test,baseline=clone(f.c.DB);baseline.undoLog=[{id:'old-undo',stockRowId:'L1',qty:1}];const local=clone(baseline);local.undoLog[0].productId='P1';
 const bundle={baseline,checkpoint:{cursor:3957},operations:[],protocolVersion:'M4/3'};let report=t.compareDatabases(local,baseline,bundle);assert.equal(report.historicalMetadata.length,1);assert.equal(report.actionableDifferences.length,0);
 local.stockRows[0].rStock=0;report=t.compareDatabases(local,baseline,bundle);assert.ok(report.actionableDifferences.some(d=>d.category==='Payload Mismatch'&&d.collection==='stockRows'));
});
test('queued correction survives ordered remote replay/rebase and converges after its later acknowledgment',async()=>{
 const devices=[fixture(),fixture('synthetic-shop'),fixture('synthetic-camon')],s=server();devices.forEach(f=>transport(f,s));
 corrected(devices[0]);const queued=clone(devices[0].sync.getOutbox()[0]);
 const peer=fixture('synthetic-other-peer'),before=clone(peer.c.DB),after=clone(before);after.stockRows[1].rStock=133;
 const remote=clone(peer.sync._test.buildOperation(before,after,'synthetic-peer-stock-change'));
 s.rows.push({seq:3958,op_id:remote.opId,device_id:remote.deviceId,payload:remote,kind:remote.kind,created_at:new Date().toISOString()});
 await devices[0].sync.pullNow(true);
 assert.equal(total(devices[0]),133);assert.equal(devices[0].c.DB.stockRows[0].rStock,0);assert.equal(devices[0].c.DB.stockCorrections.length,1);assert.deepEqual(clone(devices[0].sync.getOutbox()[0]),queued);
 await devices[0].sync.pushNow(false);for(const f of devices.slice(1))await f.sync.pullNow(true);
 for(const f of devices){assert.equal(total(f),133);assert.equal(f.c.DB.stockRows[0].rStock,0);assert.equal(f.c.DB.stockCorrections.length,1);assert.equal(f.sync.getOutbox().length,0);assert.equal(f.sync.getState().cursor,3959);}
});
test('reapplying the same correction operation does not decrement a zero-stock layer twice',()=>{
 const f=fixture();corrected(f);const op=f.sync.getOutbox()[0],before=JSON.stringify(f.c.DB);
 assert.equal(f.sync._test.applyOperation(op,{silent:true}),true);assert.equal(JSON.stringify(f.c.DB),before);
});

function addRemoteStockChange(s){
 const peer=fixture('synthetic-peer'),before=clone(peer.c.DB),after=clone(before);after.stockRows[1].rStock=133;
 const op=clone(peer.sync._test.buildOperation(before,after,'synthetic-peer-stock-change'));
 s.rows.push({seq:3958,op_id:op.opId,device_id:op.deviceId,payload:op,kind:op.kind,created_at:new Date().toISOString()});return op;
}
test('inverse identity evidence retains strict keys/primary IDs and never supplies a missing-row fallback',()=>{
 const f=fixture();corrected(f);const patch=clone(f.sync.getOutbox()[0].patches[0]);const inverse=clone(f.sync._test.inversePatch(patch));
 assert.equal(inverse.before.id,'L1');assert.equal(inverse.fallback,null);assert.equal(inverse.changes[0].value,2);
 const before=JSON.stringify(f.c.DB);inverse.key='wrong-layer';assert.throws(()=>f.sync._test.applyOperation({patches:[inverse]}),/ZEZMS_IDENTITY_MISMATCH/);assert.equal(JSON.stringify(f.c.DB),before);
 inverse.key='L1';delete inverse.before.id;inverse.before._syncId='L1';assert.throws(()=>f.sync._test.applyOperation({patches:[inverse]}),/ZEZMS_PRIMARY_ID_REQUIRED/);assert.equal(JSON.stringify(f.c.DB),before);
});
test('missing affected layer fails closed without recreating a layer or dropping the original queue/audit',async()=>{
 const f=fixture(),s=server();corrected(f);f.c.DB.stockRows.shift();f.store.set('tradeflow_v321_zola',JSON.stringify(f.c.DB));
 const before=clone(f.c.DB),queue=clone(f.sync.getOutbox());addRemoteStockChange(s);transport(f,s);
 await assert.rejects(()=>f.sync.pullNow(true),/Missing record stockRows\/L1/);assert.deepEqual(clone(f.c.DB),before);assert.deepEqual(clone(f.sync.getOutbox()),queue);assert.equal(s.pushes,0);assert.equal(JSON.parse(f.store.get('tradeflow_v321_zola')).stockCorrections.length,1);
});
test('queued payload corruption blocks rebase without resealing or mutating business data',async()=>{
 const original=fixture();corrected(original);const queue=clone(original.sync.getOutbox());queue[0].patches[0].changes[0].value=-1;
 const f=fixture('synthetic-main',{database:clone(original.c.DB),queue}),s=server();addRemoteStockChange(s);transport(f,s);const before=JSON.stringify(f.c.DB);
 await assert.rejects(()=>f.sync.pullNow(true),/ZEZMS_OPERATION_HASH_MISMATCH/);assert.equal(JSON.stringify(f.c.DB),before);assert.deepEqual(clone(f.sync.getOutbox()),queue);assert.equal(s.pushes,0);
});
test('every queued-pull durable write boundary restarts with the same correction/zero layer and delivers once',async()=>{
 let capture=false;const snapshots=[];
 const f=fixture('synthetic-main',{onWrite:(key,raw)=>{if(capture)snapshots.push({key,raw:clone(raw)});}}),s=server();const correction=corrected(f),original=clone(f.sync.getOutbox()[0]);
 addRemoteStockChange(s);transport(f,s);capture=true;await f.sync.pullNow(true);capture=false;
 assert.ok(snapshots.some(x=>x.key==='zezms_cloud_sync_m4_apply_journal_v2'));assert.ok(snapshots.some(x=>x.key==='tradeflow_v321_zola'));
 for(const snapshot of snapshots){
  const persisted=JSON.parse(snapshot.raw.tradeflow_v321_zola);assert.equal(persisted.stockRows[0].rStock,0,'intermediate inverse reached disk');assert.equal(persisted.stockCorrections.length,1,'audit deletion reached disk');
  const restarted=fixture('synthetic-main',{raw:snapshot.raw,ready:false});await restarted.sync.init();
  assert.equal(restarted.c.DB.stockRows[0].rStock,0);assert.equal(restarted.c.DB.stockCorrections[0].correctionId,correction.correctionId);assert.equal(restarted.sync.getOutbox()[0].opId,original.opId);assert.equal(restarted.sync.getOutbox()[0].payloadHash,original.payloadHash);
  const localServer=server();localServer.rows=clone(s.rows);transport(restarted,localServer);
  if(restarted.sync.getState().cursor<3958)await restarted.sync.pullNow(true);
  await restarted.sync.pushNow(false);assert.equal(localServer.rows.length,2);assert.equal(total(restarted),133);assert.equal(restarted.c.DB.stockRows[0].rStock,0);assert.equal(restarted.c.DB.stockCorrections.length,1);assert.equal(restarted.sync.getOutbox().length,0);assert.equal(restarted.sync.getState().cursor,3959);
  for(const device of ['synthetic-shop','synthetic-camon']){const peer=fixture(device);transport(peer,localServer);await peer.sync.pullNow(true);assert.equal(total(peer),133);assert.deepEqual(clone(peer.c.DB.stockCorrections),clone(restarted.c.DB.stockCorrections));}
 }
 console.log('QUEUED_REBASE_RESTART_BOUNDARIES '+snapshots.length);
});
test('journal storage exhaustion aborts before business commit, preserving exact original correction and queue',async()=>{
 let armed=false,failed=false;const f=fixture('synthetic-main',{failWrite:key=>armed&&!failed&&key==='zezms_cloud_sync_m4_apply_journal_v2'?(failed=true):false}),s=server();corrected(f);addRemoteStockChange(s);transport(f,s);const db=JSON.stringify(f.c.DB),queue=clone(f.sync.getOutbox());armed=true;
 await assert.rejects(()=>f.sync.pullNow(true),/SYNTHETIC_STORAGE_UNAVAILABLE/);assert.equal(JSON.stringify(f.c.DB),db);assert.equal(f.store.get('tradeflow_v321_zola'),db);assert.deepEqual(clone(f.sync.getOutbox()),queue);assert.equal(f.store.has('zezms_cloud_sync_m4_apply_journal_v2'),false);
});
test('bookkeeping failure after DB commit retains a journal, blocks new transport and finishes on restart',async()=>{
 let armed=false,failed=false;const f=fixture('synthetic-main',{failWrite:key=>armed&&!failed&&key==='zezms_cloud_sync_m4_queue'?(failed=true):false}),s=server();const correction=corrected(f);addRemoteStockChange(s);transport(f,s);armed=true;
 await assert.rejects(()=>f.sync.pullNow(true),/ZEZMS_REBASE_COMMIT_PENDING_RESTART/);assert.equal(JSON.parse(f.store.get('tradeflow_v321_zola')).stockRows[0].rStock,0);assert.equal(f.store.has('zezms_cloud_sync_m4_apply_journal_v2'),true);
 await assert.rejects(()=>f.sync.pushNow(false),/ZEZMS_REBASE_RECOVERY_REQUIRED/);assert.equal(s.pushes,0);
 const restarted=fixture('synthetic-main',{raw:Object.fromEntries(f.store),ready:false});await restarted.sync.init();assert.equal(total(restarted),133);assert.equal(restarted.sync.getState().cursor,3958);assert.equal(restarted.c.DB.stockCorrections[0].correctionId,correction.correctionId);assert.equal(restarted.store.has('zezms_cloud_sync_m4_apply_journal_v2'),false);
 transport(restarted,s);await restarted.sync.pushNow(false);assert.equal(s.rows.length,2);assert.equal(total(restarted),133);
});
test('lost push response survives restart with the original operation and exactly one accepted correction',async()=>{
 const f=fixture(),s=server();const correction=corrected(f),original=clone(f.sync.getOutbox()[0]);transport(f,s);s.mode='lost-ack';await assert.rejects(()=>f.sync.pushNow(false),e=>e.message==='SYNTHETIC_RESPONSE_LOST');
 const restarted=fixture('synthetic-main',{raw:Object.fromEntries(f.store),ready:false});await restarted.sync.init();assert.equal(restarted.sync.getOutbox()[0].opId,original.opId);assert.equal(restarted.sync.getOutbox()[0].payloadHash,original.payloadHash);s.mode='ok';transport(restarted,s);await restarted.sync.pushNow(false);
 assert.equal(s.rows.length,1);assert.equal(restarted.c.DB.stockCorrections[0].correctionId,correction.correctionId);assert.equal(restarted.c.DB.stockRows[0].rStock,0);assert.equal(restarted.sync.getOutbox().length,0);
});
test('source fix is completely reversible to the exact production cloud closure; every wire identity rule remains unchanged',()=>{
 const {execFileSync}=require('node:child_process'),{cloud}=require('./stock-correction-sync-fixture.cjs'),fix=require('../tools/m43-inverse-identity-fix.cjs');
 const shell=execFileSync('git',['show','a3d30228cfcf2c1577209d779534164bc72452f9:index.html'],{cwd:path.resolve(__dirname,'..'),maxBuffer:32*1024*1024}).toString('utf8');
 const original=Buffer.from(shell.match(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/)[1],'base64').toString('utf8');assert.equal(fix.unpatch(cloud),original);assert.equal(fix.patch(original),cloud);
});
test('unknown or corrupted rebase journal blocks initialization and business persistence without changing saved records',async()=>{
 const snapshots=[];let capture=false;
 const f=fixture('synthetic-main',{onWrite:(_key,raw)=>{if(capture&&raw.zezms_cloud_sync_m4_apply_journal_v2)snapshots.push(clone(raw));}}),s=server();corrected(f);addRemoteStockChange(s);transport(f,s);capture=true;await f.sync.pullNow(true);
 const raw=snapshots[0],journal=JSON.parse(raw.zezms_cloud_sync_m4_apply_journal_v2);journal.after[0]=JSON.stringify({...JSON.parse(journal.after[0]),deviceId:'wrong-device'});raw.zezms_cloud_sync_m4_apply_journal_v2=JSON.stringify(journal);
 const restarted=fixture('synthetic-main',{raw,ready:false}),db=restarted.store.get('tradeflow_v321_zola');
 await assert.rejects(()=>restarted.sync.init(),/ZEZMS_REBASE_JOURNAL_INVALID/);assert.equal(restarted.sync.isReadyForLocalOperations(),false);assert.throws(()=>restarted.c.saveDB(),/ZEZMS_REBASE_RECOVERY_REQUIRED/);assert.equal(restarted.store.get('tradeflow_v321_zola'),db);assert.equal(restarted.store.get('zezms_cloud_sync_m4_queue'),raw.zezms_cloud_sync_m4_queue);
});
test('a committed journal cannot certify a subsequently different business DB',async()=>{
 const snapshots=[];let capture=false;
 const f=fixture('synthetic-main',{onWrite:(key,raw)=>{if(capture&&key==='tradeflow_v321_zola')snapshots.push(clone(raw));}}),s=server();corrected(f);addRemoteStockChange(s);transport(f,s);capture=true;await f.sync.pullNow(true);
 const raw=snapshots[0],db=JSON.parse(raw.tradeflow_v321_zola);db.stockRows[1].rStock=132;raw.tradeflow_v321_zola=JSON.stringify(db);
 const restarted=fixture('synthetic-main',{raw,ready:false});await assert.rejects(()=>restarted.sync.init(),/ZEZMS_REBASE_STATE_UNPROVEN/);assert.equal(restarted.store.get('tradeflow_v321_zola'),raw.tradeflow_v321_zola);assert.equal(restarted.store.get('zezms_cloud_sync_m4_queue'),raw.zezms_cloud_sync_m4_queue);
});
test('protocol-readiness publication HTTP400 does not gate M4/3 upload or change operation identity',async()=>{
 const f=fixture(),s=server();corrected(f);const original=clone(f.sync.getOutbox()[0]);s.prepared=true;transport(f,s);
 await assert.rejects(()=>f.sync._test.r70PublishReadiness(),e=>e.status===400&&e.code==='22023');assert.equal(s.pushes,0);assert.deepEqual(clone(f.sync.getOutbox()[0]),original);
 await f.sync.pushNow(false);assert.equal(s.rows.length,1);assert.equal(s.rows[0].payload.opId,original.opId);assert.equal(s.rows[0].payload.payloadHash,original.payloadHash);assert.equal(f.c.DB.stockRows[0].rStock,0);
});
test('actual startup readiness wrapper tolerates publication failure on M4/3 and retains M4/4 rejection',async()=>{
 const vm=require('node:vm'),{cloud}=require('./stock-correction-sync-fixture.cjs');
 const source=cloud.slice(cloud.indexOf('var r70BaseStartLiveSync=startLiveSync;'),cloud.indexOf('var r70BaseConnectionCode=r67hConnectionCode;'));
 for(const protocol of ['M4/3','M4/4']){const patches=[],context={startLiveSync:async()=>true,r70CapabilityGuard:async()=>true,r70PublishReadiness:async()=>{throw Error('SYNTHETIC_READINESS_400');},r70Transition:{activeProtocol:protocol},r70Text:e=>e.message,setState:value=>patches.push(value)};vm.createContext(context);vm.runInContext(source,context);
  if(protocol==='M4/3')assert.equal(await context.startLiveSync(false),true);else await assert.rejects(()=>context.startLiveSync(false),/SYNTHETIC_READINESS_400/);assert.equal(patches[0].m44ReadinessError,'SYNTHETIC_READINESS_400');}
});
test('a conflicting remote depletion blocks the existing correction rather than corrupting stock or losing its audit/queue',async()=>{
 const f=fixture(),s=server();corrected(f);const before=clone(f.c.DB),queue=clone(f.sync.getOutbox()),peer=fixture('synthetic-peer'),after=clone(peer.c.DB);after.stockRows[0].rStock=1;
 const op=clone(peer.sync._test.buildOperation(clone(peer.c.DB),after,'synthetic-conflict'));
 s.rows.push({seq:3958,op_id:op.opId,device_id:op.deviceId,payload:op});transport(f,s);
 await assert.rejects(()=>f.sync.pullNow(true),/negative/);assert.deepEqual(clone(f.c.DB),before);assert.deepEqual(clone(f.sync.getOutbox()),queue);assert.deepEqual(JSON.parse(f.store.get('tradeflow_v321_zola')),before);assert.equal(f.sync.getState().cursor,3957);assert.equal(s.pushes,0);
});
test('failure during inversion of multiple queued corrections never persists partial audit removal',async()=>{
 const f=fixture(),s=server();corrected(f);f.api.commitCorrection(f.api.preparePhysicalCount({productId:'P2',physicalCount:'133'}));
 f.c.DB.stockRows=f.c.DB.stockRows.filter(r=>r.id!=='L1');f.store.set('tradeflow_v321_zola',JSON.stringify(f.c.DB));
 const before=clone(f.c.DB),queue=clone(f.sync.getOutbox());addRemoteStockChange(s);transport(f,s);
 await assert.rejects(()=>f.sync.pullNow(true),/Missing record stockRows\/L1/);assert.deepEqual(clone(f.c.DB),before);assert.deepEqual(JSON.parse(f.store.get('tradeflow_v321_zola')),before);assert.deepEqual(clone(f.sync.getOutbox()),queue);assert.equal(f.c.DB.stockCorrections.length,2);
});
test('pull recovers a same-operation lost acknowledgment without applying the correction twice',async()=>{
 const f=fixture(),s=server(),correction=corrected(f),original=clone(f.sync.getOutbox()[0]);transport(f,s);s.mode='lost-ack';await assert.rejects(()=>f.sync.pushNow(false),e=>e.message==='SYNTHETIC_RESPONSE_LOST');
 s.mode='ok';await f.sync.pullNow(true);assert.equal(f.sync.getOutbox().length,0);assert.equal(s.rows.length,1);assert.equal(f.sync.getState().cursor,3958);assert.equal(total(f),134);assert.equal(f.c.DB.stockCorrections[0].correctionId,correction.correctionId);assert.equal(s.rows[0].payload.payloadHash,original.payloadHash);
});
test('pull cannot discard a queued operation when the same cloud operation ID has a different valid payload',async()=>{
 const f=fixture(),s=server();corrected(f);const original=clone(f.sync.getOutbox()[0]),different=clone(original);different.patches[1].value.notes='different synthetic payload';different.payloadHash=f.sync._test.deterministicHash(different);
 s.rows.push({seq:3958,op_id:original.opId,device_id:original.deviceId,payload:different});transport(f,s);const before=JSON.stringify(f.c.DB);
 await assert.rejects(()=>f.sync.pullNow(true),/ZEZMS_OPERATION_PAYLOAD_CONFLICT/);assert.equal(JSON.stringify(f.c.DB),before);assert.deepEqual(clone(f.sync.getOutbox()[0]),original);assert.equal(f.sync.getState().cursor,3957);assert.equal(f.store.get('tradeflow_v321_zola'),before);
});

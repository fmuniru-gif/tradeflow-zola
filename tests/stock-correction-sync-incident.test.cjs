'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./stock-correction-sync-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),total=f=>f.c.DB.stockRows.reduce((s,r)=>s+r.rStock,0);
function corrected(f){return f.api.commitCorrection(f.api.preparePhysicalCount({productId:'P1',physicalCount:'0',notes:'Synthetic only'}));}
function transport(f,server){f.c.__fixture.transport({rpc:async(name,args)=>{
 server.calls.push(name);
 if(name==='zezms_mb3_get_protocol_transition')return server.mode==='guard-error'?{error:{message:'SYNTHETIC_CAPABILITY_UNAVAILABLE'}}:{data:[{protocol_version:'M4/3',rules_hash:'M43-R56-RULES-20260825-A',identity_registry_hash:'M43-IDREG-20260825-A',minimum_client_generation:31800,capabilities:{}}]};
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
test('unchanged production reproduces 134/136/136, equal cursor3957, outbox1/0/0, failed0 when correction remains queued',()=>{
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
 const before=clone(devices[1].c.DB),after=clone(before);after.stockRows[1].rStock=133;
 const remote=clone(devices[1].sync._test.buildOperation(before,after,'synthetic-peer-stock-change'));
 s.rows.push({seq:3958,op_id:remote.opId,device_id:'synthetic-other-peer',payload:remote,kind:remote.kind,created_at:new Date().toISOString()});
 let failure;try{await devices[0].sync.pullNow(true);}catch(error){failure=error;}
 if(failure){assert.match(failure.message,/^ZEZMS_IDENTITY_REQUIRED: stockRows operation has no stable collection identity/);assert.equal(total(devices[0]),134);assert.equal(devices[0].c.DB.stockCorrections.length,1);assert.deepEqual(clone(devices[0].sync.getOutbox()[0]),queued);assert.equal(devices[0].sync.getFailedOperations().length,0);assert.equal(devices[0].sync.getState().cursor,3957);console.log("CONFIRMED_REBASE_DEFECT cursor3957 queue1 failed0 total134 zero-layer-and-audit-retained");throw failure;}
 assert.equal(total(devices[0]),133);assert.equal(devices[0].c.DB.stockRows[0].rStock,0);assert.equal(devices[0].c.DB.stockCorrections.length,1);assert.deepEqual(clone(devices[0].sync.getOutbox()[0]),queued);
 await devices[0].sync.pushNow(false);for(const f of devices.slice(1))await f.sync.pullNow(true);
 for(const f of devices){assert.equal(total(f),133);assert.equal(f.c.DB.stockRows[0].rStock,0);assert.equal(f.c.DB.stockCorrections.length,1);assert.equal(f.sync.getOutbox().length,0);assert.equal(f.sync.getState().cursor,3959);}
});
test('reapplying the same correction operation does not decrement a zero-stock layer twice',()=>{
 const f=fixture();corrected(f);const op=f.sync.getOutbox()[0],before=JSON.stringify(f.c.DB);
 assert.equal(f.sync._test.applyOperation(op,{silent:true}),true);assert.equal(JSON.stringify(f.c.DB),before);
});

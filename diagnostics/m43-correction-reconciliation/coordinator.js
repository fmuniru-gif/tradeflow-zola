/* Controlled maintenance component. Not loaded by TradeFlow; no auto-run. */
(function(root,factory){if(typeof module==='object')module.exports=factory();else root.TradeFlowCorrectionReconciliation=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const ACTIVE='zezms_m43_reconciliation_stage_v1',RECEIPT='zezms_m43_reconciliation_receipt_v1';
 const DB='tradeflow_v321_zola',STATE='zezms_cloud_sync_m4_state',QUEUE='zezms_cloud_sync_m4_queue',APPLIED='zezms_cloud_sync_m4_applied_v2';
 const CLOUD_SHA='31aa14616ef9f91f27fd240447cd4eee187b5aa21bd3dcc973ab1d79e2f57c1b';
 const ordered=a=>a===null||typeof a!=='object'?a:Array.isArray(a)?a.map(ordered):Object.fromEntries(Object.keys(a).sort().map(k=>[k,ordered(a[k])]));
 const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b)),copy=a=>JSON.parse(JSON.stringify(a));
 const fail=code=>{throw Error(code);};
 function create(io){
  const read=k=>io.storage.getItem(k),write=(k,v)=>{io.storage.setItem(k,v);if(read(k)!==v)fail('RECON_STORAGE_READBACK');};
  async function source(){if(await io.cloudSHA()!==CLOUD_SHA)fail('RECON_UNREVIEWED_CLIENT');}
  function capture(){
   const raw=read(DB),db=JSON.parse(raw),saved=JSON.parse(read(STATE)),state=io.sync.getState();
   if(!same(db,io.database())||!same(io.sync.getOutbox(),JSON.parse(read(QUEUE)))||io.sync.getOutbox().length)fail('RECON_LOCAL_STATE_CHANGED');
   if(state.deviceAccessMode!=='OWNER'||!state.initialized||state.liveSyncEnabled||state.liveSyncDesired||state.configurationVerificationRequired||state.directoryOutboxReviewRequired||io.sync.getFailedOperations().length)fail('RECON_MAINTENANCE_REQUIRED');
   for(const field of ['deviceId','syncOwnerId','businessId','branchId','deviceSeq','cursor'])if((state[field]??null)!==(saved[field]??null))fail('RECON_RUNTIME_STATE_MISMATCH');
   if(read('zezms_cloud_sync_m4_apply_journal_v2')!==null)fail('RECON_EXISTING_APPLY_JOURNAL');
   return {raw,db,saved,state};
  }
  function materialized(c,e){
   const audit=c.db.stockCorrections.filter(a=>a.correctionId===e.correction_id),rows=c.db.stockRows.filter(r=>r.id===e.stock_before.id),products=c.db.products.filter(p=>p.id===e.product.id);
   if(audit.length!==1||rows.length!==1||products.length!==1||!same(audit[0],e.audit)||!same(rows[0],{...e.stock_before,rStock:0})||!same(products[0],e.product))fail('RECON_MATERIALIZATION_MISMATCH');
   if(c.state.deviceId!==e.device_id||c.state.syncOwnerId!==e.owner_id||c.state.businessId!==e.business_id||(c.state.branchId||null)!==(e.branch_id||null))fail('RECON_OWNER_SCOPE');
  }
  async function load(){
   await source();const raw=read(ACTIVE);if(!raw)fail('RECON_NO_STAGE');const j=JSON.parse(raw),signed=copy(j);delete signed.checksum;
   if(j.version!==1||await io.sha(JSON.stringify(signed))!==j.checksum||j.operation.payloadHash!==io.hash(j.operation))fail('RECON_STAGE_CORRUPT');
   return j;
  }
  async function persist(j){const signed=copy(j);delete signed.checksum;j.checksum=await io.sha(JSON.stringify(signed));write(ACTIVE,JSON.stringify(j));}
  async function stage(e){
   await source();if(read(ACTIVE)!==null||read(RECEIPT)!==null)fail('RECON_STAGE_ALREADY_EXISTS');
   const c=capture();materialized(c,e);
   if(!io.sync.isReadyForLocalOperations()||!e.operation||e.operation.deviceId!==e.device_id||e.operation.deviceSeq!==c.state.deviceSeq+1||e.operation.payloadHash!==io.hash(e.operation))fail('RECON_OPERATION_UNBOUND');
   // New compensating DELIVERY of the existing audit, never an original recovery.
   const j={version:1,evidence:copy(e),operation:copy(e.operation),dbSHA:await io.sha(c.raw),cursor:c.state.cursor,priorSeq:c.state.deviceSeq,appliedBefore:read(APPLIED),phase:'STAGED'};
   if(read(DB)!==c.raw||read(STATE)!==JSON.stringify(c.saved)||read(ACTIVE)!==null)fail('RECON_CAPTURE_CHANGED');
   await persist(j); // Installs the reviewed app's posting/sync hold before reservation.
   if(read(DB)!==c.raw||read(STATE)!==JSON.stringify(c.saved))fail('RECON_CAPTURE_CHANGED');
   write(STATE,JSON.stringify({...c.saved,deviceSeq:j.operation.deviceSeq}));
   return {status:'STAGED_RESTART_REQUIRED',originalOperationRecovered:false};
  }
  async function deliver(){
   const j=await load(),c=capture();materialized(c,j.evidence);
   if(await io.sha(c.raw)!==j.dbSHA||c.state.cursor!==j.cursor)fail('RECON_LOCAL_STATE_CHANGED');
   // A crash after staging but before sequence reservation can finish only that
   // exact reservation. Restart is mandatory before any network call.
   if(c.state.deviceSeq===j.priorSeq){write(STATE,JSON.stringify({...c.saved,deviceSeq:j.operation.deviceSeq}));return {status:'RESERVATION_RESTART_REQUIRED'};}
   if(c.state.deviceSeq!==j.operation.deviceSeq)fail('RECON_SEQUENCE_CHANGED');
   const applied=read(APPLIED),expected=JSON.stringify({...JSON.parse(j.appliedBefore||'{}'),[j.operation.opId]:j.serverSeq});
   if(applied!==j.appliedBefore&&!(j.phase==='ACK_VERIFIED'&&applied===expected))fail('RECON_APPLIED_CHANGED');
   await io.guard();
   const result=await io.rpc(j.evidence.evidence_id,copy(j.operation));
   const row=await io.readback(j.operation.opId,j.evidence.correction_id);
   if(!result||!Number.isSafeInteger(Number(result.server_seq))||Number(result.server_seq)<=0||result.op_id!==j.operation.opId||!row||row.owner_id!==j.evidence.owner_id||row.op_id!==j.operation.opId||Number(row.seq)!==Number(result.server_seq)||!same(row.payload,j.operation)||row.payload.payloadHash!==io.hash(row.payload)||row.receipt?.op_id!==row.op_id||Number(row.receipt?.server_seq)!==Number(row.seq)||!same(row.receipt?.audit,j.evidence.audit)||!same(row.receipt?.payload,j.operation))fail('RECON_ACK_NOT_DURABLE');
   const after=capture();materialized(after,j.evidence);
   if(await io.sha(after.raw)!==j.dbSHA||after.state.cursor!==j.cursor||after.state.deviceSeq!==j.operation.deviceSeq||read(APPLIED)!==applied)fail('RECON_LOCAL_STATE_CHANGED');
   j.phase='ACK_VERIFIED';j.serverSeq=Number(result.server_seq);await persist(j);
   const registry={...JSON.parse(j.appliedBefore||'{}'),[j.operation.opId]:j.serverSeq};
   write(APPLIED,JSON.stringify(registry)); // No DB write and NO cursor jump.
   write(RECEIPT,JSON.stringify(j));
   if(read(DB)!==after.raw||read(ACTIVE)!==JSON.stringify(j))fail('RECON_FINALIZATION_CHANGED');
   io.storage.removeItem(ACTIVE);if(read(ACTIVE)!==null)fail('RECON_STAGE_RETAINED');
   return {status:'ACCEPTED_RESTART_REQUIRED',serverSeq:j.serverSeq,originalOperationRecovered:false};
  }
  return {stage,deliver};
 }
 function browserIO(database){
  const sync=window.ZEZMS.cloudSync,storage=window.localStorage;
  const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const client=()=>{const c=sync.getClient(),s=sync.getSession();if(!c||!s||s.user?.id!==sync.getState().syncOwnerId||s.user?.is_anonymous)fail('RECON_OWNER_SESSION_REQUIRED');return c;};
  return {database,storage,sync,sha,hash:sync._test.deterministicHash,
   cloudSHA:async()=>{if(await sha(window.ZEZMS.db.save.toString())!=='57923bfbdc11f399067b2ca01240a77868c8b4592aba80b11f254bce220c451a')return null;for(const script of document.scripts){for(const text of [script.textContent,script.textContent.slice(1,-1)])if(await sha(text)===CLOUD_SHA)return CLOUD_SHA;}return null;},
   guard:()=>window.ZEZMS_M43_CAPABILITY_GUARD(false),
   rpc:async(id,operation)=>{const r=await client().rpc('zezms_m43_deliver_preserved_correction',{p_evidence_id:id,p_operation:operation});if(r.error)fail('RECON_SERVER_REJECTED');return Array.isArray(r.data)?r.data[0]:r.data;},
   readback:async(op,cid)=>{const owner=sync.getState().syncOwnerId,c=client();const r=await c.from('zezms_sync_operations').select('owner_id,seq,op_id,payload').eq('owner_id',owner).eq('op_id',op).maybeSingle();const receipt=await c.from('zezms_m43_correction_receipts').select('owner_id,op_id,server_seq,audit,payload').eq('owner_id',owner).eq('correction_id',cid).maybeSingle();if(r.error||receipt.error)fail('RECON_READBACK_FAILED');return r.data?{...r.data,receipt:receipt.data}:null;}
  };
 }
 return {create,browserIO,keys:{ACTIVE,RECEIPT,DB,STATE,QUEUE,APPLIED},CLOUD_SHA};
});

/* Read-only evidence evaluator. No coordinator import, staging or delivery API. */
(function(r,f){if(typeof module==='object')module.exports=f();else r.TradeFlowReadOnlyPreflight=f();})(globalThis,function(){
 'use strict';
 const COMMIT='cf9ff97c4f7ee9a3d65f2351ac7785fa2315bdd8';
 const CAP='/rest/v1/rpc/zezms_mb3_get_protocol_transition',PUB='/rest/v1/rpc/zezms_mb3_publish_protocol_readiness',PUSH='/rest/v1/rpc/zezms_ops_push';
 const PATHS={auth:'/auth/v1/user',state:'/rest/v1/zezms_sync_state',operations:'/rest/v1/zezms_sync_operations',checkpoints:'/rest/v1/zezms_sync_checkpoints',evidence:'/rest/v1/zezms_m43_reconciliation_evidence',receipts:'/rest/v1/zezms_m43_correction_receipts',counter:'/rest/v1/zezms_sync_counters',lifecycle:'/rest/v1/zezms_device_lifecycle',devices:'/rest/v1/zezms_business_devices',branches:'/rest/v1/zezms_branches',owner:'/rest/v1/rpc/zezms_has_business_role',capability:CAP};
 const KEYS=['tradeflow_v321_zola','zezms_cloud_sync_m4_state','zezms_cloud_sync_m4_queue','zezms_cloud_sync_m4_failed_v2','zezms_cloud_sync_m4_apply_journal_v2','zezms_m43_reconciliation_stage_v1','zezms-m3-supabase-auth'];
 const ordered=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(ordered):Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])]));
 const stable=v=>JSON.stringify(ordered(v)),same=(a,b)=>stable(a)===stable(b),copy=v=>JSON.parse(JSON.stringify(v));
 const id=v=>v===undefined||v===null?'':String(v);
 const stop=code=>{throw Error(code);},integer=n=>Number.isSafeInteger(n)&&n>=0;
 const SAFE_ERRORS=new Set(['UNSAFE_NUMERIC_EVIDENCE','INVALID_CLOUD_TEXT','UNSAFE_CLOUD_SHAPE','CLOUD_IDENTITY_AMBIGUOUS','RELEVANT_REPLAY_UNSUPPORTED','CLOUD_PATCH_IDENTITY_MISMATCH','REPLAY_LAYER_MISSING','CLOUD_STOCK_CONFLICT','HISTORY_COVERAGE_UNPROVEN','LOCAL_EVIDENCE_UNAVAILABLE','ORIGINAL_CORRECTION_NOT_UNIQUELY_IDENTIFIED','LOCAL_AUDIT_LAYER_LINKAGE_INVALID','OWNER_SESSION_NOT_VERIFIED','CLOUD_OWNER_STATE_UNVERIFIED','HISTORY_OPERATION_UNVERIFIED','CHECKPOINT_COVERAGE_UNVERIFIED','CHECKPOINT_BASELINE_UNAVAILABLE','SAVED_SESSION_UNAVAILABLE','SUPABASE_ORIGIN_UNVERIFIED','NETWORK_READ_UNAVAILABLE','SERVICE_WORKER_CONTROLLED_PAGE']);
 function wire(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(wire);return Object.fromEntries(Object.keys(v).sort().filter(k=>!['payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload'].includes(k)).map(k=>[k,wire(v[k])]));}
 function hash(v){const t=JSON.stringify(wire(v));let hi=0xcbf29ce4,lo=0x84222325;for(let i=0;i<t.length;i++){lo^=t.charCodeAt(i);const next=Math.imul(lo,435);hi=(Math.imul(hi,435)+Math.floor(((lo>>>0)*256+(next>>>0))/4294967296))>>>0;lo=next>>>0;}return hi.toString(16).padStart(8,'0')+lo.toString(16).padStart(8,'0');}
 function numericKey(t){const m=String(t).match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);if(!m)stop('UNSAFE_NUMERIC_EVIDENCE');let digits=(m[2]+(m[3]||'')).replace(/^0+/,'');if(!digits)return '0';let exp=Number(m[4]||0)-(m[3]||'').length;if(!Number.isSafeInteger(exp)||Math.abs(exp)>10000||digits.length>2048)stop('UNSAFE_NUMERIC_EVIDENCE');const zeros=digits.length-digits.replace(/0+$/,'').length;digits=digits.slice(0,digits.length-zeros);return m[1]+digits+'e'+(exp+zeros);}
 function parsePg(text){
  if(typeof text!=='string'||text.length>32*1024*1024)stop('INVALID_CLOUD_TEXT');
  let quoted=false;for(let i=0;i<text.length;i++){
   if(quoted){if(text[i]==='\\')i++;else if(text[i]==='"')quoted=false;continue;}
   if(text[i]==='"'){quoted=true;continue;}
   if(text[i]==='-'||/[0-9]/.test(text[i])){const t=text.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];if(!t||!Number.isFinite(Number(t))||numericKey(t)!==numericKey(JSON.stringify(Number(t))))stop('UNSAFE_NUMERIC_EVIDENCE');i+=t.length-1;}
  }
  const value=JSON.parse(text);function inspect(v){if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){if(['__proto__','prototype','constructor'].includes(k))stop('UNSAFE_CLOUD_SHAPE');inspect(v[k]);}}inspect(value);return value;
 }
 function trace(entries,origin){
  const out=[];for(const e of entries||[]){try{const u=new URL(e.url||e.name);if(u.origin!==origin||!Object.values(PATHS).includes(u.pathname)&&![PUB,PUSH].includes(u.pathname))continue;const status=Number(e.status??e.responseStatus);if(status!==400)continue;const method=['GET','POST'].includes(e.method)?e.method:'UNKNOWN';out.push({endpoint:u.pathname,method,status:400,blocking:u.pathname===PUB?false:[CAP,PUSH,'/rest/v1/zezms_sync_operations'].includes(u.pathname)?true:null,source:'existing-request-metadata'});}catch(_){}}
  return out;
 }
 function project(checkpoint,rows,identity){
  const keys={products:identity.product,stockRows:identity.layer,stockCorrections:identity.correction};const db={};
  for(const collection of Object.keys(keys)){const field=collection==='stockCorrections'?'correctionId':'id',matches=(checkpoint[collection]||[]).filter(v=>id(v[field])===keys[collection]);if(matches.length>1)stop('CLOUD_IDENTITY_AMBIGUOUS');db[collection]=matches.length?copy(matches[0]):null;}
  for(const row of rows)for(const p of row.payload.patches||[]){
   if(p.action?.startsWith('root-')&&Object.keys(keys).includes(p.root))stop('RELEVANT_REPLAY_UNSUPPORTED');
   if(!Object.hasOwn(keys,p.collection)||p.key!==keys[p.collection])continue;
   const field=p.collection==='stockCorrections'?'correctionId':'id',e=p.value||p.fallback||p.before;
   if(!e||id(e[field])!==p.key)stop('CLOUD_PATCH_IDENTITY_MISMATCH');
   if(p.action==='insert'){if(db[p.collection])stop('CLOUD_IDENTITY_AMBIGUOUS');db[p.collection]=copy(p.value);}
   else if(p.action==='delete'){if(!db[p.collection])stop('REPLAY_LAYER_MISSING');db[p.collection]=null;}
   else if(p.action==='update'){
    const target=db[p.collection];if(!target)stop('REPLAY_LAYER_MISSING'); // Never use fallback to fabricate a row.
    for(const c of p.changes||[]){if(['__proto__','constructor','prototype',field].includes(c.field))stop('CLOUD_PATCH_IDENTITY_MISMATCH');if(c.mode==='delta'){if(!Number.isFinite(target[c.field])||!Number.isFinite(c.value))stop('UNSAFE_NUMERIC_EVIDENCE');const n=target[c.field]+c.value;if(p.collection==='stockRows'&&c.field==='rStock'&&n< -1e-6)stop('CLOUD_STOCK_CONFLICT');target[c.field]=Math.abs(n)<1e-9?0:n;}else if(c.mode==='set'){if(Object.hasOwn(c,'value'))target[c.field]=copy(c.value);else delete target[c.field];}else stop('RELEVANT_REPLAY_UNSUPPORTED');}
   }else stop('RELEVANT_REPLAY_UNSUPPORTED');
  }
  return db;
 }
 function references(value,id){if(typeof value==='string')return value.includes(id);if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(v=>references(v,id));for(const [k,v]of Object.entries(value)){if(['correctionId','reversalOf','reversalCorrectionId'].includes(k)&&v===id)return true;if(k==='collection'&&v==='stockCorrections'&&value.key===id)return true;if(references(v,id))return true;}return false;}
 async function run(io){
  const blockers=new Set(),http400=[];const add=c=>blockers.add(c);let before;
  const result=()=>Object.freeze({status:blockers.size?'NO-GO':'GO',readOnly:true,authorizesExecution:false,blockers:[...blockers],http400});
  async function read(name,params={},optional=false){const r=await io.read(name,params);if(r.status===400)http400.push({endpoint:PATHS[name],method:'GET',status:400,blocking:name==='capability'?true:null,source:'preflight-read'});if(!r.ok){if(!optional)add(name==='evidence'?'INDEPENDENT_BINDING_UNAVAILABLE':name==='receipts'?'RECEIPT_GUARD_UNAVAILABLE':name==='capability'?'CAPABILITY_READONLY_PROOF_UNAVAILABLE':'READ_FAILED_'+name.toUpperCase());return null;}return r;}
  async function all(name,params){const rows=[];let total=null;for(let page=0;page<100;page++){
   const r=await read(name,{...params,limit:250,offset:rows.length});if(!r)return null;
   if(!integer(r.count)||r.count>25000||total!==null&&total!==r.count||!Array.isArray(r.data)||r.data.length>250)stop('HISTORY_COVERAGE_UNPROVEN');total=r.count;
   rows.push(...r.data);if(rows.length===total)return rows;if(!r.data.length||rows.length>total)stop('HISTORY_COVERAGE_UNPROVEN');
  }stop('HISTORY_COVERAGE_UNPROVEN');}
  try{
   before=io.capture();const db=JSON.parse(before[KEYS[0]]),s=JSON.parse(before[KEYS[1]]),queue=JSON.parse(before[KEYS[2]]),failed=JSON.parse(before[KEYS[3]]||'[]');
   if(!db||!s||!Array.isArray(queue)||!Array.isArray(failed))stop('LOCAL_EVIDENCE_UNAVAILABLE');
   if(!integer(s.deviceSeq)||!integer(s.cursor))stop('LOCAL_EVIDENCE_UNAVAILABLE');
   if(queue.length)add('OUTBOX_NOT_EMPTY');if(failed.length)add('FAILED_OPERATIONS_PRESENT');
   if(before[KEYS[4]]!==null||before[KEYS[5]]!==null)add('EXISTING_JOURNAL_OR_STAGE');
   if(s.liveSyncEnabled||s.liveSyncDesired)add('LIVE_SYNC_NOT_PAUSED');
   if(s.configurationVerificationRequired||s.directoryOutboxReviewRequired||s.deviceAccessMode!=='OWNER'||!s.initialized)add('LOCAL_AUTHORIZATION_HOLD');
   const candidates=(db.stockCorrections||[]).filter(a=>String(a.createdAt||'').startsWith('2026-11-01')&&a.beforeQty===2&&a.afterQty===0&&a.quantity===2);
   if(candidates.length!==1)stop('ORIGINAL_CORRECTION_NOT_UNIQUELY_IDENTIFIED');
   const audit=candidates[0],a=audit.allocations?.[0],layers=(db.stockRows||[]).filter(r=>id(r.id)===id(a?.stockRowId)),products=(db.products||[]).filter(p=>id(p.id)===id(audit.productId));
   if(!audit.correctionId||!id(audit.productId)||!Number.isFinite(Date.parse(audit.createdAt))||audit.status!=='Completed'||audit.reversalOf!==''||audit.correctionType!=='Quantity Decrease'||audit.reason!=='Physical Count Adjustment'||!Array.isArray(audit.allocations)||audit.allocations.length!==1||a.beforeRStock!==2||a.afterRStock!==0||a.quantity!==2||layers.length!==1||!id(layers[0].id)||products.length!==1||layers[0].rStock!==0||id(layers[0].productId)!==id(audit.productId)||!Number.isFinite(a.unitCost)||a.unitCost<0||a.unitCost!==layers[0].uCost||!same(audit.adjustmentTxnIds,[layers[0].id]))stop('LOCAL_AUDIT_LAYER_LINKAGE_INVALID');
   const identity={correction:audit.correctionId,layer:id(layers[0].id),product:id(audit.productId)},scope={owner_id:'eq.'+s.syncOwnerId};
   const auth=await read('auth');if(!auth||auth.data?.id!==s.syncOwnerId||auth.data.is_anonymous!==false)stop('OWNER_SESSION_NOT_VERIFIED');
   const role=await read('owner',{p_business_id:s.businessId,p_roles:'{OWNER}'});if(role?.data!==true)add('ACTIVE_OWNER_MEMBERSHIP_UNVERIFIED');
   http400.push(...trace(io.observedRequests?.()||[],io.origin));
   const cap=await read('capability',{p_device_id:s.deviceId});
   if(cap){const v=Array.isArray(cap.data)?cap.data[0]:cap.data;if(!v||v.protocol_version!=='M4/3'||v.rules_hash!=='M43-R56-RULES-20260825-A'||v.identity_registry_hash!=='M43-IDREG-20260825-A'||!integer(v.minimum_client_generation)||v.minimum_client_generation>31800||v.business_id!==s.businessId||v.branch_id!==s.branchId)add('PROTOCOL_CONTRACT_UNVERIFIED');else if(v.capabilities?.branchDataPlaneEnabled!==true&&(v.capabilities?.legacyBranchId||v.legacy_branch_id)!==s.branchId)add('BRANCH_DATA_PLANE_NOT_ENABLED');}
   const branch=await read('branches',{business_id:'eq.'+s.businessId,id:'eq.'+s.branchId,select:'id,business_id,status'});
   if(branch?.data?.length!==1||branch.data[0].id!==s.branchId||branch.data[0].business_id!==s.businessId||branch.data[0].status!=='ACTIVE')add('MAIN_BRANCH_SCOPE_UNVERIFIED');
   const life=await read('lifecycle',{...scope,device_id:'eq.'+s.deviceId,select:'owner_id,business_id,branch_id,device_id,lifecycle_state,revoked_at'});
   const devices=await read('devices',{business_id:'eq.'+s.businessId,user_id:'eq.'+s.syncOwnerId,device_id:'eq.'+s.deviceId,select:'business_id,user_id,device_id,revoked_at'});
   if(life?.data?.length!==1||life.data[0].owner_id!==s.syncOwnerId||life.data[0].device_id!==s.deviceId||life.data[0].lifecycle_state!=='ACTIVE'||life.data[0].revoked_at!==null||life.data[0].business_id!==s.businessId||life.data[0].branch_id!==s.branchId||devices?.data?.length!==1||devices.data[0].revoked_at!==null||devices.data[0].user_id!==s.syncOwnerId||devices.data[0].business_id!==s.businessId||devices.data[0].device_id!==s.deviceId)add('MAIN_ENROLLMENT_UNVERIFIED');
   const eResult=await read('evidence',{...scope,correction_id:'eq.'+identity.correction,select:'*,audit_text:audit::text,operation_text:operation::text,stock_before_text:stock_before::text,product_text:product::text'});
   let e=null;if(eResult){if(eResult.data?.length!==1)add('INDEPENDENT_ORIGINAL_BINDING_MISSING');else{e=eResult.data[0];e={...e,audit:parsePg(e.audit_text),operation:parsePg(e.operation_text),stock_before:parsePg(e.stock_before_text),product:parsePg(e.product_text)};}}
   const receipts=await read('receipts',{...scope,correction_id:'eq.'+identity.correction,select:'correction_id,op_id,server_seq'});if(receipts?.data?.length)add('CORRECTION_ALREADY_ACCEPTED');
   async function cloud(){
    const state=await read('state',{...scope,select:'owner_id,revision,protocol_version,rules_hash,identity_registry_hash,minimum_client_generation,capabilities'});
    if(state?.data?.length!==1)stop('CLOUD_OWNER_STATE_UNVERIFIED');const v=state.data[0];
    if(!integer(v.revision)||v.owner_id!==s.syncOwnerId||v.protocol_version!=='M4/3'||v.rules_hash!=='M43-R56-RULES-20260825-A'||v.identity_registry_hash!=='M43-IDREG-20260825-A'||Number(v.minimum_client_generation)>31800)add('PROTOCOL_CONTRACT_UNVERIFIED');
    const operations=await all('operations',{...scope,select:'owner_id,business_id,branch_id,seq,op_id,device_id,device_seq,kind,payload_text:payload::text',order:'seq.asc'});
    const checkpoints=await all('checkpoints',{...scope,select:'owner_id,business_id,branch_id,checkpoint_id,checkpoint_cursor,protocol_version,payload_hash,created_at,superseded_at,payload_text:payload::text',order:'checkpoint_cursor.asc,checkpoint_id.asc'});
    if(!operations||!checkpoints)stop('HISTORY_COVERAGE_UNPROVEN');
    const seen=new Set();let last=0;for(const row of operations){row.payload=parsePg(row.payload_text);if(row.owner_id!==s.syncOwnerId||!integer(row.seq)||row.seq<=last||!row.op_id||seen.has(row.op_id)||row.payload.opId!==row.op_id||row.payload.deviceId!==row.device_id||row.payload.kind!==row.kind||row.payload.protocolVersion!=='M4/3'||!row.payload.payloadHash||row.payload.payloadHash!==hash(row.payload)||!Array.isArray(row.payload.patches))stop('HISTORY_OPERATION_UNVERIFIED');seen.add(row.op_id);last=row.seq;}
    const cpIds=new Set();for(const c of checkpoints){if(c.owner_id!==s.syncOwnerId||!c.checkpoint_id||cpIds.has(c.checkpoint_id)||!integer(c.checkpoint_cursor))stop('CHECKPOINT_COVERAGE_UNVERIFIED');cpIds.add(c.checkpoint_id);c.payload=parsePg(c.payload_text);}
    if(operations.some(r=>references(r.payload,identity.correction))||checkpoints.some(c=>references(c.payload,identity.correction)))add('CORRECTION_REFERENCED_IN_CLOUD');
    const historyText='['+operations.map(r=>'['+r.seq+', '+JSON.stringify(r.op_id)+', '+r.payload_text+']').join(', ')+']';
    return {state:v,operations,checkpoints,head:Math.max(last,0,...checkpoints.map(c=>c.checkpoint_cursor)),historySHA:await io.sha(historyText)};
   }
   io.progress?.('Reading Owner-scoped checkpoint and history evidence…');const first=await cloud();
   const checkpoint=e?first.checkpoints.find(c=>c.checkpoint_id===e.checkpoint_id):first.checkpoints.filter(c=>c.protocol_version==='M4/3').at(-1);
   if(!checkpoint)stop('CHECKPOINT_BASELINE_UNAVAILABLE');
   if(checkpoint.protocol_version!=='M4/3'||checkpoint.business_id!==s.businessId||checkpoint.branch_id&&checkpoint.branch_id!==s.branchId)add('CHECKPOINT_SCOPE_UNVERIFIED');
   const projected=project(checkpoint.payload,first.operations.filter(r=>r.seq>checkpoint.checkpoint_cursor),identity);
   if(!projected.stockRows||!projected.products||id(projected.stockRows.id)!==identity.layer||id(projected.stockRows.productId)!==identity.product||projected.stockRows.rStock!==2||projected.stockCorrections)add('EXACT_CLOUD_BEFORE_STATE_MISMATCH');
   async function counter(){const r=await read('counter',{...scope,collection:'eq.stockRows',entity_key:'eq.'+identity.layer,field_name:'eq.rStock',select:'owner_id,entity_key,value_text:value::text'});if(r?.data?.length!==1||!/^2(?:\.0+)?$/.test(r.data[0].value_text))add('CLOUD_COUNTER_NOT_EXACTLY_TWO');return r?.data;}
   const counterBefore=await counter();
   if(e){
    if(e.owner_id!==s.syncOwnerId||e.business_id!==s.businessId||e.branch_id!==s.branchId||e.device_id!==s.deviceId||e.correction_id!==identity.correction||e.approved_by!==s.syncOwnerId||!same(e.audit,audit)||!same(e.product,products[0])||!same(e.stock_before,projected.stockRows)||!same({...e.stock_before,rStock:0},layers[0])||e.operational_year!==layers[0].year||e.operational_month!==layers[0].month)add('INDEPENDENT_BINDING_MISMATCH');
    if(e.archived_coverage_complete!==true||e.expected_head!==first.head||e.expected_revision!==first.state.revision||e.history_count!==first.operations.length||e.history_sha256!==first.historySHA||e.checkpoint_cursor!==checkpoint.checkpoint_cursor||e.checkpoint_sha256!==await io.sha(checkpoint.payload_text))add('ARCHIVE_OR_HISTORY_PROOF_INSUFFICIENT');
    if(!(Date.parse(e.expires_at)>io.now()))add('INDEPENDENT_BINDING_EXPIRED');
    let review;try{review=JSON.parse(e.review_reference);}catch(_){}
    if(!review||review.format!=='M43_INDEPENDENT_REVIEW_V1'||review.commit!==COMMIT||review.atomicGuardVerified!==true||review.effectivePermissionsVerified!==true||review.originalEvidenceVerified!==true||review.originalAuditSHA256!==await io.sha(e.audit_text))add('INDEPENDENT_GUARD_OR_ORIGINAL_PROOF_MISSING');
    const expected=[{action:'update',collection:'stockRows',key:identity.layer,changes:[{field:'rStock',mode:'delta',value:-2,before:2}],fallback:{...e.stock_before,rStock:0}},{action:'insert',collection:'stockCorrections',key:identity.correction,value:audit}];
    if(first.operations.some(r=>r.op_id===e.operation.opId))add('DELIVERY_OPERATION_ID_ALREADY_USED');
    if(first.operations.some(r=>r.device_id===s.deviceId&&r.device_seq>=e.operation.deviceSeq))add('LOCAL_SEQUENCE_BEHIND_CLOUD');
    if(e.operation.protocolVersion!=='M4/3'||e.operation.kind!=='STOCK_CORRECTION_UPSERT'||e.operation.deviceId!==s.deviceId||e.operation.originDeviceId!==s.deviceId||e.operation.clientGeneration!==31800||e.operation.rulesHash!=='M43-R56-RULES-20260825-A'||e.operation.identityRegistryHash!=='M43-IDREG-20260825-A'||e.operation.deviceSeq!==s.deviceSeq+1||e.operation.payloadHash!==hash(e.operation)||!same(e.operation.patches,expected)||Object.hasOwn(e.operation,'businessId')||Object.hasOwn(e.operation,'branchId'))add('EXISTING_DELIVERY_ENVELOPE_NOT_BOUND');
   }
   io.progress?.('Checking that local and cloud evidence stayed unchanged…');const second=await cloud(),counterAfter=await counter();
   if(!same(first,second)||!same(counterBefore,counterAfter))add('CLOUD_CHANGED_DURING_PREFLIGHT');
   const roleAgain=await read('owner',{p_business_id:s.businessId,p_roles:'{OWNER}'});if(roleAgain?.data!==true)add('ACTIVE_OWNER_MEMBERSHIP_UNVERIFIED');
   const authAgain=await read('auth');if(!authAgain||!same(authAgain.data,auth.data))add('OWNER_SESSION_CHANGED');
   const lifeAgain=await read('lifecycle',{...scope,device_id:'eq.'+s.deviceId,select:'owner_id,business_id,branch_id,device_id,lifecycle_state,revoked_at'});
   const devicesAgain=await read('devices',{business_id:'eq.'+s.businessId,user_id:'eq.'+s.syncOwnerId,device_id:'eq.'+s.deviceId,select:'business_id,user_id,device_id,revoked_at'});
   const branchAgain=await read('branches',{business_id:'eq.'+s.businessId,id:'eq.'+s.branchId,select:'id,business_id,status'});
   if(!same(life?.data,lifeAgain?.data)||!same(devices?.data,devicesAgain?.data)||!same(branch?.data,branchAgain?.data))add('MAIN_SCOPE_CHANGED_DURING_PREFLIGHT');
   if(cap){const again=await read('capability',{p_device_id:s.deviceId});if(!again||!same(cap.data,again.data))add('CAPABILITY_CHANGED_DURING_PREFLIGHT');}
   if(e){const again=await read('evidence',{...scope,correction_id:'eq.'+identity.correction,select:'*,audit_text:audit::text,operation_text:operation::text,stock_before_text:stock_before::text,product_text:product::text'});if(!again||!same(again.data,eResult.data))add('INDEPENDENT_BINDING_CHANGED');}
   if(e&&!(Date.parse(e.expires_at)>io.now()))add('INDEPENDENT_BINDING_EXPIRED');
  }catch(error){add(SAFE_ERRORS.has(error?.message)?error.message:'PREFLIGHT_READ_FAILED');}
  if(before){try{if(!same(before,io.capture()))add('LOCAL_CHANGED_DURING_PREFLIGHT');}catch(_){add('LOCAL_EVIDENCE_UNAVAILABLE');}}
  const unique=new Map(http400.map(e=>[e.source+e.method+e.endpoint,e]));http400.splice(0,http400.length,...unique.values());
  if(!http400.some(e=>e.source==='existing-request-metadata'))add('HTTP400_ENDPOINT_NOT_IDENTIFIED');
  if(http400.some(e=>e.blocking===true))add('HTTP400_ON_DELIVERY_DEPENDENCY');
  if(http400.some(e=>e.blocking===null))add('HTTP400_BLOCKING_EFFECT_UNVERIFIED');
  return result();
 }
 return Object.freeze({run,hash,stable,parsePg,trace,PATHS,KEYS,COMMIT});
});

/* Isolated Main-only, read-only cross-check. No storage writes or mutation endpoints. */
(function () {
 'use strict';
 const PROJECT='https://ruadyqcsutfprrxdaahi.supabase.co';
 const MAIN='9a5ab8eb-f67e-425c-866d-574b641295f0';
 const DB_KEY='tradeflow_v321_zola';
 const CORE=window.ZEZMSMainCashRepairCore;
 const PROJECTOR=window.ZEZMS?.syncIntegrity?._test;
 const KEYS=[DB_KEY,'zezms_cloud_sync_m4_state','zezms_cloud_sync_m4_queue',
  'zezms_cloud_sync_m4_failed_v2','zezms_cloud_sync_m4_apply_journal_v2'];
 const $=id=>document.getElementById(id);
 const runButton=$('run'), downloadButton=$('download'), status=$('status'),
  section=$('results'), pre=$('report');
 let lastReport=null;
 const stop=code=>{throw Error('STOP_'+code);};
 const parse=(value,name)=>{try{return JSON.parse(value);}catch{stop('INVALID_'+name);}};
 const snapshot=()=>Object.fromEntries(KEYS.map(key=>[key,localStorage.getItem(key)]));
 const stable=x=>CORE.stable(x);
 const cents=(x)=>{
  if(typeof x!=='number'||!Number.isFinite(x))stop('INVALID_BALANCE');
  return Math.round(x*100);
 };
 const money=x=>Number((x/100).toFixed(2));
 function readLocal(){
  const raw=snapshot(),db=parse(raw[DB_KEY],'DB'),state=parse(raw.zezms_cloud_sync_m4_state,'STATE'),
   queue=parse(raw.zezms_cloud_sync_m4_queue,'QUEUE'),
   failed=parse(raw.zezms_cloud_sync_m4_failed_v2||'[]','FAILED'),
   journal=raw.zezms_cloud_sync_m4_apply_journal_v2?parse(raw.zezms_cloud_sync_m4_apply_journal_v2,'JOURNAL'):null;
  if(!db||!state||!Array.isArray(queue)||!Array.isArray(failed))stop('LOCAL_SHAPE');
  if(state.deviceId!==MAIN||state.deviceAccessMode!=='OWNER'||state.initialized!==true)stop('NOT_MAIN_OWNER');
  if(queue.length||failed.length||journal)stop('PENDING_OR_FAILED_LOCAL_SYNC');
  if(String(state.supabaseUrl||'').replace(/\/$/,'')!==PROJECT||
   !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(state.publishableKey||''))stop('PRODUCTION_PROJECT_CONFIGURATION');
  const session=parse(localStorage.getItem('zezms-m3-supabase-auth'),'SESSION');
  if(!session?.access_token||!session?.user?.id||session.user.is_anonymous===true||
   !Number.isFinite(session.expires_at)||session.expires_at*1000<Date.now()+60000||
   (state.syncOwnerId&&String(state.syncOwnerId)!==String(session.user.id)))stop('OWNER_SESSION');
  return {raw,db,state,auth:{key:state.publishableKey,token:session.access_token,ownerId:String(session.user.id)}};
 }
 async function get(path,auth,post=false){
  if(post&&path!=='/rest/v1/rpc/zezms_m43_checkpoint_latest')stop('NETWORK_METHOD_BLOCKED');
  const response=await fetch(PROJECT+path,{method:post?'POST':'GET',mode:'cors',credentials:'omit',cache:'no-store',
   headers:{apikey:auth.key,Authorization:'Bearer '+auth.token,Accept:'application/json',
    ...(post?{'Content-Type':'application/json'}:{})},
   ...(post?{body:'{}'}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)stop('CLOUD_READ_HTTP_'+response.status);
  return response.json();
 }
 const rest=(table,obj)=>'/rest/v1/'+table+'?'+new URLSearchParams(obj);
 async function cloudInfo(auth){
  const [user,cp,headRows]=await Promise.all([
   get('/auth/v1/user',auth),get('/rest/v1/rpc/zezms_m43_checkpoint_latest',auth,true),
   get(rest('zezms_sync_operations',{select:'seq',owner_id:'eq.'+auth.ownerId,order:'seq.desc',limit:'1'}),auth)]);
  if(String(user?.id||'')!==auth.ownerId||user.is_anonymous||user.app_metadata?.provider==='anonymous')stop('CLOUD_AUTH');
  const checkpoint=Array.isArray(cp)?cp[0]:cp;
  if(!checkpoint?.payload||checkpoint.protocol_version!=='M4/3'||
   !Number.isSafeInteger(Number(checkpoint.checkpoint_cursor)))stop('M43_CHECKPOINT');
  if(!Array.isArray(headRows)||headRows.length!==1)stop('CLOUD_HEAD');
  const head=Number(headRows[0].seq),base=Number(checkpoint.checkpoint_cursor);
  if(!Number.isSafeInteger(head)||head<base)stop('CLOUD_HEAD_VALUE');
  return {checkpoint,head,base};
 }
 async function readBundle(auth){
  const begin=await cloudInfo(auth),ops=[];
  let cursor=begin.base;
  while(cursor<begin.head){
   const page=await get(rest('zezms_sync_operations',{
    select:'seq,op_id,device_id,device_seq,kind,payload,client_created_at,created_at',
    owner_id:'eq.'+auth.ownerId,seq:'gt.'+cursor,order:'seq.asc',limit:'500'}),auth);
   if(!Array.isArray(page)||!page.length||page.length>500)stop('OPERATION_PAGE');
   for(const row of page){
    const seq=Number(row.seq);
    if(!Number.isSafeInteger(seq)||seq<=cursor||seq>begin.head||!row.op_id||
     !row.payload||String(row.payload.opId||'')!==String(row.op_id)||
     !Array.isArray(row.payload.patches)||
     (row.payload.payloadHash&&row.payload.payloadHash!==CORE.operationHash(row.payload)))stop('OPERATION_INTEGRITY');
    ops.push(row);cursor=seq;
   }
  }
  const end=await cloudInfo(auth);
  if(end.head!==begin.head||stable(end.checkpoint)!==stable(begin.checkpoint))stop('CLOUD_CHANGED');
  return {baseline:begin.checkpoint.payload,baselineCursor:begin.base,
   operations:ops,headSeq:begin.head,protocolVersion:'M4/3',checkpoint:{cursor:begin.base}};
 }
 function sourceOperation(bundle,collection,row){
  const matches=bundle.operations.filter(op=>(op.payload.patches||[]).some(p=>
   p.action==='insert'&&p.collection===collection&&String(p.key)===String(row.id)&&stable(p.value)===stable(row)));
  if(matches.length!==1||!matches[0].payload.payloadHash)stop('SOURCE_OPERATION_'+collection);
  return matches[0];
 }
 function single(rows,id,collection){
  if(!Array.isArray(rows))stop('COLLECTION_'+collection);
  const matches=rows.filter(r=>r&&String(r.id)===String(id));
  if(matches.length!==1)stop('CLOUD_RECORD_'+collection);
  return matches[0];
 }
 function assess(local,cloud,bundle){
  const events=[],opRows=[];
  for(const spec of CORE.CASH){
   const row=single(cloud.cashLog,spec.id,'cashLog');
   if(row.action!=='Deduct'||row.cashType!==spec.wallet||cents(row.amount)!==spec.amount*100||
    !String(row.at||row.date||'').startsWith('2026-10-15')||
    !['ACTIVE',''].includes(String(row.status||'')))stop('CASH_RECORD_PAYLOAD');
   const operation=sourceOperation(bundle,'cashLog',row);
   const allWalletPatches=operation.payload.patches.filter(p=>p.action==='root-object'&&p.root==='cashBalances');
   const matched=allWalletPatches.filter(p=>p.key===spec.wallet&&p.mode==='delta'&&cents(p.value)===-spec.amount*100);
   if(matched.length!==1||allWalletPatches.length!==1)stop('CASH_DELTA_MISMATCH');
   events.push({kind:'cashLog',description:spec.wallet+' deduction',amount:spec.amount,
    presentOnMain:(local.cashLog||[]).some(x=>x?.id===spec.id),sourceSeq:Number(operation.seq),
    sourceOperationVerified:true,cloudRecordVerified:true});
   opRows.push(operation);
  }
  const expense=single(cloud.expenses,CORE.EXPENSE,'expenses');
  const linked=single(cloud.cashLog,CORE.CASH[1].id,'cashLog');
  if(cents(expense.amount)!==10000||expense.wallet!=='Cash in Hand'||
   expense.cashLogId!==CORE.CASH[1].id||linked.meta?.expenseId!==CORE.EXPENSE||
   !String(expense.date||'').startsWith('2026-10-15')||
   !['ACTIVE',''].includes(String(expense.status||'')))stop('LINKED_EXPENSE_PAYLOAD');
  const expenseOp=sourceOperation(bundle,'expenses',expense);
  if(expenseOp.op_id!==opRows[1].op_id)stop('EXPENSE_SOURCE_LINK');
  events.push({kind:'expenses',description:'Linked expense',amount:100,
   presentOnMain:(local.expenses||[]).some(x=>x?.id===CORE.EXPENSE),
   sourceSeq:Number(expenseOp.seq),sourceOperationVerified:true,cloudRecordVerified:true});
  const presence=events.map(x=>x.presentOnMain);
  if(presence.some(Boolean)&&presence.some(x=>!x))stop('PARTIAL_MAIN_RECORDS');
  const already=presence.every(Boolean);
  if((local.cashLog||[]).some(r=>CORE.CASH.some(spec=>spec.id===r?.id)&&
     (local.cashLog||[]).filter(x=>x?.id===r.id).length!==1)||
    (local.expenses||[]).filter(r=>r?.id===CORE.EXPENSE).length>1)stop('LOCAL_DUPLICATE');
  if(already){
   for(const spec of CORE.CASH){
    if(stable(single(local.cashLog,spec.id,'cashLog'))!==stable(single(cloud.cashLog,spec.id,'cashLog')))
     stop('LOCAL_CASH_RECORD_MISMATCH');
   }
   if(stable(single(local.expenses,CORE.EXPENSE,'expenses'))!==stable(expense))stop('LOCAL_EXPENSE_MISMATCH');
  }
  const mainWallets=local.cashBalances,cloudWallets=cloud.cashBalances;
  if(!mainWallets||!cloudWallets||['Cash in Hand','Others'].some(k=>
   !Object.hasOwn(mainWallets,k)||!Object.hasOwn(cloudWallets,k))||
   stable(Object.keys(mainWallets).sort())!==stable(Object.keys(cloudWallets).sort()))stop('WALLET_KEYS');
  const wallets=[];
  for(const wallet of Object.keys(cloudWallets).sort()){
   const localCents=cents(mainWallets[wallet]),cloudCents=cents(cloudWallets[wallet]),diff=localCents-cloudCents;
   const expected=wallet==='Cash in Hand'?17000:wallet==='Others'?7000:0;
   const matches=already?diff===0:(diff===0||diff===expected);
   wallets.push({wallet,main:money(localCents),cloud:money(cloudCents),
    mainMinusCloud:money(diff),permittedDifference:money(expected),matches});
  }
  const walletMatches=wallets.every(x=>x.matches);
  const virtual=JSON.parse(JSON.stringify(local));
  if(!already){
   for(const spec of CORE.CASH)virtual.cashLog.push(JSON.parse(JSON.stringify(single(cloud.cashLog,spec.id,'cashLog'))));
   virtual.expenses.push(JSON.parse(JSON.stringify(expense)));
   for(const wallet of ['Cash in Hand','Others'])virtual.cashBalances[wallet]=cloudWallets[wallet];
  }
  let businessStateMatches=false,businessMismatchReason=null;
  try{CORE.assertBusinessStateMatch(virtual,cloud);businessStateMatches=true;}
  catch(e){businessMismatchReason=String(e.message||e).slice(0,450);}
  return {recordsState:already?'ALREADY_PRESENT':'ALL_FOUR_MISSING',
   events,wallets,walletMatches,businessStateMatches,businessMismatchReason,
   cloudOperationProvenanceVerified:true};
 }
 async function verify(){
  if(!CORE||!PROJECTOR?.projectCloud||location.origin!=='https://fmuniru-gif.github.io'||
   location.pathname!=='/tradeflow-zola/diagnostics/main-cash-verify-r1/')stop('SAME_ORIGIN_MODULES');
  const local=readLocal();
  const bundle=await readBundle(local.auth);
  if(stable(local.raw)!==stable(snapshot()))stop('MAIN_CHANGED_DURING_CHECK');
  if(Number(local.state.cursor)!==bundle.headSeq)stop('CURSOR_VS_HEAD');
  const projection=PROJECTOR.projectCloud(bundle);
  if(!projection?.database||!Array.isArray(projection.conflicts)||projection.conflicts.length)stop('CLOUD_PROJECTION');
  const assessment=assess(local.db,projection.database,bundle);
  if(stable(local.raw)!==stable(snapshot()))stop('MAIN_CHANGED_AFTER_CHECK');
  return {format:'ZEZMS_MAIN_CASH_WALLET_EVIDENCE_V1',generatedAt:new Date().toISOString(),
   scope:'MAIN_ONLY_READ_ONLY',noWrite:true,mainCursor:Number(local.state.cursor),
   cloudHead:bundle.headSeq,m43CheckpointCursor:bundle.baselineCursor,
   queueCount:0,failedCount:0,interruptedApplyJournal:false,
   ...assessment,
   conclusion:assessment.walletMatches&&assessment.businessStateMatches?
    'EVIDENCE_MATCHES_REVIEW_ONLY_NO_REPAIR_AUTHORIZED':'STOP_UNRELATED_STATE_OR_WALLET_DIFFERENCE'};
 }
 function show(report){lastReport=report;pre.textContent=JSON.stringify(report,null,2);
  section.hidden=false;downloadButton.disabled=false;
  status.textContent=report.conclusion==='EVIDENCE_MATCHES_REVIEW_ONLY_NO_REPAIR_AUTHORIZED'?
   'Read-only evidence passes. No repair was performed or authorized.':
   'Read-only verification found a discrepancy. No repair was performed.';
 }
 runButton.addEventListener('click',async()=>{
  runButton.disabled=true;downloadButton.disabled=true;lastReport=null;section.hidden=true;
  status.textContent='Comparing Main and stable Owner cloud projection. No data will change.';
  try{show(await verify());}catch(error){
   const message=String(error?.message||error).slice(0,500);
   show({format:'ZEZMS_MAIN_CASH_WALLET_EVIDENCE_V1',scope:'MAIN_ONLY_READ_ONLY',
    generatedAt:new Date().toISOString(),conclusion:'STOP_NO_MUTATION',reason:message,noWrite:true});
  }finally{runButton.disabled=false;}
 });
 downloadButton.addEventListener('click',()=>{
  if(!lastReport)return;
  const blob=new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}),
   url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='ZEZMS_Main_Cash_Wallet_Evidence_READ_ONLY.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
})();

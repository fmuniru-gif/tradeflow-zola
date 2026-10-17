/* Standalone Main-only repair. Cloud traffic is GET-only; the sole business write is one local DB key. */
(function () {
  'use strict';
  const core=window.ZEZMSMainCashRepairCore;
  const projector=window.ZEZMS?.syncIntegrity?._test;
  const PROJECT='https://ruadyqcsutfprrxdaahi.supabase.co';
  const DB_KEY='tradeflow_v321_zola';
  const KEYS=[DB_KEY,'zezms_cloud_sync_m4_state','zezms_cloud_sync_m4_queue',
    'zezms_cloud_sync_m4_failed_v2','zezms_cloud_sync_m4_rejected',
    'zezms_cloud_sync_m4_applied_v2','zezms_cloud_sync_m4_apply_journal_v2'];
  const $=id=>document.getElementById(id);
  const status=$('status'),preview=$('preview'),details=$('details'),backupButton=$('backup'),repairButton=$('repair');
  let current=null,verifiedBackup=null,busy=false;
  const stop=code=>{throw Error('STOP_'+code);};
  const parse=(text,label)=>{try{return JSON.parse(text);}catch{stop('INVALID_'+label);}};
  const readRaw=()=>Object.fromEntries(KEYS.map(key=>[key,localStorage.getItem(key)]));
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  async function sha(text){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));}
  function setStatus(message){status.textContent=message;}
  function readLocal(){
    const raw=readRaw();
    const db=parse(raw[DB_KEY],'DATABASE'),state=parse(raw.zezms_cloud_sync_m4_state,'STATE');
    const queue=parse(raw.zezms_cloud_sync_m4_queue,'QUEUE');
    const failed=parse(raw.zezms_cloud_sync_m4_failed_v2||'[]','FAILED');
    const applied=parse(raw.zezms_cloud_sync_m4_applied_v2||'{}','APPLIED');
    const journal=raw.zezms_cloud_sync_m4_apply_journal_v2?
      parse(raw.zezms_cloud_sync_m4_apply_journal_v2,'JOURNAL'):null;
    if(!db||!state||!Array.isArray(queue)||!Array.isArray(failed)||
      !applied||typeof applied!=='object'||Array.isArray(applied))stop('LOCAL_SHAPE');
    return {raw,db,state,queue,failed,applied,journal};
  }
  function credentials(state){
    if(state.supabaseUrl?.replace(/\/$/,'')!==PROJECT||
      !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(state.publishableKey||''))
      stop('PRODUCTION_PROJECT_CONFIGURATION');
    const session=parse(localStorage.getItem('zezms-m3-supabase-auth'),'OWNER_SESSION');
    if(!session?.access_token||!session?.user?.id||!Number.isFinite(session.expires_at)||
      session.expires_at*1000<Date.now()+60000||session.user.is_anonymous===true)
      stop('Genuine Owner cloud session is required. Sign in on Main, close the app tab, then reopen this page.');
    return {key:state.publishableKey,token:session.access_token,ownerId:String(session.user.id)};
  }
  async function getJson(url,auth){
    const response=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{apikey:auth.key,Authorization:'Bearer '+auth.token,Accept:'application/json'},
      signal:AbortSignal.timeout(30000)});
    if(!response.ok)stop('CLOUD_READ_'+response.status);
    return response.json();
  }
  async function getOwner(auth){
    const user=await getJson(PROJECT+'/auth/v1/user',auth);
    if(!user?.id||String(user.id)!==auth.ownerId||user.is_anonymous===true||
      user.app_metadata?.provider==='anonymous')stop('OWNER_AUTH');
    return user;
  }
  function rest(table,query){return PROJECT+'/rest/v1/'+table+'?'+new URLSearchParams(query);}
  async function master(auth){
    const rows=await getJson(rest('zezms_sync_state',{
      select:'owner_id,payload,revision,operation_cursor,sync_mode,updated_at,updated_by',
      owner_id:'eq.'+auth.ownerId}),auth);
    if(!Array.isArray(rows)||rows.length!==1||String(rows[0].owner_id)!==auth.ownerId||
      rows[0].sync_mode!=='operations'||!rows[0].payload)stop('CLOUD_MASTER');
    return rows[0];
  }
  async function head(auth,baseline){
    const rows=await getJson(rest('zezms_sync_operations',{
      select:'seq',owner_id:'eq.'+auth.ownerId,order:'seq.desc',limit:'1'}),auth);
    if(!Array.isArray(rows)||rows.length>1)stop('CLOUD_HEAD_READ');
    const seq=rows.length?Number(rows[0].seq):baseline;
    if(!Number.isSafeInteger(seq)||seq<baseline)stop('CLOUD_HEAD_VALUE');
    return seq;
  }
  async function bundle(auth){
    const firstMaster=await master(auth),baseline=Number(firstMaster.operation_cursor);
    if(!Number.isSafeInteger(baseline)||baseline<0)stop('BASELINE_CURSOR');
    const firstHead=await head(auth,baseline),operations=[];
    let cursor=baseline;
    while(cursor<firstHead){
      const rows=await getJson(rest('zezms_sync_operations',{
        select:'seq,op_id,device_id,device_seq,kind,payload,client_created_at,created_at',
        owner_id:'eq.'+auth.ownerId,seq:'gt.'+cursor,order:'seq.asc',limit:'500'}),auth);
      if(!Array.isArray(rows)||!rows.length||rows.length>500)stop('CLOUD_PAGE');
      for(const row of rows){
        const seq=Number(row.seq);
        if(!Number.isSafeInteger(seq)||seq<=cursor||seq>firstHead)stop('CLOUD_PAGE_ORDER');
        operations.push(row);cursor=seq;
      }
    }
    const secondHead=await head(auth,baseline),secondMaster=await master(auth);
    if(firstHead!==secondHead||core.stable(firstMaster)!==core.stable(secondMaster))stop('CLOUD_CHANGED_DURING_PREFLIGHT');
    return {ownerId:auth.ownerId,baseline:firstMaster.payload,baselineCursor:baseline,
      operations,headSeq:firstHead,master:firstMaster};
  }
  async function gather(){
    if(!core||!projector?.projectCloud||!projector?.compareDatabases||
      location.origin!=='https://fmuniru-gif.github.io'||
      !location.pathname.startsWith('/tradeflow-zola/diagnostics/main-cash-repair/'))
      stop('REVIEWED_SAME_ORIGIN_MODULES');
    const local=readLocal(),auth=credentials(local.state);
    await getOwner(auth);
    const cloudBundle=await bundle(auth);
    const projection=projector.projectCloud(cloudBundle);
    window.ZEZMS.cloudSync={getAppliedOperations:()=>local.applied,getState:()=>local.state,
      getOutbox:()=>local.queue};
    const report=projector.compareDatabases(local.db,projection.database,cloudBundle);
    report.cloudProjectionConflicts=projection.conflicts;
    const plan=core.assess({local:local.db,cloud:projection.database,state:local.state,
      queue:local.queue,failed:local.failed,applyJournal:local.journal,report,
      bundle:cloudBundle,ownerId:auth.ownerId});
    return {local,auth,bundle:cloudBundle,cloud:projection.database,plan,report};
  }
  function show(result){
    const plan=result.plan;
    details.textContent=JSON.stringify({deviceId:plan.deviceId,cloudHead:plan.headSeq,
      wallets:plan.balances.filter(x=>x.wallet==='Cash in Hand'||x.wallet==='Others'),
      sourceOperations:plan.operations,exactCloudRecords:plan.records},null,2);
    preview.hidden=false;
    backupButton.disabled=plan.status!=='READY';
    repairButton.disabled=plan.status!=='READY'||!verifiedBackup;
    setStatus(plan.status==='ALREADY_REPAIRED'?'Already repaired: cloud records and wallet balances match. No write is needed.':
      'Read-only preflight passed. Review the four exact cloud records, then save and verify the full backup.');
  }
  async function automatic(){
    busy=true;backupButton.disabled=true;repairButton.disabled=true;
    try{current=await gather();verifiedBackup=null;show(current);}
    catch(error){current=null;verifiedBackup=null;preview.hidden=true;setStatus(error.message||String(error));}
    finally{busy=false;}
  }
  async function saveBackup(){
    if(busy||!current||current.plan.status!=='READY')return;
    busy=true;backupButton.disabled=true;repairButton.disabled=true;
    try{
      if(typeof window.showSaveFilePicker!=='function')stop('VERIFIABLE_FILE_SAVE_UNAVAILABLE');
      const pass=$('passphrase').value;
      if(pass.length<20||pass.length>1024)stop('BACKUP_PASSPHRASE_LENGTH');
      const handle=await window.showSaveFilePicker({suggestedName:'ZEZMS_Main_Cash_PreRepair_Encrypted.json',
        types:[{description:'Encrypted JSON',accept:{'application/json':['.json']}}]});
      if(core.stable(readRaw())!==core.stable(current.local.raw))stop('LOCAL_CHANGED_BEFORE_BACKUP');
      const snapshot={format:'ZEZMS_MAIN_CASH_REPAIR_BACKUP_V1',at:new Date().toISOString(),
        deviceId:core.MAIN,cloudHead:current.plan.headSeq,raw:current.local.raw};
      const plaintext=JSON.stringify(snapshot),salt=crypto.getRandomValues(new Uint8Array(16)),
        iv=crypto.getRandomValues(new Uint8Array(12)),encoder=new TextEncoder();
      const material=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);
      const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,
        {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(plaintext)));
      const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)
        s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(s);};
      const encrypted=JSON.stringify({format:'ZEZMS_MAIN_CASH_REPAIR_ENCRYPTED_V1',kdf:'PBKDF2-SHA256',
        iterations:600000,cipher:'AES-256-GCM',salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)});
      const writable=await handle.createWritable();await writable.write(encrypted);await writable.close();
      const readback=await (await handle.getFile()).text();
      if(readback!==encrypted)stop('BACKUP_READBACK');
      const check=JSON.parse(readback),decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,
        Uint8Array.from(atob(check.ciphertext),c=>c.charCodeAt(0)));
      if(new TextDecoder().decode(decoded)!==plaintext||core.stable(readRaw())!==core.stable(snapshot.raw))
        stop('BACKUP_VERIFICATION');
      verifiedBackup={at:Date.now(),raw:current.local.raw,sha256:await sha(readback),
        beforeSha256:await sha(current.local.raw[DB_KEY]),cloudHead:current.plan.headSeq};
      repairButton.disabled=false;
      setStatus('Full encrypted backup saved, read back and decrypted successfully. Review the preview, then confirm once.');
    }catch(error){verifiedBackup=null;setStatus(error.message||String(error));}
    finally{$('passphrase').value='';busy=false;backupButton.disabled=!current||current.plan.status!=='READY';}
  }
  async function repair(){
    if(busy||!current||!verifiedBackup)return;
    busy=true;backupButton.disabled=true;repairButton.disabled=true;
    let committed=false;
    try{
      if(Date.now()-verifiedBackup.at>30*60*1000)stop('BACKUP_EXPIRED');
      const fresh=await gather();
      if(fresh.plan.status!=='READY'||fresh.plan.headSeq!==verifiedBackup.cloudHead||
        core.stable(fresh.local.raw)!==core.stable(verifiedBackup.raw)||
        core.stable(fresh.plan.records)!==core.stable(current.plan.records)||
        core.stable(fresh.plan.balances)!==core.stable(current.plan.balances))stop('PREFLIGHT_CHANGED');
      if(!window.confirm('Repair only Main: restore these exact four cloud records and set Cash in Hand and Personal Wallet to the verified cloud balances? The encrypted backup has been verified.')){
        setStatus('Cancelled. No data changed.');return;
      }
      if(document.visibilityState!=='visible'||core.stable(readRaw())!==core.stable(verifiedBackup.raw))
        stop('LOCAL_CHANGED_BEFORE_COMMIT');
      const headNow=await head(fresh.auth,Number(fresh.bundle.baselineCursor));
      const masterNow=await master(fresh.auth);
      if(headNow!==fresh.plan.headSeq||core.stable(masterNow)!==core.stable(fresh.bundle.master)||
        core.stable(readRaw())!==core.stable(verifiedBackup.raw))
        stop('HEAD_OR_LOCAL_CHANGED_BEFORE_COMMIT');
      const next=core.candidate(fresh.local.db,fresh.plan,{at:new Date().toISOString(),
        backupSha256:verifiedBackup.sha256,beforeSha256:verifiedBackup.beforeSha256});
      core.assertOnlyExpectedChanges(fresh.local.db,next,fresh.plan);
      const precheck=projector.compareDatabases(next,fresh.cloud,fresh.bundle);
      if(precheck.differences.length||precheck.unappliedCloudOperations.length||
        Object.keys(fresh.cloud.cashBalances).some(w=>Number(next.cashBalances[w])!==Number(fresh.cloud.cashBalances[w])))
        stop('CANDIDATE_POST_COMPARE');
      if(core.stable(readRaw())!==core.stable(verifiedBackup.raw))stop('LOCAL_CHANGED_AT_COMMIT');
      localStorage.setItem(DB_KEY,JSON.stringify(next));committed=true;
      if(localStorage.getItem(DB_KEY)!==JSON.stringify(next))stop('DATABASE_READBACK');
      const post=await gather();
      if(post.plan.status!=='ALREADY_REPAIRED'||post.report.differences.length||
        post.plan.balances.some(x=>x.difference!==0)||
        KEYS.slice(1).some(key=>post.local.raw[key]!==verifiedBackup.raw[key]))stop('POST_COMPARE');
      current=post;verifiedBackup=null;show(post);
      setStatus('PASS: Main matches the current cloud projection for all compared records and cash balances. No operation was queued. Keep the encrypted backup.');
    }catch(error){setStatus((committed?'REPAIR_SAVED_POSTCHECK_STOP: ':'NO_CHANGE: ')+(error.message||String(error)));
      verifiedBackup=null;
      if(committed)current=null;}
    finally{busy=false;backupButton.disabled=!current||current.plan.status!=='READY';}
  }
  backupButton.addEventListener('click',saveBackup);
  repairButton.addEventListener('click',repair);
  window.addEventListener('storage',event=>{
    if(KEYS.includes(event.key)){
      verifiedBackup=null;repairButton.disabled=true;
      setStatus('STOP_LOCAL_CHANGED_IN_ANOTHER_TAB: close all other TradeFlow tabs and reload this page.');
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible'&&verifiedBackup){
      verifiedBackup=null;repairButton.disabled=true;
      setStatus('STOP_PAGE_LEFT_FOREGROUND: rerun the preflight and backup before repair.');
    }
  });
  automatic();
})();

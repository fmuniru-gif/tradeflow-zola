/* Inserted INSIDE the production embedded M4/3 closure. Healthy devices use
 * every original path. Shop stays write/upload locked even after verification. */
var shopCore=window.ZEZMSShopRecoveryCore;
var shopBound=String(state.deviceId||'')===shopCore.DEVICE;
function shopHeld(){return shopBound;}
function shopStop(detail){throw new Error('SHOP_STOP_RECOVERY_HOLD: Shop directory recovery holds all uploads and local posting.'+(typeof detail==='string'?' '+detail:''));}
var shopBasePushOne=pushOne;
pushOne=async function(operation){if(shopHeld())shopStop();return shopBasePushOne(operation);};
var shopBaseQueueOperation=queueOperation;
queueOperation=function(operation){if(shopHeld())shopStop();return shopBaseQueueOperation(operation);};
var shopBasePublishRoot=publishRoot;
publishRoot=async function(){if(shopHeld())shopStop();return shopBasePublishRoot.apply(this,arguments);};
var shopBaseBootstrap=bootstrapFromThisDevice,shopBaseDownload=downloadCloudMaster;
bootstrapFromThisDevice=async function(){if(shopHeld())shopStop();return shopBaseBootstrap.apply(this,arguments);};
downloadCloudMaster=async function(){if(shopHeld())shopStop();return shopBaseDownload.apply(this,arguments);};
var shopBaseMainQuarantine=r70sQuarantineMainDirectoryOutbox;
r70sQuarantineMainDirectoryOutbox=async function(){if(shopHeld())shopStop();return shopBaseMainQuarantine.apply(this,arguments);};
window.ZEZMS.cloudSync.quarantineMainDirectoryOutboxR70S=r70sQuarantineMainDirectoryOutbox;
var shopBaseOnSave=onLocalSave;
function shopBusinessText(database){
  var value={};shopCore.COLLECTIONS.forEach(function(k){value[k]=database[k]||[];});
  shopCore.ROOTS.forEach(function(k){value[k]=database[k];});return shopCore.stable(value);
}
var shopObservedBusiness=null;
function shopLoadBusinessGuard(){
  if(shopObservedBusiness===null){var original=localStorage.getItem(DB_KEY);if(!original)shopStop('Saved database unavailable.');shopObservedBusiness=shopBusinessText(JSON.parse(original));}
}
onLocalSave=function(){if(shopHeld()){
  shopLoadBusinessGuard();
  if(shopBusinessText(getDatabase()||{})!==shopObservedBusiness){var old=JSON.parse(shopObservedBusiness),current=JSON.parse(shopBusinessText(getDatabase()||{}));shopStop('Changed synchronized roots: '+Object.keys(current).filter(function(k){return shopCore.stable(current[k])!==shopCore.stable(old[k]);}).join(','));}
  // Local staff login audit/lockout fields are not synchronized business data.
  // They may be saved without creating a directory publication or operation.
  return false;
}return shopBaseOnSave.apply(this,arguments);};
function shopInstallSaveGuard(){
  if(!shopHeld()||typeof window.saveDB!=='function')return false;
  if(window.saveDB.__shopDirectorySaveGuard)return true;
  var originalSave=window.saveDB;
  var guarded=function(){shopLoadBusinessGuard();if(shopBusinessText(getDatabase()||{})!==shopObservedBusiness){var before=JSON.parse(shopObservedBusiness),now=JSON.parse(shopBusinessText(getDatabase()||{}));shopStop('Changed synchronized roots: '+Object.keys(now).filter(function(k){return shopCore.stable(now[k])!==shopCore.stable(before[k]);}).join(','));}return originalSave.apply(this,arguments);};
  guarded.__shopDirectorySaveGuard=true;
  guarded.__managerScopeLastLoginWrapped=originalSave.__managerScopeLastLoginWrapped===true;
  window.saveDB=guarded;return true;
}
if(shopHeld()){shopInstallSaveGuard();[250,900].forEach(function(delay){setTimeout(shopInstallSaveGuard,delay);});}
var shopBaseReady=isReadyForLocalOperations;
isReadyForLocalOperations=function(){return shopHeld()?false:shopBaseReady();};
var shopBaseCapability=r70CapabilityGuard;
r70CapabilityGuard=async function(){if(shopHeld())shopStop();return shopBaseCapability.apply(this,arguments);};
window.ZEZMS_M43_CAPABILITY_GUARD=r70CapabilityGuard;
var shopBaseInit=initCore;
initCore=async function(){
  if(!shopHeld())return shopBaseInit();
  // Do not run SDK initialization merely to check saved configuration. The
  // dedicated preflight verifies the existing token through read-only HTTP.
  queue=loadJSON(QUEUE_KEY,[]);failedOperations=loadJSON(FAILED_KEY,[]);
  appliedOperations=loadJSON(APPLIED_KEY,{});r70sDirectoryQueueHold=true;
  shopInstallSaveGuard();
  state.status=configured()?'shop-directory-recovery-hold':'not-configured';
  safeRender();return false;
};
if(shopHeld())r70sDirectoryQueueHold=true;
var shopBaseCode=r67hConnectionCode,shopBaseLabel=r67hConnectionLabel;
r67hConnectionCode=function(){if(shopHeld())return configured()?'SHOP_DIRECTORY_RECOVERY_HOLD':'SHOP_CONFIGURATION_INVALID';return shopBaseCode();};
r67hConnectionLabel=function(code){if(code==='SHOP_DIRECTORY_RECOVERY_HOLD')return 'Directory recovery hold — cloud authority not yet verified';if(code==='SHOP_CONFIGURATION_INVALID')return configurationError(state.supabaseUrl,state.publishableKey);return shopBaseLabel(code);};
var shopBaseStatusLabel=statusLabel;
statusLabel=function(){return shopHeld()?r67hConnectionLabel(r67hConnectionCode()):shopBaseStatusLabel();};
var shopBaseReview=window.ZEZMS.cloudSync.getDirectoryOutboxReview;
window.ZEZMS.cloudSync.getDirectoryOutboxReview=function(){if(!shopHeld())return shopBaseReview();return {required:true,count:queue.length,readOnly:true,reason:'SHOP_RECOVERY_HOLD'};};

function shopReloadRuntime(){
  state=loadState();queue=loadJSON(QUEUE_KEY,[]);failedOperations=loadJSON(FAILED_KEY,[]);appliedOperations=loadJSON(APPLIED_KEY,{});
  var saved=JSON.parse(localStorage.getItem(DB_KEY));
  if(typeof DB!=='undefined'&&DB&&saved){Object.keys(DB).forEach(function(k){delete DB[k];});Object.assign(DB,saved);}
  shopObservedBusiness=shopBusinessText(getDatabase()||{});
  r70sDirectoryQueueHold=true;observedSnapshot=null;
}
async function shopExclusive(){
  // A candidate worker must enumerate every window, including uncontrolled old
  // tabs. Unsupported/old workers fail closed. No skipWaiting or cache reset.
  var controller=navigator.serviceWorker&&navigator.serviceWorker.controller;
  if(!controller)throw Error('SHOP_STOP_REVIEWED_WORKER_REQUIRED');
  var channel=new MessageChannel();
  var response=await new Promise(function(resolve,reject){
    var timer=setTimeout(function(){channel.port1.close();reject(Error('SHOP_STOP_TAB_CHECK_TIMEOUT'));},5000);
    channel.port1.onmessage=function(event){clearTimeout(timer);channel.port1.close();resolve(event.data);};
    controller.postMessage({type:'ZEZMS_SHOP_RECOVERY_CLIENTS'},[channel.port2]);
  });
  if(!response||response.guard!=='shop-directory-v2'||response.count!==1||response.onlyClientUrl!==location.href)
    throw Error('SHOP_STOP_CLOSE_OTHER_TRADEFLOW_TABS');
}
async function shopReadCloud(savedState){
  var project='https://ruadyqcsutfprrxdaahi.supabase.co';
  if(String(savedState.supabaseUrl||'').replace(/\/$/,'')!==project||!savedState.publishableKey)
    throw Error('SHOP_STOP_PRODUCTION_CONFIGURATION');
  var auth;try{auth=JSON.parse(localStorage.getItem('zezms-m3-supabase-auth'));}catch(_){}
  if(!auth||!auth.access_token||!auth.user||auth.user.id!==savedState.syncOwnerId||auth.user.is_anonymous===true||Number(auth.expires_at)*1000<Date.now()+120000)
    throw Error('SHOP_STOP_VALID_OWNER_SESSION_REQUIRED');
  async function request(path,rpc){
    var allowed=['zezms_m43_checkpoint_latest','zezms_m5a4_canonical_fleet_read'];
    if(rpc&&!allowed.includes(path))throw Error('SHOP_STOP_WRITE_REQUEST_BLOCKED');
    var response=await fetch(project+(rpc?'/rest/v1/rpc/'+path:path),{
      method:rpc?'POST':'GET',credentials:'omit',cache:'no-store',
      headers:{apikey:savedState.publishableKey,Authorization:'Bearer '+auth.access_token,Accept:'application/json',...(rpc?{'Content-Type':'application/json'}:{})},
      ...(rpc?{body:JSON.stringify(rpc)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('SHOP_STOP_CLOUD_READ_HTTP_'+response.status);
    return response.json();
  }
  function rest(table,query){return '/rest/v1/'+table+'?'+new URLSearchParams(query);}
  var user=await request('/auth/v1/user');
  if(!user||user.id!==savedState.syncOwnerId||user.is_anonymous===true||user.app_metadata?.provider==='anonymous')throw Error('SHOP_STOP_OWNER_IDENTITY');
  async function context(){
    var values=await Promise.all([
      request('zezms_m43_checkpoint_latest',{}),
      request(rest('zezms_sync_operations',{select:'seq',owner_id:'eq.'+user.id,order:'seq.desc',limit:'1'})),
      request('zezms_m5a4_canonical_fleet_read',{p_business_id:savedState.businessId}),
      request(rest('zezms_device_lifecycle',{select:'id,device_id,owner_id,business_id,lifecycle_state,revision',device_id:'eq.'+shopCore.DEVICE,owner_id:'eq.'+user.id,business_id:'eq.'+savedState.businessId})),
      request(rest('zezms_sync_state',{select:'owner_id,sync_mode,revision,operation_cursor',owner_id:'eq.'+user.id})),
      request(rest('zezms_sync_operations',{select:'seq,op_id,payload',owner_id:'eq.'+user.id,op_id:'in.('+shopCore.IDS.join(',')+')',order:'seq.asc'}))
    ]);
    var checkpoint=Array.isArray(values[0])?values[0][0]:values[0];
    if(!checkpoint||values[0]?.length>1||!Array.isArray(values[1])||values[1].length!==1||!Array.isArray(values[3])||values[3].length!==1||!Array.isArray(values[4])||values[4].length!==1||values[4][0].owner_id!==user.id||values[4][0].sync_mode!=='operations')throw Error('SHOP_STOP_AUTHORITY_READ');
    return {checkpoint:checkpoint,head:Number(values[1][0].seq),fleet:values[2],lifecycle:values[3][0],master:values[4][0],accepted:values[5]};
  }
  var first=await context(),operations=[],cursor=Number(first.checkpoint.checkpoint_cursor);
  if(!Number.isSafeInteger(cursor)||!Number.isSafeInteger(first.head)||cursor>first.head)throw Error('SHOP_STOP_CLOUD_CURSOR');
  while(cursor<first.head){
    var page=await request(rest('zezms_sync_operations',{select:'seq,op_id,owner_id,device_id,payload,created_at',owner_id:'eq.'+user.id,and:'(seq.gt.'+cursor+',seq.lte.'+first.head+')',order:'seq.asc',limit:'500'}));
    if(!Array.isArray(page)||!page.length||page.length>500)throw Error('SHOP_STOP_CLOUD_PAGE');
    for(var row of page){if(row.owner_id!==user.id||!Number.isSafeInteger(Number(row.seq))||Number(row.seq)<=cursor||Number(row.seq)>first.head)throw Error('SHOP_STOP_CLOUD_ORDER');row.seq=Number(row.seq);operations.push(row);cursor=row.seq;}
  }
  var second=await context();
  if(shopCore.stable(first)!==shopCore.stable(second)||localStorage.getItem('zezms-m3-supabase-auth')!==JSON.stringify(auth)){
    // Session storage can use different whitespace. Compare semantic content.
    if(shopCore.stable(first)!==shopCore.stable(second)||shopCore.stable(JSON.parse(localStorage.getItem('zezms-m3-supabase-auth')))!==shopCore.stable(auth))throw Error('SHOP_STOP_CLOUD_OR_SESSION_CHANGED');
  }
  return Object.assign(first,{ownerId:user.id,businessId:savedState.businessId,operations:operations,checkedAt:new Date().toISOString()});
}
var shopRecovery=null;
if(shopHeld()){
  shopRecovery=shopCore.create({storage:localStorage,crypto:window.crypto,online:function(){return navigator.onLine;},exclusive:shopExclusive,
    runtime:function(){var owner=localOwnerStaff();return {role:owner?'OWNER':'',staffId:owner?String(owner.user.id):'',deviceId:state.deviceId,cursor:Number(state.cursor),queue:queue,db:getDatabase()};},
    readCloud:shopReadCloud,operationHash:deterministicHash,entityKey:entityKey,validateOperation:validateOperationIdentity,validateDatabase:validateAppliedState,
    verifyCheckpoint:function(payload,hash){return ZEZMS.managedDevices._test.verifyCheckpointPayloadHash(payload,hash);},
    integrity:{projectCloud:function(b){return ZEZMS.syncIntegrity._test.projectCloud(b);},compareDatabases:function(a,b,c){return ZEZMS.syncIntegrity._test.compareDatabases(a,b,c);},findOrphans:function(db){return ZEZMS.syncIntegrity._test.findOrphans(db);}},reloadRuntime:shopReloadRuntime});
}
function shopRecoveryHtml(){
  if(!shopHeld()||!localOwnerStaff())return '';
  return '<section class="card" id="shopRecoveryPanel"><h3>ZEZMS Shop — preserved directory recovery</h3><p>All Shop uploads and local posting remain held. These are staff authorization publications, not business transactions or device enrollment records. Main and other devices are outside this control.</p>'
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'preflight\')">Read-only Shop preflight</button> '
    +'<label>Archive passphrase (20+ characters; never saved)<input id="shopArchivePass" type="password" autocomplete="off"></label>'
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'archive\')">Save and verify full encrypted recovery backup</button> '
    +'<label>Previously saved encrypted evidence<input id="shopArchiveFile" type="file" accept=".json"></label>'
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'verifyArchive\')">Verify saved archive</button> '
    +'<button class="btn warn" onclick="zezmsShopRecoveryAction(\'quarantine\')">Quarantine exact three (offline)</button> '
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'prepareReceive\')">Read-only receive preflight</button> '
    +'<button class="btn warn" onclick="zezmsShopRecoveryAction(\'receive\')">Confirm receive only</button> '
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'resume\')">Resume interrupted receive only</button> '
    +'<button class="btn" onclick="zezmsShopRecoveryAction(\'verifyCurrent\')">Verify current Cloud-vs-Local</button> '
    +'<button class="btn warn" onclick="zezmsShopRecoveryAction(\'rollback\')">Restore preserved local state (offline)</button>'
    +'<button class="btn warn" onclick="zezmsShopRecoveryAction(\'restoreExternal\')">Restore verified external backup — lost journal (offline)</button>'
    +'<pre id="shopRecoveryReport" style="white-space:pre-wrap">No recovery action has run. Keep the original encrypted evidence permanently.</pre></section>';
}
var shopOldSettings=window.ZEZMS.cloudSync.settingsHtml;
window.ZEZMS.cloudSync.settingsHtml=function(){return shopOldSettings()+shopRecoveryHtml();};
window.zezmsShopRecoveryAction=async function(action){
  var report=document.getElementById('shopRecoveryReport');if(!shopRecovery||!localOwnerStaff())throw Error('SHOP_STOP_OWNER_REQUIRED');
  var pass=document.getElementById('shopArchivePass'),secret=pass?pass.value:'';if(pass)pass.value='';
  try{
    var result;
    if(action==='preflight')result=await shopRecovery.preflight();
    else if(action==='archive'){
      if(typeof window.showSaveFilePicker!=='function')throw Error('SHOP_STOP_FILE_READBACK_UNAVAILABLE');
      var handle=await showSaveFilePicker({suggestedName:'ZEZMS_Shop_Full_Recovery_Backup_'+Date.now()+'.json',types:[{description:'Encrypted full recovery backup',accept:{'application/json':['.json']}}]});
      result=await shopRecovery.saveArchive(handle,secret);
    }else if(action==='verifyArchive'){
      var file=document.getElementById('shopArchiveFile')?.files[0];if(!file)throw Error('SHOP_STOP_SELECT_SAVED_ARCHIVE');result=await shopRecovery.verifyArchive(file,secret);
    }else if(action==='quarantine'){
      if(!confirm('Quarantine ONLY these Shop operations, without upload or cloud acknowledgement?\n'+shopCore.IDS.join('\n')+'\nThe saved encrypted archive must already be verified. Shop must be offline.'))return;
      result=await shopRecovery.quarantine('QUARANTINE EXACT THREE');
    }else if(action==='prepareReceive')result=await shopRecovery.prepareReceive();
    else if(action==='receive'||action==='resume'){
      if(!confirm('Receive current authoritative cloud operations ONLY? No upload or Live Sync will be enabled. A stable cloud preflight and verified archive are required.'))return;
      result=await shopRecovery[action]('RECEIVE ONLY');
    }else if(action==='verifyCurrent')result=await shopRecovery.verifyCurrent();
    else if(action==='rollback'){
      if(!confirm('Restore ONLY this preserved Shop local state? This restores the three operations to a held queue, never uploads them, and requires the verified archive and offline mode.'))return;
      result=await shopRecovery.rollback('RESTORE PRESERVED LOCAL STATE');
    }else if(action==='restoreExternal'){
      if(!confirm('Restore the complete original Shop state ONLY from the verified external full backup? Use only for a missing/damaged journal, fully offline. Unknown later data or changed retained credentials blocks restoration. Uploads remain held.'))return;
      result=await shopRecovery.restoreExternal('RESTORE VERIFIED EXTERNAL BACKUP');
    }else throw Error('SHOP_STOP_UNKNOWN_ACTION');
    report=document.getElementById('shopRecoveryReport')||report;if(report)report.textContent=JSON.stringify(result,null,2);
    return result;
  }catch(error){report=document.getElementById('shopRecoveryReport')||report;if(report)report.textContent=String(error.message||error).match(/SHOP_STOP_[A-Z0-9_]+/)?.[0]||'SHOP_STOP_CHECK_FAILED';throw error;}
};
Object.assign(window.ZEZMS.cloudSync,{shopRecovery:shopRecovery,isShopDirectoryRecoveryHeld:shopHeld,start:startLiveSync,reconnectNow:r67hReconnectNow,publishRoot:publishRoot,onLocalSave:onLocalSave,isReadyForLocalOperations:isReadyForLocalOperations});
// Durable queue reads at the last upload hop above are supplemented by the
// unconditional identity hold. Old candidate tabs cannot clear it by changing
// their in-memory queue or by replaying an authentication callback.
if(shopHeld())window.addEventListener('storage',function(event){if([shopCore.KEY,STATE_KEY,QUEUE_KEY].includes(event.key)){stopRealtime();if(pushTimer){clearTimeout(pushTimer);pushTimer=null;}}});

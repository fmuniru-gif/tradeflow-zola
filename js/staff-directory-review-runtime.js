/* Runs in the native Cloud closure; existing transport and recovery holds are retained. */
(function(){
 'use strict';
 var core=window.ZEZMSStaffDirectoryReviewCore,plan=null,busy=false,message='';
 var LEGACY='zezms_cloud_sync_m4_directory_quarantine_v1',ARCHIVE='zezms_main_timestamp_directory_archive_v1';
 function stop(text){throw Error('STAFF_REVIEW_STOP: '+text);}
 function eligible(){try{return state.deviceId===core.DEVICE&&state.deviceAccessMode==='OWNER'&&requireLocalOwner().user;}catch(_){return false;}}
 function business(){var snapshot=cleanSnapshot(getDatabase());delete snapshot.sharedDeviceAuth;return JSON.stringify(snapshot);}
 function guard(){var owner=requireLocalOwner();if(!eligible())stop('Use the established Main Owner device.');ZEZMS.bootstrapPhaseA.requireNoStage();if(ZEZMS.canonicalRestore&&ZEZMS.canonicalRestore.getState().pending)stop('Restore verification is pending.');if(failedOperations.length||pushInFlight||pullInFlight||syncWorkPending)stop('A sync operation or failed item needs review first.');return owner.user.id;}
 function capture(){return {queueRaw:localStorage.getItem(QUEUE_KEY),legacyRaw:localStorage.getItem(LEGACY),business:business(),deviceId:state.deviceId,businessId:state.businessId,ownerId:state.syncOwnerId,cursor:state.cursor,deviceSeq:state.deviceSeq};}
 function unchanged(p){var n=capture();if(JSON.stringify(n)!==JSON.stringify(p))stop('Main changed after review; run the review again.');if(JSON.stringify(queue)!==p.queueRaw)stop('The stored queue differs from the active queue.');}
 async function legacy(raw,q){var a;try{a=JSON.parse(raw);}catch(_){stop('The existing three-operation archive is unavailable.');}if(!a||a.version!==1||a.deviceId!==state.deviceId||a.operationIds.length!==3||a.operations.length!==3||await r70sSha256(a.originalQueueRaw)!==a.sha256||q.some(o=>a.operationIds.includes(o.opId)))stop('Preserve and review the original archive.');}
 async function review(){
  plan=null;var owner=guard();await shopExclusive();var snap=capture();if(!snap.queueRaw)stop('The queue is unavailable.');var q=JSON.parse(snap.queueRaw);await legacy(snap.legacyRaw,q);
  var first=await fetchCloudAuditBundle(),cloud=core.cloudDirectory(first,state,deterministicHash);core.verify(state,q,cloud,getDatabase(),deterministicHash);
  var second=await fetchCloudAuditBundle(),again=core.cloudDirectory(second,state,deterministicHash);if(first.headSeq!==second.headSeq||core.stable(cloud)!==core.stable(again))stop('Cloud changed during review; retry.');
  unchanged(snap);if(guard()!==owner)stop('Owner changed during review.');
  plan={snapshot:snap,owner:owner,sha256:await r70sSha256(snap.queueRaw),cloudHead:first.headSeq,cloud:cloud,expires:Date.now()+180000,ids:q.map(o=>o.opId)};
  unchanged(snap);message='Nine timestamp-only operations verified against Cloud at '+first.headSeq+'. No staff-access changes differ. Disconnect Main from the internet, then archive within three minutes.';safeRender();return summary();
 }
 function summary(){return {ready:!!plan&&Date.now()<=plan.expires,count:plan?plan.ids.length:0,cloudHead:plan&&plan.cloudHead,sha256:plan&&plan.sha256,message:message};}
 async function archive(){
  var owner=guard();if(!plan||Date.now()>plan.expires||owner!==plan.owner)stop('Run a fresh online review first.');if(navigator.onLine)stop('Disconnect Main from the internet before archiving.');await shopExclusive();unchanged(plan.snapshot);
  var q=JSON.parse(plan.snapshot.queueRaw);core.verify(state,q,plan.cloud,getDatabase(),deterministicHash);await legacy(plan.snapshot.legacyRaw,q);if(await r70sSha256(plan.snapshot.queueRaw)!==plan.sha256)stop('The queue hash changed.');
  if(!window.confirm('Archive exactly the nine reviewed timestamp-only staff-directory operations? Their original bytes will be preserved separately from the older three-operation archive. Business data and Cloud records will not change. Sync will remain paused until you reopen Main and explicitly reconnect.'))return false;
  unchanged(plan.snapshot);if(navigator.onLine||guard()!==owner||Date.now()>plan.expires)stop('Review conditions changed.');
  var record={version:1,decision:'OWNER_REVIEWED_TIMESTAMP_ONLY_ARCHIVE',createdAt:new Date().toISOString(),deviceId:state.deviceId,businessId:state.businessId,ownerId:state.syncOwnerId,ownerStaffId:owner,cloudHead:plan.cloudHead,sha256:plan.sha256,originalQueueRaw:plan.snapshot.queueRaw,operationIds:plan.ids,legacyArchiveSha256:await r70sSha256(plan.snapshot.legacyRaw),note:'No upload, cloud acknowledgement, staff edit or business database mutation. Reopen required; sync remains paused.'};
  var raw=JSON.stringify(record),existing=localStorage.getItem(ARCHIVE);if(existing){var e;try{e=JSON.parse(existing);}catch(_){stop('The timestamp archive is invalid.');}if(e.sha256!==record.sha256||e.originalQueueRaw!==record.originalQueueRaw)stop('A different timestamp archive already exists.');raw=existing;}
  unchanged(plan.snapshot);if(navigator.onLine||guard()!==owner||Date.now()>plan.expires)stop('Review conditions changed.');
  if(!existing)localStorage.setItem(ARCHIVE,raw);if(localStorage.getItem(ARCHIVE)!==raw)stop('Archive verification failed; queue preserved.');
  stopRealtime();setState({liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:true,directoryOutboxReviewRequired:true,status:'ready'},false);
  var paused=JSON.parse(localStorage.getItem(STATE_KEY)||'null');if(!paused||paused.liveSyncEnabled!==false||paused.liveSyncDesired!==false||paused.configurationVerificationRequired!==true)stop('The pause was not saved; queue preserved.');
  unchanged(plan.snapshot);if(navigator.onLine||guard()!==owner||Date.now()>plan.expires)stop('Review conditions changed.');
  try{localStorage.setItem(QUEUE_KEY,'[]');if(localStorage.getItem(QUEUE_KEY)!=='[]')throw Error('Queue read-back failed.');}catch(error){try{localStorage.setItem(QUEUE_KEY,plan.snapshot.queueRaw);}catch(_){}stop('Queue write failed. Remain offline and preserve the archive.');}
  queue=[];r70sDirectoryQueueHold=false;setState({directoryOutboxReviewRequired:false,status:'ready'},false);
  // initCore exited early under the original hold. Never invent an observed baseline here.
  // The explicit paused/configuration gate prevents transport; a normal reopen initializes it.
  message='Nine timestamp-only operations archived. Keep the archive. Close all TradeFlow tabs/windows and reopen Main, then select Reconnect now.';plan=null;safeRender();notify(message,'ok');return true;
 }
 async function action(name){if(busy)return false;busy=true;try{guard();if(!await ZEZMS.staffAuth.confirmSensitive(name==='review'?'Review redundant staff-directory updates':'Archive reviewed timestamp-only staff updates'))return false;guard();return await navigator.locks.request('zezms-main-staff-directory-review',{mode:'exclusive',ifAvailable:true},async function(lock){if(!lock)stop('Another review is running.');return name==='review'?review():archive();});}catch(error){message=String(error&&error.message||error);safeRender();notify(message,'err');return false;}finally{busy=false;}}
 function html(){if(!eligible())return '';var pending=r70sDirectoryPending().length;if(!pending&&!localStorage.getItem(ARCHIVE))return '';var text=message||(pending?'Review the nine preserved login-timestamp publications against the current Cloud staff list. Other staff changes and business operations remain blocked.':'Timestamp archive recorded. After reopening Main, select Reconnect now to run the normal sync checks.');return '<div class="notice warn" id="staffTimestampReview"><b>Timestamp-only staff directory review</b><p>'+esc(text)+'</p>'+(pending?'<button class="btn ghost" type="button" onclick="ZEZMS.cloudSync.staffDirectoryReview.action(\'review\')">Review nine timestamp updates</button> <button class="btn ghost" type="button" '+(!summary().ready?'disabled ':'')+'onclick="ZEZMS.cloudSync.staffDirectoryReview.action(\'archive\')">Archive reviewed timestamp updates (offline)</button>':'<p>The original three-operation archive and the new timestamp archive are retained separately.</p>')+'</div>';}
 var oldCard=ZEZMS.cloudSync.syncCardHtml,oldSettings=ZEZMS.cloudSync.settingsHtml;
 ZEZMS.cloudSync.syncCardHtml=function(){return oldCard()+html();};ZEZMS.cloudSync.settingsHtml=function(){return oldSettings()+html();};
 ZEZMS.cloudSync.staffDirectoryReview=Object.freeze({action:action,getState:summary});
})();

/* ZEZMS TradeFlow v3.31.13 / r70M — Device control-plane projection.
 *
 * Lifecycle rows are the authoritative operational source. Enrollment or
 * directory status is evidence only and may never upgrade a retired, revoked
 * or replaced lifecycle into an active device.
 */
(function () {
  'use strict';
  var BUILD='20261006-r70m-device-control-plane-stabilization';
  var rows=[];
  var filter='ALL';
  var loading=false;
  function up(value){return String(value||'').trim().toUpperCase();}
  function text(value){return String(value==null?'':value);}
  function esc(value){return text(value).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function idOf(item){return text(item&&(item.lifecycle_id||item.lifecycleId||item.id));}
  function deviceIdOf(item){return text(item&&(item.device_id||item.deviceId));}
  function parentOf(item){return text(item&&(item.replaces_lifecycle_id||item.replacement_parent_lifecycle_id||item.parent_lifecycle_id||item.replacesLifecycleId));}
  function childOf(item){return text(item&&(item.replaced_by_lifecycle_id||item.replacement_child_lifecycle_id||item.child_lifecycle_id||item.replacedByLifecycleId||item.replacement_device_id||item.replaced_by_device_id));}
  function lifecycleOf(item){return up(item&&(item.lifecycle_state||item.lifecycle||item.device_status||item.status));}
  function enrollmentOf(item){return up(item&&(item.enrollment_status||item.enrolled_status||item.registration_status||item.device_access_status));}
  function resolveCanonicalDeviceState(item){
    var lifecycle=lifecycleOf(item), enrollment=enrollmentOf(item), hasChild=!!childOf(item), state='FAILED / EXPIRED';
    if(lifecycle==='ACTIVE')state='ACTIVE';
    else if(lifecycle==='VERIFYING')state='AWAITING OWNER APPROVAL';
    else if(['ENROLLING','BOOTSTRAPPING'].indexOf(lifecycle)>=0)state='VERIFYING';
    else if(lifecycle==='RETIRED')state=hasChild?'REPLACED':'RETIRED';
    else if(lifecycle==='REVOKED')state='REVOKED';
    else if(['REPLACED','SUPERSEDED'].indexOf(lifecycle)>=0||hasChild)state='REPLACED';
    else if(['EXPIRED','FAILED','CANCELLED','CANCELED'].indexOf(lifecycle)>=0)state='FAILED / EXPIRED';
    var denied=['REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(state)>=0;
    return {
      lifecycleState:lifecycle||'UNKNOWN', enrollmentStatus:enrollment||'UNKNOWN', canonicalState:state,
      authenticationEligible:state==='ACTIVE', operationalAccess:!denied&&state==='ACTIVE',
      staleEnrollmentActive:enrollment==='ACTIVE'&&state!=='ACTIVE',
      contradiction:enrollment==='ACTIVE'&&state!=='ACTIVE'?'Enrollment projection is stale; authoritative lifecycle denies operational access.':'',
      replacementParent:parentOf(item), replacementChild:childOf(item)
    };
  }
  function lineageRoot(item, byId){
    var current=item, seen={}, next=parentOf(current);
    while(next&&byId[next]&&!seen[next]){seen[next]=true;current=byId[next];next=parentOf(current);}
    return idOf(current)||deviceIdOf(current)||idOf(item)||deviceIdOf(item);
  }
  function rank(item){return Number(item.revision||0)*10000000000000+Number(new Date(item.last_seen_at||item.updated_at||item.created_at||0).getTime()||0);}
  function projectFleet(input){
    var source=Array.isArray(input)?input:[];
    var byId={};source.forEach(function(item){if(idOf(item))byId[idOf(item)]=item;});
    var normalized=source.map(function(item){var canonical=resolveCanonicalDeviceState(item);return Object.assign({},clone(item),canonical,{lineageId:lineageRoot(item,byId)});});
    var activeByLineage={};
    normalized.filter(function(item){return item.canonicalState==='ACTIVE';}).forEach(function(item){
      var prior=activeByLineage[item.lineageId]; if(!prior||rank(item)>rank(prior))activeByLineage[item.lineageId]=item;
    });
    var active=[],pending=[],history=[];
    normalized.forEach(function(item){
      if(item.canonicalState==='ACTIVE'){
        if(activeByLineage[item.lineageId]===item)active.push(item);
        else {item.canonicalState='CONFLICTING ACTIVE';item.operationalAccess=false;item.authenticationEligible=false;item.contradiction='More than one lifecycle projects ACTIVE in this lineage. The newest record is shown operationally; this row requires Owner review.';pending.push(item);}
      } else if(['VERIFYING','AWAITING OWNER APPROVAL','CONFLICTING ACTIVE'].indexOf(item.canonicalState)>=0)pending.push(item);
      else history.push(item);
    });
    active.sort(function(a,b){return text(a.device_name||a.device_id).localeCompare(text(b.device_name||b.device_id));});
    pending.sort(function(a,b){return rank(b)-rank(a);});history.sort(function(a,b){return rank(b)-rank(a);});
    return {active:active,pending:pending,history:history,all:normalized};
  }
  function cloud(){return window.ZEZMS&&ZEZMS.cloudSync?ZEZMS.cloudSync:null;}
  function ownerClient(){var s=cloud(),state=s&&s.getState?s.getState():{};if(!s||!s.getClient||!s.getSession||!s.getSession().user)throw new Error('Sign in on an Owner/Admin device to manage the fleet.');if(up(state.deviceAccessMode)==='PAIRED')throw new Error('Device management is available on Owner/Admin devices.');return {client:s.getClient(),state:state};}
  function businessId(){var s=cloud()&&cloud().getState?cloud().getState():{};return text(s.businessId||'');}
  function when(value){if(!value)return '—';var d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString();}
  function badge(value){var state=up(value),kind=state==='ACTIVE'||state==='HEALTHY'?'ok':/REVOKED|FAILED|CONFLICT/.test(state)?'bad':/RETIRED|REPLACED|ATTENTION/.test(state)?'warn':'info';return '<span class="badge '+kind+'">'+esc(value)+'</span>';}
  function health(item){if(item.canonicalState!=='ACTIVE')return item.canonicalState==='AWAITING OWNER APPROVAL'?'Awaiting approval':'Needs attention';var failed=Number(item.failed_operation_count||item.failed_operations||0),queued=Number(item.pending_outbox_count||item.queue_count||0);return failed||queued?'Needs attention':'Healthy';}
  function action(item){var m=window.ZEZMS&&ZEZMS.managedDevices,id=idOf(item),safeId=esc(JSON.stringify(id));if(!m||!id)return '—';if(item.canonicalState==='ACTIVE')return '<button class="btn sm ghost" onclick="ZEZMS.managedDevices.retire('+safeId+')">Retire</button> <button class="btn sm danger" onclick="ZEZMS.managedDevices.revoke('+safeId+')">Revoke</button>';if(item.canonicalState==='AWAITING OWNER APPROVAL')return '<button class="btn sm" onclick="ZEZMS.managedDevices.activate('+safeId+','+Number(item.revision||0)+')">Approve</button>';return '—';}
  function rowHtml(item,history){return '<tr><td><b>'+esc(item.device_name||item.device_id||'ZEZMS Device')+'</b><br><small class="mono">'+esc(deviceIdOf(item))+'</small></td><td>'+esc(item.enrollment_mode||item.mode||'Device')+'</td><td>'+esc(item.branch_name||item.branch_code||'Unassigned')+'</td><td>'+badge(item.canonicalState)+'</td><td>'+badge(health(item))+'</td><td>'+esc(when(item.last_seen_at))+'</td><td>'+esc(item.app_version||'—')+'</td><td>'+(history?'<small>'+esc(item.replacementParent?'Replaces '+item.replacementParent:item.replacementChild?'Replaced by '+item.replacementChild:item.contradiction||'Historical record')+'</small>':action(item))+'</td></tr>';}
  function table(items,history){return '<div class="table-wrap"><table><thead><tr><th>Device</th><th>Role/type</th><th>Branch</th><th>Status</th><th>Sync health</th><th>Last seen</th><th>App</th><th>'+ (history?'Lineage':'Action') +'</th></tr></thead><tbody>'+(items.map(function(item){return rowHtml(item,history);}).join('')||'<tr><td colspan="8" class="empty">None.</td></tr>')+'</tbody></table></div>';}
  function cardHtml(){
    var projection=projectFleet(rows), historyRows=filter==='ALL'?projection.history:projection.history.filter(function(item){return item.canonicalState===filter;});
    return '<style id="r70mDeviceStyles">[data-zezms-managed-lifecycle="r70h"]{display:none!important}</style><section class="card" data-zezms-device-control-plane="r70m" style="margin-top:12px"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Device Control Center</h3><span class="badge ok">r70M</span></div><p class="muted">Add or recover a device, let it verify, then approve it. Technical replay details remain available only when action is required.</p><h4>Active Devices</h4>'+table(projection.active,false)+'<div class="row" style="margin-top:10px"><button class="btn" onclick="ZEZMS.deviceControlPlaneR70M.add()">Add device</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70M.replace()">Recover / replace device</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70M.refresh()">Refresh</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70M.downloadReport()">Download fleet reconciliation report</button></div>'+(projection.pending.length?'<h4 style="margin-top:18px">Pending / Needs Attention</h4>'+table(projection.pending,false):'')+'<details style="margin-top:18px"><summary><b>Device History</b> ('+projection.history.length+')</summary><p class="muted">Historical identities are preserved for audit and do not have operational Cloud access.</p><label>Filter <select onchange="ZEZMS.deviceControlPlaneR70M.setHistoryFilter(this.value)"><option value="ALL"'+(filter==='ALL'?' selected':'')+'>All history</option><option value="REPLACED"'+(filter==='REPLACED'?' selected':'')+'>Replaced</option><option value="RETIRED"'+(filter==='RETIRED'?' selected':'')+'>Retired</option><option value="REVOKED"'+(filter==='REVOKED'?' selected':'')+'>Revoked</option><option value="FAILED / EXPIRED"'+(filter==='FAILED / EXPIRED'?' selected':'')+'>Failed enrollment</option></select></label>'+table(historyRows,true)+'</details></section>';
  }
  function hideLegacyEnrollmentPanels(){try{Array.prototype.forEach.call(document.querySelectorAll('h1,h2,h3,h4'),function(heading){if(/secure device enrollment|enrolled devices/i.test(text(heading.textContent))){var card=heading.closest&&heading.closest('.card');if(card&&!card.hasAttribute('data-zezms-device-control-plane')){card.style.display='none';card.setAttribute('data-zezms-r70m-legacy-enrollment-hidden','true');}}});}catch(_){}}
  function renderSoon(){setTimeout(hideLegacyEnrollmentPanels,0);}
  async function refresh(force){if(loading)return rows;loading=true;try{var pair=ownerClient(),id=businessId();if(!id)throw new Error('The active business is unavailable.');var result=await pair.client.rpc('zezms_m5a4_managed_fleet_with_branch',{p_business_id:id});if(result.error)throw result.error;rows=Array.isArray(result.data)?result.data:[];if(typeof render==='function')render();renderSoon();return projectFleet(rows);}finally{loading=false;}}
  function replaceView(){var base=window.viewSettings;if(typeof base!=='function'||base.__r70mDeviceControlWrapped)return false;var wrapped=function(){var html=base.apply(this,arguments);renderSoon();return html+cardHtml();};wrapped.__r70mDeviceControlWrapped=true;window.viewSettings=wrapped;return true;}
  function add(){var m=window.ZEZMS&&ZEZMS.managedDevices;if(!m)return false;m.beginDialog('ADD');return true;}
  function replace(){var m=window.ZEZMS&&ZEZMS.managedDevices;if(!m)return false;m.beginDialog('REPLACEMENT');return true;}
  function setHistoryFilter(value){filter=['ALL','REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(value)>=0?value:'ALL';if(typeof render==='function')render();}
  function fleetReport(){return projectFleet(rows).all.map(function(item){return {deviceId:deviceIdOf(item),name:text(item.device_name),lifecycleMode:text(item.enrollment_mode||item.mode),canonicalStatus:item.canonicalState,enrollmentStatus:item.enrollmentStatus,authenticationEligible:item.authenticationEligible,replacementParent:item.replacementParent,replacementChild:item.replacementChild,branch:text(item.branch_name||item.branch_code),lastSeen:text(item.last_seen_at),appVersion:text(item.app_version),verifiedCursor:item.verified_cursor==null?null:Number(item.verified_cursor),showInActive:item.canonicalState==='ACTIVE'&&item.operationalAccess,historyOnly:['REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(item.canonicalState)>=0,contradiction:item.contradiction};});}
  function downloadReport(){var report={build:BUILD,generatedAt:new Date().toISOString(),readOnly:true,records:fleetReport()};var blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ZEZMS_Fleet_Reconciliation_r70M_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);return report;}
  function install(){replaceView();renderSoon();document.documentElement.setAttribute('data-zezms-device-control-plane','r70m');}
  window.ZEZMS=window.ZEZMS||{};
  window.ZEZMS.deviceControlPlaneR70M={build:BUILD,refresh:function(){return refresh(true);},add:add,replace:replace,setHistoryFilter:setHistoryFilter,downloadReport:downloadReport,getProjection:function(){return projectFleet(rows);},_test:{resolveCanonicalDeviceState:resolveCanonicalDeviceState,projectFleet:projectFleet,fleetReport:fleetReport}};
  [0,400,1200].forEach(function(wait){setTimeout(install,wait);});
}());

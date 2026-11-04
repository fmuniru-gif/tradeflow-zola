/* Owner/Admin device presentation. Cloud authority and confirmation remain required. */
(function () {
  'use strict';
  const DAY=86400000, TTL=60000, slots=new Map(), rendered=new WeakMap();
  let cache=null, inFlight=null, lastError='', showAll=false;
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sync=()=>window.ZEZMS&&ZEZMS.cloudSync;
  const state=()=>sync()&&sync().getState?sync().getState():{};
  function businessId(){const s=state();if(s.businessId)return String(s.businessId);const f=ZEZMS.commercialFoundation&&ZEZMS.commercialFoundation.getState?ZEZMS.commercialFoundation.getState():{};return String(f.businessId||f.context&&f.context.business_id||'');}
  function staff(){try{return ZEZMS.staffAuth&&ZEZMS.staffAuth.getContext?ZEZMS.staffAuth.getContext():null;}catch(_){return null;}}
  function allowed(){
    const user=staff(),s=state();
    return !!(user&&user.user&&user.user.id&&user.user.active!==false&&['OWNER','ADMIN'].includes(String(user.role).toUpperCase())
      &&s.initialized&&s.deviceId
      &&![s.deviceAccessStatus,s.lifecycleState,s.lifecycle_state].some(status=>['REVOKED','RETIRED','DISABLED','REPLACED'].includes(String(status||'').toUpperCase())));
  }
  function requireManager(){if(!allowed())throw Error('Device recovery and administration require a signed-in Owner or Admin on a registered active device.');return staff();}
  function actor(){try{return allowed()&&sync().getOwnerManagementContext?sync().getOwnerManagementContext():{ready:false};}catch(_){return {ready:false};}}
  function contextKey(){const s=state(),u=staff(),a=actor();return JSON.stringify([u&&u.user&&u.user.id,u&&u.role,s.deviceId,s.syncOwnerId,businessId(),!!a.ready,a.session&&a.session.user&&a.session.user.id]);}
  async function requireActor(mfa){
    requireManager();
    const a=actor(),s=state();
    if(!a.ready||!a.client||!a.session||!a.session.user||String(a.session.user.id)!==String(s.syncOwnerId))throw Error('Verify the Owner cloud account in Cloud settings to view or manage the device directory.');
    if(mfa&&!a.temporary){if(typeof sync().ensureMfa!=='function')throw Error('Cloud authenticator verification is unavailable.');if(!(await sync().ensureMfa()))throw Error('Cloud authenticator verification was cancelled.');}
    requireManager();
    const after=actor();
    if(!after.ready||after.client!==a.client||String(after.session&&after.session.user&&after.session.user.id)!==String(a.session.user.id)||String(state().syncOwnerId)!==String(s.syncOwnerId)||String(state().businessId)!==String(s.businessId)||String(state().deviceId)!==String(s.deviceId))throw Error('Device administration context changed. Refresh and retry.');
    return {client:a.client,session:a.session,state:Object.assign({},state(),{businessId:businessId()})};
  }
  function version(){try{return typeof APP_VERSION!=='undefined'?String(APP_VERSION):'';}catch(_){return '';}}
  function active(device){
    if(!device||device.revoked_at||device.authentication_eligible===false)return false;
    const status=String(device.lifecycle_state||device.device_status||device.status||'ACTIVE').toUpperCase();
    return status==='ACTIVE';
  }
  function recent(device,now,currentVersion){return active(device)&&!!currentVersion&&String(device.app_version||'').trim()===currentVersion&&Date.parse(device.last_seen_at)>=now-7*DAY;}
  function select(records,now=Date.now(),currentVersion=version(),all=showAll){return (Array.isArray(records)?records:[]).filter(device=>device&&typeof device==='object'&&(all||recent(device,now,currentVersion)));}
  function records(){return allowed()&&actor().ready&&cache&&cache.key===contextKey()?cache.rows.slice():[];}
  function date(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleString():'Unknown';}
  function verifyHtml(){return state().deviceAccessMode==='PAIRED'?'<p class="muted">Verify the Owner cloud account in Cloud settings to load the device directory.</p><button class="btn sm ghost" onclick="ZEZMS.deviceCards.focusVerification()">Verify Owner access</button>':'<p class="muted">An Owner must sign in to the business Cloud account on this device before its device directory can load.</p>';}
  function controls(kind){
    if(!allowed())return '';
    if(!actor().ready)return verifyHtml();
    const all=records(),visible=select(all);
    return '<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:11px">'
      +(showAll?'All device records':('Active · reported app '+esc(version())+' · seen within 7 days'))+' · '+visible.length+' shown / '+all.length+' total</span>'
      +'<button id="deviceFilter-'+kind+'" class="btn sm ghost" type="button" aria-pressed="'+showAll+'" onclick="ZEZMS.deviceCards.toggle()">'+(showAll?'Show recent active devices':'Show all device records')+'</button>'
      +'<button class="btn sm ghost" type="button" onclick="ZEZMS.deviceCards.refresh()">Refresh devices</button></div>'
      +(lastError?'<p class="err" role="status">'+esc(lastError)+'</p>':'');
  }
  function rows(kind){
    if(!allowed())return '<tr><td colspan="6" class="empty">Owner/Admin access is required.</td></tr>';
    if(!actor().ready)return '<tr><td colspan="6" class="empty">Cloud verification is required to load the device directory.</td></tr>';
    if(!cache||cache.key!==contextKey())return '<tr><td colspan="6" class="empty">'+(lastError?esc(lastError):'Loading device directory…')+'</td></tr>';
    const current=String(state().deviceId||'');
    return select(records()).map(device=>{
      const id=String(device.device_id||''),isCurrent=id===current,isActive=active(device),name=device.device_name||'ZEZMS Device';
      const identity=esc(name)+(isCurrent?' <span class="badge ok">THIS DEVICE</span>':'');
      const badge='<span class="badge '+(isActive?'ok':'bad')+'">'+esc(device.revoked_at?'REVOKED':(device.lifecycle_state||device.device_status||device.status||'ACTIVE'))+'</span>';
      const action=!isActive?'—':isCurrent?'<button class="btn sm ghost" disabled>Current device</button>':'<button class="btn sm danger" onclick="secureDeviceEnrollmentOpenRevocation('+esc(JSON.stringify(id))+','+esc(JSON.stringify(String(name)))+')">Revoke</button>';
      const cells=kind==='registered'?[identity,'<span class="mono" style="font-size:10px">'+esc(id)+'</span>',esc(device.app_version||'—'),esc(date(device.last_seen_at)),badge,action]
        :[identity+'<br><span class="muted mono" style="font-size:10px">'+esc(id)+'</span>',String(device.metadata&&device.metadata.access_mode||'').toUpperCase()==='PAIRED_ANONYMOUS'?'Paired device':'Registered device',badge,esc(date(device.last_seen_at)),esc(device.app_version||'—'),action];
      return '<tr id="deviceRow-'+kind+'-'+esc(encodeURIComponent(id))+'">'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>';
    }).join('')||'<tr><td colspan="6" class="empty">No devices match this view. Select Show all device records to review older or revoked entries.</td></tr>';
  }
  function html(kind){
    if(!allowed())return '';
    const headings=kind==='registered'?['Device','Device ID','App','Last seen','Status','Action']:['Device','Type','Status','Last seen','App','Action'];
    return '<hr class="hr"><h3>'+(kind==='registered'?'Registered devices':'Enrolled devices')+'</h3><div id="deviceControls-'+kind+'">'+controls(kind)+'</div>'
      +'<div class="table-wrap"><table><thead><tr>'+headings.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody id="deviceRows-'+kind+'">'+rows(kind)+'</tbody></table></div>';
  }
  function update(node,content){
    if(!node||rendered.get(node)===content)return;
    if(node.innerHTML===content){rendered.set(node,content);return;}
    const wrap=node.closest('.table-wrap'),top=wrap&&wrap.scrollTop,left=wrap&&wrap.scrollLeft,focused=document.activeElement,focusId=focused&&node.contains(focused)?focused.id:'';
    node.innerHTML=content;
    rendered.set(node,content);
    if(wrap){wrap.scrollTop=top;wrap.scrollLeft=left;}
    if(focusId){const target=document.getElementById(focusId);if(target)target.focus({preventScroll:true});}
  }
  function paint(){for(const kind of ['registered','enrolled']){update(document.getElementById('deviceControls-'+kind),controls(kind));update(document.getElementById('deviceRows-'+kind),rows(kind));}}
  async function load(force){
    const pair=await requireActor(false),key=contextKey();
    if(!pair.state.businessId)throw Error('The registered business ID is unavailable. Refresh commercial context first.');
    if(!force&&cache&&cache.key===key&&Date.now()-cache.at<TTL)return cache.rows.slice();
    if(inFlight&&inFlight.key===key){if(!force)return inFlight.promise;await inFlight.promise.catch(()=>{});if(key!==contextKey())throw Error('Device directory context changed.');return load(true);}
    const request=(async()=>{
      try{
        const response=await ZEZMS.syncResilience.transport.read(signal=>pair.client.from('zezms_business_devices')
          .select('device_id,device_name,platform,app_version,last_seen_at,revoked_at,revocation_reason,user_id,metadata,created_at')
          .eq('business_id',pair.state.businessId).order('last_seen_at',{ascending:false}).abortSignal(signal));
        if(key!==contextKey())throw Error('Device directory context changed; the response was discarded.');
        if(!Array.isArray(response.data)||response.data.some(row=>!row||typeof row!=='object'||Array.isArray(row)||typeof row.device_id!=='string'||!row.device_id.trim())||new Set(response.data.map(row=>row.device_id)).size!==response.data.length)throw Error('The device directory returned an invalid response.');
        cache={key,at:Date.now(),rows:response.data.slice()};lastError='';return cache.rows.slice();
      }catch(error){if(key===contextKey())lastError=String(error.message||error);throw error;}
      finally{if(inFlight&&inFlight.key===key)inFlight=null;paint();}
    })();inFlight={key,promise:request};return request;
  }
  function schedule(name,work){
    if(!allowed()||!actor().ready)return;
    const key=contextKey(),prior=slots.get(name);
    if(prior&&prior.key===key&&(prior.running||Date.now()-prior.at<TTL))return;
    const slot={key,at:Date.now(),running:true};slots.set(name,slot);
    setTimeout(async()=>{try{if(key===contextKey())await work();}catch(error){if(key===contextKey())lastError=String(error.message||error);}finally{slot.running=false;paint();}},30);
  }
  function assertRevocation(id){requireManager();if(String(id)===String(state().deviceId))throw Error('Revoke this device from another authorized device.');}
  function toggle(){requireManager();showAll=!showAll;paint();}
  async function refresh(){try{await load(true);}catch(error){lastError=String(error.message||error);paint();}}
  function focusVerification(){const field=document.getElementById('m4OwnerManagementEmail');if(field){field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}}
  document.addEventListener('zezms-staff-auth-changed',()=>{cache=null;lastError='';slots.clear();showAll=false;paint();});
  window.ZEZMS=window.ZEZMS||{};
  ZEZMS.deviceCards=Object.freeze({build:'20261104-device-cards-r1',allowed,requireManager,actor,contextKey,requireActor,active,select,records,html,rows,paint,load,schedule,assertRevocation,toggle,refresh,focusVerification});
}());

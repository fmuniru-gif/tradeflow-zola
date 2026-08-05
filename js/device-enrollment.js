/* ZEZMS v3.7.0 — Secure Device Enrollment */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  const BUILD = '20260805-secure-device-enrollment-r28';
  let branches = [];
  let lastPairing = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }
  function attr(value) { return esc(value).replace(/\n/g, ''); }
  function sync() { return window.ZEZMS && ZEZMS.cloudSync ? ZEZMS.cloudSync : null; }
  function foundation() { return window.ZEZMS && ZEZMS.commercialFoundation ? ZEZMS.commercialFoundation : null; }
  function cloudState() { const s=sync(); return s&&s.getState?s.getState():{}; }
  function foundationState() { const f=foundation(); return f&&f.getState?f.getState():{}; }
  function normalizeRow(data) { return Array.isArray(data) ? data[0] || null : data || null; }
  function status(message, type) {
    const box=document.getElementById('deviceEnrollmentStatus');
    if(!box)return;
    const styles={ok:['#052e2b','#2dd4bf','#ccfbf1'],error:['#3f1017','#fb7185','#ffe4e6'],working:['#172554','#60a5fa','#dbeafe'],info:['#1e293b','#475569','#cbd5e1']};
    const c=styles[type]||styles.info;
    box.style.background=c[0];box.style.borderColor=c[1];box.style.color=c[2];box.textContent=String(message||'');
  }
  function base64UrlEncode(value) {
    const bytes=new TextEncoder().encode(String(value||''));
    let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function base64UrlDecode(value) {
    let text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    while(text.length%4)text+='=';
    const binary=atob(text); const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function pairingParams() {
    const p=new URLSearchParams(location.search);
    return {
      requested:p.get('deviceEnroll')==='1',
      code:p.get('pairCode')||'',
      url:(()=>{try{return base64UrlDecode(p.get('pairUrl')||'');}catch(_){return '';}})(),
      key:(()=>{try{return base64UrlDecode(p.get('pairKey')||'');}catch(_){return '';}})(),
      name:p.get('deviceName')||''
    };
  }
  function cleanPairingUrl() {
    try {
      const url=new URL(location.href);
      ['deviceEnroll','pairCode','pairUrl','pairKey','deviceName'].forEach(k=>url.searchParams.delete(k));
      history.replaceState({},document.title,url.pathname+(url.search?'?'+url.searchParams.toString():'')+url.hash);
    } catch (_) {}
  }
  function modal(html) {
    if(typeof openModal==='function')return openModal(html);
    alert('The setup dialog could not open. Reload the app and retry.');
  }
  function newDeviceForm(prefill) {
    const p=prefill||pairingParams();
    const state=cloudState();
    return '<h3>Set up a completely new device</h3>'
      + '<p class="muted">Use the one-time pairing code or setup link created on an existing OWNER device.</p>'
      + '<div class="field"><label>Device name</label><input id="deviceEnrollName" value="'+attr(p.name||'New Shop Device')+'" placeholder="Shop phone / Till 2"></div>'
      + '<div class="field"><label>One-time pairing code</label><input id="deviceEnrollCode" class="mono" value="'+attr(p.code||'')+'" autocomplete="one-time-code" placeholder="ZD-XXXX-XXXX-XXXX-XXXX-XXXX"></div>'
      + '<details '+((p.url&&p.key)?'':'open')+'><summary style="cursor:pointer;margin-bottom:8px">Supabase connection details</summary>'
      + '<div class="field"><label>Project URL</label><input id="deviceEnrollUrl" value="'+attr(p.url||state.supabaseUrl||'')+'" placeholder="https://your-project.supabase.co"></div>'
      + '<div class="field"><label>Publishable key</label><input id="deviceEnrollKey" type="password" value="'+attr(p.key||state.publishableKey||'')+'" placeholder="sb_publishable_..."></div></details>'
      + '<div id="deviceEnrollmentStatus" style="margin:10px 0;padding:10px 12px;border:1px solid #334155;border-radius:10px;font-size:11px;line-height:1.5;color:#cbd5e1">Ready to pair this device.</div>'
      + '<div class="row"><button class="btn" onclick="secureDeviceEnrollmentClaim()">Pair and download business data</button>'
      + '<button class="btn ghost" onclick="closeModal()">Cancel</button></div>'
      + '<p class="muted" style="font-size:11px;margin-top:10px">This device receives its own Supabase identity. The OWNER password is not stored here.</p>';
  }
  function openNewDevice(prefill) { modal(newDeviceForm(prefill)); }

  async function claimNewDevice() {
    const s=sync();
    if(!s||typeof s.enrollPairedDevice!=='function'){
      status('Secure Device Enrollment did not load. Confirm v3.7.0 is deployed.','error');
      return;
    }
    const values={
      deviceName:String((document.getElementById('deviceEnrollName')||{}).value||'').trim(),
      pairingCode:String((document.getElementById('deviceEnrollCode')||{}).value||'').trim(),
      supabaseUrl:String((document.getElementById('deviceEnrollUrl')||{}).value||'').trim(),
      publishableKey:String((document.getElementById('deviceEnrollKey')||{}).value||'').trim()
    };
    try{
      status('Creating this device identity and validating the one-time code…','working');
      const context=await s.enrollPairedDevice(values);
      status('Device paired. Cloud master and staff directory downloaded.','ok');
      cleanPairingUrl();
      setTimeout(function(){
        try{closeModal();}catch(_){}
        if(typeof sharedDeviceRefreshUsers==='function')sharedDeviceRefreshUsers(false);
        if(typeof toast==='function')toast('New device setup complete. Select a staff member and sign in.');
      },900);
      return context;
    }catch(error){
      const raw=String(error&&(error.message||error.details||error.hint)||error||'Device pairing failed.');
      let message=raw;
      if(/ZEZMS_PAIRING_INVALID/i.test(raw))message='The pairing code is invalid.';
      else if(/ZEZMS_PAIRING_EXPIRED/i.test(raw))message='The pairing code has expired. Create a new one on the OWNER device.';
      else if(/ZEZMS_PAIRING_USED/i.test(raw))message='This pairing code has already been used.';
      else if(/ZEZMS_DEVICE_REVOKED/i.test(raw))message='This device has been revoked.';
      else if(/anonymous.*disabled|signups.*disabled/i.test(raw))message='Enable Anonymous Sign-Ins in Supabase Authentication settings, then retry.';
      status(message,'error');
    }
  }

  async function ownerClient() {
    const s=sync();
    if(!s)throw new Error('Cloud Sync M4 is unavailable.');
    if(typeof s.waitUntilReady==='function')await s.waitUntilReady(8000);
    const state=s.getState?s.getState():{};
    if(state.deviceAccessMode==='PAIRED')throw new Error('Create pairing codes from the primary OWNER-authenticated device.');
    const client=s.getClient?s.getClient():null;
    const session=s.getSession?s.getSession():null;
    if(!client||!session||!session.user)throw new Error('Sign in to the OWNER Cloud Sync M4 account first.');
    if(typeof s.ensureMfa==='function'){
      const ok=await s.ensureMfa();
      if(!ok)throw new Error('OWNER authenticator verification was cancelled.');
    }
    return {client:client,session:session,state:state};
  }
  async function loadBranches() {
    const pair=await ownerClient();
    const f=foundationState();
    const businessId=String(f.businessId||f.context&&f.context.business_id||pair.state.businessId||'');
    if(!businessId)throw new Error('The M5A-1 Tenant ID is unavailable.');
    const result=await pair.client.from('zezms_branches').select('id,name,code,is_primary,status').eq('business_id',businessId).eq('status','ACTIVE').order('is_primary',{ascending:false}).order('name',{ascending:true});
    if(result.error)throw result.error;
    branches=Array.isArray(result.data)?result.data:[];
    const select=document.getElementById('devicePairBranch');
    if(select){
      select.innerHTML=branches.map(b=>'<option value="'+attr(b.id)+'">'+esc(b.name)+(b.code?' ('+esc(b.code)+')':'')+'</option>').join('');
      if(f.context&&f.context.branch_id)select.value=String(f.context.branch_id);
    }
    return branches;
  }
  function ownerCardHtml() {
    const state=cloudState();
    if(state.deviceAccessMode==='PAIRED'){
      return '<div class="card" style="margin-top:12px"><h3>Secure Device Enrollment</h3><p class="muted">Pairing codes can be created only from a primary OWNER-authenticated device. This device is already paired.</p></div>';
    }
    return '<div class="card" style="margin-top:12px">'
      + '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Secure Device Enrollment</h3><span class="badge ok">M5A-3</span></div>'
      + '<p class="muted" style="font-size:12px;line-height:1.55">Create a short-lived, one-use code for a completely new phone or computer. The new device receives its own identity and never receives the OWNER password.</p>'
      + '<div class="grid g2"><div class="field"><label>New device name</label><input id="devicePairName" placeholder="Till 2 / Manager phone"></div>'
      + '<div class="field"><label>Branch</label><select id="devicePairBranch"><option value="">Loading branches…</option></select></div>'
      + '<div class="field"><label>Code validity</label><select id="devicePairMinutes"><option value="10">10 minutes</option><option value="15" selected>15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></div></div>'
      + '<button class="btn" onclick="secureDeviceEnrollmentCreateCode()">Create one-time device code</button>'
      + (lastPairing?pairingResultHtml(lastPairing):'')
      + '<p class="muted" style="font-size:11px;margin-top:10px">Prerequisite: Supabase Anonymous Sign-Ins must be enabled once for the project.</p>'
      + '</div>';
  }
  function pairingResultHtml(data) {
    return '<div style="margin-top:12px;padding:12px;border:1px solid #2dd4bf;border-radius:12px;background:rgba(13,148,136,.10)">'
      + '<b>One-time pairing code</b><div class="mono" style="font-size:20px;font-weight:900;letter-spacing:1px;margin:8px 0">'+esc(data.pairing_code)+'</div>'
      + '<p class="muted" style="font-size:11px">Expires '+esc(new Date(data.expires_at).toLocaleString())+'. It works once.</p>'
      + '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="secureDeviceEnrollmentCopyCode()">Copy code</button>'
      + '<button class="btn sm ghost" onclick="secureDeviceEnrollmentCopyLink()">Copy complete setup link</button></div></div>';
  }
  function buildSetupLink(data) {
    const state=cloudState();
    const base=location.origin+location.pathname;
    const params=new URLSearchParams({
      deviceEnroll:'1',pairCode:String(data.pairing_code||''),
      pairUrl:base64UrlEncode(state.supabaseUrl||''),pairKey:base64UrlEncode(state.publishableKey||''),
      deviceName:String(data.device_name||'New ZEZMS Device')
    });
    return base+'?'+params.toString();
  }
  async function createPairing() {
    try{
      const pair=await ownerClient();
      const f=foundationState();
      const businessId=String(f.businessId||f.context&&f.context.business_id||'');
      const deviceName=String((document.getElementById('devicePairName')||{}).value||'').trim();
      const branchId=String((document.getElementById('devicePairBranch')||{}).value||'').trim();
      const minutes=Number((document.getElementById('devicePairMinutes')||{}).value||15);
      if(!businessId)throw new Error('The M5A-1 Tenant ID is unavailable.');
      if(!deviceName)throw new Error('Enter a name for the new device.');
      if(!branchId)throw new Error('Select the branch for the new device.');
      const result=await pair.client.rpc('zezms_m5a3_create_device_pairing',{
        p_business_id:businessId,p_device_name:deviceName,p_branch_id:branchId,
        p_expires_minutes:minutes,p_platform:'',p_app_version:typeof APP_VERSION!=='undefined'?String(APP_VERSION):'3.7.0'
      });
      if(result.error)throw result.error;
      lastPairing=normalizeRow(result.data);
      if(!lastPairing||!lastPairing.pairing_code)throw new Error('Supabase did not return a pairing code.');
      lastPairing.setup_link=buildSetupLink(lastPairing);
      if(typeof render==='function')render();
      if(typeof toast==='function')toast('One-time device pairing code created.');
    }catch(error){
      const raw=String(error&&(error.message||error.details||error.hint)||error||'Pairing code creation failed.');
      let message=raw;
      if(/ZEZMS_AAL2_REQUIRED/i.test(raw))message='Complete OWNER authenticator verification, then create the code again.';
      else if(/PGRST202|could not find the function/i.test(raw))message='Run SUPABASE_M5A3_SECURE_DEVICE_ENROLLMENT.sql once, then retry.';
      if(typeof toast==='function')toast(message,'err');
    }
  }
  async function copyText(value,message) {
    try{await navigator.clipboard.writeText(String(value||''));if(typeof toast==='function')toast(message||'Copied.');}
    catch(_){prompt('Copy this value:',String(value||''));}
  }
  function installSettingsCard() {
    const original=window.viewSettings;
    if(typeof original!=='function'||original.__m5a3DeviceWrapped)return;
    const wrapped=function(){const result=original.apply(this,arguments)+ownerCardHtml();setTimeout(function(){if(document.getElementById('devicePairBranch'))loadBranches().catch(function(error){const s=document.getElementById('devicePairBranch');if(s)s.innerHTML='<option value="">'+esc(error.message||error)+'</option>';});},30);return result;};
    wrapped.__m5a3DeviceWrapped=true;window.viewSettings=wrapped;
  }
  function init() {
    installSettingsCard();
    const params=pairingParams();
    if(params.requested)setTimeout(function(){openNewDevice(params);},700);
    document.documentElement.setAttribute('data-zezms-device-enrollment','ready');
  }

  window.secureDeviceEnrollmentOpen=function(){openNewDevice(pairingParams());};
  window.secureDeviceEnrollmentClaim=function(){claimNewDevice();};
  window.secureDeviceEnrollmentCreateCode=function(){createPairing();};
  window.secureDeviceEnrollmentCopyCode=function(){if(lastPairing)copyText(lastPairing.pairing_code,'Pairing code copied.');};
  window.secureDeviceEnrollmentCopyLink=function(){if(lastPairing)copyText(lastPairing.setup_link,'Complete setup link copied.');};

  ZEZMS.deviceEnrollment={version:'M5A-3',build:BUILD,open:openNewDevice,claim:claimNewDevice,createPairing:createPairing,getLastPairing:function(){return lastPairing;}};
  setTimeout(init,350);
}());

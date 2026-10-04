/* ZEZMS TradeFlow v3.31.7 r70G — ACTIVE device binding recovery.
   Local access-mode cache is never authority for managed-device lifecycle.
   This module restores only the published staff directory/control-plane cache. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var BUILD='20261004-r70g-active-device-binding-recovery';
  var BUSINESS_ROOTS=['products','customers','stockRows','sales','receipts','inventoryTxns','cashLog','expenses','accountTxns','purchaseOrders','quotations','invoices','waybills'];
  var busy=false;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function database() { try { return DB || null; } catch (_) { return null; } }
  function sync() { return window.ZEZMS && ZEZMS.cloudSync ? ZEZMS.cloudSync : null; }
  function state() { var service=sync(); return service && service.getState ? service.getState() || {} : {}; }
  function text(error) { return String(error && (error.message || error.details || error.hint) || error || '').replace(/[\r\n\t]+/g,' ').replace(/<[^>]*>/g,'').replace(/\s{2,}/g,' ').trim().slice(0,240); }
  function code(error, fallback) { var match=text(error).match(/\bZEZMS_[A-Z0-9_]+\b/); return match ? match[0] : fallback || 'ZEZMS_LOCAL_STAFF_AUTH_RECOVERY_FAILED'; }
  function businessFingerprint() {
    var db=database(), projection={};
    BUSINESS_ROOTS.forEach(function(key){ projection[key]=clone(db && db[key]); });
    return JSON.stringify(projection);
  }
  function localUsers() {
    var db=database(), users=db && db.sharedDeviceAuth && db.sharedDeviceAuth.users;
    return Array.isArray(users) ? users.filter(function(user){ return user && user.active !== false && user.passwordHash; }) : [];
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(character){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]; }); }
  function refreshRecoveredLoginSelector() {
    var select=document.getElementById('sharedLoginUser'), users=localUsers();
    if (!select || !users.length) return false;
    select.innerHTML='<option value="">Select staff member</option>'+users.map(function(user){
      var label=String(user.name || user.displayName || user.username || user.id || 'Staff');
      var role=String(user.role || '').trim();
      return '<option value="'+esc(user.id)+'">'+esc(label+(role ? ' — '+role : ''))+'</option>';
    }).join('');
    return true;
  }
  function setLoginMessage(message, kind) {
    var box=document.getElementById('sharedLoginStatus');
    if (!box) return;
    box.textContent=message;
    box.setAttribute('data-zezms-r70g-local-auth',kind || 'info');
  }
  function removeRecoveryButtons() {
    ['r70fRecoverLocalStaffAccess','r70gRecoverLocalStaffAccess','r70gReconnectExistingDevice','r70gReconnectPanel'].forEach(function(id){
      var element=document.getElementById(id); if (element && element.parentNode) element.parentNode.removeChild(element);
    });
  }
  function currentSession() {
    var service=sync();
    try { return service && service.getSession ? service.getSession() : null; } catch (_) { return null; }
  }
  function sessionIdentityMode(session) {
    var user=session && session.user || {}, app=user.app_metadata || {}, meta=user.user_metadata || {};
    return user.is_anonymous === true || app.provider === 'anonymous' || meta.is_anonymous === true ? 'PAIRED' : 'OWNER';
  }
  function clearReconnectPanel() { var panel=document.getElementById('r70gReconnectPanel'); if (panel && panel.parentNode) panel.parentNode.removeChild(panel); }
  function showReconnectPanel() {
    var status=document.getElementById('sharedLoginStatus');
    if (!status || document.getElementById('r70gReconnectPanel')) return false;
    var panel=document.createElement('div');
    panel.id='r70gReconnectPanel'; panel.style.marginTop='8px';
    panel.innerHTML='<label>Owner email<br><input id="r70gReconnectEmail" type="email" autocomplete="username"></label><br>'+ 
      '<label>Owner password<br><input id="r70gReconnectPassword" type="password" autocomplete="current-password"></label><br>'+ 
      '<label>MFA code (enter when requested)<br><input id="r70gReconnectMfa" inputmode="numeric" autocomplete="one-time-code"></label><br>'+ 
      '<button type="button" class="btn ghost" id="r70gReconnectSubmit">Verify Owner and reconnect this existing device</button>';
    status.parentNode.insertBefore(panel,status.nextSibling);
    document.getElementById('r70gReconnectSubmit').onclick=function(){
      var email=(document.getElementById('r70gReconnectEmail') || {}).value || '';
      var password=(document.getElementById('r70gReconnectPassword') || {}).value || '';
      var mfaCode=(document.getElementById('r70gReconnectMfa') || {}).value || '';
      reconnectExistingDevice({email:email,password:password,mfaCode:mfaCode}).catch(function(){});
    };
    return true;
  }
  function showRecoveryButton() {
    if (localUsers().length) { removeRecoveryButtons(); return false; }
    var status=document.getElementById('sharedLoginStatus'), select=document.getElementById('sharedLoginUser'), session=currentSession();
    if (!status || !select) return false;
    select.innerHTML='<option value="">Local staff access needs recovery</option>';
    if (session && session.user) {
      clearReconnectPanel();
      setLoginMessage('Local staff access is missing. This browser still has a Cloud identity, so ZEZMS will verify this exact device against the ACTIVE managed lifecycle before restoring only the staff directory. Do not set up a new device.','recoverable');
      if (!document.getElementById('r70gRecoverLocalStaffAccess')) {
        var recover=document.createElement('button');
        recover.type='button'; recover.id='r70gRecoverLocalStaffAccess'; recover.className='btn ghost'; recover.textContent='Recover local staff access'; recover.style.marginTop='8px';
        recover.onclick=function(){ recoverLocalStaffAccess().catch(function(){}); };
        status.parentNode.insertBefore(recover,status.nextSibling);
      }
    } else {
      setLoginMessage('Local staff access is missing and this browser no longer has a usable Cloud session. If this is still the same ACTIVE managed device, reconnect it with Owner sign-in and MFA. Do not set up a new device.','recoverable');
      if (!document.getElementById('r70gReconnectExistingDevice')) {
        var reconnect=document.createElement('button');
        reconnect.type='button'; reconnect.id='r70gReconnectExistingDevice'; reconnect.className='btn ghost'; reconnect.textContent='Reconnect this existing device'; reconnect.style.marginTop='8px';
        reconnect.onclick=showReconnectPanel;
        status.parentNode.insertBefore(reconnect,status.nextSibling);
      }
    }
    return true;
  }
  function ensureActiveContext(context, snapshot, deviceId) {
    var lifecycle=String(context && (context.lifecycle_state || context.device_status) || '').toUpperCase();
    if (lifecycle === 'RETIRED' || lifecycle === 'REVOKED') throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_REJECTED: The managed lifecycle is '+lifecycle+'.');
    if (lifecycle !== 'ACTIVE') throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: This device is not an ACTIVE managed lifecycle.');
    ['lifecycle_id','owner_id','business_id','branch_id'].forEach(function(key){ if (!String(context && context[key] || '').trim()) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: Cloud context is missing '+key+'.'); });
    if (context.device_id && String(context.device_id) !== deviceId) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: Cloud returned a different device.');
    if (snapshot.businessId && String(snapshot.businessId) !== String(context.business_id)) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: Cloud business does not match this existing device.');
    return context;
  }
  async function activeDeviceContext() {
    var service=sync(), snapshot=state(), deviceId=String(snapshot.deviceId || '').trim();
    if (!service || !deviceId) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: This browser has no preserved device ID.');
    if (service.waitUntilReady) await service.waitUntilReady(9000);
    var client=service.getClient && service.getClient(), session=currentSession();
    if (!client) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: The existing Cloud client is unavailable.');
    if (!session || !session.user) throw new Error('ZEZMS_ACTIVE_DEVICE_RECONNECT_REQUIRED: Reconnect this existing device with Owner authentication and MFA.');
    var result=await client.rpc('zezms_m5a4_device_context',{p_device_id:deviceId,p_allowed_states:['ACTIVE']});
    if (result.error) {
      var rpcCode=code(result.error,'ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND');
      if (rpcCode === 'ZEZMS_ACTIVE_DEVICE_BINDING_REJECTED') throw result.error;
      throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: '+text(result.error));
    }
    var context=Array.isArray(result.data) ? result.data[0] : result.data;
    ensureActiveContext(context,snapshot,deviceId);
    context=clone(context); context.device_id=deviceId; context.identity_mode=sessionIdentityMode(session);
    return context;
  }
  function hydrateDirectory(directory) {
    if (!directory || !Array.isArray(directory.users) || !directory.users.length) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_DIRECTORY_UNAVAILABLE: Cloud has no published active staff directory for this business.');
    var db=database(); if (!db) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_DATABASE_UNAVAILABLE: The local database is unavailable.');
    var old=db.sharedDeviceAuth && typeof db.sharedDeviceAuth === 'object' ? clone(db.sharedDeviceAuth) : {version:1,users:[],audit:[]};
    var oldById=new Map((Array.isArray(old.users) ? old.users : []).map(function(user){ return [String(user && user.id || ''),user || {}]; }));
    db.sharedDeviceDirectory=clone(directory);
    db.sharedDeviceAuth=Object.assign({},old,{version:1,enabled:directory.enabled !== false,businessId:String(directory.businessId || old.businessId || ''),directoryUpdatedAt:String(directory.updatedAt || ''),users:directory.users.map(function(remote){
      var local=oldById.get(String(remote && remote.id || '')) || {};
      return Object.assign({},clone(remote),{failedAttempts:Number(local.failedAttempts)||0,lockedUntil:String(local.lockedUntil || ''),lastLoginAt:String(local.lastLoginAt || remote.lastLoginAt || '')});
    })});
    return db.sharedDeviceAuth.users.length;
  }
  function repairLocalControlPlane(service, context) {
    if (!service || typeof service.repairActiveDeviceControlPlane !== 'function') throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_RECOVERY_UNAVAILABLE: Reload the r70G update before recovering this existing device.');
    var before=state(), unchangedId=String(before.deviceId || '');
    if (!unchangedId || unchangedId !== String(context.device_id || unchangedId)) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: Device ID cannot be changed during recovery.');
    var repaired=service.repairActiveDeviceControlPlane(context,context.identity_mode);
    if (String((repaired || state()).deviceId || '') !== unchangedId) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: Recovery refused to alter device identity.');
    return repaired;
  }
  async function completeLocalStaffRecovery(context) {
    var service=sync();
    if (!service || typeof service.fetchSharedDeviceDirectoryControlRoot !== 'function' || typeof service.persistLocalControlPlane !== 'function') throw new Error('ZEZMS_LOCAL_STAFF_AUTH_RECOVERY_UNAVAILABLE: Reload the r70G update before recovering local staff access.');
    var beforeBusiness=businessFingerprint(), beforeDb=clone(database()), beforeQueue=service.getOutbox ? JSON.stringify(service.getOutbox()) : '';
    try {
      setLoginMessage('Reading the published staff directory without replaying business history…','working');
      var directory=await service.fetchSharedDeviceDirectoryControlRoot();
      var restored=hydrateDirectory(directory);
      if (businessFingerprint() !== beforeBusiness) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_BUSINESS_STATE_CHANGED: Staff recovery refused because it would alter business data.');
      repairLocalControlPlane(service,context);
      service.persistLocalControlPlane();
      if (beforeQueue !== (service.getOutbox ? JSON.stringify(service.getOutbox()) : '')) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_QUEUE_CHANGED: Staff recovery refused because it would alter the sync queue.');
      refreshRecoveredLoginSelector(); removeRecoveryButtons();
      setLoginMessage('Local staff access was restored for this existing ACTIVE device. Its lifecycle, device ID, business data, cursor and sync queue were not changed.','ok');
      try { window.dispatchEvent(new CustomEvent('zezms-shared-device-directory-updated')); } catch (_) {}
      return {ok:true,lifecycleId:String(context.lifecycle_id || ''),staffCount:restored};
    } catch (error) {
      if (database() && beforeDb) { Object.keys(database()).forEach(function(key){ delete database()[key]; }); Object.assign(database(),beforeDb); }
      try { if (service && typeof service.persistLocalControlPlane === 'function') service.persistLocalControlPlane(); } catch (_) {}
      throw error;
    }
  }
  async function recoverLocalStaffAccess() {
    if (busy) return false; busy=true;
    try {
      setLoginMessage('Verifying this exact device against its existing Cloud lifecycle…','working');
      var context=await activeDeviceContext();
      return await completeLocalStaffRecovery(context);
    } catch (error) {
      var stable=code(error);
      if (stable === 'ZEZMS_ACTIVE_DEVICE_RECONNECT_REQUIRED') { showRecoveryButton(); return {ok:false,reconnectRequired:true,code:stable}; }
      setLoginMessage('Local staff access was not recovered: '+stable+'. '+text(error),'error');
      throw error;
    } finally { busy=false; }
  }
  function newOwnerClient(snapshot) {
    var factory=window.supabase && window.supabase.createClient;
    if (!factory || !snapshot.supabaseUrl || !snapshot.publishableKey) throw new Error('ZEZMS_ACTIVE_DEVICE_RECONNECT_UNAVAILABLE: Owner verification is unavailable in this browser.');
    return factory(snapshot.supabaseUrl,snapshot.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  }
  async function requireOwnerAal2(ownerClient, credentials) {
    var assurance=await ownerClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    var level=assurance.data || {};
    if (String(level.currentLevel || '').toLowerCase() === 'aal2') return true;
    var factors=await ownerClient.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    var list=(factors.data && factors.data.totp || []).filter(function(factor){ return factor && factor.status === 'verified'; });
    var factorId=String(credentials.factorId || (list[0] && list[0].id) || '');
    if (!factorId || !String(credentials.mfaCode || '').trim()) throw new Error('ZEZMS_ACTIVE_DEVICE_OWNER_MFA_REQUIRED: Enter the Owner authenticator code to reconnect this existing device.');
    var challenge=await ownerClient.auth.mfa.challenge({factorId:factorId}); if (challenge.error) throw challenge.error;
    var verify=await ownerClient.auth.mfa.verify({factorId:factorId,challengeId:challenge.data && challenge.data.id,code:String(credentials.mfaCode).trim()}); if (verify.error) throw verify.error;
    var after=await ownerClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (after.error || String(after.data && after.data.currentLevel || '').toLowerCase() !== 'aal2') throw new Error('ZEZMS_ACTIVE_DEVICE_OWNER_MFA_REQUIRED: Owner MFA/AAL2 verification did not complete.');
    return true;
  }
  async function reconnectExistingDevice(credentials) {
    if (busy) return false; busy=true;
    var ownerClient=null;
    try {
      credentials=credentials || {};
      var service=sync(), snapshot=state(), deviceId=String(snapshot.deviceId || '').trim(), primary=service && service.getClient && service.getClient();
      if (!service || !primary || !deviceId) throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_NOT_FOUND: This browser cannot reconnect an unrecognised device.');
      if (!String(credentials.email || '').trim() || !String(credentials.password || '')) throw new Error('ZEZMS_ACTIVE_DEVICE_OWNER_AUTH_REQUIRED: Enter the Owner email and password.');
      setLoginMessage('Verifying Owner credentials and MFA for this existing device…','working');
      ownerClient=newOwnerClient(snapshot);
      var signIn=await ownerClient.auth.signInWithPassword({email:String(credentials.email).trim(),password:String(credentials.password)});
      if (signIn.error || !signIn.data || !signIn.data.user) throw signIn.error || new Error('ZEZMS_ACTIVE_DEVICE_OWNER_AUTH_REQUIRED: Owner sign-in was not completed.');
      await requireOwnerAal2(ownerClient,credentials);
      var anonymous=await primary.auth.signInAnonymously({options:{data:{purpose:'zezms_active_device_reconnect',device_id:deviceId}}});
      if (anonymous.error || !anonymous.data || !anonymous.data.user) throw anonymous.error || new Error('ZEZMS_ACTIVE_DEVICE_RECONNECT_FAILED: A replacement paired identity was not created.');
      var rebound=await ownerClient.rpc('zezms_m5a4_reconnect_active_device',{p_device_id:deviceId,p_new_device_user_id:anonymous.data.user.id});
      if (rebound.error) throw rebound.error;
      var context=Array.isArray(rebound.data) ? rebound.data[0] : rebound.data;
      ensureActiveContext(context,snapshot,deviceId); context=clone(context); context.device_id=deviceId; context.identity_mode='PAIRED';
      if (typeof service.adoptActiveDeviceSession !== 'function') throw new Error('ZEZMS_ACTIVE_DEVICE_BINDING_RECOVERY_UNAVAILABLE: Reload the r70G update before reconnecting.');
      await service.adoptActiveDeviceSession();
      var result=await completeLocalStaffRecovery(context);
      return Object.assign({reconnected:true},result);
    } catch (error) {
      var stable=code(error);
      setLoginMessage('This existing device was not reconnected: '+stable+'. '+text(error),'error');
      throw error;
    } finally {
      try { if (ownerClient && ownerClient.auth && ownerClient.auth.signOut) await ownerClient.auth.signOut(); } catch (_) {}
      busy=false;
    }
  }
  function install() { showRecoveryButton(); document.documentElement.setAttribute('data-zezms-recovery-stabilization','r70g'); return true; }
  window.addEventListener('zezms-cloud-ready',function(){ setTimeout(install,0); });
  window.addEventListener('zezms-shared-device-directory-updated',function(){ setTimeout(install,0); });
  window.ZEZMS.recoveryStabilization={build:BUILD,recoverLocalStaffAccess:recoverLocalStaffAccess,reconnectExistingDevice:reconnectExistingDevice,showRecoveryButton:showRecoveryButton,_test:{activeDeviceContext:activeDeviceContext,businessFingerprint:businessFingerprint,localUsers:localUsers,hydrateDirectory:hydrateDirectory,refreshRecoveredLoginSelector:refreshRecoveredLoginSelector,ensureActiveContext:ensureActiveContext,completeLocalStaffRecovery:completeLocalStaffRecovery}};
  [0,350,1200,3000].forEach(function(delay){ setTimeout(install,delay); });
}());

/* ZEZMS TradeFlow v3.31.6 r70F — recovery stabilization.
   This module separates local staff-auth recovery from device lifecycle,
   Cloud initialization and business-database recovery. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var BUILD='20261004-r70f-recovery-stabilization';
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
    box.setAttribute('data-zezms-r70f-local-auth',kind || 'info');
  }
  function removeRecoveryButton() { var button=document.getElementById('r70fRecoverLocalStaffAccess'); if (button && button.parentNode) button.parentNode.removeChild(button); }
  function showRecoveryButton() {
    if (localUsers().length) { removeRecoveryButton(); return false; }
    var status=document.getElementById('sharedLoginStatus'), select=document.getElementById('sharedLoginUser');
    if (!status || !select) return false;
    select.innerHTML='<option value="">Local staff access needs recovery</option>';
    setLoginMessage('Local staff access is missing on this device. This does not mean the device needs Owner setup. If this remains an ACTIVE managed device, recover its staff access from the existing Cloud identity.','recoverable');
    if (!document.getElementById('r70fRecoverLocalStaffAccess')) {
      var button=document.createElement('button');
      button.type='button'; button.id='r70fRecoverLocalStaffAccess'; button.className='btn ghost';
      button.textContent='Recover local staff access';
      button.style.marginTop='8px';
      button.onclick=function(){ window.ZEZMS.recoveryStabilization.recoverLocalStaffAccess().catch(function(){}); };
      status.parentNode.insertBefore(button,status.nextSibling);
    }
    return true;
  }
  async function activeDeviceContext() {
    var service=sync(), snapshot=state(), deviceId=String(snapshot.deviceId || '');
    if (!service || String(snapshot.deviceAccessMode || '').toUpperCase() !== 'PAIRED' || !deviceId) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_DEVICE_NOT_ACTIVE: This browser is not an identified paired device.');
    if (service.waitUntilReady) await service.waitUntilReady(9000);
    var client=service.getClient && service.getClient(), session=service.getSession && service.getSession();
    if (!client || !session || !session.user) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_DEVICE_NOT_ACTIVE: The paired Cloud identity is unavailable.');
    var result=await client.rpc('zezms_m5a4_device_context',{p_device_id:deviceId,p_allowed_states:['ACTIVE']});
    if (result.error) throw result.error;
    var context=Array.isArray(result.data) ? result.data[0] : result.data;
    if (!context || String(context.lifecycle_state || context.device_status || '').toUpperCase() !== 'ACTIVE') throw new Error('ZEZMS_LOCAL_STAFF_AUTH_DEVICE_NOT_ACTIVE: The managed lifecycle is not ACTIVE.');
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
  async function recoverLocalStaffAccess() {
    if (busy) return false;
    busy=true;
    var beforeBusiness=businessFingerprint(), beforeDb=clone(database()), service=sync(), beforeQueue=service && service.getOutbox ? JSON.stringify(service.getOutbox()) : '';
    try {
      setLoginMessage('Checking this device’s existing Cloud identity and ACTIVE lifecycle…','working');
      var context=await activeDeviceContext();
      if (!service || typeof service.fetchSharedDeviceDirectoryControlRoot !== 'function' || typeof service.persistLocalControlPlane !== 'function') throw new Error('ZEZMS_LOCAL_STAFF_AUTH_RECOVERY_UNAVAILABLE: Reload the r70F update before recovering local staff access.');
      setLoginMessage('Reading the published staff directory without replaying business history…','working');
      var directory=await service.fetchSharedDeviceDirectoryControlRoot();
      var restored=hydrateDirectory(directory);
      if (businessFingerprint() !== beforeBusiness) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_BUSINESS_STATE_CHANGED: Staff recovery refused because it would alter business data.');
      service.persistLocalControlPlane();
      if (beforeQueue !== (service.getOutbox ? JSON.stringify(service.getOutbox()) : '')) throw new Error('ZEZMS_LOCAL_STAFF_AUTH_QUEUE_CHANGED: Staff recovery refused because it would alter the sync queue.');
      if (typeof window.sharedDeviceRefreshUsers === 'function') { /* Refreshes the login UI; it may pull in older builds, so r70F avoids calling it. */ }
      refreshRecoveredLoginSelector();
      removeRecoveryButton();
      setLoginMessage('Local staff access was restored from this device’s existing ACTIVE Cloud identity. Device enrollment and business data were not changed.','ok');
      try { window.dispatchEvent(new CustomEvent('zezms-shared-device-directory-updated')); } catch (_) {}
      return {ok:true,lifecycleId:String(context.lifecycle_id || ''),staffCount:restored};
    } catch (error) {
      if (database() && beforeDb) { Object.keys(database()).forEach(function(key){ delete database()[key]; }); Object.assign(database(),beforeDb); }
      /* If the narrow control-plane save itself succeeded before a later guard
         failed, persist the in-memory rollback.  This is still a local-only
         save and deliberately does not create an operation or alter outbox. */
      try { if (service && typeof service.persistLocalControlPlane === 'function') service.persistLocalControlPlane(); } catch (_) {}
      var stable=code(error);
      setLoginMessage('Local staff access was not recovered: '+stable+'. '+text(error),'error');
      throw error;
    } finally { busy=false; }
  }
  function install() {
    showRecoveryButton();
    document.documentElement.setAttribute('data-zezms-recovery-stabilization','r70f');
    return true;
  }
  window.addEventListener('zezms-cloud-ready',function(){ setTimeout(install,0); });
  window.addEventListener('zezms-shared-device-directory-updated',function(){ setTimeout(install,0); });
  window.ZEZMS.recoveryStabilization={build:BUILD,recoverLocalStaffAccess:recoverLocalStaffAccess,showRecoveryButton:showRecoveryButton,_test:{activeDeviceContext:activeDeviceContext,businessFingerprint:businessFingerprint,localUsers:localUsers,hydrateDirectory:hydrateDirectory,refreshRecoveredLoginSelector:refreshRecoveredLoginSelector}};
  [0,350,1200,3000].forEach(function(delay){ setTimeout(install,delay); });
}());

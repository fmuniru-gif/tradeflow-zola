/* ZEZMS TradeFlow v3.23.0 r61 — Managed Device Lifecycle & Safe Bootstrap.
   Control-plane only. This overlay deliberately does not alter normal M4/3
   business operations, checkpoints, Canonical Restore, or the local DB key. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var BUILD = '20260930-mb2-device-branch-context-r69';
  var STAGE_KEY = 'zezms_m5a4_safe_bootstrap_stage_v1';
  var states = ['ENROLLING', 'BOOTSTRAPPING', 'VERIFYING', 'ACTIVE', 'RETIRED', 'REVOKED'];
  var fleet = [];
  var branches = [];
  var currentEnrollment = null;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ''); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function row(value) { return Array.isArray(value) ? value[0] || null : value || null; }
  function cloud() { return window.ZEZMS && ZEZMS.cloudSync ? ZEZMS.cloudSync : null; }
  function foundation() { return window.ZEZMS && ZEZMS.commercialFoundation ? ZEZMS.commercialFoundation : null; }
  function state() { var s=cloud(); return s && s.getState ? s.getState() || {} : {}; }
  function platform() { return String(navigator.userAgent || '').slice(0, 240); }
  function appVersion() { try { return String(APP_VERSION || '3.23.0'); } catch (_) { return '3.23.0'; } }
  function dateText(value) { if (!value) return '—'; var d=new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); }
  function businessId() {
    var f=foundation(); var fs=f && f.getState ? f.getState() || {} : {};
    var s=state(); return String(fs.businessId || (fs.context && fs.context.business_id) || s.businessId || '');
  }
  function isPaired() { return String(state().deviceAccessMode || '').toUpperCase() === 'PAIRED'; }
  function rpcError(error, fallback) { return String(error && (error.message || error.details || error.hint) || fallback || 'The managed-device service did not complete the request.'); }
  function notify(message, type) { try { if (typeof toast === 'function') toast(message, type); } catch (_) {} }

  async function ownerClient() {
    var s=cloud();
    if (!s) throw new Error('Cloud Sync M4/3 is unavailable.');
    if (s.waitUntilReady) await s.waitUntilReady(9000);
    var snapshot=s.getState ? s.getState() || {} : {};
    if (snapshot.deviceAccessMode === 'PAIRED') throw new Error('Create, retire, revoke, and approve devices from an Owner or Admin device.');
    var client=s.getClient && s.getClient(), session=s.getSession && s.getSession();
    if (!client || !session || !session.user) throw new Error('Sign in to the Owner cloud account first.');
    if (s.ensureMfa && !(await s.ensureMfa())) throw new Error('Owner authenticator verification was cancelled.');
    return { client:client, session:session, state:snapshot };
  }

  async function pairedClient() {
    var s=cloud();
    if (!s) throw new Error('Cloud Sync M4/3 is unavailable.');
    if (s.waitUntilReady) await s.waitUntilReady(9000);
    var client=s.getClient && s.getClient(), session=s.getSession && s.getSession(), snapshot=s.getState ? s.getState() || {} : {};
    if (!client || !session || !session.user) throw new Error('This device does not have a paired cloud identity yet.');
    return { client:client, session:session, state:snapshot };
  }

  function supported(client, name) {
    return client.rpc(name, {}).then(function (result) {
      var message=rpcError(result && result.error, '');
      if (result && result.error && /could not find the function|PGRST202/i.test(message)) throw new Error('The r61 Supabase migration has not been applied yet. Deploy it before using managed device lifecycle actions.');
      return result;
    });
  }

  function stageRead() { try { var value=JSON.parse(localStorage.getItem(STAGE_KEY) || 'null'); return value && value.version === 1 ? value : null; } catch (_) { return null; } }
  function stageWrite(value) { localStorage.setItem(STAGE_KEY, JSON.stringify(value)); }
  function stageClear() { try { localStorage.removeItem(STAGE_KEY); } catch (_) {} }
  function candidateCashIsSafe(database) {
    var cash=database && database.cashBalances || {};
    Object.keys(cash).forEach(function (key) {
      var value=Number(cash[key]);
      if (!Number.isFinite(value)) throw new Error('Bootstrap cash validation failed: '+key+' is not a number.');
      if (key !== 'Others' && value < -0.000001) throw new Error('Bootstrap cash validation failed: protected wallet '+key+' would be negative.');
    });
    return true;
  }
  function candidateIntegrity(database) {
    candidateCashIsSafe(database);
    var integrity=window.ZEZMS && ZEZMS.syncIntegrity;
    if (integrity && integrity._test && typeof integrity._test.localAudit === 'function') {
      var report=integrity._test.localAudit(database);
      if (report && report.violations && report.violations.length) throw new Error('Integrity Core rejected the staged bootstrap candidate.');
    }
    return true;
  }
  function fingerprintCandidate(database) {
    var convergence=window.ZEZMS && ZEZMS.convergence;
    if (!convergence || typeof convergence.buildFingerprint !== 'function') throw new Error('Fleet Convergence is not ready; bootstrap cannot be verified.');
    var previous;
    try {
      previous=DB;
      DB=database;
      return clone(convergence.buildFingerprint());
    } finally { try { DB=previous; } catch (_) {} }
  }
  function cleanHash(database) {
    var s=cloud();
    if (!s || !s._test || !s._test.cleanSnapshot || !s._test.deterministicHash) throw new Error('M4/3 verification helpers are unavailable.');
    return String(s._test.deterministicHash(s._test.cleanSnapshot(database)) || '');
  }

  function lifecycleBadge(value) {
    var label=String(value || 'UNKNOWN').toUpperCase();
    var kind=label === 'ACTIVE' ? 'ok' : label === 'REVOKED' ? 'bad' : label === 'RETIRED' ? 'warn' : 'info';
    return '<span class="badge '+kind+'">'+esc(label)+'</span>';
  }
  function deviceRows() {
    if (!fleet.length) return '<tr><td colspan="8" class="empty">No managed device records were returned.</td></tr>';
    var current=String(state().deviceId || '');
    return fleet.map(function (item) {
      var mine=current && String(item.device_id || '') === current;
      var action='';
      if (String(item.lifecycle_state || '').toUpperCase() === 'ACTIVE') {
        action=(mine ? '<span class="muted">This device</span> ' : '<button class="btn sm ghost" onclick="ZEZMS.managedDevices.retire('+attr(JSON.stringify(String(item.lifecycle_id || '')))+')">Retire</button> '
          +'<button class="btn sm danger" onclick="ZEZMS.managedDevices.revoke('+attr(JSON.stringify(String(item.lifecycle_id || '')))+')">Revoke</button> ')
          +'<button class="btn sm ghost" onclick="ZEZMS.managedDevices.changeBranch('+attr(JSON.stringify(String(item.lifecycle_id || '')))+','+Number(item.revision || 0)+')">Change Branch</button>';
      } else if (String(item.lifecycle_state || '').toUpperCase() === 'VERIFYING') {
        action='<button class="btn sm" onclick="ZEZMS.managedDevices.activate('+attr(JSON.stringify(String(item.lifecycle_id || '')))+','+Number(item.revision || 0)+')">Approve activation</button> '
          +'<button class="btn sm ghost" onclick="ZEZMS.managedDevices.cancel('+attr(JSON.stringify(String(item.lifecycle_id || '')))+')">Cancel</button>';
      } else if (['ENROLLING','BOOTSTRAPPING'].indexOf(String(item.lifecycle_state || '').toUpperCase()) >= 0) {
        action='<button class="btn sm ghost" onclick="ZEZMS.managedDevices.cancel('+attr(JSON.stringify(String(item.lifecycle_id || '')))+')">Cancel</button>';
      } else action='<span class="muted">—</span>';
      return '<tr><td><b>'+esc(item.device_name || 'ZEZMS Device')+'</b><br><span class="muted mono" style="font-size:10px">'+esc(item.device_id || '')+'</span></td>'
        +'<td>'+esc(item.enrollment_mode || 'ADD')+'</td><td>'+lifecycleBadge(item.lifecycle_state)+'</td>'
        +'<td>'+esc(item.branch_name || 'Unassigned')+(item.branch_code ? '<br><span class="muted mono" style="font-size:10px">'+esc(item.branch_code)+'</span>' : '')+'</td>'
        +'<td>'+esc(dateText(item.last_seen_at))+'</td><td class="mono">'+esc(item.verified_cursor == null ? '—' : item.verified_cursor)+'</td>'
        +'<td>'+esc(item.app_version || '—')+'</td><td>'+action+'</td></tr>';
    }).join('');
  }
  function refreshTable() { var body=document.getElementById('m5a4DeviceRows'); if (body) body.innerHTML=deviceRows(); }
  function lifecycleCardHtml() {
    if (isPaired()) return '<div class="card" style="margin-top:12px"><h3>Managed Device Lifecycle</h3><p class="muted">This paired device is controlled by its Owner. It cannot issue codes, activate a device, retire a device, or revoke a device.</p></div>';
    return '<div class="card" style="margin-top:12px" data-zezms-managed-lifecycle="r69">'
      +'<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Managed Device Lifecycle</h3><span class="badge ok">r69</span></div>'
      +'<p class="muted" style="font-size:12px;line-height:1.45">New devices remain write-locked until they reconstruct a verified checkpoint, pass Integrity Core and Fleet evidence, and an Owner approves activation. Retired and revoked devices keep their transaction history but lose cloud access.</p>'
      +'<div class="table-wrap"><table><thead><tr><th>Device</th><th>Mode</th><th>Lifecycle</th><th>Assigned Branch</th><th>Last seen</th><th>Verified cursor</th><th>App</th><th>Action</th></tr></thead><tbody id="m5a4DeviceRows">'+deviceRows()+'</tbody></table></div>'
      +'<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn ghost" onclick="ZEZMS.managedDevices.refresh()">Refresh managed fleet</button><button class="btn" onclick="ZEZMS.managedDevices.beginDialog(\'ADD\')">Add new device</button><button class="btn ghost" onclick="ZEZMS.managedDevices.beginDialog(\'REPLACEMENT\')">Repair / replace a device</button></div>'
      +'</div>';
  }

  async function loadBranches() {
    var pair=await ownerClient(), id=businessId();
    if (!id) throw new Error('The active business is unavailable.');
    var result=await pair.client.from('zezms_branches').select('id,name,code,is_primary').eq('business_id',id).eq('status','ACTIVE').order('is_primary',{ascending:false}).order('name',{ascending:true});
    if (result.error) throw result.error;
    branches=Array.isArray(result.data) ? result.data : [];
    return branches;
  }
  async function loadFleet() {
    var pair=await ownerClient();
    var result=await pair.client.rpc('zezms_m5a4_managed_fleet_with_branch', { p_business_id:businessId() });
    if (result.error) throw result.error;
    fleet=Array.isArray(result.data) ? result.data : [];
    refreshTable(); return fleet;
  }
  function beginDialog(mode) {
    if (typeof openModal !== 'function') { notify('Reload the app, then retry device setup.', 'err'); return; }
    Promise.all([loadBranches(),loadFleet()]).then(function () {
      var branchOptions=branches.map(function (b) { return '<option value="'+attr(b.id)+'">'+esc(b.name)+(b.code ? ' ('+esc(b.code)+')' : '')+'</option>'; }).join('');
      var active=fleet.filter(function (item) { return String(item.lifecycle_state).toUpperCase()==='ACTIVE'; });
      var replacementOptions=active.map(function (item) { return '<option value="'+attr(item.lifecycle_id)+'">'+esc(item.device_name || item.device_id)+' — '+esc(item.device_id || '')+'</option>'; }).join('');
      openModal('<h3>'+esc(mode === 'REPLACEMENT' ? 'Repair or replace a device safely' : 'Add a new device safely')+'</h3>'
        +'<p class="muted">Use repair / replace for a lost, faulty, reset or unauthorised device. The code is one-use. The replacement cannot enter or upload transactions until its verified bootstrap is approved. The current device remains active until that approval, then it is retired automatically.</p>'
        +'<div class="field"><label>New device name</label><input id="m5a4Name" placeholder="Till 2 / Manager phone"></div>'
        +'<div class="field"><label>Assigned Branch</label><select id="m5a4Branch">'+branchOptions+'</select><small class="muted">This assigns the device to a branch. Operational branch data switching will be enabled in a later multi-branch phase.</small></div>'
        +(mode === 'REPLACEMENT' ? '<div class="field"><label>Device being replaced</label><select id="m5a4Replaces">'+replacementOptions+'</select></div>' : '')
        +'<div class="field"><label>Code validity</label><select id="m5a4Minutes"><option value="10">10 minutes</option><option value="15" selected>15 minutes</option><option value="30">30 minutes</option></select></div>'
        +'<div class="row"><button class="btn" onclick="ZEZMS.managedDevices.begin('+attr(JSON.stringify(mode))+')">Create safe bootstrap code</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
    }).catch(function (error) { notify(rpcError(error), 'err'); });
  }
  function setupLink(data) {
    var s=state(), encode=function (v) { var bytes=new TextEncoder().encode(String(v || '')), binary=''; bytes.forEach(function (b) { binary+=String.fromCharCode(b); }); return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
    var q=new URLSearchParams({ managedDeviceEnroll:'1', pairCode:String(data.pairing_code || ''), pairUrl:encode(s.supabaseUrl || ''), pairKey:encode(s.publishableKey || ''), deviceName:String(data.device_name || '') });
    return location.origin + location.pathname + '?' + q.toString();
  }
  async function beginEnrollment(mode) {
    var pair=await ownerClient(), id=businessId();
    var name=String((document.getElementById('m5a4Name') || {}).value || '').trim();
    var branchId=String((document.getElementById('m5a4Branch') || {}).value || '').trim();
    var replacement=mode === 'REPLACEMENT' ? String((document.getElementById('m5a4Replaces') || {}).value || '').trim() : null;
    var minutes=Number((document.getElementById('m5a4Minutes') || {}).value || 15);
    if (!name || !branchId) throw new Error('Enter a device name and select a branch.');
    if (mode === 'REPLACEMENT' && !replacement) throw new Error('Select the device being replaced.');
    var result=await pair.client.rpc('zezms_m5a4_begin_enrollment', { p_business_id:id, p_device_name:name, p_branch_id:branchId, p_mode:mode, p_replaces_lifecycle_id:replacement, p_expires_minutes:minutes, p_platform:platform(), p_app_version:appVersion() });
    if (result.error) throw result.error;
    currentEnrollment=row(result.data);
    if (!currentEnrollment || !currentEnrollment.pairing_code) throw new Error('The managed-device server did not return a pairing code.');
    currentEnrollment.setup_link=setupLink(currentEnrollment);
    if (typeof closeModal === 'function') closeModal();
    if (typeof openModal === 'function') openModal('<h3>Safe bootstrap code</h3><p class="muted">Use this only on a fresh device. It does not give the new device authority to transact.</p><div class="mono" style="font-size:20px;font-weight:900;letter-spacing:1px;margin:12px 0">'+esc(currentEnrollment.pairing_code)+'</div><p class="muted">Expires '+esc(dateText(currentEnrollment.expires_at))+'.</p><div class="row"><button class="btn" onclick="ZEZMS.managedDevices.copyCode()">Copy code</button><button class="btn ghost" onclick="ZEZMS.managedDevices.copyLink()">Copy setup link</button><button class="btn ghost" onclick="closeModal()">Close</button></div>');
    await loadFleet();
    return currentEnrollment;
  }
  async function copy(value, promptText) { try { await navigator.clipboard.writeText(String(value || '')); notify(promptText || 'Copied.'); } catch (_) { window.prompt('Copy this value:', String(value || '')); } }

  function managedParams() {
    var p=new URLSearchParams(location.search), decode=function (text) { try { text=String(text || '').replace(/-/g,'+').replace(/_/g,'/'); while (text.length % 4) text+='='; var raw=atob(text), b=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++) b[i]=raw.charCodeAt(i); return new TextDecoder().decode(b); } catch (_) { return ''; } };
    return { requested:p.get('managedDeviceEnroll') === '1', code:p.get('pairCode') || '', url:decode(p.get('pairUrl')), key:decode(p.get('pairKey')), name:p.get('deviceName') || '' };
  }
  function clearManagedParams() { try { var u=new URL(location.href); ['managedDeviceEnroll','pairCode','pairUrl','pairKey','deviceName'].forEach(function (key) { u.searchParams.delete(key); }); history.replaceState({},document.title,u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash); } catch (_) {} }
  function freshDeviceCheck() {
    var s=state(), db;
    try { db=DB; } catch (_) { db=null; }
    if (s.initialized || s.deviceAccessMode === 'PAIRED') throw new Error('This browser already has a paired or initialized device profile. Use a fresh browser/PWA profile.');
    if (db && ((db.sales || []).length || (db.receipts || []).length || (db.stockRows || []).length || (db.purchaseOrders || []).length)) throw new Error('This device already contains business records. Safe bootstrap requires a fresh profile.');
  }
  function bootstrapForm(params) {
    var p=params || managedParams();
    return '<h3>Safe bootstrap a new device</h3><p class="muted">This device will be write-locked until the Owner sees and approves its verification evidence.</p>'
      +'<div class="field"><label>Device name</label><input id="m5a4EnrollName" value="'+attr(p.name || 'New ZEZMS Device')+'"></div>'
      +'<div class="field"><label>One-time code</label><input id="m5a4EnrollCode" class="mono" value="'+attr(p.code || '')+'" autocomplete="one-time-code"></div>'
      +'<details '+((p.url && p.key) ? '' : 'open')+'><summary>Supabase connection details</summary><div class="field"><label>Project URL</label><input id="m5a4EnrollUrl" value="'+attr(p.url || state().supabaseUrl || '')+'"></div><div class="field"><label>Publishable key</label><input id="m5a4EnrollKey" type="password" value="'+attr(p.key || state().publishableKey || '')+'"></div></details>'
      +'<div id="m5a4EnrollStatus" class="muted" style="margin:10px 0">Ready to verify the code and construct a staged candidate.</div><div class="row"><button class="btn" onclick="ZEZMS.managedDevices.claim()">Claim and verify bootstrap</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function bootStatus(message, bad) { var box=document.getElementById('m5a4EnrollStatus'); if (box) { box.textContent=message; box.style.color=bad ? '#fda4af' : '#bfdbfe'; } }
  async function loadBootstrapOperations(client, lifecycleId, cursor) {
    var all=[], next=Number(cursor || 0), loops=0;
    while (loops++ < 100) {
      var result=await client.rpc('zezms_m5a4_bootstrap_operations', { p_lifecycle_id:lifecycleId, p_after_cursor:next, p_limit:500 });
      if (result.error) throw result.error;
      var page=Array.isArray(result.data) ? result.data : [];
      if (!page.length) break;
      page.forEach(function (item) { all.push(item); next=Math.max(next,Number(item.server_seq || item.seq || 0)); });
      if (page.length < 500) break;
    }
    return all;
  }
  async function claimAndStage() {
    freshDeviceCheck();
    var name=String((document.getElementById('m5a4EnrollName') || {}).value || '').trim();
    var code=String((document.getElementById('m5a4EnrollCode') || {}).value || '').trim();
    var url=String((document.getElementById('m5a4EnrollUrl') || {}).value || '').trim();
    var key=String((document.getElementById('m5a4EnrollKey') || {}).value || '').trim();
    if (!name || !code || !url || !key) throw new Error('Enter the device name, pairing code, project URL, and publishable key.');
    bootStatus('Claiming the code with a fresh anonymous device identity…');
    var s=cloud();
    try { await s.enrollPairedDevice({ deviceName:name, pairingCode:code, supabaseUrl:url, publishableKey:key }); }
    catch (error) {
      /* r61 deliberately expects the legacy enrollment hand-off to stop at the
         BOOTSTRAPPING lifecycle gate. Any other error is unsafe to continue. */
      var after=state(), text=rpcError(error);
      if (!after.deviceId || !after.syncOwnerId || !/BOOTSTRAPPING|DEVICE.*(REVOKED|ACTIVE)|lifecycle/i.test(text)) throw error;
    }
    var pair=await pairedClient(), deviceId=String(pair.state.deviceId || '');
    var contextResult=await pair.client.rpc('zezms_m5a4_device_context', { p_device_id:deviceId, p_allowed_states:['BOOTSTRAPPING','VERIFYING','ACTIVE'] });
    if (contextResult.error) throw contextResult.error;
    var context=row(contextResult.data);
    if (!context || !context.lifecycle_id) throw new Error('The server did not return the bootstrap lifecycle context.');
    bootStatus('Downloading the fixed checkpoint and ordered post-checkpoint operations…');
    var manifestResult=await pair.client.rpc('zezms_m5a4_bootstrap_manifest', { p_lifecycle_id:context.lifecycle_id });
    if (manifestResult.error) throw manifestResult.error;
    var manifest=row(manifestResult.data);
    if (!manifest || !manifest.checkpoint_payload || !manifest.checkpoint_hash) throw new Error('The server has no verified checkpoint suitable for safe bootstrap.');
    if (cleanHash(manifest.checkpoint_payload) !== String(manifest.checkpoint_hash)) throw new Error('Checkpoint payload hash mismatch. Local data was not changed.');
    var operations=await loadBootstrapOperations(pair.client, context.lifecycle_id, manifest.checkpoint_cursor);
    var prepared=s.prepareM5a4BootstrapCandidate;
    if (typeof prepared !== 'function') throw new Error('The r61 cloud bootstrap bridge is unavailable. Reload the updated application.');
    var candidate=prepared(manifest.checkpoint_payload, operations.map(function (item) { return item.payload || item.operation || item; }));
    candidateIntegrity(candidate);
    var snapshot=fingerprintCandidate(candidate);
    var cursor=operations.reduce(function (last, item) { return Math.max(last,Number(item.server_seq || item.seq || 0)); },Number(manifest.checkpoint_cursor || 0));
    if (cursor !== Number(manifest.cloud_head_cursor || cursor)) throw new Error('Cloud advanced while bootstrap was staging. Retry before any local commit.');
    bootStatus('Submitting Integrity Core and Fleet verification evidence for Owner approval…');
    var attest=await pair.client.rpc('zezms_m5a4_submit_attestation', { p_lifecycle_id:context.lifecycle_id, p_expected_revision:Number(context.revision || 0), p_cursor:cursor, p_operational_hash:String(snapshot.operationalHash || ''), p_extended_hash:String(snapshot.extendedHash || ''), p_collection_fingerprints:snapshot.collections || {}, p_integrity_ok:true, p_queue_count:0, p_failed_count:0 });
    if (attest.error) throw attest.error;
    stageWrite({ version:1, build:BUILD, lifecycleId:context.lifecycle_id, deviceId:deviceId, cursor:cursor, candidate:candidate, attestedAt:new Date().toISOString(), fingerprint:snapshot });
    clearManagedParams();
    bootStatus('Verification is complete. Ask the Owner to approve this device from Managed Device Lifecycle. This device remains write-locked.');
    notify('Bootstrap verified. Waiting for Owner approval.', 'ok');
    return context;
  }
  async function finishIfActivated() {
    var staged=stageRead(); if (!staged) throw new Error('No verified bootstrap candidate is stored on this device.');
    var pair=await pairedClient();
    var result=await pair.client.rpc('zezms_m5a4_device_context', { p_device_id:staged.deviceId, p_allowed_states:['ACTIVE'] });
    if (result.error) throw result.error;
    var context=row(result.data);
    if (!context || String(context.lifecycle_state || context.device_status || '').toUpperCase() !== 'ACTIVE') throw new Error('This device has not been activated by the Owner yet.');
    var s=cloud();
    if (!s || typeof s.commitM5a4BootstrapCandidate !== 'function') throw new Error('The r61 cloud bootstrap bridge is unavailable. Reload the updated application.');
    s.commitM5a4BootstrapCandidate(staged.candidate, { cursor:staged.cursor, context:context });
    if (typeof s.activateM5a4Live !== 'function') throw new Error('The r61 live-sync activation bridge is unavailable. Reload the updated application.');
    await s.activateM5a4Live();
    stageClear();
    notify('Safe bootstrap is active. Live Sync is now enabled for this device.', 'ok');
    if (typeof render === 'function') render();
    return true;
  }
  function stagedCardHtml() {
    var staged=stageRead();
    if (!staged) return '';
    return '<div class="card" style="margin-top:12px;border-color:#38bdf8"><h3>Safe bootstrap awaiting activation</h3><p class="muted">Checkpoint and post-checkpoint operations were verified at cursor '+esc(staged.cursor)+'. No business data has been committed to this device yet.</p><button class="btn" onclick="ZEZMS.managedDevices.finish()">Check Owner approval and activate</button></div>';
  }
  async function activate(lifecycleId, revision) {
    if (!window.confirm('Approve this verified device? It will become ACTIVE. A replacement will retire its old device at the same time.')) return false;
    var pair=await ownerClient();
    var result=await pair.client.rpc('zezms_m5a4_activate_device', { p_lifecycle_id:lifecycleId, p_expected_revision:Number(revision || 0) });
    if (result.error) throw result.error;
    await loadFleet(); notify('Device activation approved.', 'ok'); return result.data;
  }
  async function retire(lifecycleId) {
    var reason=window.prompt('Reason for retirement (for example: replaced / no longer in use):',''); if (reason == null) return false; if (!String(reason).trim()) throw new Error('A retirement reason is required.');
    var pair=await ownerClient(); var result=await pair.client.rpc('zezms_m5a4_retire_device',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(); notify('Device retired. It can no longer access cloud sync.','ok'); return result.data;
  }
  async function cancel(lifecycleId) {
    var reason=window.prompt('Reason for cancelling this incomplete enrollment:',''); if (reason == null) return false;
    if (!window.confirm('Cancel this enrollment? The unfinished device will not receive cloud access.')) return false;
    var pair=await ownerClient(); var result=await pair.client.rpc('zezms_m5a4_cancel_enrollment',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(); notify('Incomplete enrollment cancelled.','ok'); return result.data;
  }
  async function revoke(lifecycleId) {
    var reason=window.prompt('Reason for revocation (for example: lost / unauthorised):',''); if (reason == null) return false; if (!String(reason).trim()) throw new Error('A revocation reason is required.');
    if (!window.confirm('Revoke this device now? It will lose cloud access immediately.')) return false;
    var pair=await ownerClient(); var result=await pair.client.rpc('zezms_m5a4_revoke_device',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(); notify('Device revoked. Its transaction history remains intact.','ok'); return result.data;
  }
  async function changeBranch(lifecycleId, revision) {
    var pair=await ownerClient();
    await loadBranches();
    var options=branches.map(function (branch) { return '<option value="'+attr(branch.id)+'">'+esc(branch.name)+(branch.code ? ' ('+esc(branch.code)+')' : '')+'</option>'; }).join('');
    if (!options) throw new Error('Create an active branch before assigning a device.');
    if (typeof openModal !== 'function') throw new Error('Reload the app, then retry the branch assignment.');
    openModal('<h3>Change device branch</h3><p class="muted">This changes the device’s administrative branch assignment only. It does not switch, filter, move, or alter operational business data.</p><div class="field"><label>Assigned Branch</label><select id="m5a4ChangeBranch">'+options+'</select></div><div class="row"><button class="btn" onclick="ZEZMS.managedDevices.confirmBranch('+attr(JSON.stringify(String(lifecycleId || '')))+','+Number(revision || 0)+')">Confirm branch assignment</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  async function confirmBranch(lifecycleId, revision) {
    var branchId=String((document.getElementById('m5a4ChangeBranch') || {}).value || '').trim();
    if (!branchId) throw new Error('Select an active branch.');
    if (!window.confirm('Assign this active device to the selected branch? This does not change operational branch data.')) return false;
    var pair=await ownerClient();
    var result=await pair.client.rpc('zezms_m5a4_assign_device_branch', { p_lifecycle_id:lifecycleId, p_branch_id:branchId, p_expected_revision:Number(revision || 0) });
    if (result.error) throw result.error;
    if (typeof closeModal === 'function') closeModal();
    await loadFleet(); notify('Device branch assignment updated.', 'ok'); return result.data;
  }

  function installSettingsCard() {
    var original=window.viewSettings;
    if (typeof original !== 'function' || original.__m5a4LifecycleWrapped) return false;
    var wrapped=function () { return original.apply(this,arguments)+lifecycleCardHtml()+stagedCardHtml(); };
    wrapped.__m5a4LifecycleWrapped=true; window.viewSettings=wrapped; return true;
  }
  function installLegacyGuards() {
    /* The old M5A-3 buttons remain in older embedded markup, but every route
       is redirected into the gated r61 flow so a user cannot bypass bootstrap. */
    window.secureDeviceEnrollmentCreateCode=function () { beginDialog('ADD'); };
    window.secureDeviceEnrollmentOpen=function () { if (typeof openModal === 'function') openModal(bootstrapForm(managedParams())); };
    window.secureDeviceEnrollmentConfirmOpen=function () { window.secureDeviceEnrollmentOpen(); return false; };
    window.secureDeviceEnrollmentClaim=function () { claimAndStage().catch(function (error) { bootStatus(rpcError(error),true); notify(rpcError(error),'err'); }); };
  }
  function initialize() {
    installSettingsCard(); installLegacyGuards();
    if (managedParams().requested) setTimeout(function () { if (typeof openModal === 'function') openModal(bootstrapForm(managedParams())); },750);
    document.documentElement.setAttribute('data-zezms-managed-device-lifecycle','r69');
  }

  ZEZMS.managedDevices={ version:'M5A-4', build:BUILD, lifecycleStates:states.slice(), refresh:function(){ return loadFleet().catch(function(e){notify(rpcError(e),'err');throw e;}); }, beginDialog:beginDialog, begin:function(mode){return beginEnrollment(mode).catch(function(e){notify(rpcError(e),'err');throw e;});}, claim:claimAndStage, finish:function(){return finishIfActivated().catch(function(e){notify(rpcError(e),'err');throw e;});}, activate:function(id,rev){return activate(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, retire:function(id){return retire(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, cancel:function(id){return cancel(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, revoke:function(id){return revoke(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, changeBranch:function(id,rev){return changeBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, confirmBranch:function(id,rev){return confirmBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, copyCode:function(){if(currentEnrollment)return copy(currentEnrollment.pairing_code,'Pairing code copied.');}, copyLink:function(){if(currentEnrollment)return copy(currentEnrollment.setup_link,'Safe-bootstrap link copied.');}, getStage:stageRead, _test:{candidateCashIsSafe:candidateCashIsSafe, candidateIntegrity:candidateIntegrity, fingerprintCandidate:fingerprintCandidate, stageRead:stageRead} };
  setTimeout(initialize,500);
}());

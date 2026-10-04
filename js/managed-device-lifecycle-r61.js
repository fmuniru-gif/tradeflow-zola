/* ZEZMS TradeFlow v3.30.2 r69B — Managed Device Lifecycle & Safe Bootstrap.
   Control-plane only. This overlay deliberately does not alter normal M4/3
   business operations, checkpoints, Canonical Restore, or the local DB key. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var BUILD = '20261004-r70h-existing-active-device-identity-relink';
  var STAGE_KEY = 'zezms_m5a4_safe_bootstrap_stage_v1';
  var JOURNAL_KEY = 'zezms_m5a4_safe_bootstrap_journal_v2';
  var states = ['ENROLLING', 'BOOTSTRAPPING', 'VERIFYING', 'ACTIVE', 'RETIRED', 'REVOKED'];
  var fleet = [];
  var branches = [];
  var currentEnrollment = null;
  /* The fleet is a scoped, read-only owner view.  Keep its lifecycle explicit
     so Settings never presents a false empty state while the first read is in
     flight.  This is deliberately a one-shot render hydration, not a poll. */
  var fleetLoadStatus = 'IDLE';
  var fleetLoadError = '';
  var fleetLoadedBusinessId = '';
  var fleetLoadPromise = null;
  var fleetHydrationScheduled = false;
  var claimInFlight = false;

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
  function bootstrapErrorCode(error) {
    var raw=[error && error.message,error && error.details,error && error.hint,error && error.code].filter(Boolean).join(' ');
    var match=raw.match(/\bZEZMS_[A-Z0-9_]+\b/);
    return match ? match[0] : 'ZEZMS_BOOTSTRAP_CLAIM_REJECTED';
  }
  function bootstrapErrorDetail(error) {
    var text=String(error && (error.details || error.hint || error.message || error.code) || 'The server did not complete the claim.');
    return text.replace(/[\r\n\t]+/g,' ').replace(/<[^>]*>/g,'').replace(/\b(authorization|token|password|jwt|apikey|api[_ -]?key|publishable[_ -]?key)\s*[:=]\s*\S+/gi,'$1: [redacted]').replace(/\s{2,}/g,' ').trim().slice(0,240);
  }
  function bootstrapErrorMessage(code) {
    var messages={
      ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND:'This browser identity is already bound to another active managed device. Use that device or a separate fresh browser profile.',
      ZEZMS_DEVICE_ID_ALREADY_LIVE:'This device ID belongs to another live managed-device lifecycle. Use the correct device profile or contact the Owner.',
      ZEZMS_PAIRING_EXPIRED:'This bootstrap code has expired. Ask the Owner to create one fresh replacement enrollment.',
      ZEZMS_PAIRING_INVALID:'This bootstrap code is invalid. Recheck the copied setup link or code.',
      ZEZMS_PAIRING_USED:'This bootstrap code was already used by another device or enrollment.',
      ZEZMS_PAIRING_LIFECYCLE_MISMATCH:'The pairing code does not match its pending lifecycle record. No data was changed.',
      ZEZMS_BOOTSTRAP_ACCESS_BINDING_CONFLICT:'A safe device-access binding could not be created. No bootstrap changes were committed.',
      ZEZMS_BOOTSTRAP_BUSINESS_DEVICE_BINDING_CONFLICT:'A safe business-device binding could not be created. No bootstrap changes were committed.',
      ZEZMS_BOOTSTRAP_LOCAL_BUSINESS_DATA_PRESENT:'This browser contains ordinary business records and is not safe to use as a replacement bootstrap profile.',
      ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING:'The local device identity is incomplete and cannot be safely matched to its Cloud lifecycle.',
      ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE:'The device binding could not be verified safely. Retry when online; do not clear site data.',
      ZEZMS_BOOTSTRAP_MANIFEST_REVISION_INVALID:'The server did not return a valid lifecycle revision for safe bootstrap attestation.'
    };
    return messages[code] || 'The bootstrap claim was rejected before this device received any business data.';
  }
  function setClaimBusy(value) {
    claimInFlight=!!value;
    var button=document.getElementById('m5a4EnrollClaim');
    if (button) { button.disabled=!!value; button.textContent=value ? 'Working on bootstrap…' : String(button.getAttribute('data-idle-text') || 'Claim and verify bootstrap'); }
  }
  function clearBootstrapIssue() {
    var box=document.getElementById('m5a4EnrollIssue');
    if (box) { box.hidden=true; box.textContent=''; }
  }
  function showBootstrapIssue(error) {
    var code=bootstrapErrorCode(error), box=document.getElementById('m5a4EnrollIssue');
    if (box) {
      box.hidden=false;
      box.innerHTML='<b>Bootstrap claim failed</b><br><span class="mono">'+esc(code)+'</span><br><small>'+esc(bootstrapErrorMessage(code))+' '+esc(bootstrapErrorDetail(error))+'</small>';
    }
    return code;
  }
  function fleetReadError(error) {
    var detail=error && (error.message || error.details || error.hint || error.error_description);
    var text=typeof detail === 'string' ? detail : '';
    if (!text) { try { text=String(error || ''); } catch (_) { text=''; } }
    text=text.replace(/[\r\n\t]+/g,' ').replace(/<[^>]*>/g,'').replace(/\s{2,}/g,' ').trim();
    return text && text !== '[object Object]' ? text.slice(0,240) : 'The fleet read did not complete.';
  }
  function notify(message, type) { try { if (typeof toast === 'function') toast(message, type); } catch (_) {} }

  async function readClient() {
    var s=cloud();
    if (!s) throw new Error('Cloud Sync M4/3 is unavailable.');
    if (s.waitUntilReady) await s.waitUntilReady(9000);
    var snapshot=s.getState ? s.getState() || {} : {};
    if (String(snapshot.deviceAccessMode || '').toUpperCase() === 'PAIRED') throw new Error('Managed fleet details are available only on an Owner or Admin device.');
    var client=s.getClient && s.getClient(), session=s.getSession && s.getSession();
    if (!client || !session || !session.user) throw new Error('Sign in to the Owner cloud account first.');
    return { client:client, session:session, state:snapshot };
  }

  async function mutationClient() {
    var pair=await readClient(), s=cloud();
    if (s.ensureMfa && !(await s.ensureMfa())) throw new Error('Owner authenticator verification was cancelled.');
    return pair;
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
  function journalRead() {
    try {
      var value=JSON.parse(localStorage.getItem(JOURNAL_KEY) || 'null');
      if (value && value.version === 2) return value;
    } catch (_) {}
    var staged=stageRead();
    return staged && staged.lifecycleId && staged.deviceId ? { version:2, lifecycleId:String(staged.lifecycleId), deviceId:String(staged.deviceId), stage:'VERIFYING', checkpointCursor:Number(staged.cursor || 0), lastVerifiedStage:'VERIFYING', updatedAt:String(staged.attestedAt || '') } : null;
  }
  function journalWrite(patch) {
    var current=journalRead() || { version:2, build:BUILD, createdAt:new Date().toISOString() };
    var next=Object.assign({},current,patch || {},{ version:2, build:BUILD, updatedAt:new Date().toISOString() });
    try { localStorage.setItem(JOURNAL_KEY,JSON.stringify(next)); } catch (_) {}
    return next;
  }
  function journalClear() { try { localStorage.removeItem(JOURNAL_KEY); } catch (_) {} }
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
  function resetFleetCache(id) {
    fleet=[];
    fleetLoadStatus='IDLE';
    fleetLoadError='';
    fleetLoadedBusinessId=String(id || '');
    fleetLoadPromise=null;
  }
  function syncFleetContext() {
    var id=businessId();
    if (!id) {
      fleet=[];
      fleetLoadStatus='ERROR';
      fleetLoadError='The active business is unavailable.';
      fleetLoadedBusinessId='';
      fleetLoadPromise=null;
      return '';
    }
    if (fleetLoadedBusinessId !== id) resetFleetCache(id);
    return id;
  }
  function fleetStatusText() {
    if (fleetLoadStatus === 'LOADING') return 'Loading managed fleet…';
    if (fleetLoadStatus === 'ERROR') return 'Unable to load managed fleet. '+fleetLoadError+' Use Refresh managed fleet to retry.';
    if (fleetLoadStatus === 'LOADED') return 'Managed fleet loaded.';
    return 'Managed fleet has not been loaded yet.';
  }
  function deviceRows() {
    if (!fleet.length && fleetLoadStatus === 'LOADING') return '<tr><td colspan="8" class="empty">Loading managed fleet…</td></tr>';
    if (!fleet.length && fleetLoadStatus === 'ERROR') return '<tr><td colspan="8" class="empty">Unable to load managed fleet. Use Refresh managed fleet to retry.</td></tr>';
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
  function refreshFleetCard() {
    var body=document.getElementById('m5a4DeviceRows');
    if (body) body.innerHTML=deviceRows();
    var status=document.getElementById('m5a4FleetStatus');
    if (status) status.textContent=fleetStatusText();
  }
  function scheduleFleetHydration() {
    if (isPaired() || fleetHydrationScheduled) return;
    if (!syncFleetContext()) { refreshFleetCard(); return; }
    fleetHydrationScheduled=true;
    setTimeout(function () {
      fleetHydrationScheduled=false;
      ensureFleetLoaded(false).catch(function () { /* The card already contains the scoped read error. */ });
    },0);
  }
  function primeFleetCard() {
    if (!syncFleetContext()) return;
    if (fleetLoadStatus === 'IDLE') fleetLoadStatus='LOADING';
    scheduleFleetHydration();
  }
  function lifecycleCardHtml() {
    if (isPaired()) return '<div class="card" style="margin-top:12px"><h3>Managed Device Lifecycle</h3><p class="muted">This paired device is controlled by its Owner. It cannot issue codes, activate a device, retire a device, or revoke a device.</p></div>';
    primeFleetCard();
    return '<div class="card" style="margin-top:12px" data-zezms-managed-lifecycle="r70h">'
      +'<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Managed Device Lifecycle</h3><span class="badge ok">r70F</span></div>'
      +'<p class="muted" style="font-size:12px;line-height:1.45">New devices remain write-locked until they reconstruct a verified checkpoint, pass Integrity Core and Fleet evidence, and an Owner approves activation. Retired and revoked devices keep their transaction history but lose cloud access.</p>'
      +'<div class="table-wrap"><table><thead><tr><th>Device</th><th>Mode</th><th>Lifecycle</th><th>Assigned Branch</th><th>Last seen</th><th>Verified cursor</th><th>App</th><th>Action</th></tr></thead><tbody id="m5a4DeviceRows">'+deviceRows()+'</tbody></table></div>'
      +'<p id="m5a4FleetStatus" class="muted" style="margin:9px 0 0">'+esc(fleetStatusText())+'</p>'
      +'<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn ghost" onclick="ZEZMS.managedDevices.refresh()">Refresh managed fleet</button><button class="btn" onclick="ZEZMS.managedDevices.beginDialog(\'ADD\')">Add new device</button><button class="btn ghost" onclick="ZEZMS.managedDevices.beginDialog(\'REPLACEMENT\')">Repair / replace a device</button></div>'
      +'</div>';
  }

  async function loadBranches() {
    var pair=await readClient(), id=businessId();
    if (!id) throw new Error('The active business is unavailable.');
    var result=await pair.client.from('zezms_branches').select('id,name,code,is_primary').eq('business_id',id).eq('status','ACTIVE').order('is_primary',{ascending:false}).order('name',{ascending:true});
    if (result.error) throw result.error;
    branches=Array.isArray(result.data) ? result.data : [];
    return branches;
  }
  async function ensureFleetLoaded(force) {
    var id=syncFleetContext();
    if (!id) { refreshFleetCard(); throw new Error(fleetLoadError); }
    if (!force && fleetLoadStatus === 'LOADED') return fleet;
    if (fleetLoadPromise) {
      if (!force) return fleetLoadPromise;
      return fleetLoadPromise.then(function () { return ensureFleetLoaded(true); });
    }
    fleetLoadStatus='LOADING';
    fleetLoadError='';
    refreshFleetCard();
    var request=(async function () {
      try {
        var pair=await readClient();
        var result=await pair.client.rpc('zezms_m5a4_managed_fleet_with_branch', { p_business_id:id });
        if (result.error) throw result.error;
        if (fleetLoadedBusinessId !== id) return fleet;
        fleet=Array.isArray(result.data) ? result.data : [];
        fleetLoadStatus='LOADED';
        fleetLoadError='';
        refreshFleetCard();
        return fleet;
      } catch (error) {
        if (fleetLoadedBusinessId === id) {
          fleetLoadStatus='ERROR';
          fleetLoadError=fleetReadError(error);
          refreshFleetCard();
        }
        throw error;
      } finally {
        if (fleetLoadPromise === request) fleetLoadPromise=null;
      }
    }());
    fleetLoadPromise=request;
    return request;
  }
  function loadFleet(force) {
    return ensureFleetLoaded(!!force);
  }
  function beginDialog(mode) {
    if (typeof openModal !== 'function') { notify('Reload the app, then retry device setup.', 'err'); return; }
    Promise.all([loadBranches(),loadFleet(true)]).then(function () {
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
    var pair=await mutationClient(), id=businessId();
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
    await loadFleet(true);
    return currentEnrollment;
  }
  async function copy(value, promptText) { try { await navigator.clipboard.writeText(String(value || '')); notify(promptText || 'Copied.'); } catch (_) { window.prompt('Copy this value:', String(value || '')); } }

  function managedParams() {
    var p=new URLSearchParams(location.search), decode=function (text) { try { text=String(text || '').replace(/-/g,'+').replace(/_/g,'/'); while (text.length % 4) text+='='; var raw=atob(text), b=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++) b[i]=raw.charCodeAt(i); return new TextDecoder().decode(b); } catch (_) { return ''; } };
    return { requested:p.get('managedDeviceEnroll') === '1', code:p.get('pairCode') || '', url:decode(p.get('pairUrl')), key:decode(p.get('pairKey')), name:p.get('deviceName') || '' };
  }
  function clearManagedParams() { try { var u=new URL(location.href); ['managedDeviceEnroll','pairCode','pairUrl','pairKey','deviceName'].forEach(function (key) { u.searchParams.delete(key); }); history.replaceState({},document.title,u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash); } catch (_) {} }
  function lifecycleState(context) { return String(context && (context.lifecycle_state || context.device_status) || '').toUpperCase(); }
  function localBusinessState() {
    var db; try { db=DB; } catch (_) { db=null; }
    var roots=['sales','receipts','stockRows','purchaseOrders','inventoryTxns','cashLog','expenses','accountTxns','quotations','invoices','waybills'];
    var count=roots.reduce(function(total,key){ return total+(db && Array.isArray(db[key]) ? db[key].length : 0); },0);
    return { state:count ? 'MATERIALLY_POPULATED' : 'EMPTY', records:count };
  }
  function sameJournal(journal, context, deviceId) {
    return !!(journal && context && journal.lifecycleId && String(journal.lifecycleId)===String(context.lifecycle_id || '') && journal.deviceId && String(journal.deviceId)===String(deviceId || ''));
  }
  function eligibilityError(eligibility) {
    var error=new Error(String(eligibility.reasonCode || 'ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE')+': '+String(eligibility.message || 'Safe bootstrap eligibility could not be established.'));
    error.code=eligibility.reasonCode;
    return error;
  }
  async function readBoundLifecycle(pair, deviceId) {
    if (!pair || !pair.client || !deviceId) return { context:null, unavailable:false };
    var result=await pair.client.rpc('zezms_m5a4_device_context', { p_device_id:deviceId, p_allowed_states:['BOOTSTRAPPING','VERIFYING','ACTIVE'] });
    if (!result || !result.error) return { context:row(result && result.data), unavailable:false };
    var detail=rpcError(result.error,'');
    if (/DEVICE_ACCESS|DEVICE_NOT|LIFECYCLE_NOT|NO.*(?:DEVICE|LIFECYCLE)|not found|PGRST116/i.test(detail)) return { context:null, unavailable:false };
    return { context:null, unavailable:true, error:result.error };
  }
  async function inspectBootstrapEligibility() {
    var snapshot=state(), deviceId=String(snapshot.deviceId || ''), journal=journalRead(), business=localBusinessState();
    var localState={ initialized:!!snapshot.initialized, deviceAccessMode:String(snapshot.deviceAccessMode || '').toUpperCase(), deviceId:deviceId, businessDb:business.state, businessRecords:business.records };
    if (business.state !== 'EMPTY' && !(journal && String(journal.deviceId || '')===deviceId)) return { eligible:false, reasonCode:'ZEZMS_BOOTSTRAP_LOCAL_BUSINESS_DATA_PRESENT', localState:localState, cloudBinding:null, resumable:false, message:'Ordinary business records are present in this local profile.' };
    var pair=null, binding={ context:null, unavailable:false };
    try { pair=await pairedClient(); binding=await readBoundLifecycle(pair,deviceId); } catch (_) { pair=null; }
    if (binding.unavailable && localState.deviceAccessMode === 'PAIRED') return { eligible:false, reasonCode:'ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE', localState:localState, cloudBinding:null, resumable:false, message:'The existing paired lifecycle could not be verified. Retry while online; do not clear site data.' };
    if (binding.context) {
      var existingState=lifecycleState(binding.context);
      if (sameJournal(journal,binding.context,deviceId) && (existingState === 'BOOTSTRAPPING' || existingState === 'VERIFYING')) return { eligible:true, reasonCode:'SAME_BOOTSTRAP_RESUMABLE', localState:localState, cloudBinding:binding.context, resumable:true, message:'The existing bootstrap journal matches this device and lifecycle.' };
      return { eligible:false, reasonCode:'ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND', localState:localState, cloudBinding:binding.context, resumable:false, message:existingState === 'ACTIVE' ? 'This browser identity is already an ACTIVE managed device.' : 'This browser identity is bound to another live managed-device lifecycle.' };
    }
    if (localState.deviceAccessMode === 'PAIRED') return { eligible:false, reasonCode:deviceId ? 'ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE' : 'ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING', localState:localState, cloudBinding:null, resumable:false, message:'This browser reports a paired device state without a matching resumable lifecycle.' };
    var session=pair && pair.session;
    var anonymous=!!(session && session.user && (session.user.is_anonymous || (session.user.app_metadata && session.user.app_metadata.provider === 'anonymous')));
    return { eligible:true, reasonCode:anonymous ? 'UNBOUND_ANONYMOUS_SESSION' : 'FRESH_UNBOUND', localState:localState, cloudBinding:null, resumable:false, message:'No authoritative live managed-device binding was found. M4 initialization is not treated as device ownership.' };
  }
  function bootstrapForm(params) {
    var p=params || managedParams(), journal=journalRead(), resuming=!!(journal && journal.lifecycleId && journal.deviceId);
    return '<h3>Safe bootstrap a new device</h3><p class="muted">This device will be write-locked until the Owner sees and approves its verification evidence.</p>'
      +'<div class="field"><label>Device name</label><input id="m5a4EnrollName" value="'+attr(p.name || 'New ZEZMS Device')+'"></div>'
      +'<div class="field"><label>One-time code</label><input id="m5a4EnrollCode" class="mono" value="'+attr(p.code || '')+'" autocomplete="one-time-code"></div>'
      +'<details '+((p.url && p.key) ? '' : 'open')+'><summary>Supabase connection details</summary><div class="field"><label>Project URL</label><input id="m5a4EnrollUrl" value="'+attr(p.url || state().supabaseUrl || '')+'"></div><div class="field"><label>Publishable key</label><input id="m5a4EnrollKey" type="password" value="'+attr(p.key || state().publishableKey || '')+'"></div></details>'
      +'<div id="m5a4EnrollStatus" class="muted" aria-live="polite" style="margin:10px 0">Ready to verify the code and construct a staged candidate.</div>'
      +'<div id="m5a4EnrollIssue" role="alert" hidden style="margin:10px 0;padding:10px;border:1px solid #fb7185;border-radius:8px;background:rgba(190,24,93,.12);color:#fecdd3"></div>'
      +(resuming ? '<p class="muted" style="font-size:12px">An interrupted bootstrap journal was found for this device. Resume uses the existing lifecycle and never needs a new code or site-data clearing.</p>' : '')
      +'<div class="row"><button id="m5a4EnrollClaim" data-idle-text="'+(resuming ? 'Resume bootstrap' : 'Claim and verify bootstrap')+'" class="btn" onclick="ZEZMS.managedDevices.claim()">'+(resuming ? 'Resume bootstrap' : 'Claim and verify bootstrap')+'</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
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
  async function contextForDevice(pair, deviceId) {
    var result=await pair.client.rpc('zezms_m5a4_device_context', { p_device_id:deviceId, p_allowed_states:['BOOTSTRAPPING','VERIFYING','ACTIVE'] });
    if (result.error) throw result.error;
    var context=row(result.data);
    if (!context || !context.lifecycle_id) throw new Error('ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING: The claimed device is not available at the bootstrap lifecycle gate.');
    return context;
  }
  async function reconstructAndAttest(context, pair, deviceId, resumed) {
    var s=cloud(), currentState=lifecycleState(context);
    if (currentState === 'VERIFYING') {
      journalWrite({ lifecycleId:String(context.lifecycle_id), deviceId:deviceId, stage:'VERIFYING', lastVerifiedStage:'VERIFYING', resumed:!!resumed });
      bootStatus('This device is already VERIFYING and remains write-locked. Ask the Owner to approve activation.');
      notify('Bootstrap verification is already awaiting Owner approval.', 'ok');
      return context;
    }
    if (currentState !== 'BOOTSTRAPPING') throw new Error('ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE: The lifecycle is not in a resumable bootstrap state.');
    journalWrite({ lifecycleId:String(context.lifecycle_id), pairingId:String(context.pairing_id || ''), deviceId:deviceId, stage:'CONTEXT_CONFIRMED', resumed:!!resumed });
    bootStatus(resumed ? 'Resuming the existing bootstrap. Downloading its fixed checkpoint and ordered operations…' : 'Claim accepted. Downloading the fixed checkpoint and ordered post-checkpoint operations…');
    var manifestResult=await pair.client.rpc('zezms_m5a4_bootstrap_manifest', { p_lifecycle_id:context.lifecycle_id });
    if (manifestResult.error) throw manifestResult.error;
    var manifest=row(manifestResult.data);
    if (!manifest || !manifest.checkpoint_payload || !manifest.checkpoint_hash) throw new Error('The server has no verified checkpoint suitable for safe bootstrap.');
    var manifestRevision=Number(manifest.lifecycle_revision);
    if (!Number.isFinite(manifestRevision) || manifestRevision <= 0) throw new Error('ZEZMS_BOOTSTRAP_MANIFEST_REVISION_INVALID: The server did not return a valid lifecycle revision.');
    journalWrite({ stage:'MANIFEST_READY', checkpointCursor:Number(manifest.checkpoint_cursor || 0), checkpointHash:String(manifest.checkpoint_hash), manifestLifecycleRevision:manifestRevision });
    if (cleanHash(manifest.checkpoint_payload) !== String(manifest.checkpoint_hash)) throw new Error('Checkpoint payload hash mismatch. Local data was not changed.');
    bootStatus('Reconstructing the verified checkpoint and replaying ordered post-checkpoint operations…');
    var operations=await loadBootstrapOperations(pair.client, context.lifecycle_id, manifest.checkpoint_cursor);
    journalWrite({ stage:'OPERATIONS_REPLAYED', replayCursor:operations.reduce(function(last,item){ return Math.max(last,Number(item.server_seq || item.seq || 0)); },Number(manifest.checkpoint_cursor || 0)) });
    var prepared=s && s.prepareM5a4BootstrapCandidate;
    if (typeof prepared !== 'function') throw new Error('The r61 cloud bootstrap bridge is unavailable. Reload the updated application.');
    var candidate=prepared(manifest.checkpoint_payload, operations.map(function (item) { return item.payload || item.operation || item; }));
    bootStatus('Running Integrity Core and Fleet fingerprint verification…');
    candidateIntegrity(candidate);
    var snapshot=fingerprintCandidate(candidate);
    var cursor=operations.reduce(function (last, item) { return Math.max(last,Number(item.server_seq || item.seq || 0)); },Number(manifest.checkpoint_cursor || 0));
    if (cursor !== Number(manifest.cloud_head_cursor || cursor)) throw new Error('Cloud advanced while bootstrap was staging. Retry before any local commit.');
    journalWrite({ stage:'ATTESTING', replayCursor:cursor, lastVerifiedStage:'INTEGRITY_PASSED' });
    bootStatus('Submitting Integrity Core and Fleet verification evidence for Owner approval…');
    var attest=await pair.client.rpc('zezms_m5a4_submit_attestation', { p_lifecycle_id:context.lifecycle_id, p_expected_revision:manifestRevision, p_cursor:cursor, p_operational_hash:String(snapshot.operationalHash || ''), p_extended_hash:String(snapshot.extendedHash || ''), p_collection_fingerprints:snapshot.collections || {}, p_integrity_ok:true, p_queue_count:0, p_failed_count:0 });
    if (attest.error) throw attest.error;
    stageWrite({ version:1, build:BUILD, lifecycleId:context.lifecycle_id, deviceId:deviceId, cursor:cursor, candidate:candidate, attestedAt:new Date().toISOString(), fingerprint:snapshot });
    journalWrite({ stage:'VERIFYING', lastVerifiedStage:'VERIFYING', replayCursor:cursor, manifestLifecycleRevision:manifestRevision });
    clearManagedParams();
    bootStatus('Verification is complete. Ask the Owner to approve this device from Managed Device Lifecycle. This device remains write-locked.');
    notify('Bootstrap verified. Waiting for Owner approval.', 'ok');
    return context;
  }
  async function claimAndStage() {
    if (claimInFlight) return false;
    clearBootstrapIssue();
    setClaimBusy(true);
    try {
      bootStatus('Inspecting local device state and the recovery journal…');
      var eligibility=await inspectBootstrapEligibility();
      if (!eligibility.eligible) throw eligibilityError(eligibility);
      if (eligibility.resumable) {
        bootStatus('Matching bootstrap found. Resuming the same lifecycle without a new pairing code…');
        var resumePair=await pairedClient(), resumeDeviceId=String(resumePair.state.deviceId || '');
        return await reconstructAndAttest(eligibility.cloudBinding || await contextForDevice(resumePair,resumeDeviceId),resumePair,resumeDeviceId,true);
      }
      var name=String((document.getElementById('m5a4EnrollName') || {}).value || '').trim();
      var code=String((document.getElementById('m5a4EnrollCode') || {}).value || '').trim();
      var url=String((document.getElementById('m5a4EnrollUrl') || {}).value || '').trim();
      var key=String((document.getElementById('m5a4EnrollKey') || {}).value || '').trim();
      if (!name || !code || !url || !key) throw new Error('Enter the device name, pairing code, project URL, and publishable key.');
      journalWrite({ stage:'CLAIMING', deviceId:String(eligibility.localState.deviceId || ''), lastVerifiedStage:'ELIGIBLE' });
      bootStatus('Eligible: '+eligibility.reasonCode+'. Claiming the code with the existing or a fresh anonymous identity…');
      var s=cloud();
      if (!s || typeof s.claimM5a4SafeBootstrap !== 'function') throw new Error('The r70F safe-bootstrap claim bridge is unavailable. Reload the updated application.');
      var claimed=await s.claimM5a4SafeBootstrap({ deviceName:name, pairingCode:code, supabaseUrl:url, publishableKey:key });
      if (!claimed || !claimed.lifecycle_id) throw new Error('The server did not return the bootstrap lifecycle context.');
      var pair=await pairedClient(), deviceId=String(pair.state.deviceId || '');
      if (!deviceId) throw new Error('ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING: The claim did not establish a stable local device ID.');
      var context=await contextForDevice(pair,deviceId);
      if (String(context.lifecycle_id)!==String(claimed.lifecycle_id)) throw new Error('ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING: The claimed lifecycle does not match this device context.');
      journalWrite({ lifecycleId:String(context.lifecycle_id), pairingId:String(context.pairing_id || claimed.pairing_id || ''), deviceId:deviceId, stage:'BOOTSTRAPPING', lastVerifiedStage:'CLAIMED' });
      return await reconstructAndAttest(context,pair,deviceId,false);
    } catch (error) {
      var claimCode=showBootstrapIssue(error);
      journalWrite({ stage:'FAILED', lastErrorCode:claimCode, lastErrorDetail:bootstrapErrorDetail(error) });
      bootStatus('Bootstrap claim failed: '+bootstrapErrorMessage(claimCode), true);
      notify('Bootstrap claim failed: '+claimCode, 'err');
      return false;
    } finally {
      setClaimBusy(false);
    }
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
    journalClear();
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
    var pair=await mutationClient();
    var result=await pair.client.rpc('zezms_m5a4_activate_device', { p_lifecycle_id:lifecycleId, p_expected_revision:Number(revision || 0) });
    if (result.error) throw result.error;
    await loadFleet(true); notify('Device activation approved.', 'ok'); return result.data;
  }
  async function retire(lifecycleId) {
    var reason=window.prompt('Reason for retirement (for example: replaced / no longer in use):',''); if (reason == null) return false; if (!String(reason).trim()) throw new Error('A retirement reason is required.');
    var pair=await mutationClient(); var result=await pair.client.rpc('zezms_m5a4_retire_device',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(true); notify('Device retired. It can no longer access cloud sync.','ok'); return result.data;
  }
  async function cancel(lifecycleId) {
    var reason=window.prompt('Reason for cancelling this incomplete enrollment:',''); if (reason == null) return false;
    if (!window.confirm('Cancel this enrollment? The unfinished device will not receive cloud access.')) return false;
    var pair=await mutationClient(); var result=await pair.client.rpc('zezms_m5a4_cancel_enrollment',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(true); notify('Incomplete enrollment cancelled.','ok'); return result.data;
  }
  async function revoke(lifecycleId) {
    var reason=window.prompt('Reason for revocation (for example: lost / unauthorised):',''); if (reason == null) return false; if (!String(reason).trim()) throw new Error('A revocation reason is required.');
    if (!window.confirm('Revoke this device now? It will lose cloud access immediately.')) return false;
    var pair=await mutationClient(); var result=await pair.client.rpc('zezms_m5a4_revoke_device',{p_lifecycle_id:lifecycleId,p_reason:String(reason).trim()}); if(result.error)throw result.error; await loadFleet(true); notify('Device revoked. Its transaction history remains intact.','ok'); return result.data;
  }
  async function changeBranch(lifecycleId, revision) {
    await mutationClient();
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
    var pair=await mutationClient();
    var result=await pair.client.rpc('zezms_m5a4_assign_device_branch', { p_lifecycle_id:lifecycleId, p_branch_id:branchId, p_expected_revision:Number(revision || 0) });
    if (result.error) throw result.error;
    if (typeof closeModal === 'function') closeModal();
    await loadFleet(true);
    if (window.ZEZMS && ZEZMS.branchManagement && typeof ZEZMS.branchManagement.refresh === 'function') {
      try { await ZEZMS.branchManagement.refresh(); } catch (_) { /* The assignment succeeded; Branch Management shows its own scoped read error if open. */ }
    }
    notify('Device branch assignment updated.', 'ok'); return result.data;
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
    window.secureDeviceEnrollmentClaim=function () { return claimAndStage(); };
  }
  function initialize() {
    installSettingsCard(); installLegacyGuards();
    if (managedParams().requested) setTimeout(function () { if (typeof openModal === 'function') openModal(bootstrapForm(managedParams())); },750);
    document.documentElement.setAttribute('data-zezms-managed-device-lifecycle','r70h');
  }

  ZEZMS.managedDevices={ version:'M5A-4', build:BUILD, lifecycleStates:states.slice(), refresh:function(){ return loadFleet(true).catch(function(e){notify('Unable to load managed fleet. '+fleetReadError(e),'err');throw e;}); }, beginDialog:beginDialog, begin:function(mode){return beginEnrollment(mode).catch(function(e){notify(rpcError(e),'err');throw e;});}, claim:claimAndStage, finish:function(){return finishIfActivated().catch(function(e){notify(rpcError(e),'err');throw e;});}, activate:function(id,rev){return activate(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, retire:function(id){return retire(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, cancel:function(id){return cancel(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, revoke:function(id){return revoke(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, changeBranch:function(id,rev){return changeBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, confirmBranch:function(id,rev){return confirmBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, copyCode:function(){if(currentEnrollment)return copy(currentEnrollment.pairing_code,'Pairing code copied.');}, copyLink:function(){if(currentEnrollment)return copy(currentEnrollment.setup_link,'Safe-bootstrap link copied.');}, getStage:stageRead, getJournal:journalRead, _test:{candidateCashIsSafe:candidateCashIsSafe, candidateIntegrity:candidateIntegrity, fingerprintCandidate:fingerprintCandidate, stageRead:stageRead, journalRead:journalRead, localBusinessState:localBusinessState, inspectBootstrapEligibility:inspectBootstrapEligibility, readClient:readClient, mutationClient:mutationClient, ensureFleetLoaded:ensureFleetLoaded, getFleetState:function(){return { status:fleetLoadStatus, error:fleetLoadError, businessId:fleetLoadedBusinessId, count:fleet.length, scheduled:fleetHydrationScheduled, loading:!!fleetLoadPromise };}} };
  setTimeout(initialize,500);
}());

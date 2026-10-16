/* ZEZMS TradeFlow v3.31.17 r70Q Phase A Review — Managed Device Lifecycle & Safe Bootstrap.
   Control-plane only. This overlay deliberately does not alter normal M4/3
   business operations, checkpoints, Canonical Restore, or the local DB key. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var BUILD = '20261008-r70q-phase-a-review';
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
  var finishPromise = null;

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
      ZEZMS_BOOTSTRAP_MANIFEST_REVISION_INVALID:'The server did not return a valid lifecycle revision for safe bootstrap attestation.',
      ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_MISMATCH:'Checkpoint payload hash mismatch. Local data was not changed.',
      ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_FORMAT_UNSUPPORTED:'The checkpoint hash format is not supported. Local data was not changed.'
    };
    return messages[code] || 'The bootstrap did not complete before this device received any business data.';
  }
  function bootstrapFailureHeading(code) {
    var stage=String((journalRead() || {}).stage || '').toUpperCase();
    if (/^ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_/.test(String(code || '')) || stage === 'CHECKPOINT_VERIFYING' || stage === 'MANIFEST_READY') return 'Bootstrap checkpoint verification failed';
    if (stage === 'OPERATION_REPLAYING' || stage === 'RECONSTRUCTING') return 'Bootstrap operation replay failed';
    if (stage === 'INTEGRITY_VERIFYING') return 'Bootstrap integrity verification failed';
    if (stage === 'ATTESTING') return 'Bootstrap attestation failed';
    return 'Bootstrap claim failed';
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
      box.innerHTML='<b>'+esc(bootstrapFailureHeading(code))+'</b><br><span class="mono">'+esc(code)+'</span><br><small>'+esc(bootstrapErrorMessage(code))+' '+esc(bootstrapErrorDetail(error))+'</small>';
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
    var authority=s.getOwnerManagementContext && s.getOwnerManagementContext();
    if (!authority || !authority.ready) throw new Error(authority && authority.message || 'Owner device-management authorization is unavailable.');
    return { client:authority.client, session:authority.session, state:snapshot, temporary:authority.temporary, assurance:authority.assurance };
  }

  async function mutationClient() {
    var pair=await readClient(), s=cloud();
    if (pair.temporary) {
      if (pair.assurance!=='aal2') throw new Error('Owner authenticator verification is required.');
    } else if (s.ensureMfa && !(await s.ensureMfa())) throw new Error('Owner authenticator verification was cancelled.');
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
  function verifiedPendingStage() {
    var phase=window.ZEZMS && ZEZMS.bootstrapPhaseA;
    var inspection=phase && phase.inspect && phase.inspect();
    if (!inspection || inspection.status !== 'PRESENT') return null;
    var staged=inspection.stage, snapshot=state();
    if (!staged || !staged.candidate || !staged.fingerprint || !staged.attestedAt ||
        !Number.isFinite(Date.parse(staged.attestedAt)) ||
        String(staged.fingerprint.deviceId || '') !== staged.deviceId ||
        typeof staged.fingerprint.operationalHash !== 'string' || !staged.fingerprint.operationalHash ||
        typeof staged.fingerprint.extendedHash !== 'string' || !staged.fingerprint.extendedHash ||
        !staged.fingerprint.collections || typeof staged.fingerprint.collections !== 'object' ||
        String(snapshot.deviceId || '') !== staged.deviceId ||
        String(snapshot.deviceAccessMode || '').toUpperCase() !== 'PAIRED') return null;
    var rawJournal;
    try { rawJournal=localStorage.getItem(JOURNAL_KEY); } catch (_) { return null; }
    if (rawJournal !== null) {
      try { if (JSON.parse(rawJournal).version !== 2) return null; } catch (_) { return null; }
    }
    var integrity=window.ZEZMS && ZEZMS.syncIntegrity;
    if (!integrity || !integrity._test || typeof integrity._test.localAudit !== 'function') return null;
    var journal=journalRead();
    if (!journal || String(journal.lifecycleId || '') !== staged.lifecycleId ||
        String(journal.deviceId || '') !== staged.deviceId ||
        String(journal.stage || '').toUpperCase() !== 'VERIFYING' ||
        String(journal.lastVerifiedStage || '').toUpperCase() !== 'VERIFYING' ||
        (journal.replayCursor != null && Number(journal.replayCursor) !== staged.cursor)) return null;
    try {
      candidateIntegrity(staged.candidate);
      var current=fingerprintCandidate(staged.candidate);
      if (String(current.deviceId || '') !== staged.deviceId ||
          current.operationalHash !== staged.fingerprint.operationalHash ||
          current.extendedHash !== staged.fingerprint.extendedHash ||
          JSON.stringify(current.collections) !== JSON.stringify(staged.fingerprint.collections)) return null;
    } catch (_) { return null; }
    return staged;
  }
  function cleanHash(database) {
    var s=cloud();
    if (!s || !s._test || !s._test.cleanSnapshot || !s._test.deterministicHash) throw new Error('M4/3 verification helpers are unavailable.');
    return String(s._test.deterministicHash(s._test.cleanSnapshot(database)) || '');
  }
  /* M4/3 checkpoint r57 canonicalization, retained for historical eight-hex
     checkpoint rows.  This is deliberately separate from the current cloud
     helper: the hash format chooses the verifier, never a fallback result. */
  function legacyCheckpointSnapshot(database) {
    var copy=clone(database || {});
    ['backupHistory','backupSettings','syncSettings','syncMeta','syncRejectedTransactions'].forEach(function (key) { delete copy[key]; });
    return copy;
  }
  function legacyCheckpointCanonicalize(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(legacyCheckpointCanonicalize);
    var result={};
    Object.keys(value).sort().forEach(function (key) {
      if (['payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload'].indexOf(key) < 0) result[key]=legacyCheckpointCanonicalize(value[key]);
    });
    return result;
  }
  function legacyCheckpointHash(database) {
    var text=JSON.stringify(legacyCheckpointCanonicalize(legacyCheckpointSnapshot(database)));
    var hash=0x811c9dc5;
    for (var index=0; index<text.length; index+=1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash,0x01000193);
    }
    return ('00000000'+(hash >>> 0).toString(16)).slice(-8).toUpperCase();
  }
  function checkpointHashError(code, message) {
    var error=new Error(code+': '+message);
    error.code=code;
    return error;
  }
  function verifyCheckpointPayloadHash(payload, storedHash) {
    var stored=String(storedHash == null ? '' : storedHash).trim().toUpperCase(), actual, format;
    if (/^[0-9A-F]{8}$/.test(stored)) {
      format='M43_LEGACY_FNV1A_32';
      actual=legacyCheckpointHash(payload).toUpperCase();
    } else if (/^[0-9A-F]{16}$/.test(stored)) {
      format='M43_CURRENT_DETERMINISTIC_64';
      actual=cleanHash(payload).trim().toUpperCase();
    } else {
      throw checkpointHashError('ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_FORMAT_UNSUPPORTED','The checkpoint hash format is not supported. Local data was not changed.');
    }
    if (actual !== stored) throw checkpointHashError('ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_MISMATCH','Checkpoint payload hash mismatch. Local data was not changed.');
    return { ok:true, format:format, storedHash:stored, computedHash:actual };
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
  /* r70P has one Settings composition owner.  This module owns the stable
     slot; the current Device Control Center only supplies its contents.  It
     must never independently wrap window.viewSettings. */
  function deviceManagementSlotHtml() {
    var control=window.ZEZMS && window.ZEZMS.deviceControlPlaneR70P;
    var contents=control && typeof control.settingsHtml === 'function'
      ? control.settingsHtml()
      : '<p class="muted">Preparing device-management service…</p>';
    return '<div id="zezmsDeviceManagementSlot" data-zezms-device-management-slot="r70p">'+contents+'</div>';
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
    journalWrite({ stage:'CHECKPOINT_VERIFYING' });
    verifyCheckpointPayloadHash(manifest.checkpoint_payload,manifest.checkpoint_hash);
    journalWrite({ stage:'CHECKPOINT_VERIFIED' });
    bootStatus('Reconstructing the verified checkpoint and replaying ordered post-checkpoint operations…');
    journalWrite({ stage:'OPERATION_REPLAYING' });
    var operations=await loadBootstrapOperations(pair.client, context.lifecycle_id, manifest.checkpoint_cursor);
    journalWrite({ stage:'OPERATIONS_REPLAYED', replayCursor:operations.reduce(function(last,item){ return Math.max(last,Number(item.server_seq || item.seq || 0)); },Number(manifest.checkpoint_cursor || 0)) });
    var prepared=s && s.prepareM5a4BootstrapCandidate;
    if (typeof prepared !== 'function') throw new Error('The r61 cloud bootstrap bridge is unavailable. Reload the updated application.');
    journalWrite({ stage:'RECONSTRUCTING' });
    var candidate=prepared(manifest.checkpoint_payload, operations.map(function (item) { return item.payload || item.operation || item; }));
    bootStatus('Running Integrity Core and Fleet fingerprint verification…');
    journalWrite({ stage:'INTEGRITY_VERIFYING' });
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
      var failureHeading=bootstrapFailureHeading(claimCode);
      journalWrite({ stage:'FAILED', lastErrorCode:claimCode, lastErrorDetail:bootstrapErrorDetail(error) });
      bootStatus(failureHeading+': '+bootstrapErrorMessage(claimCode), true);
      notify(failureHeading+': '+claimCode, 'err');
      return false;
    } finally {
      setClaimBusy(false);
    }
  }
  async function finishIfActivated() {
    var staged=verifiedPendingStage(); if (!staged) throw new Error('No verified bootstrap candidate matching this device is awaiting activation.');
    var pair=await pairedClient();
    if (String(pair.state.deviceId || '') !== staged.deviceId || String(pair.state.deviceAccessMode || '').toUpperCase() !== 'PAIRED') throw new Error('ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING: This cloud session does not match the staged device.');
    var result=await pair.client.rpc('zezms_m5a4_device_context', { p_device_id:staged.deviceId, p_allowed_states:['ACTIVE'] });
    if (result.error) throw result.error;
    var context=row(result.data);
    if (!context || String(context.lifecycle_state || context.device_status || '').toUpperCase() !== 'ACTIVE') throw new Error('This device has not been activated by the Owner yet.');
    if (String(context.lifecycle_id || '') !== staged.lifecycleId || (context.device_id && String(context.device_id) !== staged.deviceId) ||
        (pair.state.businessId && String(context.business_id || '') !== String(pair.state.businessId)) ||
        (pair.state.syncOwnerId && String(context.owner_id || '') !== String(pair.state.syncOwnerId)))
      throw new Error('ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING: The ACTIVE cloud lifecycle does not match this verified candidate.');
    context=Object.assign({},context,{ device_id:staged.deviceId });
    var s=cloud();
    if (!s || typeof s.activateVerifiedBootstrapR70M !== 'function') throw new Error('The verified r70M bootstrap activation bridge is unavailable. Reload the complete updated application.');
    await s.activateVerifiedBootstrapR70M(staged.candidate, { cursor:staged.cursor, context:context });
    stageClear();
    journalClear();
    try { window.dispatchEvent(new CustomEvent('zezms-shared-device-directory-updated')); } catch (_) {}
    try { if (ZEZMS.recoveryStabilization && ZEZMS.recoveryStabilization.showRecoveryButton) ZEZMS.recoveryStabilization.showRecoveryButton(); } catch (_) {}
    notify('Safe bootstrap is active. Live Sync is now enabled for this device.', 'ok');
    if (typeof render === 'function') render();
    return true;
  }
  function stagedCardHtml() {
    var staged=stageRead();
    if (!staged) return '';
    var pending=cloud() && cloud().getOutbox ? cloud().getOutbox().length : 0;
    return '<div class="card" style="margin-top:12px;border-color:#38bdf8"><h3>Safe bootstrap awaiting activation</h3><p class="muted">Checkpoint and post-checkpoint operations were verified at cursor '+esc(staged.cursor)+'. No business data has been committed to this device yet.</p>'
      +(pending ? '<p class="muted"><b>'+esc(pending)+'</b> local setup item(s) need inspection before activation. Unknown or business changes remain blocked.</p><button class="btn ghost" onclick="ZEZMS.managedDevices.inspectBootstrapOutbox()">Inspect bootstrap outbox</button> ' : '')
      +'<button class="btn" onclick="ZEZMS.managedDevices.finish()">Complete activation</button></div>';
  }
  function inspectBootstrapOutbox(options) {
    var s=cloud(); if (!s || typeof s.inspectM5a4BootstrapOutbox !== 'function') throw new Error('The r70M bootstrap outbox inspector is unavailable. Reload the updated application.');
    var report=s.inspectM5a4BootstrapOutbox();
    var rows=(report.rows || []).map(function (item) { return '<li><b>'+esc(item.type || 'UNKNOWN')+'</b> — '+esc(item.classification)+'<br><small>'+esc(item.reason)+' · '+esc(item.operationId)+'</small><ul>'+(item.patches || []).map(function (entry) {return '<li>'+esc(entry.patch && entry.patch.action || 'UNKNOWN')+' · root: '+esc(entry.root || '—')+' · collection: '+esc(entry.collection || '—')+' · '+esc(entry.classification)+'</li>';}).join('')+'</ul></li>'; }).join('') || '<li>No queued local operations were found.</li>';
    if ((!options || options.display !== false) && typeof openModal === 'function') openModal('<h3>Bootstrap outbox inspection — read only</h3><p class="muted">No queued operation is changed or uploaded by this inspection. Only exact, candidate-equivalent setup residue can be reconciled during a separately approved activation.</p><p><b>Queue:</b> '+esc(report.queueCount)+' · <b>Activation eligible:</b> '+esc(report.activationEligible ? 'Yes' : 'No')+' · <b>Business records:</b> '+esc(report.localBusinessRecordCount)+' · <b>Failed operations:</b> '+esc(report.failedOperationCount)+'</p><ol>'+rows+'</ol>');
    return report;
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
    if (typeof original !== 'function' || original.__zezmsDeviceManagementComposerR70P) return false;
    var wrapped=function () {
      var html=original.apply(this,arguments)+deviceManagementSlotHtml()+stagedCardHtml();
      /* This is post-render DOM reconciliation, not a second renderer or a
         retry wrapper.  It lets r70P remove stale cached card nodes after the
         framework has installed this single composed Settings result. */
      setTimeout(function () {
        var control=window.ZEZMS && window.ZEZMS.deviceControlPlaneR70P;
        if (control && typeof control.afterSettingsRender === 'function') control.afterSettingsRender();
      },0);
      return html;
    };
    wrapped.__zezmsDeviceManagementComposerR70P=true;
    window.viewSettings=wrapped;
    return true;
  }
  function installLegacyGuards() {
    /* The old M5A-3 buttons remain in older embedded markup, but every route
       is redirected into the gated r61 flow so a user cannot bypass bootstrap. */
    window.secureDeviceEnrollmentCreateCode=function () { beginDialog('ADD'); };
    window.secureDeviceEnrollmentOpen=function () { if (typeof openModal === 'function') openModal(bootstrapForm(managedParams())); };
    window.secureDeviceEnrollmentConfirmOpen=function () { window.secureDeviceEnrollmentOpen(); return false; };
    window.secureDeviceEnrollmentClaim=function () { return claimAndStage(); };
    window.secureDeviceEnrollmentCreateCode=function () { beginDialog('ADD'); return false; };
    window.secureDeviceEnrollmentOpenRevocation=function () { throw new Error('Legacy registration cannot revoke a managed device. Use Device Control Center.'); };
    window.secureDeviceEnrollmentConfirmRevocation=function () { throw new Error('Legacy registration cannot revoke a managed device. Use Device Control Center.'); };
  }
  function initialize() {
    installSettingsCard(); installLegacyGuards();
    if (managedParams().requested) setTimeout(function () { if (typeof openModal === 'function') openModal(bootstrapForm(managedParams())); },750);
    document.documentElement.setAttribute('data-zezms-managed-device-lifecycle','r70p');
    if (typeof render === 'function') render();
  }

  ZEZMS.managedDevices={ version:'M5A-4', build:BUILD, lifecycleStates:states.slice(), refresh:function(){ return loadFleet(true).catch(function(e){notify('Unable to load managed fleet. '+fleetReadError(e),'err');throw e;}); }, beginDialog:beginDialog, begin:function(mode){return beginEnrollment(mode).catch(function(e){notify(rpcError(e),'err');throw e;});}, claim:claimAndStage, finish:function(){if (finishPromise) return finishPromise; finishPromise=finishIfActivated().catch(function(e){notify(rpcError(e),'err');throw e;}).finally(function(){finishPromise=null;}); return finishPromise;}, hasVerifiedPendingStage:function(){return !!verifiedPendingStage();}, inspectBootstrapOutbox:inspectBootstrapOutbox, activate:function(id,rev){return activate(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, retire:function(id){return retire(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, cancel:function(id){return cancel(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, revoke:function(id){return revoke(id).catch(function(e){notify(rpcError(e),'err');throw e;});}, changeBranch:function(id,rev){return changeBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, confirmBranch:function(id,rev){return confirmBranch(id,rev).catch(function(e){notify(rpcError(e),'err');throw e;});}, copyCode:function(){if(currentEnrollment)return copy(currentEnrollment.pairing_code,'Pairing code copied.');}, copyLink:function(){if(currentEnrollment)return copy(currentEnrollment.setup_link,'Safe-bootstrap link copied.');}, getStage:stageRead, getJournal:journalRead, _test:{candidateCashIsSafe:candidateCashIsSafe, candidateIntegrity:candidateIntegrity, fingerprintCandidate:fingerprintCandidate, cleanHash:cleanHash, legacyCheckpointSnapshot:legacyCheckpointSnapshot, legacyCheckpointCanonicalize:legacyCheckpointCanonicalize, legacyCheckpointHash:legacyCheckpointHash, verifyCheckpointPayloadHash:verifyCheckpointPayloadHash, bootstrapFailureHeading:bootstrapFailureHeading, stageRead:stageRead, journalRead:journalRead, localBusinessState:localBusinessState, inspectBootstrapEligibility:inspectBootstrapEligibility, readClient:readClient, mutationClient:mutationClient, ensureFleetLoaded:ensureFleetLoaded, getFleetState:function(){return { status:fleetLoadStatus, error:fleetLoadError, businessId:fleetLoadedBusinessId, count:fleet.length, scheduled:fleetHydrationScheduled, loading:!!fleetLoadPromise };}} };
  setTimeout(initialize,500);
}());

/* ZEZMS TradeFlow v3.31.19 / r70V — deterministic Device Control Center.
 *
 * Settings composition belongs exclusively to managed-device-lifecycle-r61.
 * This module never wraps window.viewSettings.  It supplies one slot payload,
 * owns fleet-read state, and treats old registration rows only as evidence.
 */
(function () {
  'use strict';
  var BUILD='20261015-r70v-outbox-settings';
  var CANONICAL_RPC='zezms_m5a4_canonical_fleet_read';
  var LEGACY_RPC='zezms_m5a4_managed_fleet_with_branch';
  var REQUIRED_FIELDS=['lifecycle_id','device_id','device_name','enrollment_mode','lifecycle_state','revision','replaces_lifecycle_id','replacement_lifecycle_id','lifecycle_retired_at','lifecycle_revoked_at','last_seen_at','verified_cursor','queue_count','failed_count','app_version','branch_id','branch_name','branch_code','device_access_status','device_access_revoked_at','registered_device_status','registered_device_revoked_at','authentication_eligible'];
  var LOAD={UNINITIALIZED:'UNINITIALIZED',WAITING:'WAITING_FOR_CLOUD',LOADING:'LOADING',CANONICAL:'CANONICAL',LIMITED:'LIMITED_EVIDENCE',ERROR:'ERROR',WAITING_AUTHORITY:'WAITING_FOR_AUTHORITY'};
  var rows=[],historyFilter='ALL',loadState=LOAD.UNINITIALIZED,loadError='',inFlight=null,loadedBusinessId='',contract={mode:'UNLOADED',reason:'',requiredFields:REQUIRED_FIELDS.slice()};

  function text(value){return String(value==null?'':value);}
  function up(value){return text(value).trim().toUpperCase();}
  function esc(value){return text(value).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function own(value,key){return !!value&&Object.prototype.hasOwnProperty.call(value,key);}
  function idOf(item){return text(item&&(item.lifecycle_id||item.lifecycleId));}
  function deviceIdOf(item){return text(item&&(item.device_id||item.deviceId));}
  function parentOf(item){return text(item&&(item.replaces_lifecycle_id||item.replacesLifecycleId));}
  function childOf(item){return text(item&&(item.replacement_lifecycle_id||item.replacementLifecycleId));}
  function numeric(value){return typeof value==='number'&&Number.isFinite(value);}
  function cloud(){return window.ZEZMS&&window.ZEZMS.cloudSync?window.ZEZMS.cloudSync:null;}
  function foundation(){return window.ZEZMS&&window.ZEZMS.commercialFoundation?window.ZEZMS.commercialFoundation:null;}
  function isMissingRpc(error){return /PGRST202|could not find the function|does not exist|schema cache/i.test(text(error&&(error.message||error.details||error.hint)||error));}
  function safeError(error){var value=text(error&&(error.message||error.details||error.hint)||error).replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();return value&&value!=='[object Object]'?value.slice(0,240):'Unable to load devices.';}
  function shape(input){return Array.isArray(input)&&input.every(function(item){return REQUIRED_FIELDS.every(function(field){return own(item,field);});});}
  function markRows(input,mode){return (Array.isArray(input)?input:[]).map(function(item){var row=clone(item)||{};row.__r70pContract=mode;return row;});}
  function fullEvidence(item){return !!item&&item.__r70pContract==='CANONICAL';}
  function lifecycleOf(item){return up(item&&(item.lifecycle_state||item.lifecycle));}
  function context(){
    var service=cloud();
    if(!service||typeof service.getOwnerManagementContext!=='function')return {ready:false,state:LOAD.WAITING,message:'Connecting to device-management service…'};
    var state=service.getState?service.getState()||{}:{};
    var f=foundation(),foundationState=f&&f.getState?f.getState()||{}:{};
    var businessId=text(foundationState.businessId||(foundationState.context&&foundationState.context.business_id)||state.businessId);
    if(!businessId)return {ready:false,state:LOAD.WAITING,message:'Business context is unavailable.'};
    var authority=service.getOwnerManagementContext();
    if(!authority||!authority.ready)return {ready:false,state:LOAD.WAITING_AUTHORITY,message:authority&&authority.message||'Owner cloud verification is required.'};
    return {ready:true,client:authority.client,service:service,state:state,session:authority.session,businessId:businessId};
  }
  function renderNow(){
    var slot=document.getElementById&&document.getElementById('zezmsDeviceManagementSlot');
    if(slot&&window.ZEZMS.uiR70P)window.ZEZMS.uiR70P.reconcile(slot,settingsHtml());
    consolidateLegacyPanels();
  }
  function setState(next,error){loadState=next;loadError=text(error);}
  function resetForBusiness(id){if(id!==loadedBusinessId){rows=[];contract={mode:'UNLOADED',reason:'',requiredFields:REQUIRED_FIELDS.slice()};loadedBusinessId=id||'';setState(LOAD.UNINITIALIZED,'');}}
  function resolveCanonicalDeviceState(item){
    var lifecycle=lifecycleOf(item),full=fullEvidence(item),access=full?up(item.device_access_status):'UNKNOWN',registration=full?up(item.registered_device_status):'UNKNOWN',canonical='FAILED / EXPIRED',contradictions=[];
    if(lifecycle==='ACTIVE')canonical='ACTIVE';
    else if(lifecycle==='VERIFYING')canonical='AWAITING OWNER APPROVAL';
    else if(['ENROLLING','BOOTSTRAPPING'].indexOf(lifecycle)>=0)canonical='VERIFYING';
    else if(lifecycle==='RETIRED')canonical=full&&childOf(item)?'REPLACED':'RETIRED';
    else if(lifecycle==='REVOKED')canonical='REVOKED';
    else if(['REPLACED','SUPERSEDED'].indexOf(lifecycle)>=0||full&&childOf(item))canonical='REPLACED';
    var terminal=['REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(canonical)>=0;
    /* The server projection is advisory. An explicit access revocation wins
       even if an older canonical RPC reports authentication_eligible=true. */
    var accessRevoked=full&&(access==='REVOKED'||!!item.device_access_revoked_at);
    if(accessRevoked&&lifecycle==='ACTIVE')canonical='ACCESS REVOKED';
    var eligible=terminal||accessRevoked?false:(full&&typeof item.authentication_eligible==='boolean'?item.authentication_eligible:null);
    if(accessRevoked)contradictions.push('The authoritative device-access record is revoked. Historical registration and server eligibility cannot restore operational access.');
    if(full&&terminal&&(access==='ACTIVE'||registration==='ACTIVE'||registration==='REGISTERED'))contradictions.push('Lifecycle '+canonical+' but legacy registration/access evidence remains '+(access==='ACTIVE'?'ACTIVE':registration||'present')+'. Operational access is denied.');
    if(full&&canonical==='ACTIVE'&&eligible!==true)contradictions.push('Lifecycle is ACTIVE but canonical access evidence does not permit operational authentication.');
    if(!full)contradictions.push('Canonical fleet read upgrade required; the legacy RPC does not provide lineage, registration, access or health evidence.');
    return {lifecycleState:lifecycle||'UNKNOWN',canonicalStatus:canonical,deviceAccessStatus:access,registrationStatus:registration,authenticationEligible:eligible,operationalAccess:eligible===true,limitedEvidence:!full,replacementParent:full?parentOf(item):'',replacementChild:full?childOf(item):'',contradictions:contradictions};
  }
  function lineageRoot(item,byId){var current=item,seen={},next=parentOf(current);while(next&&byId[next]&&!seen[next]){seen[next]=true;current=byId[next];next=parentOf(current);}return idOf(current)||idOf(item)||deviceIdOf(item);}
  function rank(item){return Number(item.revision||0)*10000000000000+Number(new Date(item.last_seen_at||0).getTime()||0);}
  function health(item){if(item.canonicalStatus!=='ACTIVE')return item.canonicalStatus==='AWAITING OWNER APPROVAL'?'Syncing':'Needs attention';if(!fullEvidence(item)||item.authenticationEligible!==true||!numeric(item.queue_count)||!numeric(item.failed_count))return 'Unknown';if(item.failed_count>0)return 'Needs attention';if(item.queue_count>0)return 'Syncing';return 'Healthy';}
  function projectFleet(input){
    var source=Array.isArray(input)?input:[],byId={};source.forEach(function(item){if(idOf(item))byId[idOf(item)]=item;});
    var all=source.map(function(item){return Object.assign({},clone(item),resolveCanonicalDeviceState(item),{lineageRoot:fullEvidence(item)?lineageRoot(item,byId):idOf(item)||deviceIdOf(item)});});
    var activeByLineage={},conflicts={};
    all.forEach(function(item){if(fullEvidence(item)&&item.lifecycleState==='ACTIVE'){var key=item.lineageRoot;activeByLineage[key]=(activeByLineage[key]||[]).concat(item);}});
    Object.keys(activeByLineage).forEach(function(key){if(activeByLineage[key].length>1)conflicts[key]=true;});
    var active=[],pending=[],history=[],limited=[];
    all.forEach(function(item){
      if(conflicts[item.lineageRoot]&&item.lifecycleState==='ACTIVE'){item.canonicalStatus='CONFLICTING ACTIVE';item.authenticationEligible=false;item.operationalAccess=false;item.contradictions=item.contradictions.concat(['More than one ACTIVE lifecycle exists in this authoritative replacement lineage. No convenience action is available.']);pending.push(item);return;}
      if(item.limitedEvidence){limited.push(item);return;}
      if(item.canonicalStatus==='ACTIVE'&&item.operationalAccess)active.push(item);
      else if(['VERIFYING','AWAITING OWNER APPROVAL','ACTIVE','ACCESS REVOKED'].indexOf(item.canonicalStatus)>=0)pending.push(item);
      else history.push(item);
    });
    function sort(items){return items.sort(function(a,b){var byName=text(a.device_name||a.device_id).localeCompare(text(b.device_name||b.device_id));return byName||rank(b)-rank(a);});}
    return {active:sort(active),pending:sort(pending),history:sort(history),limited:sort(limited),all:all,canonical:contract.mode==='CANONICAL'};
  }
  function badge(value){var state=up(value),kind=state==='ACTIVE'||state==='HEALTHY'?'ok':/REVOKED|FAILED|CONFLICT|ATTENTION|ERROR/.test(state)?'bad':/RETIRED|REPLACED|UNKNOWN|LIMITED/.test(state)?'warn':'info';return '<span class="badge '+kind+'">'+esc(value)+'</span>';}
  function when(value){if(!value)return '—';var date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString();}
  function itemAction(item){var managed=window.ZEZMS&&window.ZEZMS.managedDevices,id=idOf(item),safe=esc(JSON.stringify(id));if(!managed||!id)return '—';if(fullEvidence(item)&&item.canonicalStatus==='ACTIVE'&&item.operationalAccess)return '<button class="btn sm ghost" onclick="ZEZMS.managedDevices.changeBranch('+safe+','+Number(item.revision||0)+')">Change Branch</button> <button class="btn sm ghost" onclick="ZEZMS.managedDevices.retire('+safe+')">Retire</button> <button class="btn sm danger" onclick="ZEZMS.managedDevices.revoke('+safe+')">Revoke</button>';if(fullEvidence(item)&&item.canonicalStatus==='AWAITING OWNER APPROVAL')return '<button class="btn sm" onclick="ZEZMS.managedDevices.activate('+safe+','+Number(item.revision||0)+')">Approve</button>';return '<small>'+(item.limitedEvidence?'Read-only evidence':'Historical / review only')+'</small>';}
  function evidenceLine(item){var items=[];if(item.replacementParent)items.push('Replaces '+item.replacementParent);if(item.replacementChild)items.push('Replaced by '+item.replacementChild);if(item.contradictions.length)items.push(item.contradictions.join(' '));return items.join(' ');}
  function table(items,history,empty){return '<div class="table-wrap"><table><thead><tr><th>Device</th><th>Role/type</th><th>Branch</th><th>Status</th><th>Sync health</th><th>Last seen</th><th>App</th><th>'+(history?'Lineage / evidence':'Actions')+'</th></tr></thead><tbody>'+(items.map(function(item){return '<tr><td><b>'+esc(item.device_name||item.device_id||'ZEZMS Device')+'</b><br><small class="mono">'+esc(deviceIdOf(item))+'</small></td><td>'+esc(item.enrollment_mode||'Device')+'</td><td>'+esc(item.branch_name||item.branch_code||'Unassigned')+'</td><td>'+badge(item.canonicalStatus)+'</td><td>'+badge(health(item))+'</td><td>'+esc(when(item.last_seen_at))+'</td><td>'+esc(item.app_version||'—')+'</td><td>'+(history?'<small>'+esc(evidenceLine(item)||'Historical record')+'</small>':itemAction(item))+'</td></tr>';}).join('')||'<tr><td colspan="8" class="empty">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';}
  function controls(){return '<div class="row" style="margin-top:10px"><button class="btn" onclick="ZEZMS.deviceControlPlaneR70P.add()">Add device</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.replace()">Recover / replace device</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.refresh()">Refresh</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.downloadReport()">Download fleet reconciliation report</button></div>';}
  function settingsHtml(){
    var heading='<section class="card" data-zezms-device-control-plane="r70p" style="margin-top:12px"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Device Control Center</h3><span class="badge '+(loadState===LOAD.CANONICAL?'ok':loadState===LOAD.ERROR?'bad':'info')+'">r70V</span></div><p class="muted">One authoritative fleet projection. Registration history remains available for audit and cannot override lifecycle authority.</p>';
    var authority=context();
    if(!authority.ready)return heading+'<p class="muted">'+esc(authority.message)+'</p></section>';
    if(loadState===LOAD.UNINITIALIZED||loadState===LOAD.WAITING)return heading+'<p class="muted">Connecting to device-management service…</p></section>';
    if(loadState===LOAD.WAITING_AUTHORITY)return heading+'<p class="muted">'+esc(loadError||'Device management is available on an Owner/Admin device.')+'</p></section>';
    if(loadState===LOAD.LOADING)return heading+'<p class="muted">Loading devices…</p></section>';
    if(loadState===LOAD.ERROR)return heading+'<div class="notice warn"><b>Unable to load devices.</b> '+esc(loadError||'The fleet request did not complete.')+'</div><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.refresh()">Retry</button></section>';
    var projection=projectFleet(rows),historyRows=historyFilter==='ALL'?projection.history:projection.history.filter(function(item){return item.canonicalStatus===historyFilter;});
    if(loadState===LOAD.LIMITED)return heading+'<div class="notice warn"><b>Canonical fleet read upgrade required.</b> '+esc(contract.reason||'The installed server RPC does not return the evidence required for canonical fleet status.')+'</div><h4>Legacy read-only lifecycle evidence</h4>'+table(projection.limited,true,'No legacy lifecycle records found after the successful read.')+'<div class="row" style="margin-top:10px"><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.refresh()">Refresh</button><button class="btn ghost" onclick="ZEZMS.deviceControlPlaneR70P.downloadReport()">Download read-only evidence report</button></div></section>';
    var activeEmpty=rows.length===0?'No devices found.':'No current operational devices.';
    return heading+'<h4>Active Devices</h4>'+table(projection.active,false,activeEmpty)+controls()+'<h4 style="margin-top:18px">Pending / Needs Attention</h4>'+table(projection.pending,false,'No items require attention.')+'<details style="margin-top:18px"><summary><b>Device History</b> ('+projection.history.length+')</summary><p class="muted">Replaced, retired, revoked and failed identities are preserved for audit only; they have no operational actions.</p><label>Filter <select onchange="ZEZMS.deviceControlPlaneR70P.setHistoryFilter(this.value)"><option value="ALL"'+(historyFilter==='ALL'?' selected':'')+'>All history</option><option value="REPLACED"'+(historyFilter==='REPLACED'?' selected':'')+'>Replaced</option><option value="RETIRED"'+(historyFilter==='RETIRED'?' selected':'')+'>Retired</option><option value="REVOKED"'+(historyFilter==='REVOKED'?' selected':'')+'>Revoked</option><option value="FAILED / EXPIRED"'+(historyFilter==='FAILED / EXPIRED'?' selected':'')+'>Failed enrollment</option></select></label>'+table(historyRows,true,'No historical devices match this filter.')+'</details></section>';
  }
  function cleanupObsoleteNodes(){if(!document||!document.querySelectorAll)return;Array.prototype.forEach.call(document.querySelectorAll('[data-zezms-device-control-plane="r70m"],[data-zezms-device-control-plane="r70n"]'),function(node){if(node&&node.parentNode)node.parentNode.removeChild(node);});}
  function consolidateLegacyPanels(scope){
    scope=scope||document;if(!scope||!scope.querySelectorAll)return;
    Array.prototype.forEach.call(scope.querySelectorAll('h1,h2,h3,h4'),function(heading){
      var label=up(heading&&heading.textContent);if(!/REGISTERED DEVICES|ENROLLED DEVICES|SECURE DEVICE ENROLLMENT|MANAGED DEVICE LIFECYCLE|LEGACY REGISTRATION EVIDENCE/.test(label))return;
      var card=heading.closest&&heading.closest('.card');if(!card||card.hasAttribute('data-zezms-device-control-plane')||card.hasAttribute('data-zezms-device-management-slot'))return;
      // Retain read-only registration evidence in a collapsed history section.
      card.style.display='';
      card.setAttribute('data-zezms-legacy-registration-evidence','true');heading.textContent='Legacy registration evidence — not canonical fleet status';
      if(!card.querySelector||card.querySelector('[data-zezms-r70p-registration-history]'))return;
      var tableWrap=card.querySelector('.table-wrap')||card.querySelector('table');if(!tableWrap){card.style.display='none';return;}
      var details=document.createElement('details');details.setAttribute('data-zezms-r70p-registration-history','true');details.innerHTML='<summary><b>Registration History</b></summary><p class="muted">These are legacy registration records, not the operational fleet. Their historical ACTIVE labels cannot restore a retired, replaced or revoked lifecycle.</p>';
      if(tableWrap.parentNode){tableWrap.parentNode.insertBefore(details,tableWrap);details.appendChild(tableWrap);}
      Array.prototype.forEach.call(details.querySelectorAll('button'),function(button){if(/revoke|retire|replace/i.test(text(button.textContent))){button.disabled=true;button.title='Historical registration evidence is read-only here.';}});
    });
  }
  async function readFleet(pair){
    var canonical=await pair.client.rpc(CANONICAL_RPC,{p_business_id:pair.businessId});
    if(!canonical.error&&shape(canonical.data)){contract={mode:'CANONICAL',reason:'',requiredFields:REQUIRED_FIELDS.slice()};return markRows(canonical.data,'CANONICAL');}
    if(canonical.error&&!isMissingRpc(canonical.error))throw canonical.error;
    var legacy=await pair.client.rpc(LEGACY_RPC,{p_business_id:pair.businessId});if(legacy.error)throw legacy.error;
    contract={mode:'UPGRADE_REQUIRED',reason:canonical.error?'The canonical read RPC is not deployed.':'The canonical read RPC returned an incomplete contract.',requiredFields:REQUIRED_FIELDS.slice()};return markRows(legacy.data,'LEGACY');
  }
  function ensureFleetLoaded(force){
    var pair=context();if(!pair.ready){resetForBusiness('');setState(pair.state,pair.message);renderNow();return Promise.resolve(null);}
    resetForBusiness(pair.businessId);
    if(!force&&(loadState===LOAD.CANONICAL||loadState===LOAD.LIMITED))return Promise.resolve(projectFleet(rows));
    if(inFlight)return inFlight;
    setState(LOAD.LOADING,'');renderNow();
    inFlight=readFleet(pair).then(function(result){rows=result;setState(contract.mode==='CANONICAL'?LOAD.CANONICAL:LOAD.LIMITED,'');return projectFleet(rows);}).catch(function(error){setState(LOAD.ERROR,safeError(error));throw error;}).finally(function(){inFlight=null;renderNow();});
    return inFlight;
  }
  function afterSettingsRender(){cleanupObsoleteNodes();consolidateLegacyPanels();ensureFleetLoaded(false).catch(function(){/* load state is recorded and rendered visibly */});}
  function add(){var managed=window.ZEZMS&&window.ZEZMS.managedDevices;if(!managed)return false;managed.beginDialog('ADD');return true;}
  function replace(){var managed=window.ZEZMS&&window.ZEZMS.managedDevices;if(!managed)return false;managed.beginDialog('REPLACEMENT');return true;}
  function refresh(){return ensureFleetLoaded(true);}
  function setHistoryFilter(value){historyFilter=['ALL','REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(value)>=0?value:'ALL';renderNow();}
  function fleetReport(input){return projectFleet(input==null?rows:input).all.map(function(item){return {lifecycleId:idOf(item),deviceId:deviceIdOf(item),name:text(item.device_name),lifecycleMode:text(item.enrollment_mode),lifecycleState:item.lifecycleState,canonicalStatus:item.canonicalStatus,registrationStatus:item.registrationStatus,registeredDeviceStatus:item.registrationStatus,deviceAccessStatus:item.deviceAccessStatus,deviceAccessRevokedAt:item.device_access_revoked_at||null,registeredDeviceRevokedAt:item.registered_device_revoked_at||null,authenticationEligible:item.authenticationEligible,replacesLifecycleId:item.replacementParent||null,replacementLifecycleId:item.replacementChild||null,lineageRoot:item.lineageRoot,branch:{id:item.branch_id||null,name:text(item.branch_name),code:text(item.branch_code)},lastSeen:item.last_seen_at||null,appVersion:text(item.app_version),verifiedCursor:numeric(item.verified_cursor)?item.verified_cursor:null,queueCount:numeric(item.queue_count)?item.queue_count:null,failedCount:numeric(item.failed_count)?item.failed_count:null,syncHealth:health(item),showInActive:item.canonicalStatus==='ACTIVE'&&item.operationalAccess,historyOnly:['REPLACED','RETIRED','REVOKED','FAILED / EXPIRED'].indexOf(item.canonicalStatus)>=0,contradictions:item.contradictions.slice(),evidenceSources:fullEvidence(item)?['zezms_device_lifecycle','zezms_device_access','zezms_business_devices','zezms_branches','zezms_m5a4_canonical_fleet_read']:['zezms_m5a4_managed_fleet_with_branch (legacy limited evidence)']};});}
  function downloadReport(){var report={build:BUILD,generatedAt:new Date().toISOString(),readOnly:true,loadState:loadState,contract:clone(contract),records:fleetReport()};var blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ZEZMS_Fleet_Reconciliation_r70V_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);return report;}
  function eventReady(){ensureFleetLoaded(false).catch(function(){});}
  window.ZEZMS=window.ZEZMS||{};
  window.ZEZMS.deviceControlPlaneR70P={build:BUILD,normalizeSettings:consolidateLegacyPanels,settingsHtml:settingsHtml,afterSettingsRender:afterSettingsRender,ensureFleetLoaded:ensureFleetLoaded,refresh:refresh,add:add,replace:replace,setHistoryFilter:setHistoryFilter,downloadReport:downloadReport,getProjection:function(){return projectFleet(rows);},getContract:function(){return clone(contract);},getLoadState:function(){return {state:loadState,error:loadError,loading:!!inFlight,businessId:loadedBusinessId};},_test:{requiredFields:REQUIRED_FIELDS.slice(),shape:shape,markRows:markRows,resolveCanonicalDeviceState:resolveCanonicalDeviceState,projectFleet:projectFleet,fleetReport:fleetReport,health:health,settingsHtml:settingsHtml,afterSettingsRender:afterSettingsRender,ensureFleetLoaded:ensureFleetLoaded}};
  if(window.addEventListener){['zezms-cloud-ready','zezms-cloud-sync-ready','zezms-auth-ready','zezms-session-ready','zezms-business-context-ready','zezms-settings-opened','zezms-shared-device-directory-updated','focus'].forEach(function(name){window.addEventListener(name,eventReady);});}
  document.documentElement.setAttribute('data-zezms-device-control-plane','r70p');
}());

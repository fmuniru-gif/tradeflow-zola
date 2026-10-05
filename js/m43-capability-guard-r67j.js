/*
 * ZEZMS TradeFlow r67J — M4/3 capability guard recovery.
 *
 * Authority: the guard recovered from the verified r67H Cloud loader,
 * decoded from its direct baseline CLOUD_B64 (lines 383–434).  The r67I
 * materializer retained its callers but omitted this out-of-band definition.
 * This fragment is injected inside the final Cloud Sync closure, so it shares
 * the established M4/3 constants, state, lifecycle and queue machinery.
 */

function r67jCapabilityMessage(error) {
  return String(error && (error.message || error.details || error.hint) || error || 'M4/3 capability validation failed.');
}

function r67jIsTransientCapabilityError(message) {
  return /network|offline|timeout|timed out|fetch|connection reset|temporar|unavailable/i.test(String(message || ''));
}

function r67jIsBlockingCapabilityError(message) {
  const text = String(message || '');
  if (/ZEZMS_(CLIENT_CAPABILITY_MISMATCH|SERVER_M43_UPGRADE_REQUIRED)|M4\/3 capability mismatch/i.test(text)) return true;
  if (/ZEZMS_CAPABILITY_CHECK_FAILED/i.test(text)) return !r67jIsTransientCapabilityError(text);
  return false;
}

function r67jMarkCapabilityBlocked(code, message) {
  const original = String(message || 'M4/3 capability validation failed.');
  const detail = /M4\/3 capability mismatch - update required/i.test(original)
    ? original
    : 'M4/3 capability mismatch - update required. ' + original;
  try { r67hClearReconnectTimer(); } catch (_) {}
  try { r67iClearStartupTimer(); } catch (_) {}
  try { stopRealtime(); } catch (_) {}
  r67hPersist({
    status: 'capability-blocked',
    liveSyncEnabled: state.liveSyncDesired === true ? true : state.liveSyncEnabled,
    r67jCapabilityBlocked: true,
    r67jCapabilityBlockCode: String(code || 'M43_CAPABILITY_VALIDATION_FAILED'),
    r67jCapabilityBlockReason: detail,
    r67jCapabilityBlockedAt: new Date().toISOString(),
    lastError: detail
  }, false);
}

function r67jClearCapabilityBlocked() {
  if (!state.r67jCapabilityBlocked) return;
  r67hPersist({
    r67jCapabilityBlocked: false,
    r67jCapabilityBlockCode: '',
    r67jCapabilityBlockReason: '',
    r67jCapabilityUnblockedAt: new Date().toISOString()
  }, false);
}

/*
 * Recovered r67H M4/3 guard retained only for a genuinely legacy server.
 * r70J installs the final global wrapper after this fragment, so an MB3
 * server always uses r70's protocol-aware transition guard instead.
 */
async function r67jLegacyCapabilityGuard(force){
  var sync=window.ZEZMS&&ZEZMS.cloudSync;
  if(!sync||!sync.getClient||!sync.getSession) return true;
  var client=sync.getClient(), session=sync.getSession();
  if(!client||!session) return true;
  var key='zezms_m43_capability_state_r56';
  var cached=null;
  try{cached=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
  var now=Date.now();
  if(!force&&cached&&cached.verified===true&&now-Number(cached.checkedMs||0)<300000) return true;
  var result=await client.rpc('zezms_m43_get_capabilities');
  if(result.error){
    var missing=/does not exist|Could not find the function|schema cache/i.test(String(result.error.message||result.error));
    var record={
      verified:false, checkedAt:new Date().toISOString(), checkedMs:now,
      code:missing?'SERVER_M43_UPGRADE_REQUIRED':'CAPABILITY_CHECK_FAILED',
      message:missing?'Run the M4/3 Supabase Safety Core SQL before enabling sync.':String(result.error.message||result.error)
    };
    try{localStorage.setItem(key,JSON.stringify(record));}catch(_){}
    try{sync.stop();}catch(_){}
    throw new Error('ZEZMS_'+record.code+': '+record.message);
  }
  var row=Array.isArray(result.data)?result.data[0]:result.data;
  row=row||{};
  var problems=[];
  if(String(row.protocol_version||'')!=='M4/3') problems.push('protocol');
  if(Number(row.minimum_client_generation||0)>31800) problems.push('client-generation');
  if(String(row.rules_hash||'')!=='M43-R56-RULES-20260825-A') problems.push('rules');
  if(String(row.identity_registry_hash||'')!=='M43-IDREG-20260825-A') problems.push('identity-registry');
  var ok=problems.length===0;
  var record={
    verified:ok, checkedAt:new Date().toISOString(), checkedMs:now,
    code:ok?'CAPABILITY_MATCH':'CLIENT_CAPABILITY_MISMATCH',
    message:ok?'Client and server sync rules match.':'Mismatch: '+problems.join(', '),
    serverProtocol:String(row.protocol_version||''),
    serverRulesHash:String(row.rules_hash||''),
    serverIdentityHash:String(row.identity_registry_hash||''),
    minimumClientGeneration:Number(row.minimum_client_generation||0),
    activationCursor:Number(row.activation_cursor||0),
    capabilities:row.capabilities||{}
  };
  try{localStorage.setItem(key,JSON.stringify(record));}catch(_){}
  window.ZEZMS_M43_LAST_CAPABILITY=record;
  if(!ok){
    try{sync.stop();}catch(_){}
    throw new Error('ZEZMS_CLIENT_CAPABILITY_MISMATCH: '+record.message);
  }
  try{
    if(sync.normalizeM43LegacyWarning) sync.normalizeM43LegacyWarning(record.activationCursor);
  }catch(_){}
  return true;
}

function r70jIsObsoleteR67jMismatch(message) {
  return /ZEZMS_CLIENT_CAPABILITY_MISMATCH|M4\/3 capability mismatch - update required|Mismatch:\s*(?:protocol|rules|identity-registry)/i.test(String(message || ''));
}

function r70jReadLegacyCapabilityRecord() {
  try { return JSON.parse(localStorage.getItem('zezms_m43_capability_state_r56') || 'null'); }
  catch (_) { return null; }
}

/* This is deliberately narrow: a successful r70 validation may clear only
   the old r67J mismatch sentinel, never a general sync/integrity/lifecycle
   error. It lets an already-paired device retry without clearing site data. */
function r70jNormalizeObsoleteR67jCapabilityBlock() {
  var record=r70jReadLegacyCapabilityRecord();
  var staleRecord=!!(record && record.code==='CLIENT_CAPABILITY_MISMATCH'
    && r70jIsObsoleteR67jMismatch(record.message));
  var staleBlock=!!(state.r67jCapabilityBlocked
    && /^(M43_CAPABILITY_VALIDATION_FAILED|CLIENT_CAPABILITY_MISMATCH)$/.test(String(state.r67jCapabilityBlockCode || ''))
    && r70jIsObsoleteR67jMismatch(state.r67jCapabilityBlockReason || state.lastError));
  if (!staleRecord && !staleBlock) return false;

  var patch={};
  if (staleBlock) {
    patch.r67jCapabilityBlocked=false;
    patch.r67jCapabilityBlockCode='';
    patch.r67jCapabilityBlockReason='';
    patch.r67jCapabilityUnblockedAt=new Date().toISOString();
  }
  if (r70jIsObsoleteR67jMismatch(state.lastError)) {
    patch.lastError='';
    if (state.status==='capability-blocked') patch.status='ready';
  }
  if (Object.keys(patch).length) r67hPersist(patch,false);
  if (staleRecord) {
    try { localStorage.removeItem('zezms_m43_capability_state_r56'); } catch (_) {}
  }
  return true;
}

/*
 * Final capability entry point. On an MB3 server r70CapabilityGuard is the
 * only validator. A missing MB3 transition RPC is the explicit, fail-closed
 * legacy-server path, validated by the recovered r67J M4/3 guard.
 */
async function r70jAuthoritativeCapabilityGuard(force) {
  var transition=await r70CapabilityGuard(force===true);
  if (transition && transition.source==='m43-legacy-server') {
    var legacy=await r67jLegacyCapabilityGuard(force===true);
    r70jNormalizeObsoleteR67jCapabilityBlock();
    return legacy;
  }
  r70jNormalizeObsoleteR67jCapabilityBlock();
  return transition;
}

var r67jBaseConnectionCode = r67hConnectionCode;
r67hConnectionCode = function () {
  if (state.r67jCapabilityBlocked || r67jIsBlockingCapabilityError(state.lastError)) return 'CAPABILITY_BLOCKED';
  return r67jBaseConnectionCode();
};

var r67jBaseConnectionLabel = r67hConnectionLabel;
r67hConnectionLabel = function (code) {
  if (code === 'CAPABILITY_BLOCKED') return 'Enabled - blocked: M4/3 capability validation failed';
  return r67jBaseConnectionLabel(code);
};

var r67jBaseScheduleReconnect = r67hScheduleReconnect;
r67hScheduleReconnect = function (reason) {
  if (state.r67jCapabilityBlocked || r67jIsBlockingCapabilityError(state.lastError)) {
    Promise.resolve(window.ZEZMS_M43_CAPABILITY_GUARD(true)).then(function () {
      r67jBaseScheduleReconnect(reason);
    }).catch(function (error) {
      handleError(error);
    });
    return false;
  }
  return r67jBaseScheduleReconnect(reason);
};

var r67jBaseScheduleStartupSync = r67iScheduleStartupSync;
r67iScheduleStartupSync = function (reason) {
  if (state.r67jCapabilityBlocked || r67jIsBlockingCapabilityError(state.lastError)) {
    Promise.resolve(window.ZEZMS_M43_CAPABILITY_GUARD(true)).then(function () {
      r67jBaseScheduleStartupSync(reason);
    }).catch(function (error) {
      handleError(error);
    });
    return false;
  }
  return r67jBaseScheduleStartupSync(reason);
};

/* Keep the user-visible connection in SYNCING while the inherited ordered
   pull/rebase/push/final-pull path is running. The r67J builder also moves
   the realtime subscription to after that path. */
var r67jReconciliationInProgress = false;
var r67jBaseSetState = setState;
setState = function (patch, shouldRender) {
  if (r67jReconciliationInProgress && patch && patch.status === 'live') {
    patch = Object.assign({}, patch, {status:'syncing'});
  }
  return r67jBaseSetState(patch, shouldRender);
};

var r67jBaseStartLiveSync = startLiveSync;
startLiveSync = async function (showNotice) {
  let result;
  r67jReconciliationInProgress = true;
  try {
    await window.ZEZMS_M43_CAPABILITY_GUARD(false);
    result = await r67jBaseStartLiveSync(showNotice);
    r70jNormalizeObsoleteR67jCapabilityBlock();
  } finally {
    r67jReconciliationInProgress = false;
  }
  if (result === true && state.liveSyncEnabled) r67hPersist({status:'live',lastError:''}, false);
  return result;
};

var r67jBaseHandleError = handleError;
handleError = function (error) {
  r67jBaseHandleError(error);
  const message = r67jCapabilityMessage(error);
  if (r67jIsBlockingCapabilityError(message)) {
    r67jMarkCapabilityBlocked('M43_CAPABILITY_VALIDATION_FAILED', message);
  }
};

/* Read-only backend preflight. It authenticates, checks paired-device
   lifecycle directly, invokes the same production guard, then reads the
   server head. It never pushes, pulls, edits a queue or writes Cloud data. */
async function r67jPreflightM43Capability() {
  requireClient();
  if (state.deviceAccessMode === 'PAIRED') {
    const response = await client.rpc('zezms_m5a3_device_context', {
      p_device_id: state.deviceId,
      p_device_name: state.deviceName,
      p_platform: String(navigator.userAgent || '').slice(0, 240),
      p_app_version: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '3.28.10'
    });
    if (response.error) throw response.error;
    const context = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!context || String(context.device_status || '').toUpperCase() !== 'ACTIVE') {
      const error = new Error('ZEZMS_DEVICE_REVOKED: managed device is not ACTIVE.');
      r67hPersist({deviceAccessStatus:String(context && context.device_status || 'REVOKED').toUpperCase(), status:'error', lastError:error.message}, false);
      throw error;
    }
  } else if (!r67hLifecycleAllowsSync()) {
    const error = new Error('ZEZMS_DEVICE_REVOKED: managed device is not ACTIVE.');
    r67hPersist({status:'error', lastError:error.message}, false);
    throw error;
  }
  await window.ZEZMS_M43_CAPABILITY_GUARD(true);
  r67jClearCapabilityBlocked();
  const head = await client
    .from(OPERATIONS_TABLE)
    .select('seq')
    .eq('owner_id', currentSyncOwnerId())
    .order('seq', { ascending: false })
    .limit(1);
  if (head.error) throw head.error;
  const rows = head.data || [];
  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    serverCursor: Number(rows[0] && rows[0].seq || 0),
    capability: window.ZEZMS_M43_LAST_CAPABILITY || null,
    readOnly: true
  };
}

/* This assignment is intentionally last in the composed Cloud Sync runtime.
   It keeps historical callers on the global name while making r70's dynamic
   MB3 contract authoritative. */
window.ZEZMS_M43_CAPABILITY_GUARD=r70jAuthoritativeCapabilityGuard;

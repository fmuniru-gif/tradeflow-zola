/* Main-only audit input comparison. GET-only except the verified SELECT-only checkpoint RPC. */
(function () {
  'use strict';
  const PROJECT = 'https://ruadyqcsutfprrxdaahi.supabase.co';
  const MAIN = '9a5ab8eb-f67e-425c-866d-574b641295f0';
  const DB_KEY = 'tradeflow_v321_zola';
  const CORE = window.ZEZMSMainAuditInputCore;
  const CURRENT = window.ZEZMSMainAuditR60o;
  const LEGACY = window.ZEZMS?.syncIntegrity?._test;
  // Remove the legacy module's interactive repair/export API from this page.
  // Its pure projector and comparator remain available for this comparison.
  if (LEGACY) window.ZEZMS.syncIntegrity = Object.freeze({
    version:window.ZEZMS.syncIntegrity.version,
    build:window.ZEZMS.syncIntegrity.build,
    _test:LEGACY
  });
  const $ = id => document.getElementById(id);
  const button = $('run'), status = $('status'), result = $('result'), reportView = $('report');
  let safeReport = null;
  const stop = code => { throw Error(code); };
  const parse = (raw, code) => { try { return JSON.parse(raw); } catch (_) { stop(code); } };

  function localInput() {
    const raw = {
      database:localStorage.getItem(DB_KEY),
      state:localStorage.getItem('zezms_cloud_sync_m4_state'),
      queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
      applied:localStorage.getItem('zezms_cloud_sync_m4_applied_v2')
    };
    const db = parse(raw.database, 'INVALID_LOCAL_DATABASE');
    const state = parse(raw.state, 'INVALID_SYNC_STATE');
    const queue = parse(raw.queue, 'INVALID_QUEUE');
    const applied = parse(raw.applied || '{}', 'INVALID_APPLIED_REGISTER');
    if (!db || !state || !Array.isArray(queue) || !applied || typeof applied !== 'object' ||
        Array.isArray(applied)) stop('INVALID_LOCAL_SHAPE');
    if (String(state.deviceId) !== MAIN) stop('NOT_MAIN_DEVICE');
    if (String(state.supabaseUrl || '').replace(/\/$/, '') !== PROJECT ||
        !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(state.publishableKey || ''))
      stop('PRODUCTION_PROJECT_CONFIGURATION');
    const session = parse(localStorage.getItem('zezms-m3-supabase-auth'), 'OWNER_SESSION_REQUIRED');
    if (!session?.access_token || !session?.user?.id || session.user.is_anonymous === true ||
        !Number.isFinite(session.expires_at) || session.expires_at * 1000 < Date.now() + 60000)
      stop('VALID_OWNER_SESSION_REQUIRED');
    return { raw, db, state, queue, applied, auth:{
      key:state.publishableKey, token:session.access_token, ownerId:String(session.user.id) } };
  }

  async function request(path, auth, method) {
    const mode = method || 'GET';
    if (mode !== 'GET' && !(mode === 'POST' && path === '/rest/v1/rpc/zezms_m43_checkpoint_latest'))
      stop('WRITE_REQUEST_BLOCKED');
    const response = await fetch(PROJECT + path, {
      method:mode, mode:'cors', credentials:'omit', cache:'no-store',
      headers:{ apikey:auth.key, Authorization:'Bearer ' + auth.token,
        Accept:'application/json', ...(mode === 'POST' ? {'Content-Type':'application/json'} : {}) },
      ...(mode === 'POST' ? {body:'{}'} : {}), signal:AbortSignal.timeout(30000)
    });
    if (!response.ok) stop('CLOUD_READ_HTTP_' + response.status);
    return response.json();
  }
  const rest = (table, query) => '/rest/v1/' + table + '?' + new URLSearchParams(query);
  async function owner(auth) {
    const user = await request('/auth/v1/user', auth);
    if (!user?.id || String(user.id) !== auth.ownerId || user.is_anonymous === true ||
        user.app_metadata?.provider === 'anonymous') stop('OWNER_AUTH_FAILED');
  }
  async function master(auth) {
    const rows = await request(rest('zezms_sync_state', {
      select:'owner_id,payload,revision,operation_cursor,sync_mode,updated_at,updated_by',
      owner_id:'eq.' + auth.ownerId }), auth);
    if (!Array.isArray(rows) || rows.length !== 1 ||
        String(rows[0].owner_id) !== auth.ownerId || rows[0].sync_mode !== 'operations' ||
        !rows[0].payload || !Number.isSafeInteger(Number(rows[0].operation_cursor)))
      stop('CLOUD_MASTER_INVALID');
    return rows[0];
  }
  async function checkpoint(auth) {
    // The recorded production SQL definition selects the latest row from
    // public.zezms_sync_checkpoints where owner_id=auth.uid(); it has no write clause.
    const data = await request('/rest/v1/rpc/zezms_m43_checkpoint_latest', auth, 'POST');
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.payload || !Number.isSafeInteger(Number(row.checkpoint_cursor)) ||
        Number(row.checkpoint_cursor) < 0 || String(row.protocol_version) !== 'M4/3')
      stop('M43_CHECKPOINT_INVALID');
    return row;
  }
  async function head(auth) {
    const rows = await request(rest('zezms_sync_operations', {
      select:'seq', owner_id:'eq.' + auth.ownerId, order:'seq.desc', limit:'1' }), auth);
    if (!Array.isArray(rows) || rows.length > 1) stop('CLOUD_HEAD_INVALID');
    return rows.length ? Number(rows[0].seq) : 0;
  }
  async function operations(auth, after, through) {
    const rows = [];
    let cursor = after;
    while (cursor < through) {
      const page = await request(rest('zezms_sync_operations', {
        select:'seq,op_id,device_id,device_seq,kind,payload,client_created_at,created_at',
        owner_id:'eq.' + auth.ownerId, seq:'gt.' + cursor, order:'seq.asc', limit:'500' }), auth);
      if (!Array.isArray(page) || page.length < 1 || page.length > 500) stop('CLOUD_OPERATION_PAGE_INVALID');
      for (const row of page) {
        const seq = Number(row.seq);
        if (!Number.isSafeInteger(seq) || seq <= cursor || seq > through) stop('CLOUD_OPERATION_ORDER_INVALID');
        rows.push(row); cursor = seq;
      }
    }
    return rows;
  }
  function summarizeReport(report) {
    return { totals:CORE.totals(report), categories:CORE.differenceCategories(report) };
  }
  function evaluate(test, local, cloudBundle) {
    const projection = test.projectCloud(cloudBundle);
    const audit = test.compareDatabases(local.db, projection.database, cloudBundle);
    audit.cloudProjectionConflicts = projection.conflicts;
    return { projection, audit };
  }
  async function run() {
    if (!CORE || !CURRENT || CURRENT.version !== '3.20.0' || !LEGACY ||
        location.origin !== 'https://fmuniru-gif.github.io' ||
        location.pathname !== '/tradeflow-zola/diagnostics/main-cash-input-compare/')
      stop('DIAGNOSTIC_ORIGIN_OR_MODULE_MISMATCH');
    const moduleResponse = await fetch('integrity-r60o.js', {cache:'no-store'});
    if (!moduleResponse.ok || await CORE.sha(await moduleResponse.text()) !==
        '1d10b619e56c09103be32fb982686ebb1d309fd7a231b4ad78ec1d1c61071e7c')
      stop('PRODUCTION_INTEGRITY_MODULE_HASH_MISMATCH');
    const local = localInput();
    const ownerContext = local.state.deviceAccessMode === 'PAIRED'
      ? String(local.state.syncOwnerId || '') : local.auth.ownerId;
    if (ownerContext !== local.auth.ownerId) stop('OWNER_TENANT_CONTEXT_MISMATCH');
    await owner(local.auth);
    const [m43, m42, cloudHead] = await Promise.all([
      checkpoint(local.auth), master(local.auth), head(local.auth)
    ]);
    const currentCursor = Number(m43.checkpoint_cursor), legacyCursor = Number(m42.operation_cursor);
    if (!Number.isSafeInteger(cloudHead) || cloudHead < Math.max(currentCursor, legacyCursor))
      stop('CLOUD_CURSOR_HEAD_INVALID');
    const all = await operations(local.auth, Math.min(currentCursor, legacyCursor), cloudHead);
    const [m43Again, m42Again, headAgain] = await Promise.all([
      checkpoint(local.auth), master(local.auth), head(local.auth)
    ]);
    if (cloudHead !== headAgain || CORE.stable(m43) !== CORE.stable(m43Again) ||
        CORE.stable(m42) !== CORE.stable(m42Again)) stop('CLOUD_CHANGED_DURING_COMPARISON');
    const rawAfter = {
      database:localStorage.getItem(DB_KEY),
      state:localStorage.getItem('zezms_cloud_sync_m4_state'),
      queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
      applied:localStorage.getItem('zezms_cloud_sync_m4_applied_v2')
    };
    if (JSON.stringify(local.raw) !== JSON.stringify(rawAfter)) stop('LOCAL_CHANGED_DURING_COMPARISON');
    const legacyRows = all.filter(row => Number(row.seq) > legacyCursor);
    const currentRows = all.filter(row => Number(row.seq) > currentCursor);
    const legacyBundle = { ownerId:local.auth.ownerId, baseline:m42.payload,
      baselineCursor:legacyCursor, operations:legacyRows, headSeq:cloudHead, protocolVersion:'M4/2' };
    const currentBundle = { ownerId:local.auth.ownerId, baseline:m43.payload,
      baselineCursor:currentCursor, operations:currentRows, headSeq:cloudHead,
      protocolVersion:'M4/3', checkpoint:{cursor:currentCursor} };
    window.ZEZMS.cloudSync = {getAppliedOperations:() => local.applied,
      getState:() => local.state, getOutbox:() => local.queue, protocolVersion:'M4/3'};
    const r3 = evaluate(LEGACY, local, legacyBundle);
    const oldOnCurrent = evaluate(LEGACY, local, currentBundle);
    const currentOnOld = evaluate(CURRENT.test, local, legacyBundle);
    const normalLike = evaluate(CURRENT.test, local, currentBundle);
    let snapshot = null;
    const file = $('snapshot').files[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) stop('SNAPSHOT_TOO_LARGE');
      snapshot = await CORE.snapshotComparison(parse(await file.text(), 'INVALID_SNAPSHOT_JSON'),
        local.db, CURRENT.test, MAIN);
    }
    const [localCollections, legacyCloudCollections, currentCloudCollections,
      oldOnCurrentCollections, currentOnOldCollections] = await Promise.all([
      CORE.collections(local.db, CURRENT.test),
      CORE.collections(r3.projection.database, CURRENT.test),
      CORE.collections(normalLike.projection.database, CURRENT.test),
      CORE.collections(oldOnCurrent.projection.database, CURRENT.test),
      CORE.collections(currentOnOld.projection.database, CURRENT.test)
    ]);
    const baselineEqual = currentCursor === legacyCursor &&
      await CORE.sha(m43.payload) === await CORE.sha(m42.payload);
    const operationWindowEqual = await CORE.sha(currentRows) === await CORE.sha(legacyRows);
    const projectionEqual = CORE.stable(oldOnCurrentCollections) === CORE.stable(currentCloudCollections);
    const comparisonEqual = CORE.stable(summarizeReport(oldOnCurrent.audit)) ===
      CORE.stable(summarizeReport(normalLike.audit));
    const stages = {ownerContextMatch:true, snapshot, localCursor:Number(local.state.cursor),
      baselineEqual, operationWindowEqual, projectionEqual, comparisonEqual};
    return {
      format:'ZEZMS_MAIN_AUDIT_INPUT_COMPARISON_V1', generatedAt:new Date().toISOString(),
      scope:'MAIN_ONLY_READ_ONLY', deviceIdentityMatch:true, ownerContextMatch:true,
      applicationIntegrity:{version:CURRENT.version, build:CURRENT.build,
        moduleSha256:'1d10b619e56c09103be32fb982686ebb1d309fd7a231b4ad78ec1d1c61071e7c'},
      standaloneIntegrity:{version:window.ZEZMS.syncIntegrity.version,
        build:window.ZEZMS.syncIntegrity.build},
      local:{cursor:Number(local.state.cursor), queueCount:local.queue.length,
        appliedRegisterCount:Object.keys(local.applied).length, collections:localCollections,
        runtimeSnapshot:snapshot},
      cloud:{head:cloudHead, masterBaselineCursor:legacyCursor,
        checkpointBaselineCursor:currentCursor, legacyOperationCount:legacyRows.length,
        currentOperationCount:currentRows.length,
        masterPayloadSha256:await CORE.sha(m42.payload),
        checkpointPayloadSha256:await CORE.sha(m43.payload),
        legacyOperationWindowSha256:await CORE.sha(legacyRows),
        currentOperationWindowSha256:await CORE.sha(currentRows)},
      comparisons:{
        r3Standalone:{...summarizeReport(r3.audit), collections:legacyCloudCollections},
        legacyRulesOnCurrentBundle:{...summarizeReport(oldOnCurrent.audit), collections:oldOnCurrentCollections},
        currentRulesOnLegacyBundle:{...summarizeReport(currentOnOld.audit), collections:currentOnOldCollections},
        normalInputEquivalent:{...summarizeReport(normalLike.audit), collections:currentCloudCollections}
      },
      stages:{...stages, snapshot:snapshot ? {
        generatedAt:snapshot.generatedAt, cursor:snapshot.cursor,
        differingCollections:snapshot.differingCollections } : null,
        firstDivergentStage:CORE.firstStage(stages)},
      note:'Normal-input-equivalent uses the saved local DB. Import the app snapshot to verify its in-memory DB. No repair is authorized by this report.'
    };
  }
  button.addEventListener('click', async function () {
    button.disabled = true; result.hidden = true; safeReport = null;
    status.textContent = 'Reading Main and cloud audit inputs. No repair will run.';
    try {
      safeReport = await run(); reportView.textContent = JSON.stringify(safeReport, null, 2);
      result.hidden = false;
      status.textContent = 'Read-only comparison complete. Financial repair remains blocked.';
    } catch (error) {
      status.textContent = 'STOP: ' + String(error.message || error).replace(/https?:\/\/\S+/g, '[URL]');
    } finally { button.disabled = false; }
  });
  $('download').addEventListener('click', function () {
    if (!safeReport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(safeReport, null, 2)],
      {type:'application/json'}));
    const link = document.createElement('a'); link.href = url;
    link.download = 'ZEZMS_Main_Audit_Input_Comparison.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

/* r70W review: read-only proof for one Camon 17P bootstrap outbox item. */
(function () {
  'use strict';
  const DEVICE = '4f95591d-8a5a-4866-a009-74b50bfe32f0';
  const LIFECYCLE = 'e2f9a4be-f306-4bbd-ba1d-387d8274c63d';
  const OPERATION = 'ee957e0e-5d46-4e84-8418-d9527347b945';
  const CURSOR = 3498;
  const QUEUE_KEY = 'zezms_cloud_sync_m4_queue';
  const FAILED_KEY = 'zezms_cloud_sync_m4_failed_v2';
  const STAGE_KEY = 'zezms_m5a4_safe_bootstrap_stage_v1';
  const JOURNAL_KEY = 'zezms_m5a4_safe_bootstrap_journal_v2';
  const STATE_KEY = 'zezms_cloud_sync_m4_state';
  const KEYS = [QUEUE_KEY, FAILED_KEY, STAGE_KEY, JOURNAL_KEY, STATE_KEY];
  const BUTTON_ID = 'r70wVerifyKpiOutbox';
  const REPORT_ID = 'r70wKpiOutboxReport';
  const DOWNLOAD_ID = 'r70wDownloadKpiReport';
  let savedEnvelope = null;

  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!record(value)) return value;
    const result = {};
    Object.keys(value).sort().forEach(key => { result[key] = canonical(value[key]); });
    return result;
  }
  function same(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function readRaw() { return Object.fromEntries(KEYS.map(key => [key, localStorage.getItem(key)])); }
  function parsed(raw) { try { return JSON.parse(raw); } catch (_) { return null; } }
  function shape(value, keys) { return record(value) && same(Object.keys(value).sort(), keys.slice().sort()); }
  async function sha(value) {
    if (!crypto || !crypto.subtle || !window.TextEncoder) throw Error('HASH_UNAVAILABLE');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
    return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function expected() {
    const generator = window.ZEZMSConfirmedJulySnapshot;
    if (!generator || generator.build !== '20261008-r70q-phase-a-review' || !record(generator.values)) return null;
    const values = generator.values;
    if (!['debt', 'creditors', 'deposits', 'cashBuckets'].every(k => Number.isFinite(values[k]))) return null;
    return { id:'KPI-202607-CONFIRMED', year:2026, month:7,
      debt:values.debt, creditors:values.creditors, deposits:values.deposits, cashBuckets:values.cashBuckets,
      confirmedClosing:true, confirmationSource:'User-confirmed July 2026 closing balances',
      correctionRelease:'3.4.23', snapshotVersion:3, automatic:false };
  }
  function partialFields(value, reference) {
    return record(value) && record(reference) && Object.keys(reference).every(key => own(value, key) && same(value[key], reference[key]));
  }
  function status(report) {
    if (report.reasons.some(x => /UNAVAILABLE|MISSING|INVALID|CORRUPT|CHANGED_DURING_READ/.test(x))) return 'NOT_VERIFIABLE';
    if (report.reasons.length === 0) return 'EXACT_EQUALITY';
    if (report.comparison.expectedFieldsEqual && report.comparison.candidateFieldsEqual &&
        (!report.comparison.expectedExact || !report.comparison.candidateExact)) return 'PARTIAL_EQUALITY';
    return 'MISMATCH';
  }
  async function inspect() {
    const result = { format:'ZEZMS_R70W_CAMON17P_KPI_EQUIVALENCE_V1', readOnly:true,
      inspectedAt:new Date().toISOString(), status:'NOT_VERIFIABLE', reasons:[],
      queueCount:null, failedCount:null, localMaterialBusinessCount:null, localKpiRecordCount:null,
      deviceId:null, lifecycleId:null, cursor:null, operationId:null,
      checks:{ verifiedStage:false, fingerprint:false, durableQueue:false, operationBeforeAttestation:false,
        completePatchShape:false, noUnrelatedQueuedOperations:false, noUnrelatedMaterialBusinessRecords:false,
        operationPayloadHash:false, localKpiExact:false },
      comparison:{ expectedFieldsEqual:false, expectedExact:false, candidateFieldsEqual:false,
        candidateExact:false, candidateRecordCount:0, candidateKeyMatchCount:0 },
      hashes:{ operation:null, patch:null, expectedRecord:null, candidateRecord:null, stageFingerprint:null } };
    const fail = code => { if (!result.reasons.includes(code)) result.reasons.push(code); };
    let before;
    try {
      const sync = window.ZEZMS && ZEZMS.cloudSync;
      const managed = window.ZEZMS && ZEZMS.managedDevices;
      const state = sync && sync.getState && sync.getState();
      if (!state || String(state.deviceId || '') !== DEVICE) {
        fail('DEVICE_IDENTITY_MISMATCH');
        result.status = 'MISMATCH';
        return result;
      }
      before = readRaw();
      const queue = sync && sync.getOutbox && sync.getOutbox();
      const failed = sync && sync.getFailedOperations && sync.getFailedOperations();
      const stage = parsed(before[STAGE_KEY]);
      const journal = parsed(before[JOURNAL_KEY]);
      const storedQueue = parsed(before[QUEUE_KEY]);
      const storedFailed = parsed(before[FAILED_KEY]);
      const inspection = sync && sync.inspectM5a4BootstrapOutbox && sync.inspectM5a4BootstrapOutbox();
      result.deviceId = state && String(state.deviceId || '');
      result.lifecycleId = stage && String(stage.lifecycleId || '');
      result.cursor = stage && Number(stage.cursor);
      result.queueCount = Array.isArray(queue) ? queue.length : null;
      result.failedCount = Array.isArray(failed) ? failed.length : null;
      result.localMaterialBusinessCount = inspection && inspection.localBusinessRecordCount;
      if (result.deviceId !== DEVICE || result.lifecycleId !== LIFECYCLE || result.cursor !== CURSOR ||
          String(state && state.deviceAccessMode || '').toUpperCase() !== 'PAIRED' ||
          state && state.liveSyncEnabled !== false ||
          journal && (journal.deviceId !== DEVICE || journal.lifecycleId !== LIFECYCLE || journal.stage !== 'VERIFYING')) fail('DEVICE_OR_LIFECYCLE_MISMATCH');
      if (!Array.isArray(queue) || queue.length !== 1 || !Array.isArray(failed) || failed.length !== 0)
        fail('QUEUE_OR_FAILED_COUNT_MISMATCH');
      result.checks.noUnrelatedQueuedOperations = Array.isArray(queue) && queue.length === 1;
      result.checks.durableQueue = Array.isArray(storedQueue) && same(storedQueue, queue) &&
        Array.isArray(storedFailed) && same(storedFailed, failed);
      if (!result.checks.durableQueue) fail('DURABLE_OUTBOX_INVALID');
      result.checks.noUnrelatedMaterialBusinessRecords = result.localMaterialBusinessCount === 0;
      if (!result.checks.noUnrelatedMaterialBusinessRecords) fail('LOCAL_BUSINESS_DATA_MISMATCH');
      result.checks.verifiedStage = !!(managed && managed.hasVerifiedPendingStage && managed.hasVerifiedPendingStage());
      result.checks.fingerprint = result.checks.verifiedStage;
      if (!result.checks.verifiedStage) fail('STAGE_INTEGRITY_UNAVAILABLE');
      if (!stage || !record(stage.candidate) || !record(stage.fingerprint) || !journal) fail('STAGE_OR_JOURNAL_MISSING');
      const op = Array.isArray(queue) && queue[0];
      result.operationId = op && String(op.opId || '');
      if (!record(op) || op.opId !== OPERATION || op.kind !== 'DATABASE_CHANGE' || op.deviceId !== DEVICE ||
          (op.originDeviceId && op.originDeviceId !== DEVICE)) fail('OPERATION_IDENTITY_MISMATCH');
      const patch = op && Array.isArray(op.patches) && op.patches.length === 1 && op.patches[0];
      const localKpi = typeof DB !== 'undefined' && DB && Array.isArray(DB.kpiHistory) ? DB.kpiHistory : null;
      result.localKpiRecordCount = localKpi && localKpi.length;
      result.checks.localKpiExact = !!(localKpi && localKpi.length === 1 && patch && same(localKpi[0],patch.value));
      if (!result.checks.localKpiExact) fail('LOCAL_KPI_RECORD_MISMATCH');
      const generatorRecord = expected();
      if (!generatorRecord) fail('EXPECTED_GENERATOR_UNAVAILABLE');
      result.checks.completePatchShape = !!(patch && shape(patch, ['action','collection','key','value']) &&
        patch.action === 'insert' && patch.collection === 'kpiHistory' && record(patch.value) &&
        patch.value.id === 'KPI-202607-CONFIRMED' &&
        patch.key === String(patch.value._syncId || patch.value.id));
      if (!result.checks.completePatchShape) fail('PATCH_SHAPE_OR_KEY_MISMATCH');
      result.checks.operationBeforeAttestation = !!(op && stage && Number.isFinite(Date.parse(op.createdAt)) &&
        Number.isFinite(Date.parse(stage.attestedAt)) && Date.parse(op.createdAt) < Date.parse(stage.attestedAt));
      if (!result.checks.operationBeforeAttestation) fail('ATTESTATION_ORDER_MISMATCH');
      result.checks.operationPayloadHash = !!(op && typeof op.payloadHash === 'string' && sync && sync._test &&
        sync._test.deterministicHash && sync._test.deterministicHash(op) === op.payloadHash);
      if (!result.checks.operationPayloadHash) fail('OPERATION_HASH_MISMATCH');
      if (generatorRecord && patch && record(patch.value)) {
        const withoutSyncId = Object.assign({}, patch.value);
        delete withoutSyncId._syncId;
        result.comparison.expectedFieldsEqual = partialFields(withoutSyncId, generatorRecord);
        result.comparison.expectedExact = same(withoutSyncId, generatorRecord);
        if (!result.comparison.expectedFieldsEqual) fail('EXPECTED_JULY_VALUES_MISMATCH');
        else if (!result.comparison.expectedExact) fail('EXPECTED_JULY_EXTRA_FIELDS');
        result.hashes.expectedRecord = await sha(generatorRecord);
        result.hashes.patch = await sha(patch);
      }
      const matches = stage && stage.candidate && Array.isArray(stage.candidate.kpiHistory)
        ? stage.candidate.kpiHistory.filter(item => record(item) && item.id === 'KPI-202607-CONFIRMED') : [];
      result.comparison.candidateRecordCount = matches.length;
      result.comparison.candidateKeyMatchCount = stage && stage.candidate && Array.isArray(stage.candidate.kpiHistory) && patch
        ? stage.candidate.kpiHistory.filter(item => record(item) && String(item._syncId || item.id) === String(patch.key)).length : 0;
      if (patch && (matches.length !== 1 || result.comparison.candidateKeyMatchCount !== 1))
        fail('CANDIDATE_RECORD_MISSING_OR_DUPLICATE');
      if (matches.length === 1 && patch && record(patch.value)) {
        result.comparison.candidateFieldsEqual = partialFields(matches[0], patch.value);
        result.comparison.candidateExact = same(matches[0], patch.value);
        if (!result.comparison.candidateFieldsEqual) fail('CANDIDATE_VALUES_MISMATCH');
        else if (!result.comparison.candidateExact) fail('CANDIDATE_EXTRA_FIELDS');
        result.hashes.candidateRecord = await sha(matches[0]);
      }
      if (op) result.hashes.operation = await sha(op);
      if (stage && stage.fingerprint) result.hashes.stageFingerprint = await sha(stage.fingerprint);
      if (!same(before, readRaw()) || !same(queue, sync && sync.getOutbox && sync.getOutbox()))
        fail('CHANGED_DURING_READ');
    } catch (_) { fail('READ_OR_HASH_UNAVAILABLE'); }
    result.status = status(result);
    return result;
  }
  async function run() {
    const box = document.getElementById(REPORT_ID);
    if (!box) return;
    savedEnvelope = null;
    const download = document.getElementById(DOWNLOAD_ID);
    if (download) download.hidden = true;
    try {
      const result = await inspect();
      savedEnvelope = { integrity:{algorithm:'SHA-256',covers:'report',sha256:await sha(result)},report:result };
      box.textContent = JSON.stringify(savedEnvelope, null, 2);
      if (download) download.hidden = false;
    } catch (_) {
      box.textContent = 'NOT_VERIFIABLE: Secure report hashing is unavailable. The outbox was not changed.';
    }
    box.hidden = false;
  }
  async function download() {
    await run();
    if (!savedEnvelope) return false;
    const blob = new Blob([JSON.stringify(savedEnvelope,null,2)+'\n'],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ZEZMS_Camon17P_KPI_Review_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);
    link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    return true;
  }
  function refresh() {
    const login = document.getElementById('loginScreen');
    const status = document.getElementById('sharedLoginStatus');
    const sync = window.ZEZMS && ZEZMS.cloudSync;
    if (!login || login.style.display === 'none' || !status || !status.parentNode ||
        !sync || !sync.getState || String(sync.getState().deviceId || '') !== DEVICE ||
        localStorage.getItem(STAGE_KEY) === null) return;
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID; button.type = 'button'; button.className = 'btn ghost';
    button.textContent = 'Verify Camon 17P KPI outbox (read only)';
    button.style.cssText = 'width:100%;margin-top:8px';
    button.addEventListener('click', run);
    const downloadButton = document.createElement('button');
    downloadButton.id = DOWNLOAD_ID; downloadButton.type = 'button'; downloadButton.className = 'btn ghost';
    downloadButton.textContent = 'Download sanitized KPI review report';
    downloadButton.style.cssText = 'width:100%;margin-top:8px';
    downloadButton.hidden = true;
    downloadButton.addEventListener('click', download);
    const box = document.createElement('pre');
    box.id = REPORT_ID; box.hidden = true;
    box.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto;font-size:11px';
    status.parentNode.insertBefore(box, status.nextSibling);
    status.parentNode.insertBefore(downloadButton, box);
    status.parentNode.insertBefore(button, box);
  }
  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.camon17pKpiReview = Object.freeze({ inspect, refresh });
  window.addEventListener('load', () => setTimeout(refresh, 800), { once:true });
  window.addEventListener('zezms-cloud-ready', () => setTimeout(refresh, 1000), { once:true });
}());

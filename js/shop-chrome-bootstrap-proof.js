/* Shop Chrome: local, read-only evidence for the one blocked bootstrap operation. */
(function () {
  'use strict';
  const DEVICE = '6229402b-947f-43b2-818f-143c3a27a1a0';
  const LIFECYCLE = '0820a9f3-9e62-45c8-ac81-c4e15f5a03a5';
  const OPERATION = '95bab3c9-04dd-4cf2-b514-90d3964fbd31';
  const BUTTON = 'shopChromeBootstrapProofButton';
  const REPORT = 'shopChromeBootstrapProofReport';
  const DOWNLOAD = 'shopChromeBootstrapProofDownload';
  let lastEnvelope = null;

  function safeName(value) {
    const text=String(value == null ? '' : value);
    return !text || /^[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(text) ? text : '[REDACTED]';
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const sorted = {};
      Object.keys(value).sort().forEach(key => { sorted[key] = canonical(value[key]); });
      return sorted;
    }
    return value;
  }
  function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  async function sha(value) {
    const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(canonical(value)));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function context() {
    const service = window.ZEZMS && ZEZMS.managedDevices;
    const phase = window.ZEZMS && ZEZMS.bootstrapPhaseA;
    const cloud = window.ZEZMS && ZEZMS.cloudSync;
    if (!service || !service.hasVerifiedPendingStage || !service.hasVerifiedPendingStage() ||
        !phase || !phase.inspect || !cloud || !cloud.getState || !cloud.getOutbox) return null;
    const inspection = phase.inspect();
    const stage = inspection && inspection.status === 'PRESENT' ? inspection.stage : null;
    const state = cloud.getState();
    if (!stage || stage.deviceId !== DEVICE || stage.lifecycleId !== LIFECYCLE ||
        state.deviceId !== DEVICE || String(state.deviceAccessMode).toUpperCase() !== 'PAIRED') return null;
    return { stage, cloud, state };
  }
  async function inspect() {
    const proof = context();
    if (!proof) throw new Error('STOP_IDENTITY_OR_STAGE: This verified Shop Chrome bootstrap is unavailable.');
    const queue = proof.cloud.getOutbox();
    if (!Array.isArray(queue) || queue.length !== 1 || queue[0].opId !== OPERATION)
      throw new Error('STOP_QUEUE_CHANGED: The expected single operation is no longer present.');
    const op = queue[0];
    if (op.kind !== 'DATABASE_CHANGE' || !Array.isArray(op.patches))
      throw new Error('STOP_OPERATION_SHAPE: The original operation is not the expected type.');
    const july = window.ZEZMSConfirmedJulySnapshot;
    const values = july && july.values;
    const expectedJuly = values ? {
      id:'KPI-202607-CONFIRMED',year:2026,month:7,debt:values.debt,creditors:values.creditors,
      deposits:values.deposits,cashBuckets:values.cashBuckets,confirmedClosing:true,
      confirmationSource:'User-confirmed July 2026 closing balances',correctionRelease:'3.4.23',
      snapshotVersion:3,automatic:false
    } : null;
    const candidate = proof.stage.candidate;
    if (!candidate || typeof candidate !== 'object') throw new Error('STOP_CANDIDATE_MISSING');
    const patches = [];
    for (const patch of op.patches) {
      const action = safeName(patch && patch.action);
      const collection = safeName(patch && patch.collection);
      const root = safeName(patch && patch.root);
      const value = patch && patch.value;
      let candidateValue;
      if (root && action === 'root-set') candidateValue = candidate[root];
      else if (collection && candidate && Array.isArray(candidate[collection]) && value && typeof value === 'object') {
        const key=String(value.id || value._syncId || '');
        if (key) candidateValue = candidate[collection].find(row => row && String(row.id || row._syncId || '') === key);
      }
      const isJuly = action === 'insert' && collection === 'kpiHistory' && value && value.id === 'KPI-202607-CONFIRMED';
      // Only field names and hashes leave this browser. No staff verifier, customer
      // detail, settings value, cloud credential or raw operation is rendered.
      patches.push({ action, collection, root,
        recordId: isJuly ? 'KPI-202607-CONFIRMED' : '',
        fieldNames: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).map(safeName).sort() : [],
        beforeSha256:patch && Object.prototype.hasOwnProperty.call(patch,'before') ? await sha(patch.before) : null,
        valueSha256:patch && Object.prototype.hasOwnProperty.call(patch,'value') ? await sha(value) : null,
        candidateSha256:candidateValue === undefined ? null : await sha(candidateValue),
        exactCandidateMatch:candidateValue !== undefined && equal(value,candidateValue),
        confirmedJulyId:isJuly,confirmedJulyExact:isJuly && expectedJuly !== null && equal(value,expectedJuly) });
    }
    const wire = JSON.parse(JSON.stringify(op));
    ['payloadHash','outboxState','attempts','lastAttempt','lastError','_legacyPayload'].forEach(key => { delete wire[key]; });
    const hash = proof.cloud._test && proof.cloud._test.deterministicHash;
    const report = { format:'ZEZMS_SHOP_CHROME_BOOTSTRAP_PROOF_V1', readOnly:true,
      deviceId:DEVICE,lifecycleId:LIFECYCLE,stageCursor:proof.stage.cursor,attestedAt:proof.stage.attestedAt,
      operationId:OPERATION,operationKind:op.kind,
      createdAt:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(String(op.createdAt || '')) ? op.createdAt : '',
      deviceSeq:Number.isSafeInteger(Number(op.deviceSeq)) && Number(op.deviceSeq)>=0 ? Number(op.deviceSeq) : null,
      queueCount:queue.length,patchCount:patches.length,
      payloadHash:/^[0-9a-f]{16}$/i.test(String(op.payloadHash || '')) ? op.payloadHash : '[INVALID]',
      payloadHashMatches:typeof hash === 'function' ? hash(wire) === op.payloadHash : null,
      operationSha256:await sha(op),patches,
      disposition:'UNRESOLVED — inspection never authorizes quarantine or activation' };
    return { integrity:{algorithm:'SHA-256',covers:'report',sha256:await sha(JSON.stringify(report))},report };
  }
  function refresh() {
    if (!context()) {
      lastEnvelope=null;
      for (const id of [BUTTON,REPORT,DOWNLOAD]) { const old=document.getElementById(id); if (old) old.remove(); }
      return;
    }
    if (document.getElementById(BUTTON)) return;
    const anchor=document.getElementById('r70vInspectBootstrapOutbox');
    if (!anchor || !anchor.parentNode) return;
    const button=document.createElement('button');
    button.id=BUTTON;button.type='button';button.className='btn ghost';
    button.style.cssText='margin-top:8px;width:100%';
    button.textContent='Inspect exact Shop Chrome operation proof (read only)';
    button.addEventListener('click',async function () {
      const box=document.getElementById(REPORT);
      try { lastEnvelope=await inspect(); box.textContent=JSON.stringify(lastEnvelope,null,2); }
      catch (error) { lastEnvelope=null; box.textContent=String(error && error.message || 'Read-only inspection failed.'); }
      box.hidden=false;
      document.getElementById(DOWNLOAD).hidden=!lastEnvelope;
    });
    const box=document.createElement('pre');box.id=REPORT;box.hidden=true;
    box.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto;font-size:11px';
    const download=document.createElement('button');download.id=DOWNLOAD;download.type='button';download.className='btn ghost';download.hidden=true;
    download.style.cssText='margin-top:8px;width:100%';download.textContent='Download privacy-safe proof JSON';
    download.addEventListener('click',function () {
      if (!context() || !lastEnvelope) return;
      const blob=new Blob([JSON.stringify(lastEnvelope,null,2)+'\n'],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='ZEZMS_Shop_Chrome_Bootstrap_Proof.json';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    anchor.parentNode.insertBefore(button,anchor.nextSibling);
    anchor.parentNode.insertBefore(box,button.nextSibling);
    anchor.parentNode.insertBefore(download,box.nextSibling);
  }
  window.ZEZMS=window.ZEZMS||{};
  ZEZMS.shopChromeBootstrapProof=Object.freeze({inspect,refresh});
  window.addEventListener('zezms-cloud-ready',refresh);
  window.addEventListener('storage',refresh);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,1000));
  else setTimeout(refresh,1000);
}());

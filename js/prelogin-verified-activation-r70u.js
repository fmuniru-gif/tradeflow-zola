/* r70U: expose the existing verified Safe Bootstrap finish at the staff login gate. */
(function () {
  'use strict';
  var ID='r70uCompleteVerifiedActivation';
  var INSPECT_ID='r70vInspectBootstrapOutbox';
  var DOWNLOAD_ID='r70vDownloadBootstrapOutbox';
  var REPORT_ID='r70vBootstrapOutboxReport';
  var busy=false;
  var savedEnvelope=null;
  function managed() { return window.ZEZMS && ZEZMS.managedDevices; }
  function sync() { return window.ZEZMS && ZEZMS.cloudSync; }
  function loginVisible() {
    var screen=document.getElementById('loginScreen');
    return !!screen && screen.style.display !== 'none';
  }
  function remove() {
    savedEnvelope=null;
    [ID,INSPECT_ID,DOWNLOAD_ID,REPORT_ID].forEach(function (id) {
      var element=document.getElementById(id);
      if (element && element.parentNode) element.parentNode.removeChild(element);
    });
  }
  function identifier(value) {
    var text=String(value==null?'':value);
    return /^[A-Za-z0-9_-]{1,120}$/.test(text)?text:'[REDACTED]';
  }
  function type(value) {
    var text=String(value==null?'':value);
    return /^[A-Z0-9_:-]{1,80}$/.test(text)?text:'[REDACTED NONSTANDARD TYPE]';
  }
  function path(value) {
    var text=String(value==null?'':value);
    return !text?'':/^[A-Za-z][A-Za-z0-9_.-]{0,100}$/.test(text)?text:'[REDACTED PATH]';
  }
  function timestamp(value) {
    var text=String(value==null?'':value);
    return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(text)?text:'';
  }
  function count(value) {
    var number=Number(value);
    return Number.isSafeInteger(number)&&number>=0?number:null;
  }
  function classification(value) {
    return ['SAFE_SETUP_RESIDUE','BUSINESS_OPERATION','UNKNOWN / REVIEW REQUIRED'].indexOf(value)>=0
      ?value:'UNRECOGNIZED CLASSIFICATION';
  }
  function diagnostic(report) {
    var rows=(report.rows||[]).map(function (row) {
      var kind=classification(row.classification);
      return { operationId:identifier(row.operationId),type:type(row.type),createdAt:timestamp(row.createdAt),
        classification:kind,candidateEquivalent:kind==='SAFE_SETUP_RESIDUE'&&row.safeToDiscard===true,
        paths:(row.patches||[]).map(function (item) {
          return {action:path(item.patch&&item.patch.action),root:path(item.root),collection:path(item.collection),
            classification:classification(item.classification)};
        }) };
    });
    var stage=report.bootstrapStage;
    var queueCount=count(report.queueCount),failedCount=count(report.failedOperationCount),businessCount=count(report.localBusinessRecordCount);
    return {format:'ZEZMS_R70V_BOOTSTRAP_OUTBOX_DIAGNOSTIC_V1',readOnly:true,inspectedAt:timestamp(report.inspectedAt),
      bootstrapStage:stage?{deviceId:identifier(stage.deviceId),lifecycleId:identifier(stage.lifecycleId),
        cursor:count(stage.cursor),attestedAt:timestamp(stage.attestedAt)}:null,
      queueCount:queueCount,failedOperationCount:failedCount,localBusinessRecordCount:businessCount,
      activationEligible:report.activationEligible===true&&queueCount===rows.length&&failedCount===0&&businessCount===0&&rows.every(function (row) {return row.candidateEquivalent;}),
      rows:rows};
  }
  async function digest(text) {
    if (!window.crypto || !crypto.subtle || !window.TextEncoder) throw new Error('Secure browser hashing is unavailable; preserve the on-screen report and stop.');
    var bytes=new TextEncoder().encode(text);
    var hash=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(function (byte) {return byte.toString(16).padStart(2,'0');}).join('');
  }
  async function inspect() {
    if (!eligible()) { refresh(); return null; }
    var box=document.getElementById(REPORT_ID),download=document.getElementById(DOWNLOAD_ID),service=sync();
    if (!box || !download) return null;
    savedEnvelope=null;download.hidden=true;
    try {
      if (!service || typeof service.inspectM5a4BootstrapOutbox!=='function') throw new Error('The trusted r70M read-only inspector is unavailable.');
      var report=diagnostic(service.inspectM5a4BootstrapOutbox());
      var sha256=await digest(JSON.stringify(report));
      if (!eligible()) { refresh(); return null; }
      savedEnvelope={integrity:{algorithm:'SHA-256',covers:'report',sha256:sha256},report:report};
      box.textContent=JSON.stringify(savedEnvelope,null,2);
      box.hidden=false;download.hidden=false;
      return savedEnvelope;
    } catch (error) {
      box.textContent='Read-only inspection unavailable: '+String(error&&error.message||error).slice(0,240);
      box.hidden=false;
      return null;
    }
  }
  function download() {
    if (!eligible() || !savedEnvelope) { refresh(); return false; }
    var blob=new Blob([JSON.stringify(savedEnvelope,null,2)+'\n'],{type:'application/json'});
    var url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='ZEZMS_Bootstrap_Outbox_Diagnostic_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(function () {URL.revokeObjectURL(url);},1000);
    return true;
  }
  function eligible() {
    var service=managed();
    return !!(service && typeof service.hasVerifiedPendingStage === 'function' &&
      service.hasVerifiedPendingStage() && loginVisible());
  }
  function refresh() {
    if (!eligible()) { if (!busy) remove(); return false; }
    var status=document.getElementById('sharedLoginStatus');
    if (!status || !status.parentNode) return false;
    if (!document.getElementById(INSPECT_ID)) {
      var inspectButton=document.createElement('button');
      inspectButton.id=INSPECT_ID;inspectButton.type='button';inspectButton.className='btn ghost';
      inspectButton.style.marginTop='8px';inspectButton.style.width='100%';
      inspectButton.textContent='Inspect bootstrap outbox (read only)';
      inspectButton.addEventListener('click',inspect);
      status.parentNode.insertBefore(inspectButton,status.nextSibling);
    }
    if (!document.getElementById(DOWNLOAD_ID)) {
      var downloadButton=document.createElement('button');
      downloadButton.id=DOWNLOAD_ID;downloadButton.type='button';downloadButton.className='btn ghost';
      downloadButton.style.marginTop='8px';downloadButton.style.width='100%';downloadButton.hidden=true;
      downloadButton.textContent='Download sanitized JSON report';
      downloadButton.addEventListener('click',download);
      status.parentNode.insertBefore(downloadButton,status.nextSibling);
    }
    if (!document.getElementById(REPORT_ID)) {
      var reportBox=document.createElement('pre');reportBox.id=REPORT_ID;reportBox.hidden=true;
      reportBox.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto;font-size:11px';
      status.parentNode.insertBefore(reportBox,status.nextSibling);
    }
    var button=document.getElementById(ID);
    if (button) return true;
    button=document.createElement('button');
    button.id=ID;
    button.type='button';
    button.className='btn';
    button.style.marginTop='8px';
    button.style.width='100%';
    button.textContent='Complete verified activation';
    button.addEventListener('click',async function () {
      if (busy || !eligible()) { refresh(); return; }
      busy=true;
      button.disabled=true;
      button.textContent='Checking Owner approval and activating…';
      try {
        await managed().finish();
        remove();
      } catch (error) {
        var box=document.getElementById('sharedLoginStatus');
        if (box) box.textContent=String(error && error.message || 'Activation could not be completed.').slice(0,240);
      } finally {
        busy=false;
        button.disabled=false;
        button.textContent='Complete verified activation';
        refresh();
      }
    });
    status.parentNode.insertBefore(button,status.nextSibling);
    return true;
  }
  window.ZEZMS=window.ZEZMS||{};
  ZEZMS.preloginVerifiedActivation={refresh:refresh,inspect:inspect,download:download};
  window.addEventListener('zezms-cloud-ready',refresh);
  window.addEventListener('storage',refresh);
  window.addEventListener('zezms-shared-device-directory-updated',refresh);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(refresh,700);});
  else setTimeout(refresh,700);
}());

/* r70U: expose the existing verified Safe Bootstrap finish at the staff login gate. */
(function () {
  'use strict';
  var ID='r70uCompleteVerifiedActivation';
  var INSPECT_ID='r70vInspectBootstrapOutbox';
  var REPORT_ID='r70vBootstrapOutboxReport';
  var busy=false;
  function managed() { return window.ZEZMS && ZEZMS.managedDevices; }
  function loginVisible() {
    var screen=document.getElementById('loginScreen');
    return !!screen && screen.style.display !== 'none';
  }
  function remove() {
    [ID,INSPECT_ID,REPORT_ID].forEach(function (id) {
      var element=document.getElementById(id);
      if (element && element.parentNode) element.parentNode.removeChild(element);
    });
  }
  function diagnostic(report) {
    return { readOnly:true, inspectedAt:report.inspectedAt, stage:report.bootstrapStage,
      queueCount:report.queueCount, failedOperationCount:report.failedOperationCount,
      localBusinessRecordCount:report.localBusinessRecordCount, activationEligible:report.activationEligible,
      rows:(report.rows||[]).map(function (row) { return { operationId:row.operationId, createdAt:row.createdAt,
        type:row.type, source:row.source, classification:row.classification,
        candidateEquivalent:row.safeToDiscard===true, reason:row.reason,
        paths:(row.patches||[]).map(function (item) { return { action:item.patch&&item.patch.action||'',
          root:item.root||'', collection:item.collection||'', classification:item.classification||'', reason:item.reason||'' }; }) }; }) };
  }
  function inspect() {
    if (!eligible()) { refresh(); return null; }
    var box=document.getElementById(REPORT_ID);
    if (!box) return null;
    try {
      var report=diagnostic(managed().inspectBootstrapOutbox({display:false}));
      box.textContent=JSON.stringify(report,null,2);
      box.hidden=false;
      return report;
    } catch (error) {
      box.textContent='Read-only inspection unavailable: '+String(error&&error.message||error).slice(0,240);
      box.hidden=false;
      return null;
    }
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
      inspectButton.id=INSPECT_ID; inspectButton.type='button'; inspectButton.className='btn ghost';
      inspectButton.style.marginTop='8px'; inspectButton.style.width='100%';
      inspectButton.textContent='Inspect bootstrap outbox (read only)';
      inspectButton.addEventListener('click',inspect);
      status.parentNode.insertBefore(inspectButton,status.nextSibling);
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
  ZEZMS.preloginVerifiedActivation={refresh:refresh,inspect:inspect};
  window.addEventListener('zezms-cloud-ready',refresh);
  window.addEventListener('storage',refresh);
  window.addEventListener('zezms-shared-device-directory-updated',refresh);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(refresh,700);});
  else setTimeout(refresh,700);
}());

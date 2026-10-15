/* r70U: expose the existing verified Safe Bootstrap finish at the staff login gate. */
(function () {
  'use strict';
  var ID='r70uCompleteVerifiedActivation';
  var busy=false;
  function managed() { return window.ZEZMS && ZEZMS.managedDevices; }
  function loginVisible() {
    var screen=document.getElementById('loginScreen');
    return !!screen && screen.style.display !== 'none';
  }
  function remove() {
    var button=document.getElementById(ID);
    if (button && button.parentNode) button.parentNode.removeChild(button);
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
  ZEZMS.preloginVerifiedActivation={refresh:refresh};
  window.addEventListener('zezms-cloud-ready',refresh);
  window.addEventListener('storage',refresh);
  window.addEventListener('zezms-shared-device-directory-updated',refresh);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(refresh,700);});
  else setTimeout(refresh,700);
}());

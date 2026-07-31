/* ZEZMS v3.4.18 — stable frozen headers compatibility module */
(function () {
  'use strict';
  function cleanupLegacyState() {
    document.documentElement.classList.remove('zezms-kpi-portrait-freeze');
    document.documentElement.style.removeProperty('--zezms-topbar-height');
    document.documentElement.style.removeProperty('--zezms-kpi-pane-height');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupLegacyState, { once: true });
  } else {
    cleanupLegacyState();
  }
  window.ZEZMSKPIFreezePane = {
    refresh: cleanupLegacyState,
    updateOffset: cleanupLegacyState
  };
}());

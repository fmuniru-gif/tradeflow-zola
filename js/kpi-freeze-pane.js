/* ZEZMS v3.4.16 — reliable KPI freeze in portrait and landscape */
(function () {
  'use strict';

  let topbarObserver = null;

  function isPortraitPhone() {
    const root = document.documentElement;
    let portrait = false;
    try { portrait = window.matchMedia('(orientation: portrait)').matches; } catch (_) {}
    return root.classList.contains('zezms-phone-layout') && portrait;
  }

  function hasKPIFreezePane() {
    const pane = document.querySelector('.kpi-freeze-pane');
    return !!(pane && pane.offsetParent !== null);
  }

  function updateOffset() {
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const height = Math.max(1, Math.ceil(topbar.getBoundingClientRect().height));
      document.documentElement.style.setProperty('--zezms-topbar-height', height + 'px');
    }

    const active = hasKPIFreezePane();
    const portraitFreeze = active && isPortraitPhone();
    document.documentElement.classList.toggle('zezms-kpi-portrait-freeze', portraitFreeze);
  }

  function scheduleUpdate() {
    window.requestAnimationFrame(updateOffset);
  }

  function observeTopbar() {
    if (!window.ResizeObserver || topbarObserver) return;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    topbarObserver = new ResizeObserver(scheduleUpdate);
    topbarObserver.observe(topbar);
  }

  function begin() {
    scheduleUpdate();
    observeTopbar();

    const root = document.getElementById('viewRoot') || document.body;
    const observer = new MutationObserver(function () {
      scheduleUpdate();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', function () {
    setTimeout(scheduleUpdate, 120);
  }, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });

  window.ZEZMSKPIFreezePane = {
    updateOffset,
    refresh: scheduleUpdate
  };
}());

/* ZEZMS v3.4.15 — KPI freeze pane offset helper */
(function () {
  'use strict';

  function updateOffset() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const height = Math.max(1, Math.ceil(topbar.getBoundingClientRect().height));
    document.documentElement.style.setProperty('--zezms-topbar-height', height + 'px');
  }

  function scheduleUpdate() {
    window.requestAnimationFrame(updateOffset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleUpdate, { once: true });
  } else {
    scheduleUpdate();
  }

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', function () {
    setTimeout(scheduleUpdate, 100);
  }, { passive: true });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleUpdate);
    const begin = function () {
      const topbar = document.querySelector('.topbar');
      if (topbar) observer.observe(topbar);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', begin, { once: true });
    } else {
      begin();
    }
  }

  window.ZEZMSKPIFreezePane = { updateOffset };
}());

/* ZEZMS v3.4.17 — portrait KPI freeze without freezing the dashboard */
(function () {
  'use strict';

  let scheduled = false;
  let topbarObserver = null;
  let paneObserver = null;

  function isPortraitPhone() {
    let portrait = false;
    try { portrait = window.matchMedia('(orientation: portrait)').matches; } catch (_) {}
    return document.documentElement.classList.contains('zezms-phone-layout') && portrait;
  }

  function visiblePane() {
    const pane = document.querySelector('.kpi-freeze-pane');
    return pane && pane.offsetParent !== null ? pane : null;
  }

  function ensureSpacer(pane) {
    let spacer = pane.nextElementSibling;
    if (!spacer || !spacer.classList.contains('kpi-freeze-spacer')) {
      spacer = document.createElement('div');
      spacer.className = 'kpi-freeze-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      pane.insertAdjacentElement('afterend', spacer);
    }
    return spacer;
  }

  function removeSpacers() {
    document.querySelectorAll('.kpi-freeze-spacer').forEach(function (node) {
      node.remove();
    });
  }

  function observeElement(element, kind) {
    if (!window.ResizeObserver || !element) return;
    if (kind === 'topbar') {
      if (topbarObserver) topbarObserver.disconnect();
      topbarObserver = new ResizeObserver(scheduleUpdate);
      topbarObserver.observe(element);
    } else {
      if (paneObserver) paneObserver.disconnect();
      paneObserver = new ResizeObserver(scheduleUpdate);
      paneObserver.observe(element);
    }
  }

  function update() {
    scheduled = false;
    const root = document.documentElement;
    const pane = visiblePane();
    const active = !!pane && isPortraitPhone();

    root.classList.toggle('zezms-kpi-portrait-freeze', active);

    if (!active) {
      removeSpacers();
      if (paneObserver) paneObserver.disconnect();
      return;
    }

    const topbar = document.querySelector('.topbar');
    const topbarHeight = topbar ? Math.max(1, Math.ceil(topbar.getBoundingClientRect().height)) : 78;
    root.style.setProperty('--zezms-topbar-height', topbarHeight + 'px');

    const spacer = ensureSpacer(pane);
    // Measure after the fixed-layout class is active.
    const paneHeight = Math.max(1, Math.ceil(pane.getBoundingClientRect().height));
    root.style.setProperty('--zezms-kpi-pane-height', paneHeight + 'px');
    spacer.style.height = paneHeight + 'px';

    observeElement(topbar, 'topbar');
    observeElement(pane, 'pane');
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  function begin() {
    scheduleUpdate();
    const view = document.getElementById('viewRoot') || document.body;
    new MutationObserver(scheduleUpdate).observe(view, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(scheduleUpdate, 150); }, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });

  window.ZEZMSKPIFreezePane = { refresh: scheduleUpdate, updateOffset: scheduleUpdate };
}());

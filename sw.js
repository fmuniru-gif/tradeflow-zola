/* ZEZMS TradeFlow — Vertical-only phone layout; A5 receipts, Sales Records, VAT, Invoice, Waybill, Auto Month and Cloud Sync M4 retained */
const CACHE = 'zezms-rollover-sync-repair-20260802-r10';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js?v=20260802-rollover-sync-repair-r10',
  './js/backup-manager.js?v=20260802-rollover-sync-repair-r10',
  './js/cloud-sync.js?v=20260802-rollover-sync-repair-r10',
  './js/bootpatch.js?v=20260802-rollover-sync-repair-r10',
  './js/config.js?v=20260802-rollover-sync-repair-r10',
  './js/db-events.js?v=20260802-rollover-sync-repair-r10',
  './js/dbservice.js?v=20260802-rollover-sync-repair-r10',
  './js/diagnostics.js?v=20260802-rollover-sync-repair-r10',
  './js/events.js?v=20260802-rollover-sync-repair-r10',
  './js/health-module.js?v=20260802-rollover-sync-repair-r10',
  './js/lifecycle-module.js?v=20260802-rollover-sync-repair-r10',
  './js/logger.js?v=20260802-rollover-sync-repair-r10',
  './js/notifications-module.js?v=20260802-rollover-sync-repair-r10',
  './js/operations-update.js?v=20260802-rollover-sync-repair-r10',
  './js/auto-month-rollover.js?v=20260802-rollover-sync-repair-r10',
  './js/invoice-waybill.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-adapter.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-controller.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-events.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-facade.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-metrics.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-module.js?v=20260802-rollover-sync-repair-r10',
  './js/product-search-service.js?v=20260802-rollover-sync-repair-r10',
  './js/registry.js?v=20260802-rollover-sync-repair-r10',
  './js/storage.js?v=20260802-rollover-sync-repair-r10',
  './js/system-module.js?v=20260802-rollover-sync-repair-r10',
  './js/utils-module.js?v=20260802-rollover-sync-repair-r10',
  './js/mobile-vertical-layout.js?v=20260802-rollover-sync-repair-r10',
  './js/kpi-freeze-pane.js?v=20260802-rollover-sync-repair-r10'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isAppCode = isNavigation
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/manifest.json');

  if (isAppCode) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match(request, { ignoreSearch: true }) || caches.match('./index.html')
          )
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    }))
  );
});

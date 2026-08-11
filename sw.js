/* ZEZMS Owner Edition - read-only pricing intelligence, policy lab and new-product simulator */
const CACHE = 'zezms-new-product-pricing-20260811-r37';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js?v=20260811-new-product-pricing-r37',
  './js/backup-manager.js?v=20260811-new-product-pricing-r37',
  './js/cloud-sync.js?v=20260811-new-product-pricing-r37',
  './js/bootpatch.js?v=20260811-new-product-pricing-r37',
  './js/config.js?v=20260811-new-product-pricing-r37',
  './js/db-events.js?v=20260811-new-product-pricing-r37',
  './js/dbservice.js?v=20260811-new-product-pricing-r37',
  './js/diagnostics.js?v=20260811-new-product-pricing-r37',
  './js/events.js?v=20260811-new-product-pricing-r37',
  './js/health-module.js?v=20260811-new-product-pricing-r37',
  './js/lifecycle-module.js?v=20260811-new-product-pricing-r37',
  './js/logger.js?v=20260811-new-product-pricing-r37',
  './js/notifications-module.js?v=20260811-new-product-pricing-r37',
  './js/operations-update.js?v=20260811-new-product-pricing-r37',
  './js/auto-month-rollover.js?v=20260811-new-product-pricing-r37',
  './js/invoice-waybill.js?v=20260811-new-product-pricing-r37',
  './js/product-search-adapter.js?v=20260811-new-product-pricing-r37',
  './js/product-search-controller.js?v=20260811-new-product-pricing-r37',
  './js/product-search-events.js?v=20260811-new-product-pricing-r37',
  './js/product-search-facade.js?v=20260811-new-product-pricing-r37',
  './js/product-search-metrics.js?v=20260811-new-product-pricing-r37',
  './js/product-search-module.js?v=20260811-new-product-pricing-r37',
  './js/product-search-service.js?v=20260811-new-product-pricing-r37',
  './js/registry.js?v=20260811-new-product-pricing-r37',
  './js/storage.js?v=20260811-new-product-pricing-r37',
  './js/system-module.js?v=20260811-new-product-pricing-r37',
  './js/utils-module.js?v=20260811-new-product-pricing-r37',
  './js/mobile-vertical-layout.js?v=20260811-new-product-pricing-r37',
  './js/kpi-freeze-pane.js?v=20260811-new-product-pricing-r37',
  './js/confirmed-july-snapshot.js?v=20260811-new-product-pricing-r37',
  './js/commercial-foundation.js?v=20260811-new-product-pricing-r37',
  './js/owner-maintenance-v373.js?v=20260811-new-product-pricing-r37',
  './js/pdf-export.js?v=20260811-new-product-pricing-r37',
  './js/transaction-badge-v372.js?v=20260811-new-product-pricing-r37',
  './js/management-intelligence-v380.js?v=20260811-new-product-pricing-r37',
  './js/margin-intelligence-v381.js?v=20260811-new-product-pricing-r37',
  './js/pricing-guidance-v382.js?v=20260811-new-product-pricing-r37',
  './js/pricing-policy-lab-v383.js?v=20260811-new-product-pricing-r37',
  './js/new-product-pricing-v384.js?v=20260811-new-product-pricing-r37',
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
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE && !key.startsWith('zezms-commercial-pilot-'))
        .map((key) => caches.delete(key))))
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

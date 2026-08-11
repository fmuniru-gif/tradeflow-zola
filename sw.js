/* ZEZMS Owner Edition - read-only Management, Margin and Pricing Guidance */
const CACHE = 'zezms-pricing-guidance-20260811-r35';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js?v=20260811-pricing-guidance-r35',
  './js/backup-manager.js?v=20260811-pricing-guidance-r35',
  './js/cloud-sync.js?v=20260811-pricing-guidance-r35',
  './js/bootpatch.js?v=20260811-pricing-guidance-r35',
  './js/config.js?v=20260811-pricing-guidance-r35',
  './js/db-events.js?v=20260811-pricing-guidance-r35',
  './js/dbservice.js?v=20260811-pricing-guidance-r35',
  './js/diagnostics.js?v=20260811-pricing-guidance-r35',
  './js/events.js?v=20260811-pricing-guidance-r35',
  './js/health-module.js?v=20260811-pricing-guidance-r35',
  './js/lifecycle-module.js?v=20260811-pricing-guidance-r35',
  './js/logger.js?v=20260811-pricing-guidance-r35',
  './js/notifications-module.js?v=20260811-pricing-guidance-r35',
  './js/operations-update.js?v=20260811-pricing-guidance-r35',
  './js/auto-month-rollover.js?v=20260811-pricing-guidance-r35',
  './js/invoice-waybill.js?v=20260811-pricing-guidance-r35',
  './js/product-search-adapter.js?v=20260811-pricing-guidance-r35',
  './js/product-search-controller.js?v=20260811-pricing-guidance-r35',
  './js/product-search-events.js?v=20260811-pricing-guidance-r35',
  './js/product-search-facade.js?v=20260811-pricing-guidance-r35',
  './js/product-search-metrics.js?v=20260811-pricing-guidance-r35',
  './js/product-search-module.js?v=20260811-pricing-guidance-r35',
  './js/product-search-service.js?v=20260811-pricing-guidance-r35',
  './js/registry.js?v=20260811-pricing-guidance-r35',
  './js/storage.js?v=20260811-pricing-guidance-r35',
  './js/system-module.js?v=20260811-pricing-guidance-r35',
  './js/utils-module.js?v=20260811-pricing-guidance-r35',
  './js/mobile-vertical-layout.js?v=20260811-pricing-guidance-r35',
  './js/kpi-freeze-pane.js?v=20260811-pricing-guidance-r35',
  './js/confirmed-july-snapshot.js?v=20260811-pricing-guidance-r35',
  './js/commercial-foundation.js?v=20260811-pricing-guidance-r35',
  './js/owner-maintenance-v373.js?v=20260811-pricing-guidance-r35',
  './js/pdf-export.js?v=20260811-pricing-guidance-r35',
  './js/transaction-badge-v372.js?v=20260811-pricing-guidance-r35',
  './js/management-intelligence-v380.js?v=20260811-pricing-guidance-r35',
  './js/margin-intelligence-v381.js?v=20260811-pricing-guidance-r35',
  './js/pricing-guidance-v382.js?v=20260811-pricing-guidance-r35',
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

/* ZEZMS Owner Edition v3.16.0 - Supplier & Procurement Intelligence */
const CACHE = 'zezms-supplier-procurement-intelligence-20260822-r51';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/zez-document-watermark.jpg',
  './js/app.js?v=20260812-portfolio-signals-r39',
  './js/backup-manager.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/cloud-sync.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/input-defaults-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/bootpatch.js?v=20260812-portfolio-signals-r39',
  './js/config.js?v=20260812-portfolio-signals-r39',
  './js/db-events.js?v=20260812-portfolio-signals-r39',
  './js/dbservice.js?v=20260812-portfolio-signals-r39',
  './js/diagnostics.js?v=20260812-portfolio-signals-r39',
  './js/events.js?v=20260812-portfolio-signals-r39',
  './js/health-module.js?v=20260812-portfolio-signals-r39',
  './js/lifecycle-module.js?v=20260812-portfolio-signals-r39',
  './js/logger.js?v=20260812-portfolio-signals-r39',
  './js/notifications-module.js?v=20260812-portfolio-signals-r39',
  './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/auto-month-rollover.js?v=20260812-portfolio-signals-r39',
  './js/invoice-waybill.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/product-search-adapter.js?v=20260812-portfolio-signals-r39',
  './js/product-search-controller.js?v=20260812-portfolio-signals-r39',
  './js/product-search-events.js?v=20260812-portfolio-signals-r39',
  './js/product-search-facade.js?v=20260812-portfolio-signals-r39',
  './js/product-search-metrics.js?v=20260812-portfolio-signals-r39',
  './js/product-search-module.js?v=20260812-portfolio-signals-r39',
  './js/product-search-service.js?v=20260812-portfolio-signals-r39',
  './js/registry.js?v=20260812-portfolio-signals-r39',
  './js/storage.js?v=20260812-portfolio-signals-r39',
  './js/system-module.js?v=20260812-portfolio-signals-r39',
  './js/utils-module.js?v=20260812-portfolio-signals-r39',
  './js/mobile-vertical-layout.js?v=20260817-loopback-network-r47',
  './js/kpi-freeze-pane.js?v=20260812-portfolio-signals-r39',
  './js/confirmed-july-snapshot.js?v=20260812-portfolio-signals-r39',
  './js/commercial-foundation.js?v=20260812-portfolio-signals-r39',
  './js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/transaction-badge-v372.js?v=20260812-portfolio-signals-r39',
  './js/management-intelligence-v380.js?v=20260812-portfolio-signals-r39',
  './js/margin-intelligence-v381.js?v=20260812-portfolio-signals-r39',
  './js/pricing-guidance-v382.js?v=20260812-portfolio-signals-r39',
  './js/pricing-policy-lab-v383.js?v=20260820-customer-retention-r47',
  './js/new-product-pricing-v384.js?v=20260820-customer-retention-r47',
  './js/stock-velocity-v390.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/portfolio-signals-v391.js?v=20260812-portfolio-signals-r39',
  './js/customer-intelligence-v3100.js?v=20260814-sales-channel-capture-r43',
  './js/customer-master-v3120.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-outreach-v3140.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-followups-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/product-catalog-search-v3140.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/sales-pipeline-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/stock-corrections-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/warranty-management-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/supplier-procurement-v3160.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/print-readiness-v3120.js?v=20260817-loopback-network-r47',
  './js/direct-print-bridge-v3121.js?v=20260817-loopback-network-r47',
  './js/navigation-v3101.js?v=20260822-supplier-procurement-intelligence-r51',
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
        .catch(() => caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match(request, { ignoreSearch: true })
            .then((ignoredSearch) => ignoredSearch || caches.match('./index.html'));
        }))
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

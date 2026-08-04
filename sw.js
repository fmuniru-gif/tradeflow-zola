/* ZEZMS TradeFlow — Vertical-only phone layout; A5 receipts, Sales Records, VAT, Invoice, Waybill, Auto Month and Cloud Sync M4 retained */
const CACHE = 'zezms-m5a2-auth-staff-security-20260804-r18';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/backup-manager.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/cloud-sync.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/bootpatch.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/config.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/db-events.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/dbservice.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/diagnostics.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/events.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/health-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/lifecycle-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/logger.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/notifications-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/operations-update.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/auto-month-rollover.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/invoice-waybill.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-adapter.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-controller.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-events.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-facade.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-metrics.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/product-search-service.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/registry.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/storage.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/system-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/utils-module.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/mobile-vertical-layout.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/kpi-freeze-pane.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/confirmed-july-snapshot.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/commercial-foundation.js?v=20260804-m5a2-auth-staff-security-r18',
  './js/staff-auth.js?v=20260804-m5a2-auth-staff-security-r18'
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

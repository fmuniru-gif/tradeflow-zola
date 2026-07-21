/* TradeFlow PWA — Zola Electronics Zone (Tamale) — Service Worker v3.2.1 */
const CACHE = 'zezms-cloud-backup-m1-20260721';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js',
  './js/backup-manager.js',
  './js/bootpatch.js',
  './js/config.js',
  './js/db-events.js',
  './js/dbservice.js',
  './js/diagnostics.js',
  './js/events.js',
  './js/health-module.js',
  './js/lifecycle-module.js',
  './js/logger.js',
  './js/notifications-module.js',
  './js/product-search-adapter.js',
  './js/product-search-controller.js',
  './js/product-search-events.js',
  './js/product-search-facade.js',
  './js/product-search-metrics.js',
  './js/product-search-module.js',
  './js/product-search-service.js',
  './js/registry.js',
  './js/storage.js',
  './js/system-module.js',
  './js/utils-module.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Always ask GitHub Pages for the newest application page first. This avoids
  // retaining an older index.html after a deployment while preserving offline use.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

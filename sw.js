/* ZEZMS Owner Edition v3.28.11 - Internal Cash Wallet Transfer r67K */
const CACHE = 'zezms-r67k-wallet-transfer-20260912';
const PATCHED_INDEX_CACHE = 'zezms-r67k-wallet-transfer-cache-v1';
const ASSETS = [
  './','./index.html','./manifest.json','./assets/zez-document-watermark.jpg',
  './js/app.js?v=20260812-portfolio-signals-r39','./js/backup-manager.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/cloud-sync.js?v=20260823-sync-integrity-r52','./js/input-defaults-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/bootpatch.js?v=20260812-portfolio-signals-r39','./js/config.js?v=20260812-portfolio-signals-r39',
  './js/db-events.js?v=20260812-portfolio-signals-r39','./js/dbservice.js?v=20260812-portfolio-signals-r39',
  './js/diagnostics.js?v=20260812-portfolio-signals-r39','./js/events.js?v=20260812-portfolio-signals-r39',
  './js/health-module.js?v=20260812-portfolio-signals-r39','./js/lifecycle-module.js?v=20260812-portfolio-signals-r39',
  './js/logger.js?v=20260812-portfolio-signals-r39','./js/notifications-module.js?v=20260812-portfolio-signals-r39',
  './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51','./js/auto-month-rollover.js?v=20260812-portfolio-signals-r39',
  './js/invoice-waybill.js?v=20260822-supplier-procurement-intelligence-r51','./js/product-search-adapter.js?v=20260812-portfolio-signals-r39',
  './js/product-search-controller.js?v=20260812-portfolio-signals-r39','./js/product-search-events.js?v=20260812-portfolio-signals-r39',
  './js/product-search-facade.js?v=20260812-portfolio-signals-r39','./js/product-search-metrics.js?v=20260812-portfolio-signals-r39',
  './js/product-search-module.js?v=20260812-portfolio-signals-r39','./js/product-search-service.js?v=20260812-portfolio-signals-r39',
  './js/registry.js?v=20260812-portfolio-signals-r39','./js/storage.js?v=20260812-portfolio-signals-r39',
  './js/system-module.js?v=20260812-portfolio-signals-r39','./js/utils-module.js?v=20260812-portfolio-signals-r39',
  './js/mobile-vertical-layout.js?v=20260817-loopback-network-r47','./js/kpi-freeze-pane.js?v=20260812-portfolio-signals-r39',
  './js/confirmed-july-snapshot.js?v=20260812-portfolio-signals-r39','./js/commercial-foundation.js?v=20260812-portfolio-signals-r39',
  './js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51','./js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/transaction-badge-v372.js?v=20260812-portfolio-signals-r39','./js/management-intelligence-v380.js?v=20260812-portfolio-signals-r39',
  './js/margin-intelligence-v381.js?v=20260812-portfolio-signals-r39','./js/pricing-guidance-v382.js?v=20260812-portfolio-signals-r39',
  './js/pricing-policy-lab-v383.js?v=20260820-customer-retention-r47','./js/new-product-pricing-v384.js?v=20260820-customer-retention-r47',
  './js/stock-velocity-v390.js?v=20260822-supplier-procurement-intelligence-r51','./js/portfolio-signals-v391.js?v=20260812-portfolio-signals-r39',
  './js/customer-intelligence-v3100.js?v=20260814-sales-channel-capture-r43','./js/customer-master-v3120.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-outreach-v3140.js?v=20260822-supplier-procurement-intelligence-r51','./js/customer-followups-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/product-catalog-search-v3140.js?v=20260822-supplier-procurement-intelligence-r51','./js/sales-pipeline-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/stock-corrections-v3150.js?v=20260822-supplier-procurement-intelligence-r51','./js/warranty-management-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/supplier-procurement-v3160.js?v=20260822-supplier-procurement-intelligence-r51','./js/sync-integrity-v3161.js?v=20260823-sync-integrity-r52',
  './js/print-readiness-v3120.js?v=20260817-loopback-network-r47','./js/direct-print-bridge-v3121.js?v=20260817-loopback-network-r47',
  './js/navigation-v3101.js?v=20260822-supplier-procurement-intelligence-r51',
];
const CRITICAL_ASSETS = ['./', './index.html', './manifest.json', './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51'];
let postShellCachePromise = null;

async function cacheSuccessful(request, response) {
  if (!response || !response.ok) return response;
  const url = new URL(request.url || request, self.location.origin);
  if (url.origin !== self.location.origin) return response;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  return response;
}
function cacheStaticAssetsAfterShell() {
  if (postShellCachePromise) return postShellCachePromise;
  postShellCachePromise = (async () => {
    const cache = await caches.open(CACHE);
    for (const asset of ASSETS) {
      try {
        const request = new Request(new URL(asset, self.registration.scope).href, { cache: 'no-store' });
        if (await cache.match(request.url, { ignoreVary: true })) continue;
        await cacheSuccessful(request, await fetch(request));
      } catch (_) { /* This optional cache entry can be retried on a later version. */ }
    }
  })();
  return postShellCachePromise;
}
async function cached(request) {
  const cache = await caches.open(CACHE);
  const key = typeof request === 'string' ? request : request.url;
  return (await cache.match(key, { ignoreVary: true })) || cache.match(key, { ignoreSearch: true, ignoreVary: true });
}
async function revalidate(request) {
  const response = await fetch(request, { cache: 'no-store' });
  return cacheSuccessful(request, response);
}
function revalidateAfterStartup(request) {
  return new Promise((resolve) => setTimeout(resolve, 5000)).then(() => revalidate(request));
}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CRITICAL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== PATCHED_INDEX_CACHE && !key.startsWith('zezms-commercial-pilot-')).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'ZEZMS_R67K_SHELL_READY' && data.release === '20260912-r67k-wallet-transfer') {
    /* One sequential cache pass after the shell is usable; never a startup stampede. */
    event.waitUntil(cacheStaticAssetsAfterShell());
  }
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = request.mode === 'navigate';
  const isVersionedAsset = /\.(?:js|css|json)$/i.test(url.pathname) && !!url.search;
  if (isVersionedAsset) {
    event.respondWith(cached(request).then((hit) => hit || revalidate(request)));
    return;
  }
  if (!isNavigation) {
    event.respondWith(cached(request).then((hit) => hit || revalidate(request)));
    return;
  }
  event.respondWith((async () => {
    const hit = await cached(request);
    const refresh = revalidateAfterStartup(request).catch(() => null);
    if (hit) {
      event.waitUntil(refresh);
      return hit;
    }
    const network = await refresh;
    if (network) return network;
    if (isNavigation) return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  })());
});

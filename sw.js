/* ZEZMS Owner Edition v3.31.19 - Deterministic Device Control r70P.
   Cache rotation is deliberately limited to application-shell assets. */
const CACHE = 'zezms-ui-stock-review-20261024-v1';
const PATCHED_INDEX_CACHE = 'zezms-ui-stock-review-patched-v1';
const ASSETS = [
  './','./index.html','./manifest.json','./assets/zez-document-watermark.jpg',
  './js/app.js?v=20261008-r70q-phase-a-review','./js/backup-manager.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/cloud-sync.js?v=20260823-sync-integrity-r52','./js/input-defaults-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/bootpatch.js?v=20261008-r70q-phase-a-review','./js/config.js?v=20261008-r70q-phase-a-review',
  './js/db-events.js?v=20261008-r70q-phase-a-review','./js/dbservice.js?v=20261008-r70q-phase-a-review',
  './js/diagnostics.js?v=20261008-r70q-phase-a-review','./js/events.js?v=20261008-r70q-phase-a-review',
  './js/health-module.js?v=20261008-r70q-phase-a-review','./js/lifecycle-module.js?v=20261008-r70q-phase-a-review',
  './js/logger.js?v=20261008-r70q-phase-a-review','./js/notifications-module.js?v=20261008-r70q-phase-a-review',
  './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51','./js/bootstrap-startup-guard.js?v=20261024-ui-stock-review-r1',
  './js/auto-month-rollover-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/invoice-waybill.js?v=20260822-supplier-procurement-intelligence-r51','./js/product-search-adapter.js?v=20261008-r70q-phase-a-review',
  './js/product-search-controller.js?v=20261008-r70q-phase-a-review','./js/product-search-events.js?v=20261008-r70q-phase-a-review',
  './js/product-search-facade.js?v=20261008-r70q-phase-a-review','./js/product-search-metrics.js?v=20261008-r70q-phase-a-review',
  './js/product-search-module.js?v=20261008-r70q-phase-a-review','./js/product-search-service.js?v=20261008-r70q-phase-a-review',
  './js/registry.js?v=20261008-r70q-phase-a-review','./js/storage.js?v=20261008-r70q-phase-a-review',
  './js/system-module.js?v=20261008-r70q-phase-a-review','./js/utils-module.js?v=20261008-r70q-phase-a-review',
  './js/mobile-vertical-layout.js?v=20260817-loopback-network-r47','./js/kpi-freeze-pane.js?v=20261008-r70q-phase-a-review',
  './js/confirmed-july-snapshot-bootstrap-guard.js?v=20261024-ui-stock-review-r1','./js/shop-chrome-bootstrap-proof.js?v=20261024-ui-stock-review-r1',
  './js/commercial-foundation.js?v=20261008-r70q-phase-a-review',
  './js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51','./js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/transaction-badge-v372.js?v=20261008-r70q-phase-a-review','./js/management-intelligence-v380.js?v=20261004-r70f-recovery-stabilization',
  './js/margin-intelligence-v381.js?v=20261004-r70f-recovery-stabilization','./js/pricing-guidance-v382.js?v=20261004-r70f-recovery-stabilization',
  './js/pricing-policy-lab-v383.js?v=20261004-r70f-recovery-stabilization','./js/new-product-pricing-v384.js?v=20260820-customer-retention-r47',
  './js/stock-velocity-v390.js?v=20261004-r70f-recovery-stabilization','./js/portfolio-signals-v391.js?v=20261004-r70f-recovery-stabilization',
  './js/customer-intelligence-v3100.js?v=20261004-r70f-recovery-stabilization','./js/customer-master-v3120.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-outreach-v3140.js?v=20260822-supplier-procurement-intelligence-r51','./js/customer-followups-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/product-catalog-search-v3140.js?v=20260822-supplier-procurement-intelligence-r51','./js/sales-pipeline-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1','./js/warranty-management-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/supplier-procurement-v3160.js?v=20260822-supplier-procurement-intelligence-r51','./js/sync-integrity-v3161.js?v=20260823-sync-integrity-r52',
  './js/print-readiness-v3120.js?v=20260817-loopback-network-r47','./js/direct-print-bridge-v3121.js?v=20260817-loopback-network-r47',
  './js/navigation-v3101.js?v=20260822-supplier-procurement-intelligence-r51','./js/promotion-intelligence-r68.js?v=20261004-r70f-recovery-stabilization',
  './js/navigation-v3101-r68.js?v=20261004-r70f-recovery-stabilization','./js/route-title-ownership-r68.js?v=20261004-r70f-recovery-stabilization',
  './js/sales-pipeline-r67v.js?v=20260923-proforma-fleet-print-r67w','./js/proforma-invoice-r67w.js?v=20260923-proforma-fleet-print-r67w','./js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/account-cash-pdf-r68e.js?v=20261004-r70f-recovery-stabilization','./js/kpi-charts-compact-r68e.js?v=20261004-r70f-recovery-stabilization',
  './js/managed-device-lifecycle-r61.js?v=20261008-r70q-phase-a-review',
  './js/recovery-stabilization-r70g.js?v=20261008-r70q-phase-a-review','./js/identity-relink-r70h.js?v=20261008-r70q-phase-a-review',
];
const CRITICAL_ASSETS = ['./', './index.html', './manifest.json',
  './js/bootstrap-startup-guard.js?v=20261024-ui-stock-review-r1',
  './js/auto-month-rollover-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/confirmed-july-snapshot-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/shop-chrome-bootstrap-proof.js?v=20261024-ui-stock-review-r1',
  './js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1',
  './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51'];
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
  // A fresh shell cache is mandatory for this review candidate; never inherit the old r70Q index.
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    const requests = CRITICAL_ASSETS.map((asset) => new Request(new URL(asset, self.registration.scope).href,
      { cache:'reload' }));
    await cache.addAll(requests);
    // Fail closed on a mixed deployment: do not activate the new worker with an old shell.
    const expected = 'const RELEASE=\"20261024-ui-stock-review-r1\";';
    for (const entry of ['./', './index.html']) {
      const response = await cache.match(new URL(entry, self.registration.scope).href, {ignoreVary:true});
      const shellText = response && response.ok ? await response.text() : '';
      if (!shellText.includes(expected) || !shellText.includes('const SHOP_DIRECTORY_RECOVERY_BUILD="shop-storage-capacity-v1";') || shellText.includes('BRANCH_MANAGEMENT_R69_B64')) {
        throw new Error('ZEZMS_PRESERVATION_RELEASE_MISMATCH');
      }
    }
    const manifestResponse = await cache.match(new URL('./manifest.json', self.registration.scope).href, {ignoreVary:true});
    const manifestData = manifestResponse && manifestResponse.ok ? await manifestResponse.json() : null;
    if (!manifestData || manifestData.start_url !== './index.html?build=20261024-ui-stock-review-r1') throw new Error('ZEZMS_PRESERVATION_RELEASE_MISMATCH');
    for (const [index,asset] of CRITICAL_ASSETS.slice(3,8).entries()) {
      const response = await cache.match(new URL(asset, self.registration.scope).href, {ignoreVary:true});
      const marker = index === 3 ? 'shopChromeBootstrapProof' : index === 4 ? 'preparePhysicalCount' : 'bootstrapStartupGuard';
      if (!response || !response.ok || !(await response.text()).includes(marker)) throw new Error('ZEZMS_PRESERVATION_RELEASE_MISMATCH');
    }
  }));
});
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'ZEZMS_SHOP_RECOVERY_CLIENTS') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
      if (event.ports && event.ports[0]) event.ports[0].postMessage({
        guard:'shop-directory-v2',release:'shop-storage-capacity-v1',count:windows.length,
        onlyClientUrl:windows.length===1?windows[0].url:null
      });
    })());
    return;
  }
  if (data && data.type === 'ZEZMS_RUNTIME_INTEGRITY_PROBE') {
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type:'ZEZMS_RUNTIME_INTEGRITY_RESPONSE', release:'20261024-ui-stock-review-r1', cache:CACHE });
    }
    return;
  }
  if (data && ((data.type === 'ZEZMS_R70P_SHELL_READY' && (data.release === '20261024-ui-stock-review-r1' || data.release === '20261022-shop-chrome-directory-chain-r70w-v1' || data.release === '20261020-prebranch-functional-r1' || data.release === '20261015-r70u-prelogin-verified-activation' || data.release === '20261008-r70q-phase-a-review')) || (data.type === 'ZEZMS_R67I_SHELL_READY' && data.release === '20260910-r67i-fast-startup-and-offline-cache'))) {
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
    if (isNavigation) return (await cached(new URL('./index.html', self.registration.scope).href)) || Response.error();
    return Response.error();
  })());
});

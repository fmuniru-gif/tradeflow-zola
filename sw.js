/* ZEZMS Owner Edition v3.31.19 - Deterministic Device Control r70P.
   Cache rotation is deliberately limited to application-shell assets. */
const CACHE = 'zezms-pr11-delivery-20261026-313dcf89b9db40d3';
const PATCHED_INDEX_CACHE = 'zezms-pr11-patched-90a27f201266ea39';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/zez-document-watermark.jpg',
  './js/app.js?v=20260812-portfolio-signals-r39',
  './js/backup-manager.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/cloud-sync.js?v=20260823-sync-integrity-r52',
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
  './js/bootstrap-startup-guard.js?v=20261024-ui-stock-review-r1',
  './js/auto-month-rollover-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
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
  './js/confirmed-july-snapshot-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/shop-chrome-bootstrap-proof.js?v=20261024-ui-stock-review-r1',
  './js/commercial-foundation.js?v=20260812-portfolio-signals-r39',
  './js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/transaction-badge-v372.js?v=20260812-portfolio-signals-r39',
  './js/management-intelligence-v380.js?v=20261028-remaining-tabs-r1',
  './js/margin-intelligence-v381.js?v=20261008-r70q-phase-a-review',
  './js/pricing-guidance-v382.js?v=20261008-r70q-phase-a-review',
  './js/pricing-policy-lab-v383.js?v=20261008-r70q-phase-a-review',
  './js/new-product-pricing-v384.js?v=20260820-customer-retention-r47',
  './js/stock-velocity-v390.js?v=20261028-remaining-tabs-r1',
  './js/portfolio-signals-v391.js?v=20261008-r70q-phase-a-review',
  './js/customer-intelligence-v3100.js?v=20261008-r70q-phase-a-review',
  './js/customer-master-v3120.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-outreach-v3140.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/customer-followups-v3130.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/product-catalog-search-v3140.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/sales-pipeline-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1',
  './js/warranty-management-v3150.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/supplier-procurement-v3160.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/sync-integrity-v3161.js?v=20260823-sync-integrity-r52',
  './js/print-readiness-v3120.js?v=20260817-loopback-network-r47',
  './js/direct-print-bridge-v3121.js?v=20260817-loopback-network-r47',
  './js/navigation-v3101.js?v=20260822-supplier-procurement-intelligence-r51',
  './js/promotion-intelligence-r68.js?v=20261004-r70f-recovery-stabilization',
  './js/navigation-v3101-r68.js?v=20261004-r70f-recovery-stabilization',
  './js/route-title-ownership-r68.js?v=20261004-r70f-recovery-stabilization',
  './js/sales-pipeline-r67v.js?v=20260923-proforma-fleet-print-r67w',
  './js/proforma-invoice-r67w.js?v=20260923-proforma-fleet-print-r67w',
  './js/account-cash-pdf-r68e.js?v=20261004-r70f-recovery-stabilization',
  './js/kpi-charts-compact-r68e.js?v=20261004-r70f-recovery-stabilization',
  './js/managed-device-lifecycle-r61.js?v=20261008-r70q-phase-a-review',
  './js/recovery-stabilization-r70g.js?v=20261008-r70q-phase-a-review',
  './js/identity-relink-r70h.js?v=20261008-r70q-phase-a-review',
  './PR11_DELIVERY_UPDATE.html',
  './PR12_RAW_BYTE_UPDATE.html',
  './js/remaining-tabs-presentation.js?v=20261028-remaining-tabs-r1',
  './REMAINING_TABS_UPDATE.html',
];
const CRITICAL_ASSETS = ['./', './index.html', './manifest.json',
  './js/bootstrap-startup-guard.js?v=20261024-ui-stock-review-r1',
  './js/auto-month-rollover-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/confirmed-july-snapshot-bootstrap-guard.js?v=20261024-ui-stock-review-r1',
  './js/shop-chrome-bootstrap-proof.js?v=20261024-ui-stock-review-r1',
  './js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1',
  './js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51'];
const DELIVERY = '20261028-remaining-tabs-r1';
// PR11_VERIFIED_ASSETS_BEGIN
const VERIFIED_ASSETS = Object.freeze({
  "./": "aa741aa66cbb39c77c8025992de3c8c92d65bec1b3725279c35ab768a4396846",
  "./index.html": "aa741aa66cbb39c77c8025992de3c8c92d65bec1b3725279c35ab768a4396846",
  "./manifest.json": "65e7cbf3b2ecb6af102b97db4d778fa4f2cef9b82a612d6b64bcdb30e62e60be",
  "./assets/zez-document-watermark.jpg": "c477963932d6d765d0c2678b701d90aabfe9202ec486d68c2acb1f341b12c695",
  "./js/app.js?v=20260812-portfolio-signals-r39": "5c15ae89298b09c88b88672d2e1262572ea478f68c64b92d0643518b736c5162",
  "./js/backup-manager.js?v=20260822-supplier-procurement-intelligence-r51": "2d6ff4a8d117461aea3d37ad7759cce87479a923adc680cb7b63999dd9140b90",
  "./js/cloud-sync.js?v=20260823-sync-integrity-r52": "85dbcc87dea724f7f685204c7f2ca3d9bc49ed1d10c590dd37575a243d9f67ac",
  "./js/input-defaults-v3130.js?v=20260822-supplier-procurement-intelligence-r51": "a2aaeb779da58daec419874d2089c77c7424154c2dd0191c788a2aca757febbe",
  "./js/bootpatch.js?v=20260812-portfolio-signals-r39": "ac39d82df1af9f07ba52067c069a28b03554dcce6fe525eb4fa7fae1a0e00876",
  "./js/config.js?v=20260812-portfolio-signals-r39": "c29e728a7e4420b2611d98ed5b4d5f1f6b810a96351c86a51dbd69d3fddd77f0",
  "./js/db-events.js?v=20260812-portfolio-signals-r39": "00848c2558c02ce702b2e1982f73c1dcccb6795d43e1bc4e329dc00c14c3efd9",
  "./js/dbservice.js?v=20260812-portfolio-signals-r39": "49da996893caaa91b204f4b4c1e11bdaca235bb0fd736440b79b1499d8024aed",
  "./js/diagnostics.js?v=20260812-portfolio-signals-r39": "369bd6bce8243fcabf8ae48c03932e9e745d7d44460904a8c936b8a0e4cadb6e",
  "./js/events.js?v=20260812-portfolio-signals-r39": "c3115c223b7a4f07c8a5ca41749627578ce5596bfe6ac367f161e5ca3b41238c",
  "./js/health-module.js?v=20260812-portfolio-signals-r39": "632b4148f501c7b751109e1be39a1a3bd3bb52bcf8dc5d666db0bc3166bf58c8",
  "./js/lifecycle-module.js?v=20260812-portfolio-signals-r39": "da4b7ff3a0658bd971ceded2e99561ef7b9fc0fd6769f0c5a194e64942c71f87",
  "./js/logger.js?v=20260812-portfolio-signals-r39": "ba2a56b8d997083432dc3175c2de7349b8726e33379ad02f0106f43fb25484ce",
  "./js/notifications-module.js?v=20260812-portfolio-signals-r39": "29a4416ac009eff852008ace6a1f0e06b3b6ab61d16ab1ae10edf1832d94aed6",
  "./js/operations-update.js?v=20260822-supplier-procurement-intelligence-r51": "d225da7b26facc838ab3139e183fed33b6d94ff478053816e6e66b3e06aa0e1c",
  "./js/bootstrap-startup-guard.js?v=20261024-ui-stock-review-r1": "1cdda418025ff3197c8e5fa5a143744b7c67fc8351db23593d54a657e7d76e52",
  "./js/auto-month-rollover-bootstrap-guard.js?v=20261024-ui-stock-review-r1": "9b9cea13e303f1e9345ac9ab03c1ec10ec75b28bdf60675a56d38835ae1c35e3",
  "./js/invoice-waybill.js?v=20260822-supplier-procurement-intelligence-r51": "a1e32449485566f5dd83e76a49db1ae95faed8faeddbfa3073652f6a4144ae69",
  "./js/product-search-adapter.js?v=20260812-portfolio-signals-r39": "974462424d85c5897a0e84f5b4bcb29b10dbc782f807164d9c59b64e52e35159",
  "./js/product-search-controller.js?v=20260812-portfolio-signals-r39": "d72bf9f5ddae3638aee308c09b9cdce6178e0cc479db0dc02652021cf2b329f4",
  "./js/product-search-events.js?v=20260812-portfolio-signals-r39": "92852c255132bf3e2c3377de88177f1130c16f56d6cd04c989afc842b08c6b0f",
  "./js/product-search-facade.js?v=20260812-portfolio-signals-r39": "53d28d30d7626bb4dce1eddeb0c66a4f642b3b8efc37808c8104dae098b29fa6",
  "./js/product-search-metrics.js?v=20260812-portfolio-signals-r39": "7463a0ad8911a1c06b8987a96baba5033cf0737fac4838d8079b2bef847e7564",
  "./js/product-search-module.js?v=20260812-portfolio-signals-r39": "abb33f35bce7db44efa8d0d27839985d7ff2878af94375555c31c9ee7b044ca0",
  "./js/product-search-service.js?v=20260812-portfolio-signals-r39": "53f700d44c28fc635843115b1ebf356d253c749890db95f68169da316946fd78",
  "./js/registry.js?v=20260812-portfolio-signals-r39": "422274c6fed874e84521134860dd6e21fbf12f9d2be8410dae3c142075d2683e",
  "./js/storage.js?v=20260812-portfolio-signals-r39": "c67c325fce0d8ea652ba63ad40ef60c313d92e67be20e27749a70e9d7add7350",
  "./js/system-module.js?v=20260812-portfolio-signals-r39": "3b15295ac69d2ed69ed96f7ff6d93de3df2ba5ff269c48cbdc86e9f84c9553c5",
  "./js/utils-module.js?v=20260812-portfolio-signals-r39": "ebc628e52732d1fd72c4d2354891929cf372a0fab8ee82c11c25ac6050651abb",
  "./js/mobile-vertical-layout.js?v=20260817-loopback-network-r47": "bad0bacfb42decd3f9e693bfb10ee77326943a7fa990c309b622e4dab2770af7",
  "./js/kpi-freeze-pane.js?v=20260812-portfolio-signals-r39": "3f9754639bf1bda4e6145b84193f4f82a88338ce4a396490f85e1f8915b2c785",
  "./js/confirmed-july-snapshot-bootstrap-guard.js?v=20261024-ui-stock-review-r1": "ba500c7a41392008b7de08fcffa828f031395b8ee7ab9e08f07a8442d6bd2dea",
  "./js/shop-chrome-bootstrap-proof.js?v=20261024-ui-stock-review-r1": "4366166e966043c6a8cff8599b7e333ff43933ab0399d03993feab413a4391bb",
  "./js/commercial-foundation.js?v=20260812-portfolio-signals-r39": "bc9462b5f135d8d6557ea036b8196f23c3de20acd872587d484547d531a5e000",
  "./js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51": "55ab7f0e4db3e9d2e534876a35a382762878a6d1aef842902a7a550952c7ca34",
  "./js/pdf-export.js?v=20260822-supplier-procurement-intelligence-r51": "36175b30cf4fc11653b2f8a007fbbe3b709c9bace317ad375fb084d2c0c2b06a",
  "./js/transaction-badge-v372.js?v=20260812-portfolio-signals-r39": "e43c1047055032399c2e4da2485c4d29bf3f3f9bb1978c54272472df2ea15a35",
  "./js/management-intelligence-v380.js?v=20261028-remaining-tabs-r1": "0fcacfe9043823f1528e68c5179c59f18b2a14045b9bc8c7b6fd4c2434f228b8",
  "./js/margin-intelligence-v381.js?v=20261008-r70q-phase-a-review": "b14b35ef2f134317c89e4578b90f3cb8792001c1b3e2f3010d9cec00688232f1",
  "./js/pricing-guidance-v382.js?v=20261008-r70q-phase-a-review": "7e979ff42bbb8246da20b951d90e00ac17b562292819a5a747fb18348a19428a",
  "./js/pricing-policy-lab-v383.js?v=20261008-r70q-phase-a-review": "cce1d64b743eb4e2a185c0af9a8e582da247f3b5e80889d460a6313724b6a175",
  "./js/new-product-pricing-v384.js?v=20260820-customer-retention-r47": "e57bde41d4d32495e3bb343e7bae9849ccc7c3c18919177ddb64ffa1c0ffdf5c",
  "./js/stock-velocity-v390.js?v=20261028-remaining-tabs-r1": "edbbefb5c0d20731feb8e99c01ee536ece68b3cf01e56623068d493c320605d0",
  "./js/portfolio-signals-v391.js?v=20261008-r70q-phase-a-review": "a768b2539b195f2c8b73a9837f323e17412e2d42bb598d3fffadb3baea878d98",
  "./js/customer-intelligence-v3100.js?v=20261008-r70q-phase-a-review": "8064ba76409090fb0f2c54577c6734e9671abee44b4ab4c656f7622408609ccf",
  "./js/customer-master-v3120.js?v=20260822-supplier-procurement-intelligence-r51": "4abc35ac32dd14abfceb57a1c2df051e072f941d094158104d7d4dfed87185bb",
  "./js/customer-outreach-v3140.js?v=20260822-supplier-procurement-intelligence-r51": "4954fe725a549e2462703fc0cd64ef891b547a0982aed1bd078a7cc71c978a35",
  "./js/customer-followups-v3130.js?v=20260822-supplier-procurement-intelligence-r51": "c966cb9ff0483b6b8a160b268980b51c1d3a26f29fa2791f890a29a52243d994",
  "./js/product-catalog-search-v3140.js?v=20260822-supplier-procurement-intelligence-r51": "52eaf57d049f04d656192a04357c82725de6c70cb32272f5714d78c3adc209cb",
  "./js/sales-pipeline-v3150.js?v=20260822-supplier-procurement-intelligence-r51": "4058e0e8ec81a616201832f239aebcf385a3804de2e87c6212255b5f592ac84a",
  "./js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1": "59cc3c705bb10f3e704cf1414772edc1a66352fa21c0db9d584b6e768b2adf62",
  "./js/warranty-management-v3150.js?v=20260822-supplier-procurement-intelligence-r51": "a859832b8a021e5a82567c9c0407fdb3461eb79ff3153c47f36a558df73a4af8",
  "./js/supplier-procurement-v3160.js?v=20260822-supplier-procurement-intelligence-r51": "7daa9b58aeb0085e57afabff7a3ec53d8000a8680e5d15c0990c5f32c48c27eb",
  "./js/sync-integrity-v3161.js?v=20260823-sync-integrity-r52": "92f5fdf6285876f3b17f52862bd3406c0ca9ab29379782c342cd11f986b3e84d",
  "./js/print-readiness-v3120.js?v=20260817-loopback-network-r47": "78305c787bdfd0a6377ac7890e083bd4e60d452c0c27863aa39b91c8783168c9",
  "./js/direct-print-bridge-v3121.js?v=20260817-loopback-network-r47": "d03a5ccca7e1edd76bad309d9fc539648cdbcc25be2a6083662fcb79f09d50a9",
  "./js/navigation-v3101.js?v=20260822-supplier-procurement-intelligence-r51": "a2f74df744a98e5fdcc7b0aa28eb25f2b842f8a112a10b6979988a031f61d42d",
  "./js/promotion-intelligence-r68.js?v=20261004-r70f-recovery-stabilization": "7f3b8bdae49e2bd2dd0818e0581034ee571be953c1aeb6f288301d093ef8bac3",
  "./js/navigation-v3101-r68.js?v=20261004-r70f-recovery-stabilization": "104a8b1c9336f77660c9955ae337f41a47900d8305afb5ad3db014b72091729d",
  "./js/route-title-ownership-r68.js?v=20261004-r70f-recovery-stabilization": "a1428f0fc58f9a9635a6c0d16ca8fe19cf164743daf3fa70377a0c2f80f8aadc",
  "./js/sales-pipeline-r67v.js?v=20260923-proforma-fleet-print-r67w": "037cfa436e76c12713fe473ea2ff3a52332cf122db0c16de7726d1a1ad249595",
  "./js/proforma-invoice-r67w.js?v=20260923-proforma-fleet-print-r67w": "9cfbc461110d82b9cd243676efc018defee2c42afa51160511d5640f05178d75",
  "./js/account-cash-pdf-r68e.js?v=20261004-r70f-recovery-stabilization": "dda35e900f6a398db2fc513f67021ef2497147f1608a9bee4c895202d119b46d",
  "./js/kpi-charts-compact-r68e.js?v=20261004-r70f-recovery-stabilization": "dc83f9e80ca27c301df8cf8ecbe919bcd5c35a155cd07244414ff5ea6368a8eb",
  "./js/managed-device-lifecycle-r61.js?v=20261008-r70q-phase-a-review": "2c716db967aa030f3ae58b28b9f2b77a8306383ff76f02f30a2a17d68678cc18",
  "./js/recovery-stabilization-r70g.js?v=20261008-r70q-phase-a-review": "01b67327e7808449ae589eaafdf6ae40381b18b86a2a7af0bfba83e488288df9",
  "./js/identity-relink-r70h.js?v=20261008-r70q-phase-a-review": "384ec3b2ddf00d07eb06ca2b9a5e6b09aff44ddb34c9e92a02f7e7b0daf38c27",
  "./PR11_DELIVERY_UPDATE.html": "df7e64d954f16505226e2a99d3363e1d9688ad3a2832baf1e1f8b5eb6bfabbe5",
  "./PR12_RAW_BYTE_UPDATE.html": "95037b8f8ff3fc89a7a6ddcadad840f161e4601579920ae2d6982852226f2db9",
  "./js/remaining-tabs-presentation.js?v=20261028-remaining-tabs-r1": "854db5f0151eed5a7e81530770a8f722ef726856ea83c2d1f3bde6c2e9f84050",
  "./REMAINING_TABS_UPDATE.html": "dff0ed75ead0927363b5055cbe89eaff71850ccc9297f307bbbda17168239cf5"
});
// PR11_VERIFIED_ASSETS_END
let postShellCachePromise = null;

function verifiedKey(request) {
  const url=new URL(request.url || request,self.location.origin);
  const scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin)return null;
  if(!url.pathname.startsWith(scope.pathname))return null;
  const relative='./'+url.pathname.slice(scope.pathname.length)+url.search;
  if(Object.prototype.hasOwnProperty.call(VERIFIED_ASSETS,relative))return relative;
  if(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html')return './index.html';
  return null;
}
async function verifyDelivery(key,response) {
  if(!response || !response.ok)throw new Error('ZEZMS_DELIVERY_HTTP_FAILURE: '+key);
  const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
  const actual=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==VERIFIED_ASSETS[key])throw new Error('ZEZMS_DELIVERY_HASH_MISMATCH: '+key);
  return response;
}

async function cacheSuccessful(request, response) {
  if (!response || !response.ok) return response;
  const url = new URL(request.url || request, self.location.origin);
  if (url.origin !== self.location.origin) return response;
  const key=verifiedKey(request);
  if(key)await verifyDelivery(key,response);
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
  const key=verifiedKey(request);
  if(key)return cache.match(new URL(key,self.registration.scope).href,{ignoreVary:true});
  const url=typeof request==='string'?request:request.url;
  return cache.match(url,{ignoreVary:true});
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
    // The cache namespace is derived from every expected byte digest. Failed or
    // interrupted installs cannot overwrite the active generation's app cache.
    // Fetch sequentially while old clients continue using their existing worker.
    const verified=[];
    for(const asset of Object.keys(VERIFIED_ASSETS)){
      const request=new Request(new URL(asset,self.registration.scope).href,{cache:'reload'});
      const response=await fetch(request);
      await verifyDelivery(asset,response);
      verified.push([request,response]);
    }
    for(const [request,response] of verified)await cache.put(request,response);
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
      event.source.postMessage({ type:'ZEZMS_RUNTIME_INTEGRITY_RESPONSE', release:'20261024-ui-stock-review-r1', cache:CACHE, delivery:DELIVERY, verified:true, nonce:data.nonce });
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
  const key=verifiedKey(request);
  if(key){
    event.respondWith(cached(request).then(async hit=>{
      if(hit)return hit;
      const response=await fetch(new Request(new URL(key,self.registration.scope).href,{cache:'no-store'}));
      await verifyDelivery(key,response);
      const cache=await caches.open(CACHE);await cache.put(new URL(key,self.registration.scope).href,response.clone());
      return response;
    }));
    return;
  }
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

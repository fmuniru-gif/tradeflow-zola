/* ZEZMS TradeFlow Owner Edition v3.14.0
   Runtime-only Product Catalog Name/ID filtering. */
(function () {
  'use strict';

  var VERSION = '3.14.0';
  var BUILD = '20260820-customer-outreach-r48';
  var runtime = { name:'', productId:'', timer:null, filterRuns:0 };

  function clean(value) { return value == null ? '' : String(value).trim(); }
  function canonical(value) { return clean(value).toLocaleLowerCase(); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ' '); }
  function filterEntries(products, nameValue, idValue) {
    var nameTerm = canonical(nameValue), idTerm = canonical(idValue);
    return (Array.isArray(products) ? products : []).map(function (product, index) {
      return { product:product, index:index };
    }).filter(function (entry) {
      var product = entry.product || {};
      return (!nameTerm || canonical(product.name).indexOf(nameTerm) >= 0)
        && (!idTerm || canonical(product.id).indexOf(idTerm) >= 0);
    });
  }
  function model(products) {
    runtime.filterRuns += 1;
    var entries = filterEntries(products, runtime.name, runtime.productId);
    return { entries:entries, total:Array.isArray(products) ? products.length : 0, active:!!(clean(runtime.name) || clean(runtime.productId)), name:runtime.name, productId:runtime.productId };
  }
  function refreshNow() {
    if (runtime.timer != null) { clearTimeout(runtime.timer); runtime.timer = null; }
    if (typeof window.renderProductCatalogRows === 'function') window.renderProductCatalogRows();
  }
  function scheduleRefresh() {
    if (runtime.timer != null) clearTimeout(runtime.timer);
    runtime.timer = setTimeout(function () { runtime.timer = null; refreshNow(); }, 120);
  }
  function updateName(value) { runtime.name = clean(value); scheduleRefresh(); }
  function updateId(value) { runtime.productId = clean(value); scheduleRefresh(); }
  function clear() {
    runtime.name = ''; runtime.productId = '';
    var name = document.getElementById('catalogSearchName'), productId = document.getElementById('catalogSearchId');
    if (name) name.value = ''; if (productId) productId.value = '';
    refreshNow();
  }
  function controlsHTML() {
    return '<div class="product-catalog-search-grid" data-catalog-search-version="' + VERSION + '">'
      + '<div class="field"><label>Search Product Name</label><input id="catalogSearchName" type="search" autocomplete="off" value="' + attr(runtime.name) + '" placeholder="e.g. Television" oninput="ZEZMS.productCatalogSearch.updateName(this.value)"></div>'
      + '<div class="field"><label>Search Product ID</label><input id="catalogSearchId" type="search" autocomplete="off" value="' + attr(runtime.productId) + '" placeholder="e.g. PRD-001" oninput="ZEZMS.productCatalogSearch.updateId(this.value)"></div>'
      + '<button class="btn ghost" type="button" onclick="ZEZMS.productCatalogSearch.clear()">Clear Search</button></div>';
  }
  function injectStyles() {
    if (document.getElementById('productCatalogSearchV3140Styles')) return;
    var style = document.createElement('style');
    style.id = 'productCatalogSearchV3140Styles';
    style.textContent = '.product-catalog-search-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:end;margin:8px 0 12px}.product-catalog-search-grid>*{min-width:0}.product-catalog-search-grid input{color:var(--text,#f1f5f9);background:#0b1220;border-color:var(--line,#475569)}.product-catalog-search-grid input::placeholder{color:#94a3b8;opacity:1}.product-catalog-search-grid input:focus{border-color:var(--teal2,#14b8a6);outline:2px solid var(--teal2,#14b8a6);outline-offset:1px}@media(max-width:600px){.product-catalog-search-grid{grid-template-columns:minmax(0,1fr)}.product-catalog-search-grid .btn{width:100%}}';
    document.head.appendChild(style);
  }

  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.productCatalogSearch = Object.freeze({
    version:VERSION, build:BUILD, controlsHTML:controlsHTML, model:model,
    updateName:updateName, updateId:updateId, clear:clear, refreshNow:refreshNow,
    getState:function () { return {name:runtime.name,productId:runtime.productId,filterRuns:runtime.filterRuns,persisted:false}; },
    _test:Object.freeze({ clean:clean, canonical:canonical, filterEntries:filterEntries })
  });
  injectStyles();
}());

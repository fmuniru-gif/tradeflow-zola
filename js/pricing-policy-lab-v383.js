/* ZEZMS TradeFlow Owner Edition v3.8.3 - Pricing Policy Lab */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  if (ZEZMS.pricingPolicyLab && ZEZMS.pricingPolicyLab.installed
      && window.viewDashboard && window.viewDashboard.__zezmsPricingPolicyLabV383) return;

  const VERSION = '3.8.3';
  const BUILD = '20260820-customer-retention-r47';
  const CURRENCY_TOLERANCE = 0.01;
  let currentProducts = Object.freeze([]);

  function text(value) { return String(value == null ? '' : value).trim(); }
  function finite(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function number(value) { const parsed = finite(value); return parsed == null ? 0 : parsed; }
  function escapeHTML(value) {
    if (typeof esc === 'function') return esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }
  function currency(value) {
    if (typeof fmt === 'function') return fmt(number(value));
    return 'GH\u20b5 ' + number(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function quantity(value) {
    if (typeof fmtN === 'function') return fmtN(number(value));
    return number(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function percent(value) {
    const safe = finite(value);
    return (safe == null ? 0 : safe).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '%';
  }
  function setText(id, value) { const node=document.getElementById(id); if (node) node.textContent=value; }
  function setDisplay(id, value) { const node=document.getElementById(id); if (node) node.style.display=value; }

  function stageThreeProducts() {
    const api = ZEZMS.pricingGuidance;
    if (!api || typeof api.getCurrentStockAggregate !== 'function') return Object.freeze([]);
    const products = api.getCurrentStockAggregate();
    return Array.isArray(products) ? products : Object.freeze([]);
  }

  function selectedProduct() {
    const select=document.getElementById('policyLabProduct');
    if (!select || select.value==='') return null;
    const index=Number(select.value);
    return Number.isInteger(index) && currentProducts[index] ? currentProducts[index] : null;
  }

  function inputValue(id) {
    const node=document.getElementById(id);
    return node ? text(node.value) : '';
  }

  function scenario() {
    const marginRaw=inputValue('policyLabMargin');
    const additionalRaw=inputValue('policyLabAdditionalCost');
    const contemplatedRaw=inputValue('policyLabContemplatedPrice');
    if (!marginRaw) return Object.freeze({ state:'blank', message:'Enter a Target Gross Margin % to begin the temporary scenario.' });
    const margin=finite(marginRaw);
    const additional=additionalRaw==='' ? 0 : finite(additionalRaw);
    const contemplated=contemplatedRaw==='' ? null : finite(contemplatedRaw);
    if (margin == null || margin < 0 || margin >= 100 || margin > 99.99) {
      return Object.freeze({ state:'invalid', message:'Target Gross Margin must be between 0.00% and 99.99%.' });
    }
    if (additional == null || additional < 0) {
      return Object.freeze({ state:'invalid', message:'Additional Business Cost/Unit must be zero or greater.' });
    }
    if (contemplatedRaw!=='' && (contemplated == null || contemplated < 0)) {
      return Object.freeze({ state:'invalid', message:'Contemplated Selling Price must be zero or greater.' });
    }
    return Object.freeze({ state:'valid', margin:margin, additional:additional, contemplated:contemplated, message:'' });
  }

  function comparePrice(price, advisory, longLabel) {
    if (price == null || advisory == null) return longLabel ? 'Current Price Unavailable' : 'Price Unavailable';
    const difference=price-advisory;
    if (Math.abs(difference) <= CURRENCY_TOLERANCE) return longLabel ? 'At Temporary Policy Price' : 'At Temporary Policy';
    if (difference > 0) return longLabel ? 'Above Temporary Policy Price' : 'Above Temporary Policy';
    return longLabel ? 'Below Temporary Policy Price' : 'Below Temporary Policy';
  }

  function productScenario(product, policy) {
    const weighted=finite(product && product.weightedCostPerUnit);
    const adjusted=weighted == null ? null : weighted + policy.additional;
    const denominator=1-(policy.margin/100);
    const advisory=adjusted == null || denominator <= 0 ? null : adjusted/denominator;
    const listedReliable=product && product.listedPriceState==='reliable' && finite(product.listedPrice) != null && product.listedPrice > 0;
    const listed=listedReliable ? Number(product.listedPrice) : null;
    const currentGap=listed != null && advisory != null ? listed-advisory : null;
    const currentGapPercent=currentGap != null && advisory > 0 ? (currentGap/advisory)*100 : null;
    const currentGrossProfit=listed != null && adjusted != null ? listed-adjusted : null;
    const currentMargin=currentGrossProfit != null && listed > 0 ? (currentGrossProfit/listed)*100 : null;
    const contemplated=policy.contemplated;
    const contemplatedGrossProfit=contemplated != null && adjusted != null ? contemplated-adjusted : null;
    const contemplatedMargin=contemplatedGrossProfit != null && contemplated > 0 ? (contemplatedGrossProfit/contemplated)*100 : null;
    const contemplatedPolicyDifference=contemplated != null && advisory != null ? contemplated-advisory : null;
    const contemplatedCurrentDifference=contemplated != null && listed != null ? contemplated-listed : null;
    return Object.freeze({
      product:product, weighted:weighted, adjusted:adjusted, advisory:advisory, listed:listed,
      currentGap:currentGap, currentGapPercent:currentGapPercent,
      currentGrossProfit:currentGrossProfit, currentMargin:currentMargin,
      status:advisory == null ? '\u2014' : comparePrice(listed, advisory, true),
      previewStatus:advisory == null ? 'Price Unavailable' : comparePrice(listed, advisory, false),
      contemplated:contemplated, contemplatedGrossProfit:contemplatedGrossProfit,
      contemplatedMargin:contemplatedMargin,
      contemplatedPolicyDifference:contemplatedPolicyDifference,
      contemplatedCurrentDifference:contemplatedCurrentDifference,
      contemplatedStatus:contemplated == null || advisory == null ? '\u2014' : comparePrice(contemplated, advisory, true)
    });
  }

  function listedPriceText(product) {
    if (!product) return '\u2014';
    if (product.listedPriceState==='multiple') return 'Multiple';
    return product.listedPriceState==='reliable' ? currency(product.listedPrice) : '\u2014';
  }

  function displaySelectedProduct(product) {
    setText('policyLabProductName', product ? product.productName : '\u2014');
    setText('policyLabProductId', product ? (product.productId || '\u2014') : '\u2014');
    setText('policyLabCategory', product ? (product.category || '\u2014') : '\u2014');
    setText('policyLabRemainingQty', product ? quantity(product.remainingQty) : '\u2014');
    setText('policyLabRemainingCost', product && product.totalRemainingCost != null ? currency(product.totalRemainingCost) : '\u2014');
    setText('policyLabWeightedCost', product && product.weightedCostPerUnit != null ? currency(product.weightedCostPerUnit) : '\u2014');
    setText('policyLabListedPrice', listedPriceText(product));
  }

  function clearResultValues() {
    ['policyLabResultWeighted','policyLabResultAdditional','policyLabAdjustedCost','policyLabResultMargin','policyLabAdvisoryPrice','policyLabResultListed','policyLabCurrentGap','policyLabCurrentGP','policyLabCurrentMargin','policyLabResultContemplated','policyLabContemplatedGP','policyLabContemplatedMargin','policyLabContemplatedPolicyGap','policyLabContemplatedCurrentGap','policyLabStatus'].forEach(function (id) { setText(id, '\u2014'); });
  }

  function resultValues(model, policy) {
    setText('policyLabResultWeighted', model.weighted == null ? '\u2014' : currency(model.weighted));
    setText('policyLabResultAdditional', currency(policy.additional));
    setText('policyLabAdjustedCost', model.adjusted == null ? '\u2014' : currency(model.adjusted));
    setText('policyLabResultMargin', percent(policy.margin));
    setText('policyLabAdvisoryPrice', model.advisory == null ? '\u2014' : currency(model.advisory));
    setText('policyLabResultListed', listedPriceText(model.product));
    setText('policyLabCurrentGap', model.currentGap == null ? '\u2014' : currency(model.currentGap) + (model.currentGapPercent == null ? '' : ' (' + percent(model.currentGapPercent) + ')'));
    setText('policyLabCurrentGP', model.currentGrossProfit == null ? '\u2014' : currency(model.currentGrossProfit));
    setText('policyLabCurrentMargin', model.currentMargin == null ? '\u2014' : percent(model.currentMargin));
    setText('policyLabResultContemplated', model.contemplated == null ? '\u2014' : currency(model.contemplated));
    setText('policyLabContemplatedGP', model.contemplatedGrossProfit == null ? '\u2014' : currency(model.contemplatedGrossProfit));
    setText('policyLabContemplatedMargin', model.contemplatedMargin == null ? '\u2014' : percent(model.contemplatedMargin));
    setText('policyLabContemplatedPolicyGap', model.contemplatedPolicyDifference == null ? '\u2014' : currency(model.contemplatedPolicyDifference));
    setText('policyLabContemplatedCurrentGap', model.contemplatedCurrentDifference == null ? '\u2014' : currency(model.contemplatedCurrentDifference));
    setText('policyLabStatus', model.contemplated == null ? model.status : model.contemplatedStatus);
  }

  function previewBadge(status) {
    const badge=status==='Below Temporary Policy' ? 'bad' : status==='Above Temporary Policy' ? 'ok' : 'warn';
    return '<span class="badge ' + badge + '">' + escapeHTML(status) + '</span>';
  }

  function renderPortfolio(policy) {
    const models=currentProducts.map(function (product) { return productScenario(product, policy); });
    const sorted=models.slice().sort(function (left, right) {
      const belowLeft=left.previewStatus==='Below Temporary Policy' ? 0 : 1;
      const belowRight=right.previewStatus==='Below Temporary Policy' ? 0 : 1;
      const gapLeft=left.currentGap == null ? Infinity : left.currentGap;
      const gapRight=right.currentGap == null ? Infinity : right.currentGap;
      const costLeft=finite(left.product.totalRemainingCost);
      const costRight=finite(right.product.totalRemainingCost);
      return belowLeft-belowRight || gapLeft-gapRight
        || (costRight == null ? -Infinity : costRight)-(costLeft == null ? -Infinity : costLeft)
        || left.product.productName.localeCompare(right.product.productName);
    });
    const body=document.getElementById('policyLabPreviewBody');
    if (body) {
      body.innerHTML=sorted.length ? sorted.map(function (model) {
        const product=model.product;
        return '<tr data-policy-product-id="' + escapeHTML(product.productId) + '" data-policy-status="' + escapeHTML(model.previewStatus) + '" data-policy-price="' + (model.advisory == null ? '' : model.advisory) + '" data-price-gap="' + (model.currentGap == null ? '' : model.currentGap) + '">'
          + '<td>' + escapeHTML(product.productName) + '</td><td>' + escapeHTML(product.category || '\u2014') + '</td>'
          + '<td class="right mono">' + quantity(product.remainingQty) + '</td>'
          + '<td class="right mono">' + (model.weighted == null ? '\u2014' : currency(model.weighted)) + '</td>'
          + '<td class="right mono">' + (model.adjusted == null ? '\u2014' : currency(model.adjusted)) + '</td>'
          + '<td class="right mono">' + listedPriceText(product) + '</td>'
          + '<td class="right mono">' + (model.advisory == null ? '\u2014' : currency(model.advisory)) + '</td>'
          + '<td class="right mono">' + (model.currentGap == null ? '\u2014' : currency(model.currentGap)) + '</td>'
          + '<td class="right mono">' + (model.currentMargin == null ? '\u2014' : percent(model.currentMargin)) + '</td>'
          + '<td>' + previewBadge(model.previewStatus) + '</td></tr>';
      }).join('') : '<tr><td colspan="10" class="empty">No current stocked product is available for this temporary scenario.</td></tr>';
    }
    const below=models.filter(function (model) { return model.previewStatus==='Below Temporary Policy'; });
    const above=models.filter(function (model) { return model.previewStatus==='Above Temporary Policy' || model.previewStatus==='At Temporary Policy'; });
    const unresolved=models.filter(function (model) { return model.product.listedPriceState!=='reliable'; });
    const capital=below.reduce(function (sum, model) { return sum+number(model.product.totalRemainingCost); }, 0);
    setText('policyLabBelowCount', String(below.length));
    setText('policyLabBelowCapital', currency(capital));
    setText('policyLabAboveCount', String(above.length));
    setText('policyLabUnresolvedCount', String(unresolved.length));
    ['policyLabBelowCount','policyLabBelowCapital','policyLabAboveCount','policyLabUnresolvedCount'].forEach(function (id) {
      const node=document.getElementById(id); if (node) node.dataset.value=id==='policyLabBelowCapital' ? String(capital) : node.textContent;
    });
  }

  function recalculate() {
    const product=selectedProduct();
    displaySelectedProduct(product);
    const policy=scenario();
    const message=document.getElementById('policyLabValidation');
    if (message) {
      message.textContent=policy.message || '';
      message.className=policy.state==='invalid' ? 'empty' : 'muted';
    }
    if (policy.state!=='valid') {
      clearResultValues();
      setDisplay('policyLabKpis','none');
      setDisplay('policyLabPreview','none');
      return;
    }
    if (product) resultValues(productScenario(product, policy), policy);
    else clearResultValues();
    renderPortfolio(policy);
    setDisplay('policyLabKpis','');
    setDisplay('policyLabPreview','');
  }

  function reset() {
    const select=document.getElementById('policyLabProduct');
    const margin=document.getElementById('policyLabMargin');
    const additional=document.getElementById('policyLabAdditionalCost');
    const contemplated=document.getElementById('policyLabContemplatedPrice');
    if (select) select.value='';
    if (margin) margin.value='';
    if (additional) additional.value='';
    if (contemplated) contemplated.value='';
    displaySelectedProduct(null);
    clearResultValues();
    const validation=document.getElementById('policyLabValidation');
    if (validation) { validation.textContent='Enter a Target Gross Margin % to begin the temporary scenario.'; validation.className='muted'; }
    const previewBody=document.getElementById('policyLabPreviewBody');
    if (previewBody) previewBody.innerHTML='';
    setText('policyLabBelowCount','0');
    setText('policyLabBelowCapital',currency(0));
    setText('policyLabAboveCount','0');
    setText('policyLabUnresolvedCount','0');
    setDisplay('policyLabKpis','none');
    setDisplay('policyLabPreview','none');
  }

  function policyLabHTML() {
    currentProducts=stageThreeProducts();
    const options=currentProducts.map(function (product, index) {
      return '<option value="' + index + '">' + escapeHTML(product.productId || 'No ID') + ' \u2014 ' + escapeHTML(product.productName) + '</option>';
    }).join('');
    return '<div id="pricingPolicyLab" data-build="' + BUILD + '" style="margin-top:18px">'
      + '<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Pricing Policy Lab</h2><span class="badge warn">Runtime only</span></div>'
      + '<p class="muted" style="margin:8px 0 0">Temporary pricing-policy simulation. Nothing entered or calculated here is saved or applied to Sale Out.</p></div>'
      + '<div class="card" style="margin-bottom:12px"><div class="grid g2">'
      + '<div class="field"><label>Product</label><select id="policyLabProduct" onchange="ZEZMS.pricingPolicyLab.recalculate()"><option value="">\u2014 select current stocked product \u2014</option>' + options + '</select></div>'
      + '<div class="field"><label>Target Gross Margin %</label><input id="policyLabMargin" type="number" min="0" max="99.99" step="0.01" placeholder="0.00 to 99.99" oninput="ZEZMS.pricingPolicyLab.recalculate()" /></div>'
      + '<div class="field"><label>Additional Business Cost/Unit</label><input id="policyLabAdditionalCost" type="number" min="0" step="0.01" value="" placeholder="0" data-semantic-default="0" oninput="ZEZMS.pricingPolicyLab.recalculate()" /></div>'
      + '<div class="field"><label>Contemplated Selling Price</label><input id="policyLabContemplatedPrice" type="number" min="0" step="0.01" placeholder="Optional" oninput="ZEZMS.pricingPolicyLab.recalculate()" /></div></div>'
      + '<div id="policyLabValidation" class="muted">Enter a Target Gross Margin % to begin the temporary scenario.</div>'
      + '<div class="grid g2" style="margin-top:12px"><div><h3>Selected Current-Stock Reference</h3>'
      + '<div class="statline"><span>Product</span><b id="policyLabProductName">\u2014</b></div><div class="statline"><span>Product ID</span><b id="policyLabProductId" class="mono">\u2014</b></div><div class="statline"><span>Category</span><b id="policyLabCategory">\u2014</b></div><div class="statline"><span>Remaining Qty</span><b id="policyLabRemainingQty" class="mono">\u2014</b></div><div class="statline"><span>Remaining Stock Cost</span><b id="policyLabRemainingCost" class="mono">\u2014</b></div><div class="statline"><span>Weighted Remaining Cost/Unit</span><b id="policyLabWeightedCost" class="mono">\u2014</b></div><div class="statline"><span>Current Listed Price</span><b id="policyLabListedPrice" class="mono">\u2014</b></div></div>'
      + '<div><h3>Policy Lab Result</h3><div class="statline"><span>Weighted Remaining Cost/Unit</span><b id="policyLabResultWeighted" class="mono">\u2014</b></div><div class="statline"><span>Additional Business Cost/Unit</span><b id="policyLabResultAdditional" class="mono">\u2014</b></div><div class="statline"><span>Adjusted Reference Cost/Unit</span><b id="policyLabAdjustedCost" class="mono">\u2014</b></div><div class="statline"><span>Target Gross Margin %</span><b id="policyLabResultMargin" class="mono">\u2014</b></div><div class="statline"><span>Advisory Policy Price</span><b id="policyLabAdvisoryPrice" class="mono">\u2014</b></div><div class="statline"><span>Current Listed Price</span><b id="policyLabResultListed" class="mono">\u2014</b></div><div class="statline"><span>Current Price Gap</span><b id="policyLabCurrentGap" class="mono">\u2014</b></div><div class="statline"><span>Scenario GP/Unit at Current Price</span><b id="policyLabCurrentGP" class="mono">\u2014</b></div><div class="statline"><span>Scenario Margin at Current Price</span><b id="policyLabCurrentMargin" class="mono">\u2014</b></div><div class="statline"><span>Contemplated Price</span><b id="policyLabResultContemplated" class="mono">\u2014</b></div><div class="statline"><span>Contemplated GP/Unit</span><b id="policyLabContemplatedGP" class="mono">\u2014</b></div><div class="statline"><span>Contemplated Margin %</span><b id="policyLabContemplatedMargin" class="mono">\u2014</b></div><div class="statline"><span>Contemplated vs Policy Price</span><b id="policyLabContemplatedPolicyGap" class="mono">\u2014</b></div><div class="statline"><span>Contemplated vs Current Price</span><b id="policyLabContemplatedCurrentGap" class="mono">\u2014</b></div><div class="statline"><span>Temporary Policy Status</span><b id="policyLabStatus">\u2014</b></div></div></div>'
      + '<p class="muted" style="font-size:12px">Weighted remaining stock cost plus the temporary additional business-cost allowance entered above. This is a simulation value only.</p>'
      + '<p class="muted" style="font-size:12px"><b>Advisory Policy Price:</b> This is the price mathematically required to produce the selected gross margin against the temporary adjusted reference cost. It is not automatically the correct market price and is not enforced by the application.</p>'
      + '<p class="muted" style="font-size:12px"><b>Gross margin</b> is calculated as profit \u00f7 selling price. It is different from markup, which is profit \u00f7 cost. The Policy Lab uses gross margin.</p>'
      + '<button type="button" class="btn ghost" onclick="ZEZMS.pricingPolicyLab.reset()">Reset Policy Lab</button></div>'
      + '<div id="policyLabKpis" class="grid g2" style="display:none;margin-bottom:12px"><div class="card kpi amber"><h3>Products Below Temporary Policy</h3><div id="policyLabBelowCount" class="val mono">0</div><div class="sub">Reliable listed prices below this runtime scenario</div></div><div class="card kpi pink"><h3>Capital in Products Below Temporary Policy</h3><div id="policyLabBelowCapital" class="val mono">GH\u20b5 0.00</div><div class="sub">Associated remaining stock capital; not a realised loss</div></div><div class="card kpi teal"><h3>Products Above Temporary Policy</h3><div id="policyLabAboveCount" class="val mono">0</div><div class="sub">Reliable listed prices at or above this scenario</div></div><div class="card kpi blue"><h3>Current Stock with Unresolved Price</h3><div id="policyLabUnresolvedCount" class="val mono">0</div><div class="sub">Unavailable or ambiguous current listed prices</div></div></div>'
      + '<div id="policyLabPreview" class="card" style="display:none"><h3>Temporary Policy \u2014 Current Stock Preview</h3><p class="muted" style="font-size:12px">The same temporary cost allowance and margin assumption are being applied to every product in this preview. This is a scenario test, not a saved category or product policy.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th class="right">Remaining Qty</th><th class="right">Weighted Cost/Unit</th><th class="right">Adjusted Cost/Unit</th><th class="right">Listed Price</th><th class="right">Advisory Policy Price</th><th class="right">Price Gap</th><th class="right">Scenario Margin at Listed Price</th><th>Status</th></tr></thead><tbody id="policyLabPreviewBody"></tbody></table></div></div></div>';
  }

  function appendInsideManagementArea(dashboardHTML, labHTML) {
    const close=dashboardHTML.lastIndexOf('</section>');
    return close < 0 ? dashboardHTML+labHTML : dashboardHTML.slice(0,close)+labHTML+dashboardHTML.slice(close);
  }

  function install() {
    const originalDashboard=window.viewDashboard;
    if (typeof originalDashboard!=='function') { console.error('Pricing Policy Lab could not attach because the Dashboard renderer is unavailable.'); return false; }
    if (originalDashboard.__zezmsPricingPolicyLabV383) return true;
    const wrappedDashboard=function () {
      const dashboard=originalDashboard.apply(this,arguments);
      try { return appendInsideManagementArea(dashboard,policyLabHTML()); }
      catch (error) {
        currentProducts=Object.freeze([]);
        console.error('Pricing Policy Lab could not be rendered.',error);
        return appendInsideManagementArea(dashboard,'<div id="pricingPolicyLab" style="margin-top:18px"><div class="card"><h2>Pricing Policy Lab</h2><div class="empty">The runtime Policy Lab could not be rendered. No price, policy or operational record was changed.</div></div></div>');
      }
    };
    wrappedDashboard.__zezmsPricingPolicyLabV383=true;
    wrappedDashboard.__zezmsPricingGuidanceV382=Boolean(originalDashboard.__zezmsPricingGuidanceV382);
    wrappedDashboard.__zezmsMarginIntelligenceV381=Boolean(originalDashboard.__zezmsMarginIntelligenceV381);
    wrappedDashboard.__zezmsManagementIntelligenceV380=Boolean(originalDashboard.__zezmsManagementIntelligenceV380);
    wrappedDashboard.__zezmsOriginalDashboard=originalDashboard;
    window.viewDashboard=wrappedDashboard;
    return true;
  }

  const installed=install();
  ZEZMS.pricingPolicyLab=Object.freeze({
    version:VERSION, build:BUILD, installed:installed, readOnly:true, advisoryOnly:true, runtimeOnly:true,
    recalculate:recalculate, reset:reset,
    getCurrentProducts:function () { return currentProducts; }
  });
}());

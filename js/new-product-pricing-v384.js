/* ZEZMS TradeFlow Owner Edition v3.8.4 - New Product Pricing Simulator */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  if (ZEZMS.newProductPricing && ZEZMS.newProductPricing.installed
      && window.viewDashboard && window.viewDashboard.__zezmsNewProductPricingV384) return;

  const VERSION = '3.8.4';
  const BUILD = '20260820-customer-retention-r47';
  const CURRENCY_TOLERANCE = 0.01;
  let activeMode = 'existing';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function finite(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function safeAdd() {
    const values=Array.prototype.slice.call(arguments);
    if (values.some(function (value) { return !Number.isFinite(value); })) return null;
    const result=values.reduce(function (sum,value) { return sum+value; },0);
    return Number.isFinite(result) ? result : null;
  }
  function safeMultiply(left,right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    const result=left*right;
    return Number.isFinite(result) ? result : null;
  }
  function safeDivide(numerator,denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator===0) return null;
    const result=numerator/denominator;
    return Number.isFinite(result) ? result : null;
  }
  function currency(value) {
    if (typeof fmt === 'function') return fmt(value);
    return 'GH\u20b5 ' + Number(value).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function quantity(value) {
    if (typeof fmtN === 'function') return fmtN(value);
    return Number(value).toLocaleString('en-GH',{maximumFractionDigits:2});
  }
  function percent(value) {
    return Number(value).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  }
  function node(id) { return document.getElementById(id); }
  function setText(id,value) { const target=node(id);if(target)target.textContent=value; }
  function setDisplay(id,value) { const target=node(id);if(target)target.style.display=value; }
  function metric(id,value,formatter) {
    const target=node(id);if(!target)return;
    target.dataset.value=value == null ? '' : String(value);
    target.textContent=value == null ? '\u2014' : formatter(value);
  }
  function raw(id) { const target=node(id);return target ? text(target.value) : ''; }

  function parseInputs() {
    const quantityRaw=raw('newPricingQuantity');
    const supplierRaw=raw('newPricingSupplierCost');
    const acquisitionRaw=raw('newPricingAcquisitionCosts');
    const businessRaw=raw('newPricingBusinessCost');
    const marginRaw=raw('newPricingMargin');
    const marketRaw=raw('newPricingMarketPrice');
    const contemplatedRaw=raw('newPricingContemplatedPrice');
    const proposedQuantity=quantityRaw==='' ? 1 : finite(quantityRaw);
    const supplierCost=finite(supplierRaw);
    const acquisitionCosts=acquisitionRaw==='' ? 0 : finite(acquisitionRaw);
    const businessCost=businessRaw==='' ? 0 : finite(businessRaw);
    const margin=marginRaw==='' ? null : finite(marginRaw);
    const marketPrice=marketRaw==='' ? null : finite(marketRaw);
    const contemplatedPrice=contemplatedRaw==='' ? null : finite(contemplatedRaw);

    if (proposedQuantity == null || proposedQuantity<=0 || !Number.isInteger(proposedQuantity)) {
      return Object.freeze({state:'invalid',message:'Proposed Quantity must be a whole number greater than zero.'});
    }
    if (supplierRaw==='') return Object.freeze({state:'blank',message:'Enter Supplier Unit Cost to begin the temporary new-product scenario.'});
    if (supplierCost == null || supplierCost<0) return Object.freeze({state:'invalid',message:'Supplier Unit Cost must be zero or greater.'});
    if (acquisitionCosts == null || acquisitionCosts<0) return Object.freeze({state:'invalid',message:'Additional Batch Acquisition Costs must be zero or greater.'});
    if (businessCost == null || businessCost<0) return Object.freeze({state:'invalid',message:'Additional Business Cost / Unit must be zero or greater.'});
    if (marginRaw!=='' && (margin == null || margin<0 || margin>99.99)) return Object.freeze({state:'invalid',message:'Target Gross Margin must be between 0.00% and 99.99%.'});
    if (marketRaw!=='' && (marketPrice == null || marketPrice<0)) return Object.freeze({state:'invalid',message:'Market / Competitor Price must be zero or greater.'});
    if (contemplatedRaw!=='' && (contemplatedPrice == null || contemplatedPrice<0)) return Object.freeze({state:'invalid',message:'Contemplated Selling Price must be zero or greater.'});

    const acquisitionPerUnit=safeDivide(acquisitionCosts,proposedQuantity);
    const landedUnitCost=acquisitionPerUnit == null ? null : safeAdd(supplierCost,acquisitionPerUnit);
    const adjustedCost=landedUnitCost == null ? null : safeAdd(landedUnitCost,businessCost);
    const supplierPurchaseCost=safeMultiply(supplierCost,proposedQuantity);
    const totalLandedBatchCost=landedUnitCost == null ? null : safeMultiply(landedUnitCost,proposedQuantity);
    if ([acquisitionPerUnit,landedUnitCost,adjustedCost,supplierPurchaseCost,totalLandedBatchCost].some(function(value){return value==null;})) {
      return Object.freeze({state:'invalid',message:'One or more scenario values exceed the supported numeric range.'});
    }

    const advisoryPrice=margin == null ? null : safeDivide(adjustedCost,1-(margin/100));
    const projectedGPPerUnit=advisoryPrice == null ? null : safeAdd(advisoryPrice,-adjustedCost);
    const projectedBatchGP=projectedGPPerUnit == null ? null : safeMultiply(projectedGPPerUnit,proposedQuantity);
    const projectedBatchSales=advisoryPrice == null ? null : safeMultiply(advisoryPrice,proposedQuantity);
    const advisoryCapitalEfficiency=projectedBatchGP != null && totalLandedBatchCost>0 ? safeMultiply(safeDivide(projectedBatchGP,totalLandedBatchCost),1000) : null;

    const marketGP=marketPrice == null ? null : safeAdd(marketPrice,-adjustedCost);
    const marketMargin=marketGP != null && marketPrice>0 ? safeMultiply(safeDivide(marketGP,marketPrice),100) : null;
    const marketAdvisoryGap=marketPrice != null && advisoryPrice != null ? safeAdd(marketPrice,-advisoryPrice) : null;
    const marketBatchGP=marketGP == null ? null : safeMultiply(marketGP,proposedQuantity);
    const marketCapitalEfficiency=marketBatchGP != null && totalLandedBatchCost>0 ? safeMultiply(safeDivide(marketBatchGP,totalLandedBatchCost),1000) : null;

    const contemplatedGP=contemplatedPrice == null ? null : safeAdd(contemplatedPrice,-adjustedCost);
    const contemplatedMargin=contemplatedGP != null && contemplatedPrice>0 ? safeMultiply(safeDivide(contemplatedGP,contemplatedPrice),100) : null;
    const contemplatedBatchGP=contemplatedGP == null ? null : safeMultiply(contemplatedGP,proposedQuantity);
    const contemplatedAdvisoryGap=contemplatedPrice != null && advisoryPrice != null ? safeAdd(contemplatedPrice,-advisoryPrice) : null;
    const contemplatedMarketGap=contemplatedPrice != null && marketPrice != null ? safeAdd(contemplatedPrice,-marketPrice) : null;

    return Object.freeze({
      state:margin == null ? 'cost-only' : 'valid',
      message:margin == null ? 'Enter a Target Gross Margin % to calculate the advisory selling price.' : 'Temporary scenario only. Nothing here creates or updates an operational record.',
      productName:raw('newPricingProductName'),proposedQuantity,supplierCost,acquisitionCosts,businessCost,margin,marketPrice,contemplatedPrice,
      acquisitionPerUnit,landedUnitCost,adjustedCost,supplierPurchaseCost,totalLandedBatchCost,
      advisoryPrice,projectedGPPerUnit,projectedBatchGP,projectedBatchSales,advisoryCapitalEfficiency,
      marketGP,marketMargin,marketAdvisoryGap,marketBatchGP,marketCapitalEfficiency,
      contemplatedGP,contemplatedMargin,contemplatedBatchGP,contemplatedAdvisoryGap,contemplatedMarketGap
    });
  }

  function priceStatus(price,advisory) {
    if (price==null || advisory==null) return '\u2014';
    const difference=price-advisory;
    if (Math.abs(difference)<=CURRENCY_TOLERANCE) return 'At Temporary Advisory Price';
    return difference>0 ? 'Above Temporary Advisory Price' : 'Below Temporary Advisory Price';
  }

  const metricIds=[
    'newPricingResultSupplier','newPricingResultQuantity','newPricingSupplierPurchase','newPricingResultAcquisition','newPricingAcquisitionPerUnit','newPricingLandedUnit','newPricingResultBusiness','newPricingAdjustedCost','newPricingLandedBatch',
    'newPricingResultMargin','newPricingAdvisoryPrice','newPricingProjectedGPUnit','newPricingProjectedBatchGP','newPricingProjectedBatchSales','newPricingAdvisoryEfficiency','newPricingBreakEven',
    'newPricingResultMarket','newPricingMarketGP','newPricingMarketMargin','newPricingMarketGap','newPricingMarketBatchGP','newPricingMarketEfficiency',
    'newPricingResultContemplated','newPricingContemplatedGP','newPricingContemplatedMargin','newPricingContemplatedBatchGP','newPricingContemplatedAdvisoryGap','newPricingContemplatedMarketGap'
  ];

  function clearResults() {
    metricIds.forEach(function(id){const target=node(id);if(target){target.textContent='\u2014';target.dataset.value='';}});
    setText('newPricingResultName','\u2014');
    setText('newPricingMarketStatus','\u2014');
    setText('newPricingMarketCostStatus','\u2014');
    setText('newPricingContemplatedStatus','\u2014');
    setDisplay('newPricingResults','none');
  }

  function renderResults(model) {
    setText('newPricingResultName',model.productName || 'Temporary new-product scenario');
    metric('newPricingResultSupplier',model.supplierCost,currency);
    metric('newPricingResultQuantity',model.proposedQuantity,quantity);
    metric('newPricingSupplierPurchase',model.supplierPurchaseCost,currency);
    metric('newPricingResultAcquisition',model.acquisitionCosts,currency);
    metric('newPricingAcquisitionPerUnit',model.acquisitionPerUnit,currency);
    metric('newPricingLandedUnit',model.landedUnitCost,currency);
    metric('newPricingResultBusiness',model.businessCost,currency);
    metric('newPricingAdjustedCost',model.adjustedCost,currency);
    metric('newPricingLandedBatch',model.totalLandedBatchCost,currency);
    metric('newPricingResultMargin',model.margin,percent);
    metric('newPricingAdvisoryPrice',model.advisoryPrice,currency);
    metric('newPricingProjectedGPUnit',model.projectedGPPerUnit,currency);
    metric('newPricingProjectedBatchGP',model.projectedBatchGP,currency);
    metric('newPricingProjectedBatchSales',model.projectedBatchSales,currency);
    metric('newPricingAdvisoryEfficiency',model.advisoryCapitalEfficiency,currency);
    metric('newPricingBreakEven',model.adjustedCost,currency);
    metric('newPricingResultMarket',model.marketPrice,currency);
    metric('newPricingMarketGP',model.marketGP,currency);
    metric('newPricingMarketMargin',model.marketMargin,percent);
    metric('newPricingMarketGap',model.marketAdvisoryGap,currency);
    metric('newPricingMarketBatchGP',model.marketBatchGP,currency);
    metric('newPricingMarketEfficiency',model.marketCapitalEfficiency,currency);
    setText('newPricingMarketStatus',priceStatus(model.marketPrice,model.advisoryPrice));
    setText('newPricingMarketCostStatus',model.marketPrice != null && model.marketPrice<model.adjustedCost ? 'Below Adjusted Cost Reference' : '\u2014');
    metric('newPricingResultContemplated',model.contemplatedPrice,currency);
    metric('newPricingContemplatedGP',model.contemplatedGP,currency);
    metric('newPricingContemplatedMargin',model.contemplatedMargin,percent);
    metric('newPricingContemplatedBatchGP',model.contemplatedBatchGP,currency);
    metric('newPricingContemplatedAdvisoryGap',model.contemplatedAdvisoryGap,currency);
    metric('newPricingContemplatedMarketGap',model.contemplatedMarketGap,currency);
    setText('newPricingContemplatedStatus',priceStatus(model.contemplatedPrice,model.advisoryPrice));
    setDisplay('newPricingResults','');
  }

  function recalculate() {
    const model=parseInputs();
    const validation=node('newPricingValidation');
    if(validation){validation.textContent=model.message;validation.className=model.state==='invalid'?'empty':'muted';}
    if(model.state==='blank' || model.state==='invalid'){clearResults();return;}
    renderResults(model);
  }

  function reset() {
    const defaults={newPricingProductName:'',newPricingQuantity:'',newPricingSupplierCost:'',newPricingAcquisitionCosts:'',newPricingBusinessCost:'',newPricingMargin:'',newPricingMarketPrice:'',newPricingContemplatedPrice:''};
    Object.keys(defaults).forEach(function(id){const target=node(id);if(target)target.value=defaults[id];});
    clearResults();
    const validation=node('newPricingValidation');
    if(validation){validation.textContent='Enter Supplier Unit Cost to begin the temporary new-product scenario.';validation.className='muted';}
  }

  function setMode(mode) {
    activeMode=mode==='new'?'new':'existing';
    const isNew=activeMode==='new';
    setDisplay('policyLabExistingProductPanel',isNew?'none':'');
    setDisplay('policyLabKpis',isNew?'none':'');
    setDisplay('policyLabPreview',isNew?'none':'');
    setDisplay('newProductPricingMode',isNew?'':'none');
    const existingButton=node('policyLabExistingModeButton');
    const newButton=node('policyLabNewModeButton');
    if(existingButton)existingButton.className=isNew?'btn ghost':'btn';
    if(newButton)newButton.className=isNew?'btn':'btn ghost';
    setText('policyLabModeDescription',isNew?'Estimate pricing before purchasing or creating the product in inventory.':'Analyse pricing for inventory already in stock.');
    if(!isNew && ZEZMS.pricingPolicyLab && typeof ZEZMS.pricingPolicyLab.recalculate==='function') ZEZMS.pricingPolicyLab.recalculate();
  }

  function modeTabsHTML() {
    return '<div id="policyLabModeTabs" class="card" style="margin-bottom:12px"><div class="row" style="gap:8px;flex-wrap:wrap">'
      + '<button id="policyLabExistingModeButton" type="button" class="btn" onclick="ZEZMS.newProductPricing.setMode(\'existing\')">Existing Product</button>'
      + '<button id="policyLabNewModeButton" type="button" class="btn ghost" onclick="ZEZMS.newProductPricing.setMode(\'new\')">New Product</button></div>'
      + '<p id="policyLabModeDescription" class="muted" style="margin:8px 0 0"><b>Existing Product:</b> Analyse pricing for inventory already in stock.</p></div>';
  }

  function newProductHTML() {
    return '<div id="newProductPricingMode" data-build="'+BUILD+'" style="display:none">'
      + '<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">New Product Pricing Simulator</h2><p class="muted" style="margin:6px 0 0"><b>New Product:</b> Estimate pricing before purchasing or creating the product in inventory.</p></div><span class="badge warn">Runtime only</span></div>'
      + '<p class="muted">This simulator does not create a product, Product ID, Stock In record, Purchase Order, supplier entry or saved selling price.</p>'
      + '<div class="grid g2"><div class="field"><label>Product Name / Description</label><input id="newPricingProductName" type="text" placeholder="43&quot; Smart TV" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Proposed Quantity</label><input id="newPricingQuantity" type="number" min="1" step="1" value="" placeholder="1" data-semantic-default="1" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Supplier Unit Cost</label><input id="newPricingSupplierCost" type="number" min="0" step="0.01" placeholder="GH\u20b5 0.00" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Additional Batch Acquisition Costs</label><input id="newPricingAcquisitionCosts" type="number" min="0" step="0.01" value="" placeholder="0" data-semantic-default="0" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Additional Business Cost / Unit</label><input id="newPricingBusinessCost" type="number" min="0" step="0.01" value="" placeholder="0" data-semantic-default="0" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Target Gross Margin %</label><input id="newPricingMargin" type="number" min="0" max="99.99" step="0.01" placeholder="0.00 to 99.99" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Market / Competitor Price</label><input id="newPricingMarketPrice" type="number" min="0" step="0.01" placeholder="Optional" oninput="ZEZMS.newProductPricing.recalculate()" /></div>'
      + '<div class="field"><label>Contemplated Selling Price</label><input id="newPricingContemplatedPrice" type="number" min="0" step="0.01" placeholder="Optional" oninput="ZEZMS.newProductPricing.recalculate()" /></div></div>'
      + '<div id="newPricingValidation" class="muted">Enter Supplier Unit Cost to begin the temporary new-product scenario.</div><p class="muted" style="font-size:12px"><b>VAT basis:</b> Enter supplier costs, market prices and contemplated selling prices on a consistent tax basis. VAT treatment remains governed by the application\'s existing transaction functionality and is not recalculated by this simulator.</p></div>'
      + '<div id="newPricingResults" style="display:none"><div class="grid g2">'
      + '<div class="card"><h3>Cost and Capital</h3><div class="statline"><span>Scenario Product</span><b id="newPricingResultName">\u2014</b></div><div class="statline"><span>Supplier Unit Cost</span><b id="newPricingResultSupplier" class="mono">\u2014</b></div><div class="statline"><span>Proposed Quantity</span><b id="newPricingResultQuantity" class="mono">\u2014</b></div><div class="statline"><span>Supplier Purchase Cost</span><b id="newPricingSupplierPurchase" class="mono">\u2014</b></div><div class="statline"><span>Additional Acquisition Costs</span><b id="newPricingResultAcquisition" class="mono">\u2014</b></div><div class="statline"><span>Acquisition Extras / Unit</span><b id="newPricingAcquisitionPerUnit" class="mono">\u2014</b></div><div class="statline"><span>Landed Unit Cost</span><b id="newPricingLandedUnit" class="mono">\u2014</b></div><div class="statline"><span>Additional Business Cost / Unit</span><b id="newPricingResultBusiness" class="mono">\u2014</b></div><div class="statline"><span>Adjusted Reference Cost / Unit</span><b id="newPricingAdjustedCost" class="mono">\u2014</b></div><div class="statline"><span>Total Landed Batch Cost</span><b id="newPricingLandedBatch" class="mono">\u2014</b></div><p class="muted" style="font-size:12px">Landed Unit Cost combines supplier unit cost with the proposed batch-level acquisition costs allocated across the quantity. This is a management estimate based entirely on the temporary assumptions entered here.</p></div>'
      + '<div class="card"><h3>Pricing Scenario</h3><div class="statline"><span>Target Gross Margin</span><b id="newPricingResultMargin" class="mono">\u2014</b></div><div class="statline"><span>Advisory Selling Price</span><b id="newPricingAdvisoryPrice" class="mono">\u2014</b></div><div class="statline"><span>Projected GP / Unit</span><b id="newPricingProjectedGPUnit" class="mono">\u2014</b></div><div class="statline"><span>Projected Batch Gross Profit</span><b id="newPricingProjectedBatchGP" class="mono">\u2014</b></div><div class="statline"><span>Projected Batch Sales at Advisory Price</span><b id="newPricingProjectedBatchSales" class="mono">\u2014</b></div><div class="statline"><span>Projected GP per GH\u20b51,000 Landed Capital</span><b id="newPricingAdvisoryEfficiency" class="mono">\u2014</b></div><div class="statline"><span>Adjusted Cost Reference</span><b id="newPricingBreakEven" class="mono">\u2014</b></div><p class="muted" style="font-size:12px"><b>Advisory Selling Price:</b> This is the mathematical selling price required to achieve the selected gross margin against the temporary adjusted reference cost. It is not saved, enforced or automatically transferred to Stock In or Sale Out.</p><p class="muted" style="font-size:12px">Projected Batch Sales is a scenario value assuming all proposed units are eventually sold at the advisory price. It is not guaranteed revenue.</p><p class="muted" style="font-size:12px">Selling at the Adjusted Cost Reference would produce zero simulated gross profit after the temporary cost allowances used in this scenario.</p></div>'
      + '<div class="card"><h3>Market / Competitor Comparison</h3><div class="statline"><span>Market / Competitor Price</span><b id="newPricingResultMarket" class="mono">\u2014</b></div><div class="statline"><span>GP / Unit at Market Price</span><b id="newPricingMarketGP" class="mono">\u2014</b></div><div class="statline"><span>Gross Margin at Market Price</span><b id="newPricingMarketMargin" class="mono">\u2014</b></div><div class="statline"><span>Difference from Advisory Price</span><b id="newPricingMarketGap" class="mono">\u2014</b></div><div class="statline"><span>Projected Batch GP at Market Price</span><b id="newPricingMarketBatchGP" class="mono">\u2014</b></div><div class="statline"><span>GP per GH\u20b51,000 at Market Price</span><b id="newPricingMarketEfficiency" class="mono">\u2014</b></div><div class="statline"><span>Market vs Temporary Advisory</span><b id="newPricingMarketStatus">\u2014</b></div><div class="statline"><span>Market Cost Reference</span><b id="newPricingMarketCostStatus">\u2014</b></div></div>'
      + '<div class="card"><h3>Contemplated Price</h3><div class="statline"><span>Contemplated Selling Price</span><b id="newPricingResultContemplated" class="mono">\u2014</b></div><div class="statline"><span>Contemplated GP / Unit</span><b id="newPricingContemplatedGP" class="mono">\u2014</b></div><div class="statline"><span>Contemplated Gross Margin</span><b id="newPricingContemplatedMargin" class="mono">\u2014</b></div><div class="statline"><span>Contemplated Batch GP</span><b id="newPricingContemplatedBatchGP" class="mono">\u2014</b></div><div class="statline"><span>Difference from Advisory</span><b id="newPricingContemplatedAdvisoryGap" class="mono">\u2014</b></div><div class="statline"><span>Difference from Market Price</span><b id="newPricingContemplatedMarketGap" class="mono">\u2014</b></div><div class="statline"><span>Temporary Advisory Status</span><b id="newPricingContemplatedStatus">\u2014</b></div></div></div>'
      + '<div class="card" style="margin-top:12px"><p class="muted" style="font-size:12px"><b>Capital-efficiency limitation:</b> This is a pricing-scenario ratio only. It does not account for how long the product may take to sell. A fast-moving lower-margin product may still outperform a slow-moving higher-margin product.</p><p class="muted" style="font-size:12px">The simulator presents temporary economics only. It does not issue a buy, do-not-buy or purchase recommendation.</p></div></div>'
      + '<button type="button" class="btn ghost" style="margin-bottom:12px" onclick="ZEZMS.newProductPricing.reset()">Reset New Product Scenario</button></div>';
  }

  function enhanceDashboard(dashboardHTML) {
    activeMode='existing';
    const labStart=dashboardHTML.indexOf('<div id="pricingPolicyLab"');
    if(labStart<0) return dashboardHTML;
    const existingMarker='<div class="card" style="margin-bottom:12px"><div class="grid g2">';
    const existingIndex=dashboardHTML.indexOf(existingMarker,labStart);
    if(existingIndex<0) throw new Error('Existing Product Policy Lab panel marker was not found.');
    let enhanced=dashboardHTML.slice(0,existingIndex)+modeTabsHTML()+'<div id="policyLabExistingProductPanel" class="card" style="margin-bottom:12px"><div class="grid g2">'+dashboardHTML.slice(existingIndex+existingMarker.length);
    const kpiIndex=enhanced.indexOf('<div id="policyLabKpis"',existingIndex);
    if(kpiIndex<0) throw new Error('Existing Product Policy Lab KPI marker was not found.');
    enhanced=enhanced.slice(0,kpiIndex)+newProductHTML()+enhanced.slice(kpiIndex);
    return enhanced;
  }

  function install() {
    const originalDashboard=window.viewDashboard;
    if(typeof originalDashboard!=='function'){console.error('New Product Pricing Simulator could not attach because the Dashboard renderer is unavailable.');return false;}
    if(originalDashboard.__zezmsNewProductPricingV384)return true;
    const wrappedDashboard=function(){
      const dashboard=originalDashboard.apply(this,arguments);
      try{return enhanceDashboard(dashboard);}
      catch(error){console.error('New Product Pricing Simulator could not be rendered.',error);return dashboard;}
    };
    wrappedDashboard.__zezmsNewProductPricingV384=true;
    wrappedDashboard.__zezmsPricingPolicyLabV383=Boolean(originalDashboard.__zezmsPricingPolicyLabV383);
    wrappedDashboard.__zezmsPricingGuidanceV382=Boolean(originalDashboard.__zezmsPricingGuidanceV382);
    wrappedDashboard.__zezmsMarginIntelligenceV381=Boolean(originalDashboard.__zezmsMarginIntelligenceV381);
    wrappedDashboard.__zezmsManagementIntelligenceV380=Boolean(originalDashboard.__zezmsManagementIntelligenceV380);
    wrappedDashboard.__zezmsOriginalDashboard=originalDashboard;
    window.viewDashboard=wrappedDashboard;
    return true;
  }

  const installed=install();
  ZEZMS.newProductPricing=Object.freeze({
    version:VERSION,build:BUILD,installed:installed,readOnly:true,advisoryOnly:true,runtimeOnly:true,
    setMode:setMode,recalculate:recalculate,reset:reset,getMode:function(){return activeMode;}
  });
}());

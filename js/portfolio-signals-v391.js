(function(){
  'use strict';

  var VERSION = '3.9.1';
  var BUILD = '20260812-portfolio-signals-r39';
  var RELEASE = 'Portfolio Signals & Capital Allocation Intelligence';
  var EVENT_NAME = 'zezms:stock-velocity-updated';
  if(window.ZEZMS && window.ZEZMS.portfolioSignals
    && window.ZEZMS.portfolioSignals.version === VERSION
    && typeof window.viewDashboard === 'function'
    && window.viewDashboard.__zezmsPortfolioSignalsV391){
    return;
  }

  var runtime = {
    model: null,
    renderCount: 0,
    refreshCount: 0
  };

  function clean(value){ return String(value == null ? '' : value).trim(); }
  function normalize(value){ return clean(value).toLocaleLowerCase(); }
  function list(value){ return Array.isArray(value) ? value : []; }
  function finite(value){
    if(value == null || (typeof value === 'string' && clean(value) === '')) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function safeMultiply(left, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return null;
    var result = left * right;
    return Number.isFinite(result) ? result : null;
  }
  function safeAdd(left, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return null;
    var result = left + right;
    return Number.isFinite(result) ? result : null;
  }
  function safeProductivity(pace, capital){
    if(!Number.isFinite(pace) || !Number.isFinite(capital) || !(capital > 0)) return null;
    var result = (pace / capital) * 1000;
    return Number.isFinite(result) ? result : null;
  }
  function esc(value){
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function dataNumber(value){ return Number.isFinite(value) ? String(value) : ''; }
  function formatQuantity(value){
    if(!Number.isFinite(value)) return '—';
    return Number(value).toLocaleString('en-GH', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
    });
  }
  function formatMetric(value, digits){
    if(!Number.isFinite(value)) return '—';
    return Number(value).toLocaleString('en-GH', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }
  function formatCurrency(value){
    if(!Number.isFinite(value)) return '—';
    if(typeof window.money === 'function'){
      try{ return window.money(value); }catch(_error){}
    }
    return 'GH₵ ' + Number(value).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  function formatPercent(value){ return Number.isFinite(value) ? formatMetric(value, 1) + '%' : '—'; }
  function formatDay(value){
    var date = new Date(value);
    if(!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }
  function formatRank(rank, total){
    return Number.isFinite(rank) && Number.isFinite(total) ? rank + ' of ' + total : '—';
  }
  function productName(product){ return clean(product && product.product) || 'Unnamed product'; }
  function productId(product){ return clean(product && product.productId) || '—'; }
  function deterministicCompare(left, right){
    return productName(left).localeCompare(productName(right))
      || productId(left).localeCompare(productId(right))
      || clean(left && left.key).localeCompare(clean(right && right.key));
  }
  function freezeDeep(value){
    if(Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
    if(value && typeof value === 'object'){
      var copy = {};
      Object.keys(value).forEach(function(key){ copy[key] = freezeDeep(value[key]); });
      return Object.freeze(copy);
    }
    return value;
  }

  function ownerAdmin(){
    try{
      if(typeof session !== 'undefined' && session){
        var commercialRole = clean(session.commercialRole).toUpperCase();
        if(commercialRole) return commercialRole === 'OWNER' || commercialRole === 'ADMIN';
        var legacyRole = clean(session.role).toUpperCase();
        if(legacyRole || session.adminMode === true) return legacyRole === 'ADMIN' || session.adminMode === true;
      }
    }catch(_error){}
    try{
      var auth = window.ZEZMS && window.ZEZMS.staffAuth;
      var context = auth && typeof auth.getContext === 'function' ? auth.getContext() : null;
      var role = clean(context && context.role).toUpperCase();
      return role === 'OWNER' || role === 'ADMIN';
    }catch(_error2){ return false; }
  }

  function stage3Snapshot(){
    try{
      var api = window.ZEZMS && window.ZEZMS.pricingGuidance;
      return api && typeof api.getCurrentStockAggregate === 'function'
        ? list(api.getCurrentStockAggregate())
        : [];
    }catch(_error){ return []; }
  }
  function stage4Snapshot(){
    try{
      var api = window.ZEZMS && window.ZEZMS.stockVelocity;
      return api && typeof api.getProductSnapshot === 'function'
        ? api.getProductSnapshot()
        : null;
    }catch(_error){ return null; }
  }

  function uniqueLookup(items, keyGetter){
    var buckets = new Map();
    items.forEach(function(item){
      var key = normalize(keyGetter(item));
      if(!key) return;
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });
    return function(value){
      var bucket = buckets.get(normalize(value));
      return bucket && bucket.length === 1 ? bucket[0] : null;
    };
  }

  function pricingMatcher(pricing){
    var byKey = new Map();
    var byId = new Map();
    pricing.forEach(function(product){
      var key = clean(product && product.key);
      var id = clean(product && product.productId);
      if(key) byKey.set(key, product);
      if(id){
        var normalizedId = normalize(id);
        if(!byId.has(normalizedId)) byId.set(normalizedId, []);
        byId.get(normalizedId).push(product);
      }
    });
    var byName = uniqueLookup(pricing, function(product){ return product && product.productName; });
    return function(velocity){
      var key = clean(velocity && velocity.key);
      if(key && byKey.has(key)) return byKey.get(key);
      var id = normalize(velocity && velocity.productId);
      var idBucket = id ? byId.get(id) : null;
      if(idBucket && idBucket.length === 1) return idBucket[0];
      return byName(velocity && velocity.product);
    };
  }

  function quartileForRank(rank, total){
    if(!(total >= 4) || !(rank >= 1) || rank > total) return null;
    return 'Q' + (4 - Math.floor(((rank - 1) * 4) / total));
  }
  function rankProducts(products, valueKey, direction, prefix, eligibility){
    var eligible = products.filter(function(product){
      return Number.isFinite(product[valueKey]) && (!eligibility || eligibility(product));
    });
    eligible.sort(function(left, right){
      var difference = direction === 'asc'
        ? left[valueKey] - right[valueKey]
        : right[valueKey] - left[valueKey];
      return difference || deterministicCompare(left, right);
    });
    eligible.forEach(function(product, index){
      var rank = index + 1;
      product[prefix + 'Rank'] = rank;
      product[prefix + 'RankTotal'] = eligible.length;
      product[prefix + 'Quartile'] = quartileForRank(rank, eligible.length);
    });
    return eligible;
  }

  function planningMap(snapshot){
    var map = new Map();
    var planning = snapshot && snapshot.planning;
    if(!planning || !planning.inputs || planning.inputs.state !== 'valid') return map;
    list(planning.products).forEach(function(product){
      var key = clean(product && product.key);
      if(key) map.set(key, product);
    });
    return map;
  }

  function sumCapital(products, predicate){
    var sum = 0;
    var found = false;
    for(var index = 0; index < products.length; index += 1){
      var product = products[index];
      if(predicate && !predicate(product)) continue;
      if(!Number.isFinite(product.totalRemainingCost)) continue;
      found = true;
      sum = safeAdd(sum, product.totalRemainingCost);
      if(sum == null) return null;
    }
    return found ? sum : 0;
  }

  function buildModel(){
    var velocity = stage4Snapshot();
    var pricing = stage3Snapshot();
    var matchPricing = pricingMatcher(pricing);
    var planning = planningMap(velocity);
    var products = list(velocity && velocity.products).map(function(source){
      var price = matchPricing(source) || {};
      var referenceGP = finite(price.referenceGrossProfitPerUnit);
      var thirtyDayPace = finite(source.thirtyDayPace);
      var referenceGPPace = referenceGP == null || thirtyDayPace == null
        ? null
        : safeMultiply(referenceGP, thirtyDayPace);
      var totalRemainingCost = finite(source.totalRemainingCost);
      var referenceCapitalProductivity = safeProductivity(referenceGPPace, totalRemainingCost);
      var planned = planning.get(clean(source.key));
      return {
        key: clean(source.key),
        productId: clean(source.productId),
        product: productName(source),
        category: clean(source.category) || clean(price.category) || 'Uncategorised',
        remainingQty: finite(source.remainingQty),
        totalRemainingCost: totalRemainingCost,
        weightedCost: finite(price.weightedCostPerUnit),
        listedPrice: price.listedPriceState === 'reliable' ? finite(price.listedPrice) : null,
        listedPriceState: clean(price.listedPriceState) || 'unavailable',
        referenceGP: referenceGP,
        referenceMargin: finite(price.referenceGrossMargin),
        priceCostStatus: clean(price.status),
        unitsSold: finite(source.unitsSold),
        averageDailyVelocity: finite(source.averageDailyVelocity),
        thirtyDayPace: thirtyDayPace,
        estimatedDaysOfCover: finite(source.estimatedDaysOfCover),
        lastSaleDate: clean(source.lastSaleDate),
        incomingOpenPOQty: source.incomingKnown === false ? null : finite(source.incomingOpenPOQty),
        inventoryPosition: finite(source.inventoryPosition),
        suggestedReorderQuantity: planned ? finite(planned.suggestedReorderQuantity) : null,
        referenceGPPace: referenceGPPace,
        referenceCapitalProductivity: referenceCapitalProductivity,
        signals: []
      };
    });

    rankProducts(products, 'thirtyDayPace', 'desc', 'velocity');
    rankProducts(products, 'totalRemainingCost', 'desc', 'capital');
    var coverEligible = rankProducts(products, 'estimatedDaysOfCover', 'asc', 'cover', function(product){
      return product.averageDailyVelocity > 0;
    });
    rankProducts(products, 'referenceGPPace', 'desc', 'contribution');
    var productivityEligible = rankProducts(products, 'referenceCapitalProductivity', 'desc', 'productivity');

    var shortestCoverCutoff = Math.ceil(coverEligible.length / 4);
    var strongestProductivityCutoff = Math.ceil(productivityEligible.length / 4);
    products.forEach(function(product){
      if(product.averageDailyVelocity > 0
        && product.velocityQuartile === 'Q4'
        && Number.isFinite(product.coverRank)
        && product.coverRank <= shortestCoverCutoff){
        product.signals.push('High Velocity / Low Cover');
      }
      if(product.capitalQuartile === 'Q4'
        && (product.velocityQuartile === 'Q1' || product.unitsSold === 0)){
        product.signals.push('High Capital / Low Movement');
      }
      if(product.referenceGPPace > 0 && product.contributionQuartile === 'Q4'){
        product.signals.push('Strong Reference Contribution');
      }
      if(product.referenceCapitalProductivity > 0
        && Number.isFinite(product.productivityRank)
        && product.productivityRank <= strongestProductivityCutoff){
        product.signals.push('Strong Reference Capital Productivity');
      }
      if(product.priceCostStatus === 'Below Remaining-Cost Reference'){
        product.signals.push('Below Remaining-Cost Reference');
      }
      if(product.remainingQty > 0 && product.unitsSold === 0){
        product.signals.push('No Sales in Lookback');
      }
      if(!product.signals.length) product.signals.push('Normal Monitoring');
    });

    var totalCapital = sumCapital(products);
    var signalNames = [
      'High Velocity / Low Cover',
      'High Capital / Low Movement',
      'Strong Reference Contribution',
      'No Sales in Lookback',
      'Normal Monitoring'
    ];
    var exposures = signalNames.map(function(signal){
      var capital = sumCapital(products, function(product){ return product.signals.indexOf(signal) >= 0; });
      var percent = Number.isFinite(capital) && Number.isFinite(totalCapital) && totalCapital > 0
        ? safeMultiply(capital / totalCapital, 100)
        : null;
      return { signal:signal, capital:capital, percent:percent };
    });

    runtime.renderCount += 1;
    runtime.model = freezeDeep({
      windowDays: finite(velocity && velocity.windowDays),
      startDay: clean(velocity && velocity.startDay),
      endDay: clean(velocity && velocity.endDay),
      products: products,
      pricingProductCount: pricing.length,
      planningValid: planning.size > 0,
      totalCapital: totalCapital,
      exposures: exposures,
      kpis: {
        highCapitalLowMovementCapital: sumCapital(products, function(product){ return product.signals.indexOf('High Capital / Low Movement') >= 0; }),
        highVelocityLowCoverCapital: sumCapital(products, function(product){ return product.signals.indexOf('High Velocity / Low Cover') >= 0; }),
        strongContributionCount: products.filter(function(product){ return product.signals.indexOf('Strong Reference Contribution') >= 0; }).length,
        noSalesCount: products.filter(function(product){ return product.remainingQty > 0 && product.unitsSold === 0; }).length
      },
      diagnostics: {
        renderCount: runtime.renderCount,
        currentProductCount: products.length,
        velocityRankCount: products.filter(function(product){ return Number.isFinite(product.velocityRank); }).length,
        capitalRankCount: products.filter(function(product){ return Number.isFinite(product.capitalRank); }).length,
        coverRankCount: coverEligible.length,
        productivityRankCount: productivityEligible.length
      }
    });
    return runtime.model;
  }

  function hasSignal(product, signal){ return product.signals.indexOf(signal) >= 0; }
  function signalBadges(product){
    return product.signals.map(function(signal){
      var className = signal === 'Below Remaining-Cost Reference' ? 'bad'
        : signal === 'Normal Monitoring' ? ''
        : signal === 'High Capital / Low Movement' || signal === 'No Sales in Lookback' ? 'warn'
        : 'ok';
      return '<span class="badge ' + className + '">' + esc(signal) + '</span>';
    }).join(' ');
  }
  function emptyRow(columns, text){ return '<tr><td colspan="' + columns + '" class="empty">' + esc(text) + '</td></tr>'; }
  function stockCapitalValue(product){ return Number.isFinite(product.totalRemainingCost) ? product.totalRemainingCost : -Infinity; }
  function overviewSort(left, right){
    var leftNormal = hasSignal(left, 'Normal Monitoring');
    var rightNormal = hasSignal(right, 'Normal Monitoring');
    if(leftNormal !== rightNormal) return leftNormal ? 1 : -1;
    var priorities = [
      'High Velocity / Low Cover',
      'High Capital / Low Movement',
      'Strong Reference Capital Productivity'
    ];
    for(var index = 0; index < priorities.length; index += 1){
      var leftHas = hasSignal(left, priorities[index]);
      var rightHas = hasSignal(right, priorities[index]);
      if(leftHas !== rightHas) return leftHas ? -1 : 1;
    }
    return stockCapitalValue(right) - stockCapitalValue(left) || deterministicCompare(left, right);
  }
  function overviewRow(product){
    return '<tr data-portfolio-row="1" data-product-key="' + esc(product.key) + '"'
      + ' data-velocity-rank="' + dataNumber(product.velocityRank) + '"'
      + ' data-capital-rank="' + dataNumber(product.capitalRank) + '"'
      + ' data-velocity-quartile="' + esc(product.velocityQuartile || '') + '"'
      + ' data-capital-quartile="' + esc(product.capitalQuartile || '') + '"'
      + ' data-reference-gp-pace="' + dataNumber(product.referenceGPPace) + '"'
      + ' data-capital-productivity="' + dataNumber(product.referenceCapitalProductivity) + '">'
      + '<td><b>' + esc(product.product) + '</b></td>'
      + '<td>' + esc(productId(product)) + '</td>'
      + '<td>' + esc(product.category) + '</td>'
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.estimatedDaysOfCover, 1) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceGP) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceGPPace) + '</td>'
      + '<td class="num">' + formatMetric(product.referenceCapitalProductivity, 2) + '</td>'
      + '<td>' + esc(formatRank(product.velocityRank, product.velocityRankTotal)) + '</td>'
      + '<td>' + esc(formatRank(product.capitalRank, product.capitalRankTotal)) + '</td>'
      + '<td><div class="portfolio-signal-badges">' + signalBadges(product) + '</div></td>'
      + '</tr>';
  }
  function capitalHeavyRow(product){
    return '<tr data-capital-heavy-row="1" data-product-key="' + esc(product.key) + '">'
      + '<td><b>' + esc(product.product) + '</b></td><td>' + esc(product.category) + '</td>'
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '<td class="num">' + formatQuantity(product.unitsSold) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.estimatedDaysOfCover, 1) + '</td>'
      + '<td>' + (product.lastSaleDate ? esc(formatDay(product.lastSaleDate)) : 'No sale in window') + '</td>'
      + '<td class="num">' + formatCurrency(product.listedPrice) + '</td>'
      + '<td class="num">' + (Number.isFinite(product.referenceMargin) ? formatPercent(product.referenceMargin) : '—') + '</td>'
      + '</tr>';
  }
  function highVelocityRow(product){
    return '<tr data-high-velocity-row="1" data-product-key="' + esc(product.key) + '">'
      + '<td><b>' + esc(product.product) + '</b></td>'
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatQuantity(product.inventoryPosition) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.estimatedDaysOfCover, 1) + '</td>'
      + '<td class="num">' + formatQuantity(product.incomingOpenPOQty) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceGP) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceGPPace) + '</td>'
      + '<td class="num">' + formatQuantity(product.suggestedReorderQuantity) + '</td>'
      + '</tr>';
  }
  function productivityRow(product, weakest){
    return '<tr data-productivity-row="' + (weakest ? 'weakest' : 'strongest') + '" data-product-key="' + esc(product.key) + '">'
      + '<td><b>' + esc(product.product) + '</b></td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + (weakest ? '<td class="num">' + formatQuantity(product.unitsSold) + '</td>' : '')
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceGP) + '</td>'
      + (!weakest ? '<td class="num">' + formatCurrency(product.referenceGPPace) + '</td>' : '')
      + '<td class="num">' + formatMetric(product.referenceCapitalProductivity, 2) + '</td>'
      + (weakest
        ? '<td><div class="portfolio-signal-badges">' + signalBadges(product) + '</div></td>'
        : '<td class="num">' + formatMetric(product.estimatedDaysOfCover, 1) + '</td>')
      + '</tr>';
  }
  function exposureRow(exposure){
    return '<tr data-signal-capital="' + esc(exposure.signal) + '" data-amount="' + dataNumber(exposure.capital) + '" data-percent="' + dataNumber(exposure.percent) + '">'
      + '<td>' + esc(exposure.signal) + '</td><td class="num">' + formatCurrency(exposure.capital) + '</td><td class="num">' + formatPercent(exposure.percent) + '</td></tr>';
  }

  function sectionHTML(){
    var model = buildModel();
    var overview = model.products.slice().sort(overviewSort);
    var capitalHeavy = model.products.filter(function(product){ return hasSignal(product, 'High Capital / Low Movement'); });
    capitalHeavy.sort(function(left, right){ return stockCapitalValue(right) - stockCapitalValue(left) || deterministicCompare(left, right); });
    var highVelocity = model.products.filter(function(product){ return hasSignal(product, 'High Velocity / Low Cover'); });
    highVelocity.sort(function(left, right){
      return left.estimatedDaysOfCover - right.estimatedDaysOfCover
        || right.thirtyDayPace - left.thirtyDayPace
        || deterministicCompare(left, right);
    });
    var strongest = model.products.filter(function(product){ return product.referenceCapitalProductivity > 0; });
    strongest.sort(function(left, right){
      return right.referenceCapitalProductivity - left.referenceCapitalProductivity || deterministicCompare(left, right);
    });
    strongest = strongest.slice(0, 10);
    var weakest = model.products.filter(function(product){ return Number.isFinite(product.referenceCapitalProductivity); });
    weakest.sort(function(left, right){
      return left.referenceCapitalProductivity - right.referenceCapitalProductivity || deterministicCompare(left, right);
    });
    weakest = weakest.slice(0, 10);
    var rangeText = model.startDay && model.endDay
      ? formatDay(model.startDay) + ' – ' + formatDay(model.endDay)
      : '—';

    return ''
      + '<div class="divider"></div>'
      + '<section id="portfolioSignalsLab" data-stage="4B" data-version="' + VERSION + '" data-build="' + BUILD + '" data-window-days="' + dataNumber(model.windowDays) + '" aria-labelledby="portfolioSignalsHeading">'
      + '<style id="portfolioSignalsResponsiveStyles">#portfolioSignalsLab .portfolio-signal-badges{display:flex;gap:4px;flex-wrap:wrap;min-width:210px}@media(max-width:720px){#portfolioSignalsLab .grid.g4{grid-template-columns:minmax(0,1fr)!important}}html.zezms-phone-layout #portfolioSignalsLab .table-wrap{overflow-x:auto!important;overflow-y:auto!important}html.zezms-phone-layout #portfolioSignalsLab .table-wrap table{width:max-content!important;max-width:none!important;min-width:760px!important}</style>'
      + '<div class="row wrap" style="justify-content:space-between;align-items:flex-start"><div><h3 id="portfolioSignalsHeading" style="margin:0">Portfolio Signals &amp; Capital Allocation</h3>'
      + '<div class="muted">Relative portfolio analysis combining current stock capital, recent sales velocity and current pricing references. No product, price, stock quantity or Purchase Order is changed.</div></div><span class="pill">Stage 4B · Read only</span></div>'
      + '<div class="notice" style="margin-top:12px"><b>Active Sales History Window:</b> <span id="portfolioWindowLabel" data-window-days="' + dataNumber(model.windowDays) + '">' + (model.windowDays ? 'Last ' + model.windowDays + ' days' : 'Unavailable') + '</span> (' + esc(rangeText) + '). This follows Stage 4A and has no separate selector.</div>'
      + '<div class="grid g4" id="portfolioKpis" style="margin-top:12px">'
      + '<div class="card kpi amber"><div class="sub">Capital in High-Capital / Low-Movement</div><div class="val" id="portfolioKpiHighCapital" data-value="' + dataNumber(model.kpis.highCapitalLowMovementCapital) + '">' + formatCurrency(model.kpis.highCapitalLowMovementCapital) + '</div></div>'
      + '<div class="card kpi teal"><div class="sub">Capital in High-Velocity / Low-Cover</div><div class="val" id="portfolioKpiHighVelocity" data-value="' + dataNumber(model.kpis.highVelocityLowCoverCapital) + '">' + formatCurrency(model.kpis.highVelocityLowCoverCapital) + '</div></div>'
      + '<div class="card kpi green"><div class="sub">Products with Strong Reference Contribution</div><div class="val" id="portfolioKpiStrongContribution" data-value="' + model.kpis.strongContributionCount + '">' + model.kpis.strongContributionCount.toLocaleString('en-GH') + '</div></div>'
      + '<div class="card kpi pink"><div class="sub">Products with No Sales in Lookback</div><div class="val" id="portfolioKpiNoSales" data-value="' + model.kpis.noSalesCount + '">' + model.kpis.noSalesCount.toLocaleString('en-GH') + '</div></div></div>'
      + '<div class="notice" style="margin-top:12px"><b>Reference GP Pace / 30 Days:</b> This estimates potential 30-day gross-profit contribution using the current listed price, current weighted remaining-cost reference and recent observed sales pace. It is not realised accounting profit.<br><b>Reference GP / GH₵1,000 Stock Capital:</b> This is a current-stock portfolio reference. It is not ROI and does not measure the historical return on all capital previously invested.</div>'
      + '<h4 style="margin:18px 0 8px">Product Portfolio Overview</h4><div class="muted" style="margin-bottom:6px">Ranks are deterministic ordinal positions among products with valid values. Quartiles appear only where at least four products are eligible.</div>'
      + '<div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="num">Current Qty</th><th class="num">Stock Capital</th><th class="num">30-Day Sales Pace</th><th class="num">Days of Cover</th><th class="num">Reference GP/Unit</th><th class="num">Reference GP Pace / 30 Days</th><th class="num">Reference GP / GH₵1,000 Stock Capital</th><th>Velocity Rank</th><th>Capital Rank</th><th>Signals</th></tr></thead><tbody id="portfolioOverviewBody">'
      + (overview.length ? overview.map(overviewRow).join('') : emptyRow(13, 'No current stock products are available for portfolio analysis.'))
      + '</tbody></table></div>'
      + '<h4 style="margin:18px 0 8px">Capital Heavy — Low Movement</h4><div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th class="num">Current Qty</th><th class="num">Stock Capital</th><th class="num">Units Sold in Lookback</th><th class="num">30-Day Sales Pace</th><th class="num">Days of Cover</th><th>Last Sale Date</th><th class="num">Listed Price</th><th class="num">Reference Margin %</th></tr></thead><tbody id="portfolioCapitalHeavyBody">'
      + (capitalHeavy.length ? capitalHeavy.map(capitalHeavyRow).join('') : emptyRow(10, 'No current product falls into the relative High-Capital / Low-Movement group for this lookback.'))
      + '</tbody></table></div>'
      + '<h4 style="margin:18px 0 8px">High Velocity — Low Cover</h4><div class="muted" style="margin-bottom:6px">Suggested Reorder Qty is copied from Stage 4A only when its temporary scenario is currently valid; otherwise it is shown as —.</div><div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Current Qty</th><th class="num">Inventory Position</th><th class="num">30-Day Sales Pace</th><th class="num">Days of Cover</th><th class="num">Incoming Open PO</th><th class="num">Reference GP/Unit</th><th class="num">Reference GP Pace / 30 Days</th><th class="num">Stage 4A Suggested Reorder Qty</th></tr></thead><tbody id="portfolioHighVelocityBody">'
      + (highVelocity.length ? highVelocity.map(highVelocityRow).join('') : emptyRow(9, 'No current product falls into the relative High-Velocity / Low-Cover group for this lookback.'))
      + '</tbody></table></div>'
      + '<h4 style="margin:18px 0 8px">Strongest Reference Capital Productivity — Top 10</h4><div class="notice" style="margin-bottom:6px">This ranking combines current listed-price economics with recent sales pace and current remaining stock capital. It is not realised ROI.</div><div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Stock Capital</th><th class="num">Current Qty</th><th class="num">30-Day Sales Pace</th><th class="num">Reference GP/Unit</th><th class="num">Reference GP Pace / 30 Days</th><th class="num">Reference GP / GH₵1,000 Stock Capital</th><th class="num">Days of Cover</th></tr></thead><tbody id="portfolioStrongestBody">'
      + (strongest.length ? strongest.map(function(product){ return productivityRow(product, false); }).join('') : emptyRow(8, 'No current product has a positive, calculable reference capital-productivity value.'))
      + '</tbody></table></div>'
      + '<h4 style="margin:18px 0 8px">Weakest Reference Capital Productivity — Bottom 10</h4><div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Stock Capital</th><th class="num">Current Qty</th><th class="num">Units Sold in Lookback</th><th class="num">30-Day Sales Pace</th><th class="num">Reference GP/Unit</th><th class="num">Reference GP / GH₵1,000 Stock Capital</th><th>Signals</th></tr></thead><tbody id="portfolioWeakestBody">'
      + (weakest.length ? weakest.map(function(product){ return productivityRow(product, true); }).join('') : emptyRow(8, 'No current product has a calculable reference capital-productivity value.'))
      + '</tbody></table></div>'
      + '<h4 style="margin:18px 0 8px">Current Stock Capital by Portfolio Signal</h4><div class="notice" style="margin-bottom:6px"><b>Portfolio signals overlap.</b> Percentages show exposure to each signal independently and should not be summed.</div><div class="table-wrap"><table><thead><tr><th>Portfolio signal</th><th class="num">Current stock capital</th><th class="num">Share of total known capital</th></tr></thead><tbody id="portfolioSignalCapitalBody">'
      + model.exposures.map(exposureRow).join('')
      + '</tbody></table></div>'
      + '<div class="muted" style="margin-top:10px">Relative signals are temporary management-attention references. They are not ABC classes, a composite score, Buy/Hold/Exit commands, budget allocations, automatic repricing or Purchase Orders.</div>'
      + '</section>';
  }

  function appendSection(html){
    var marker = html.lastIndexOf('</section>');
    if(marker < 0) return html + sectionHTML();
    return html.slice(0, marker) + sectionHTML() + html.slice(marker);
  }
  function refresh(){
    var existing = document.getElementById('portfolioSignalsLab');
    if(!existing || !ownerAdmin()) return false;
    runtime.refreshCount += 1;
    existing.outerHTML = sectionHTML();
    return true;
  }
  function install(){
    if(typeof window.viewDashboard !== 'function') return false;
    if(window.viewDashboard.__zezmsPortfolioSignalsV391) return true;
    var original = window.viewDashboard;
    var wrapped = function(){
      var html = original.apply(this, arguments);
      if(typeof html !== 'string' || html.indexOf('id="portfolioSignalsLab"') >= 0 || !ownerAdmin()) return html;
      return appendSection(html);
    };
    Object.keys(original).forEach(function(key){
      try{ wrapped[key] = original[key]; }catch(_error){}
    });
    wrapped.__zezmsPortfolioSignalsV391 = true;
    wrapped.__zezmsPortfolioSignalsV391Original = original;
    window.viewDashboard = wrapped;
    window.addEventListener(EVENT_NAME, refresh);
    return true;
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.portfolioSignals = Object.freeze({
    version: VERSION,
    build: BUILD,
    release: RELEASE,
    install: install,
    refresh: refresh,
    getPortfolioSnapshot: function(){ return runtime.model || freezeDeep({ products:[], exposures:[], kpis:{} }); },
    getRuntimeSnapshot: function(){
      return Object.freeze({
        renderCount: runtime.renderCount,
        refreshCount: runtime.refreshCount,
        productCount: runtime.model ? runtime.model.products.length : 0,
        windowDays: runtime.model ? runtime.model.windowDays : null
      });
    }
  });

  install();
})();

(function(){
  'use strict';

  var VERSION = '3.9.0';
  var BUILD = '20260820-customer-retention-r47';
  var RELEASE = 'Stock Velocity & Reorder Planning Lab';
  var WINDOWS = [30, 60, 90];
  var DEFAULT_WINDOW = 90;
  var DAY_MS = 24 * 60 * 60 * 1000;
  if(window.ZEZMS && window.ZEZMS.stockVelocity
    && window.ZEZMS.stockVelocity.version === VERSION
    && typeof window.viewDashboard === 'function'
    && window.viewDashboard.__zezmsStockVelocityV390){
    return;
  }
  var runtime = {
    baseModel: null,
    planningSnapshot: null,
    renderCount: 0,
    scenarioCount: 0
  };

  function database(){
    try{
      return typeof DB === 'object' && DB ? DB : {};
    }catch(_error){
      return {};
    }
  }

  function asArray(value){
    return Array.isArray(value) ? value : [];
  }

  function clean(value){
    return String(value == null ? '' : value).trim();
  }

  function normalize(value){
    return clean(value).toLocaleLowerCase();
  }

  function finite(value){
    if(value == null || (typeof value === 'string' && clean(value) === '')) return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positive(value){
    var parsed = finite(value);
    return parsed != null && parsed > 0 ? parsed : null;
  }

  function nonNegative(value){
    var parsed = finite(value);
    return parsed != null && parsed >= 0 ? parsed : null;
  }

  function safeDivide(numerator, denominator){
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
      ? numerator / denominator
      : null;
  }

  function safeAdd(left, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return null;
    var sum = left + right;
    return Number.isFinite(sum) ? sum : null;
  }

  function dataNumber(value){
    return Number.isFinite(value) ? String(value) : '';
  }

  function esc(value){
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

  function formatPercent(value){
    return Number.isFinite(value) ? formatMetric(value, 1) + '%' : '—';
  }

  function localDay(value){
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if(!Number.isFinite(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDay(value){
    var date = value instanceof Date ? value : localDay(value);
    if(!date || !Number.isFinite(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function validWindow(value){
    var parsed = Number(value);
    return WINDOWS.indexOf(parsed) >= 0 ? parsed : DEFAULT_WINDOW;
  }

  function activeRecord(record){
    if(!record || record.voided) return false;
    var status = clean(record.status || 'ACTIVE').toUpperCase();
    return status !== 'VOID' && status !== 'UNDONE' && status !== 'CANCELLED';
  }

  function displayName(product){
    return clean(product && (product.productName || product.product || product.name)) || 'Unnamed product';
  }

  function displayId(product){
    return clean(product && product.productId) || '—';
  }

  function createUniqueLookup(items, valueGetter){
    var buckets = new Map();
    items.forEach(function(item){
      var key = normalize(valueGetter(item));
      if(!key) return;
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });
    return {
      get: function(value){
        var bucket = buckets.get(normalize(value));
        return bucket && bucket.length === 1 ? bucket[0] : null;
      },
      ambiguous: function(value){
        var bucket = buckets.get(normalize(value));
        return !!(bucket && bucket.length > 1);
      }
    };
  }

  function getFrozenStockAggregate(){
    try{
      var guidance = window.ZEZMS && window.ZEZMS.pricingGuidance;
      if(guidance && typeof guidance.getCurrentStockAggregate === 'function'){
        var result = guidance.getCurrentStockAggregate();
        return asArray(result);
      }
    }catch(_error){}
    return [];
  }

  function makeCurrentProducts(aggregate){
    return aggregate.map(function(item, index){
      var productId = clean(item && item.productId);
      var name = displayName(item);
      var category = clean(item && item.category) || 'Uncategorised';
      var remainingQty = nonNegative(item && item.remainingQty);
      var totalCost = nonNegative(item && item.totalRemainingCost);
      var weightedCost = nonNegative(item && (item.weightedCostPerUnit != null ? item.weightedCostPerUnit : item.weightedCost));
      var listedPrice = nonNegative(item && item.listedPrice);
      var key = clean(item && item.key) || (productId
        ? 'id:' + normalize(productId)
        : 'name:' + normalize(name) + ':' + index);
      return {
        key: key,
        productId: productId,
        product: name,
        category: category,
        remainingQty: remainingQty == null ? 0 : remainingQty,
        totalRemainingCost: totalCost,
        weightedCost: weightedCost,
        listedPrice: listedPrice,
        source: item
      };
    });
  }

  function buildIdentityResolver(currentProducts, data){
    var catalogue = asArray(data.products);
    var currentById = new Map();
    currentProducts.forEach(function(product){
      if(product.productId) currentById.set(normalize(product.productId), product);
    });
    var currentNameLookup = createUniqueLookup(currentProducts, function(product){ return product.product; });
    var catalogueById = new Map();
    catalogue.forEach(function(product){
      var id = clean(product && (product.id || product.productId));
      if(id) catalogueById.set(normalize(id), product);
    });
    var catalogueNameLookup = createUniqueLookup(catalogue, function(product){
      return product && (product.name || product.product);
    });

    function resolve(line){
      var explicitId = clean(line && (line.productId || line.productID));
      var name = clean(line && (line.product || line.name));
      var category = clean(line && line.category);
      var catalogueProduct = explicitId ? catalogueById.get(normalize(explicitId)) : null;

      if(!explicitId && name){
        catalogueProduct = catalogueNameLookup.get(name);
        if(catalogueProduct){
          explicitId = clean(catalogueProduct.id || catalogueProduct.productId);
        }else if(catalogueNameLookup.ambiguous(name) || currentNameLookup.ambiguous(name)){
          return { resolved: false, ambiguous: true, name: name };
        }
      }

      if(explicitId){
        var currentByExplicitId = currentById.get(normalize(explicitId));
        if(currentByExplicitId){
          return {
            resolved: true,
            key: currentByExplicitId.key,
            productId: currentByExplicitId.productId,
            product: currentByExplicitId.product,
            category: currentByExplicitId.category,
            current: currentByExplicitId
          };
        }
        if(!catalogueProduct) catalogueProduct = catalogueById.get(normalize(explicitId));
        return {
          resolved: true,
          key: 'id:' + normalize(explicitId),
          productId: explicitId,
          product: clean(catalogueProduct && (catalogueProduct.name || catalogueProduct.product)) || name || explicitId,
          category: clean(catalogueProduct && catalogueProduct.category) || category || 'Uncategorised',
          current: null
        };
      }

      if(name){
        var currentByName = currentNameLookup.get(name);
        if(currentByName){
          return {
            resolved: true,
            key: currentByName.key,
            productId: currentByName.productId,
            product: currentByName.product,
            category: currentByName.category,
            current: currentByName
          };
        }
        return {
          resolved: true,
          key: 'name:' + normalize(name),
          productId: '',
          product: name,
          category: category || 'Uncategorised',
          current: null
        };
      }

      return { resolved: false, ambiguous: false, name: '' };
    }

    return {
      resolve: resolve,
      currentById: currentById,
      currentNameLookup: currentNameLookup
    };
  }

  function ensureSalesEntry(map, identity){
    if(!map.has(identity.key)){
      map.set(identity.key, {
        key: identity.key,
        productId: identity.productId || '',
        product: identity.product || 'Unnamed product',
        category: identity.category || 'Uncategorised',
        unitsSold: 0,
        lastSaleDate: null,
        lineCount: 0
      });
    }
    return map.get(identity.key);
  }

  function buildSalesHistory(data, resolver, startDay, endDay){
    var salesAvailable = Array.isArray(data.sales);
    var quickAvailable = Array.isArray(data.inventoryTxns);
    var salesMap = new Map();
    var completedSalesUsed = 0;
    var validLinesUsed = 0;
    var skippedLines = 0;
    var ambiguousLines = 0;
    var seenRecords = new Set();

    function recordKey(prefix, record, index){
      var stable = clean(record && (record.receiptNo || record.id || record.transactionId));
      return stable ? prefix + ':' + normalize(stable) : prefix + ':index:' + index;
    }

    function processRecord(prefix, record, index, lines){
      if(!activeRecord(record)) return;
      var day = localDay(record.date || record.createdAt || record.saleDate);
      if(!day || day < startDay || day > endDay) return;
      var key = recordKey(prefix, record, index);
      if(seenRecords.has(key)) return;
      seenRecords.add(key);
      var recordUsed = false;

      asArray(lines).forEach(function(line){
        var qty = positive(line && line.qty);
        if(qty == null){
          skippedLines += 1;
          return;
        }
        var identity = resolver.resolve(line);
        if(!identity.resolved){
          skippedLines += 1;
          if(identity.ambiguous) ambiguousLines += 1;
          return;
        }
        var entry = ensureSalesEntry(salesMap, identity);
        var nextUnits = safeAdd(entry.unitsSold, qty);
        if(nextUnits == null){
          skippedLines += 1;
          return;
        }
        entry.unitsSold = nextUnits;
        entry.lineCount += 1;
        if(!entry.lastSaleDate || day > entry.lastSaleDate) entry.lastSaleDate = day;
        validLinesUsed += 1;
        recordUsed = true;
      });

      if(recordUsed) completedSalesUsed += 1;
    }

    asArray(data.sales).forEach(function(sale, index){
      processRecord('receipt-sale', sale, index, sale && sale.lines);
    });

    asArray(data.inventoryTxns).forEach(function(transaction, index){
      var type = clean(transaction && transaction.type).toUpperCase();
      var subtype = clean(transaction && transaction.subtype).toUpperCase();
      if(type !== 'SALE_OUT' || subtype !== 'QUICK') return;
      processRecord('quick-sale', transaction, index, transaction && transaction.details && transaction.details.lines);
    });

    return {
      salesMap: salesMap,
      completedSalesUsed: completedSalesUsed,
      validLinesUsed: validLinesUsed,
      skippedLines: skippedLines,
      ambiguousLines: ambiguousLines,
      sourceAvailable: salesAvailable && quickAvailable,
      receiptSourceAvailable: salesAvailable,
      quickSourceAvailable: quickAvailable
    };
  }

  function buildIncomingOrders(data, resolver){
    var available = Array.isArray(data.purchaseOrders);
    var incoming = new Map();
    var seenOrders = new Set();
    var openOrdersUsed = 0;
    var linesUsed = 0;
    var skippedLines = 0;
    var duplicateLinesSkipped = 0;

    asArray(data.purchaseOrders).forEach(function(order, orderIndex){
      if(!order) return;
      var status = clean(order.status || 'OPEN').toUpperCase();
      if(status !== 'OPEN') return;
      if(order.committedAt || asArray(order.committedTransactionIds).length > 0) return;
      var stableOrderId = clean(order.id || order.poNo || order.purchaseOrderNo);
      var orderKey = stableOrderId ? normalize(stableOrderId) : 'index:' + orderIndex;
      if(seenOrders.has(orderKey)) return;
      seenOrders.add(orderKey);
      var usedOrder = false;
      var seenLineIds = new Set();

      asArray(order.lines).forEach(function(line){
        var lineId = clean(line && line.id);
        if(lineId){
          var normalizedLineId = normalize(lineId);
          if(seenLineIds.has(normalizedLineId)){
            duplicateLinesSkipped += 1;
            return;
          }
          seenLineIds.add(normalizedLineId);
        }
        var qty = positive(line && line.qty);
        if(qty == null){
          skippedLines += 1;
          return;
        }
        var identity = resolver.resolve(line);
        if(!identity.resolved){
          skippedLines += 1;
          return;
        }
        var nextIncoming = safeAdd(incoming.get(identity.key) || 0, qty);
        if(nextIncoming == null){
          skippedLines += 1;
          return;
        }
        incoming.set(identity.key, nextIncoming);
        linesUsed += 1;
        usedOrder = true;
      });

      if(usedOrder) openOrdersUsed += 1;
    });

    return {
      available: available,
      incoming: incoming,
      openOrdersUsed: openOrdersUsed,
      linesUsed: linesUsed,
      skippedLines: skippedLines,
      duplicateLinesSkipped: duplicateLinesSkipped
    };
  }

  function buildBaseModel(windowDays){
    var selectedWindow = validWindow(windowDays);
    var today = localDay(new Date());
    var startDay = new Date(today.getTime() - (selectedWindow - 1) * DAY_MS);
    var data = database();
    var frozenAggregate = getFrozenStockAggregate();
    var currentProducts = makeCurrentProducts(frozenAggregate);
    var resolver = buildIdentityResolver(currentProducts, data);
    var history = buildSalesHistory(data, resolver, startDay, today);
    var incoming = buildIncomingOrders(data, resolver);
    var matchedSales = new Set();

    var products = currentProducts.map(function(product){
      var sales = history.salesMap.get(product.key);
      if(sales) matchedSales.add(product.key);
      var unitsSold = sales ? sales.unitsSold : 0;
      var averageDailyVelocity = unitsSold / selectedWindow;
      var thirtyDayPace = averageDailyVelocity * 30;
      var estimatedDaysOfCover = averageDailyVelocity > 0
        ? product.remainingQty / averageDailyVelocity
        : null;
      return Object.assign({}, product, {
        unitsSold: unitsSold,
        averageDailyVelocity: averageDailyVelocity,
        thirtyDayPace: thirtyDayPace,
        estimatedDaysOfCover: estimatedDaysOfCover,
        lastSaleDate: sales ? sales.lastSaleDate : null,
        incomingOpenPOQty: incoming.available ? (incoming.incoming.get(product.key) || 0) : null,
        incomingKnown: incoming.available,
        currentlyOutOfStock: false
      });
    });

    var outOfStock = [];
    history.salesMap.forEach(function(sales, key){
      if(matchedSales.has(key) || !(sales.unitsSold > 0)) return;
      var averageDailyVelocity = sales.unitsSold / selectedWindow;
      outOfStock.push({
        key: sales.key,
        productId: sales.productId,
        product: sales.product,
        category: sales.category,
        remainingQty: 0,
        totalRemainingCost: null,
        weightedCost: null,
        listedPrice: null,
        unitsSold: sales.unitsSold,
        averageDailyVelocity: averageDailyVelocity,
        thirtyDayPace: averageDailyVelocity * 30,
        estimatedDaysOfCover: 0,
        lastSaleDate: sales.lastSaleDate,
        incomingOpenPOQty: incoming.available ? (incoming.incoming.get(sales.key) || 0) : null,
        incomingKnown: incoming.available,
        currentlyOutOfStock: true
      });
    });

    products.sort(stockVelocitySort);
    outOfStock.sort(function(a, b){
      return b.thirtyDayPace - a.thirtyDayPace || a.product.localeCompare(b.product);
    });

    runtime.renderCount += 1;
    runtime.planningSnapshot = null;
    runtime.baseModel = {
      windowDays: selectedWindow,
      startDay: startDay,
      endDay: today,
      products: products,
      outOfStock: outOfStock,
      history: history,
      incoming: incoming,
      diagnostics: {
        renderCount: runtime.renderCount,
        currentProductCount: products.length,
        saleProductCount: history.salesMap.size
      }
    };
    return runtime.baseModel;
  }

  function stockVelocitySort(a, b){
    var aMoving = a.averageDailyVelocity > 0;
    var bMoving = b.averageDailyVelocity > 0;
    if(aMoving !== bMoving) return aMoving ? -1 : 1;
    if(aMoving && bMoving){
      return a.estimatedDaysOfCover - b.estimatedDaysOfCover
        || b.unitsSold - a.unitsSold
        || a.product.localeCompare(b.product);
    }
    return b.unitsSold - a.unitsSold || a.product.localeCompare(b.product);
  }

  function productCells(product){
    return '<td><b>' + esc(product.product) + '</b></td>'
      + '<td>' + esc(displayId(product)) + '</td>'
      + '<td>' + esc(product.category) + '</td>';
  }

  function velocityRow(product){
    var cover = product.averageDailyVelocity > 0
      ? formatMetric(product.estimatedDaysOfCover, 1)
      : '—';
    var lastSale = product.lastSaleDate ? formatDay(product.lastSaleDate) : 'No sale in window';
    return '<tr data-velocity-row="1" data-product-key="' + esc(product.key) + '"'
      + ' data-product-id="' + esc(product.productId) + '"'
      + ' data-units-sold="' + product.unitsSold + '"'
      + ' data-average-daily-velocity="' + product.averageDailyVelocity + '"'
      + ' data-thirty-day-pace="' + product.thirtyDayPace + '"'
      + ' data-estimated-cover="' + (product.estimatedDaysOfCover == null ? '' : product.estimatedDaysOfCover) + '"'
      + ' data-remaining-qty="' + product.remainingQty + '"'
      + ' data-stock-cost="' + (product.totalRemainingCost == null ? '' : product.totalRemainingCost) + '"'
      + ' data-reference-cost="' + (product.weightedCost == null ? '' : product.weightedCost) + '">'
      + productCells(product)
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatQuantity(product.unitsSold) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.averageDailyVelocity, 3) + '</td>'
      + '<td class="num">' + cover + '</td>'
      + '<td>' + lastSale + '</td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '</tr>';
  }

  function fastMoverRow(product){
    return '<tr data-fast-mover-row="1" data-product-key="' + esc(product.key) + '" data-cover="' + product.estimatedDaysOfCover + '">'
      + '<td><b>' + esc(product.product) + '</b></td>'
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatQuantity(product.unitsSold) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.estimatedDaysOfCover, 1) + '</td>'
      + '<td>' + formatDay(product.lastSaleDate) + '</td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '</tr>';
  }

  function noSaleRow(product){
    return '<tr data-no-sale-row="1" data-product-key="' + esc(product.key) + '" data-stock-cost="' + (product.totalRemainingCost == null ? '' : product.totalRemainingCost) + '">'
      + productCells(product)
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + formatCurrency(product.totalRemainingCost) + '</td>'
      + '<td class="num">' + formatCurrency(product.listedPrice) + '</td>'
      + '<td>No sale in window</td>'
      + '</tr>';
  }

  function outOfStockRow(product){
    return '<tr data-out-of-stock-row="1" data-product-key="' + esc(product.key) + '" data-product-id="' + esc(product.productId) + '" data-units-sold="' + product.unitsSold + '">'
      + productCells(product)
      + '<td class="num">' + formatQuantity(product.unitsSold) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td>' + formatDay(product.lastSaleDate) + '</td>'
      + '</tr>';
  }

  function emptyRow(colspan, message){
    return '<tr><td colspan="' + colspan + '" class="muted">' + esc(message) + '</td></tr>';
  }

  function capitalSplit(model){
    var activeCapital = 0;
    var noSaleCapital = 0;
    var totalCapital = 0;
    var missingCosts = 0;
    var overflow = false;
    model.products.forEach(function(product){
      if(Number.isFinite(product.totalRemainingCost)){
        totalCapital = safeAdd(totalCapital, product.totalRemainingCost);
        if(product.averageDailyVelocity > 0) activeCapital = safeAdd(activeCapital, product.totalRemainingCost);
        else noSaleCapital = safeAdd(noSaleCapital, product.totalRemainingCost);
        if(totalCapital == null || activeCapital == null || noSaleCapital == null) overflow = true;
      }else{
        missingCosts += 1;
      }
    });
    return {
      activeCapital: activeCapital,
      noSaleCapital: noSaleCapital,
      totalCapital: totalCapital,
      activePercent: Number.isFinite(activeCapital) ? safeDivide(activeCapital * 100, totalCapital) : null,
      noSalePercent: Number.isFinite(noSaleCapital) ? safeDivide(noSaleCapital * 100, totalCapital) : null,
      missingCosts: missingCosts,
      overflow: overflow
    };
  }

  function renderBaseTables(model){
    var positive = model.products.filter(function(product){ return product.averageDailyVelocity > 0; }).slice(0, 10);
    var noSales = model.products.filter(function(product){ return !(product.averageDailyVelocity > 0); });
    noSales.sort(function(a, b){
      var aCost = Number.isFinite(a.totalRemainingCost) ? a.totalRemainingCost : -1;
      var bCost = Number.isFinite(b.totalRemainingCost) ? b.totalRemainingCost : -1;
      return bCost - aCost || a.product.localeCompare(b.product);
    });
    var capital = capitalSplit(model);
    var sourceMessage = model.history.sourceAvailable
      ? 'The application does not record a definitive sales-history coverage start marker, so completeness for the full selected window cannot be automatically confirmed.'
      : 'Sales-history coverage appears incomplete for part or all of the selected window because one or more operational sales sources are unavailable.';
    var identityMessage = model.history.ambiguousLines > 0
      ? ' ' + model.history.ambiguousLines + ' line(s) were excluded because their product name matched more than one product ID.'
      : '';
    var skippedMessage = model.history.skippedLines > 0
      ? ' ' + model.history.skippedLines + ' invalid or safely unmatchable line(s) were not used.'
      : '';
    var poMessage = model.incoming.available
      ? model.incoming.openOrdersUsed + ' open purchase order(s), ' + model.incoming.linesUsed + ' line(s), were included once in incoming quantities.'
      : 'Purchase-order data is unavailable; incoming quantity is shown as unavailable and is excluded from planning calculations.';

    setHTML('velocityCoverage',
      '<div><b>Effective sales window:</b> <span id="velocityEffectiveRange" data-window-days="' + model.windowDays + '" data-start="' + model.startDay.toISOString() + '" data-end="' + model.endDay.toISOString() + '">' + formatDay(model.startDay) + ' – ' + formatDay(model.endDay) + '</span></div>'
      + '<div><b>Valid completed sales used:</b> <span id="velocitySalesUsed" data-value="' + model.history.completedSalesUsed + '">' + model.history.completedSalesUsed.toLocaleString('en-GH') + '</span> (' + model.history.validLinesUsed.toLocaleString('en-GH') + ' product line(s)).</div>'
      + '<div class="muted" id="velocityCoverageNotice">' + esc(sourceMessage + identityMessage + skippedMessage) + '</div>'
      + '<div class="muted" id="velocityPONotice">' + esc(poMessage) + '</div>');

    setHTML('stockVelocityBody', model.products.length
      ? model.products.map(velocityRow).join('')
      : emptyRow(10, 'No current stock products are available for velocity analysis.'));
    setHTML('fastMoversBody', positive.length
      ? positive.map(fastMoverRow).join('')
      : emptyRow(7, 'No products have valid recent sales in the selected window.'));
    setHTML('noSalesBody', noSales.length
      ? noSales.map(noSaleRow).join('')
      : emptyRow(7, 'Every current product has at least one valid recent sale in this window.'));
    setHTML('outOfStockRecentBody', model.outOfStock.length
      ? model.outOfStock.map(outOfStockRow).join('')
      : emptyRow(6, 'No safely identified recently selling products are currently out of stock.'));
    setHTML('capitalActivityBody',
      '<tr data-capital-group="active" data-amount="' + dataNumber(capital.activeCapital) + '" data-percent="' + dataNumber(capital.activePercent) + '"><td>Stock with recent sales</td><td class="num">' + formatCurrency(capital.activeCapital) + '</td><td class="num">' + formatPercent(capital.activePercent) + '</td></tr>'
      + '<tr data-capital-group="no-sales" data-amount="' + dataNumber(capital.noSaleCapital) + '" data-percent="' + dataNumber(capital.noSalePercent) + '"><td>Stock without recent sales</td><td class="num">' + formatCurrency(capital.noSaleCapital) + '</td><td class="num">' + formatPercent(capital.noSalePercent) + '</td></tr>'
      + '<tr data-capital-group="total" data-amount="' + dataNumber(capital.totalCapital) + '"><td><b>Total current remaining stock cost</b></td><td class="num"><b>' + formatCurrency(capital.totalCapital) + '</b></td><td class="num"><b>' + (capital.totalCapital > 0 ? '100.0%' : '—') + '</b></td></tr>');
    setText('capitalCostCoverage', capital.overflow
      ? 'One or more capital totals are too large to display reliably and are shown as unavailable.'
      : capital.missingCosts > 0
      ? capital.missingCosts + ' current product(s) have no usable remaining-cost basis and are excluded from the capital split.'
      : 'All current products have a usable remaining-cost basis for this capital split.');
  }

  function integerInput(id, defaultWhenBlank){
    var element = document.getElementById(id);
    var raw = element ? clean(element.value) : '';
    if(raw === '' && defaultWhenBlank != null){
      return { state: 'valid', value: defaultWhenBlank, raw: raw };
    }
    if(raw === '') return { state: 'missing', value: null, raw: raw };
    var value = Number(raw);
    if(!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0){
      return { state: 'invalid', value: null, raw: raw };
    }
    return { state: 'valid', value: value, raw: raw };
  }

  function readPlanningInputs(){
    var lead = integerInput('velocityLeadTime', null);
    var safety = integerInput('velocitySafetyDays', 0);
    var target = integerInput('velocityTargetDays', null);
    if(lead.state === 'invalid' || safety.state === 'invalid' || target.state === 'invalid'){
      return {
        state: 'invalid',
        message: 'Enter whole numbers of zero or more for lead time, safety stock, and target coverage.'
      };
    }
    if(lead.state === 'missing' || target.state === 'missing'){
      return {
        state: 'incomplete',
        message: 'Planning Inputs Required: enter lead time and target coverage. Safety stock defaults to 0 days.'
      };
    }
    return {
      state: 'valid',
      leadTimeDays: lead.value,
      safetyDays: safety.value,
      targetCoverageDays: target.value
    };
  }

  function planningProduct(product, inputs){
    var average = product.averageDailyVelocity;
    var incoming = product.incomingKnown ? product.incomingOpenPOQty : null;
    var incomingForCalculation = incoming == null ? 0 : incoming;
    var reorderDays = safeAdd(inputs.leadTimeDays, inputs.safetyDays);
    var targetDays = reorderDays == null ? null : safeAdd(reorderDays, inputs.targetCoverageDays);
    var leadTimeDemand = average * inputs.leadTimeDays;
    var safetyStockDemand = average * inputs.safetyDays;
    var reorderPoint = average * reorderDays;
    var inventoryPosition = safeAdd(product.remainingQty, incomingForCalculation);
    var targetStockPosition = average * targetDays;
    var rawSuggested = targetStockPosition - inventoryPosition;
    var suggestedReorderQuantity = Math.max(0, Math.ceil(rawSuggested));
    var calculationsValid = [average, reorderDays, targetDays, leadTimeDemand, safetyStockDemand, reorderPoint, inventoryPosition, targetStockPosition, rawSuggested, suggestedReorderQuantity].every(Number.isFinite)
      && suggestedReorderQuantity <= Number.MAX_SAFE_INTEGER;
    var status;
    if(product.currentlyOutOfStock && average > 0) status = 'Currently Out of Stock';
    else if(!(average > 0)) status = 'No Recent Sales Basis';
    else if(inventoryPosition <= reorderPoint) status = 'At/Below Temporary Reorder Point';
    else status = 'Above Temporary Reorder Point';
    var referenceCapital = Number.isFinite(product.weightedCost) && calculationsValid
      ? suggestedReorderQuantity * product.weightedCost
      : null;
    if(!Number.isFinite(referenceCapital)) referenceCapital = null;
    return Object.assign({}, product, {
      planningValid: calculationsValid,
      leadTimeDemand: leadTimeDemand,
      safetyStockDemand: safetyStockDemand,
      reorderPoint: reorderPoint,
      inventoryPosition: inventoryPosition,
      targetStockPosition: targetStockPosition,
      suggestedReorderQuantity: suggestedReorderQuantity,
      referenceCapital: referenceCapital,
      planningStatus: status
    });
  }

  function planningRank(status){
    if(status === 'Currently Out of Stock') return 0;
    if(status === 'At/Below Temporary Reorder Point') return 1;
    if(status === 'Above Temporary Reorder Point') return 2;
    return 3;
  }

  function planningRow(product){
    var incomingLabel = product.incomingKnown ? formatQuantity(product.incomingOpenPOQty) : '—';
    return '<tr data-reorder-row="1" data-product-key="' + esc(product.key) + '"'
      + ' data-product-id="' + esc(product.productId) + '"'
      + ' data-current-stock="' + product.remainingQty + '"'
      + ' data-incoming-known="' + (product.incomingKnown ? 'true' : 'false') + '"'
      + ' data-incoming-qty="' + (product.incomingOpenPOQty == null ? '' : product.incomingOpenPOQty) + '"'
      + ' data-inventory-position="' + product.inventoryPosition + '"'
      + ' data-lead-demand="' + product.leadTimeDemand + '"'
      + ' data-safety-demand="' + product.safetyStockDemand + '"'
      + ' data-reorder-point="' + product.reorderPoint + '"'
      + ' data-target-position="' + product.targetStockPosition + '"'
      + ' data-suggested-reorder="' + product.suggestedReorderQuantity + '"'
      + ' data-reference-capital="' + (product.referenceCapital == null ? '' : product.referenceCapital) + '"'
      + ' data-status="' + esc(product.planningStatus) + '">'
      + productCells(product)
      + '<td class="num">' + formatQuantity(product.remainingQty) + '</td>'
      + '<td class="num">' + incomingLabel + '</td>'
      + '<td class="num">' + formatQuantity(product.inventoryPosition) + '</td>'
      + '<td class="num">' + formatMetric(product.thirtyDayPace, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.reorderPoint, 2) + '</td>'
      + '<td class="num">' + formatMetric(product.targetStockPosition, 2) + '</td>'
      + '<td class="num"><b>' + formatQuantity(product.suggestedReorderQuantity) + '</b></td>'
      + '<td class="num">' + formatCurrency(product.weightedCost) + '</td>'
      + '<td class="num">' + formatCurrency(product.referenceCapital) + '</td>'
      + '<td>' + esc(product.planningStatus) + '</td>'
      + '</tr>';
  }

  function hidePlanning(message, state){
    runtime.planningSnapshot = null;
    setText('velocityPlanningMessage', message);
    var messageElement = document.getElementById('velocityPlanningMessage');
    if(messageElement) messageElement.setAttribute('data-state', state);
    setHidden('velocityPlanningKpis', true);
    setHidden('velocityReorderPreview', true);
    setHTML('reorderPreviewBody', '');
  }

  function renderPlanning(model, inputs){
    runtime.scenarioCount += 1;
    var currentPlanning = model.products.map(function(product){ return planningProduct(product, inputs); });
    var outOfStockPlanning = model.outOfStock.map(function(product){ return planningProduct(product, inputs); });
    if(currentPlanning.concat(outOfStockPlanning).some(function(product){ return !product.planningValid; })){
      hidePlanning('Planning inputs or calculated quantities are too large for a reliable whole-unit scenario. Enter smaller values.', 'invalid');
      return;
    }
    runtime.planningSnapshot = {
      inputs: inputs,
      products: currentPlanning.map(function(product){
        return {
          key: product.key,
          inventoryPosition: product.inventoryPosition,
          suggestedReorderQuantity: product.suggestedReorderQuantity,
          planningStatus: product.planningStatus
        };
      }),
      outOfStockProducts: outOfStockPlanning.map(function(product){
        return {
          key: product.key,
          inventoryPosition: product.inventoryPosition,
          suggestedReorderQuantity: product.suggestedReorderQuantity,
          planningStatus: product.planningStatus
        };
      })
    };
    var preview = currentPlanning.concat(outOfStockPlanning);
    preview.sort(function(a, b){
      return planningRank(a.planningStatus) - planningRank(b.planningStatus)
        || b.suggestedReorderQuantity - a.suggestedReorderQuantity
        || ((a.estimatedDaysOfCover == null ? Infinity : a.estimatedDaysOfCover) - (b.estimatedDaysOfCover == null ? Infinity : b.estimatedDaysOfCover))
        || a.product.localeCompare(b.product);
    });

    var atOrBelow = currentPlanning.filter(function(product){
      return product.averageDailyVelocity > 0 && product.inventoryPosition <= product.reorderPoint;
    }).length;
    var suggestedUnits = currentPlanning.reduce(function(sum, product){
      return safeAdd(sum, product.suggestedReorderQuantity);
    }, 0);
    var referenceCapital = currentPlanning.reduce(function(sum, product){
      return safeAdd(sum, Number.isFinite(product.referenceCapital) ? product.referenceCapital : 0);
    }, 0);
    var noRecentSales = currentPlanning.filter(function(product){ return !(product.averageDailyVelocity > 0); }).length;

    setText('velocityPlanningMessage', 'Runtime-only scenario. Review the assumptions and suggested quantities; no purchase order is created or changed.');
    var messageElement = document.getElementById('velocityPlanningMessage');
    if(messageElement) messageElement.setAttribute('data-state', 'valid');
    setText('velocityKpiAtBelow', atOrBelow.toLocaleString('en-GH'));
    setText('velocityKpiSuggested', formatQuantity(suggestedUnits));
    setText('velocityKpiCapital', formatCurrency(referenceCapital));
    setText('velocityKpiNoSales', noRecentSales.toLocaleString('en-GH'));
    setData('velocityPlanningKpis', 'atBelow', atOrBelow);
    setData('velocityPlanningKpis', 'suggestedUnits', suggestedUnits);
    setData('velocityPlanningKpis', 'referenceCapital', referenceCapital);
    setData('velocityPlanningKpis', 'noRecentSales', noRecentSales);
    setData('velocityPlanningKpis', 'leadTimeDays', inputs.leadTimeDays);
    setData('velocityPlanningKpis', 'safetyDays', inputs.safetyDays);
    setData('velocityPlanningKpis', 'targetCoverageDays', inputs.targetCoverageDays);
    setHidden('velocityPlanningKpis', false);
    setHidden('velocityReorderPreview', false);
    setHTML('reorderPreviewBody', preview.length
      ? preview.map(planningRow).join('')
      : emptyRow(13, 'No safely identified products are available for a reorder preview.'));
  }

  function recalculate(){
    var model = runtime.baseModel;
    if(!model) return;
    var inputs = readPlanningInputs();
    if(inputs.state !== 'valid'){
      hidePlanning(inputs.message, inputs.state);
      return;
    }
    renderPlanning(model, inputs);
  }

  function changeWindow(value){
    var selected = validWindow(value);
    var select = document.getElementById('velocityWindow');
    if(select) select.value = String(selected);
    var model = buildBaseModel(selected);
    renderBaseTables(model);
    recalculate();
    notifySnapshotChanged();
  }

  function resetScenario(){
    setValue('velocityWindow', String(DEFAULT_WINDOW));
    setValue('velocityLeadTime', '');
    setValue('velocitySafetyDays', '');
    setValue('velocityTargetDays', '');
    changeWindow(DEFAULT_WINDOW);
  }

  function freezeSnapshotValue(value){
    if(value instanceof Date) return value.toISOString();
    if(Array.isArray(value)) return Object.freeze(value.map(freezeSnapshotValue));
    if(value && typeof value === 'object'){
      var copy = {};
      Object.keys(value).forEach(function(key){ copy[key] = freezeSnapshotValue(value[key]); });
      return Object.freeze(copy);
    }
    return value;
  }

  function currentPlanningSnapshot(){
    return runtime.planningSnapshot;
  }

  function ensureProductSnapshot(){
    if(!runtime.baseModel) buildBaseModel(DEFAULT_WINDOW);
    return productSnapshot();
  }

  function productSnapshot(){
    var model = runtime.baseModel;
    if(!model) return Object.freeze({ windowDays:null, startDay:null, endDay:null, products:Object.freeze([]), outOfStockProducts:Object.freeze([]), incoming:null, planning:null });
    function productValue(product){
      return {
        key: product.key,
        productId: product.productId,
        product: product.product,
        category: product.category,
        remainingQty: product.remainingQty,
        totalRemainingCost: product.totalRemainingCost,
        weightedCost: product.weightedCost,
        listedPrice: product.listedPrice,
        unitsSold: product.unitsSold,
        averageDailyVelocity: product.averageDailyVelocity,
        thirtyDayPace: product.thirtyDayPace,
        estimatedDaysOfCover: product.estimatedDaysOfCover,
        lastSaleDate: product.lastSaleDate,
        incomingOpenPOQty: product.incomingOpenPOQty,
        incomingKnown: product.incomingKnown,
        inventoryPosition: safeAdd(product.remainingQty, product.incomingKnown ? product.incomingOpenPOQty : 0)
      };
    }
    return freezeSnapshotValue({
      windowDays: model.windowDays,
      startDay: model.startDay,
      endDay: model.endDay,
      products: model.products.map(productValue),
      outOfStockProducts: model.outOfStock.map(productValue),
      incoming: {
        available:model.incoming.available,
        totalUnits:model.incoming.available ? Array.from(model.incoming.incoming.values()).reduce(function(sum, value){ return safeAdd(sum, value); }, 0) : null,
        openOrdersUsed:model.incoming.openOrdersUsed,
        linesUsed:model.incoming.linesUsed
      },
      planning: currentPlanningSnapshot()
    });
  }

  function notifySnapshotChanged(){
    try{
      window.dispatchEvent(new CustomEvent('zezms:stock-velocity-updated', {
        detail: { windowDays: runtime.baseModel ? runtime.baseModel.windowDays : null }
      }));
    }catch(_error){}
  }

  function setHTML(id, html){
    var element = document.getElementById(id);
    if(element) element.innerHTML = html;
  }

  function setText(id, value){
    var element = document.getElementById(id);
    if(element) element.textContent = value;
  }

  function setValue(id, value){
    var element = document.getElementById(id);
    if(element) element.value = value;
  }

  function setHidden(id, hidden){
    var element = document.getElementById(id);
    if(element) element.hidden = !!hidden;
  }

  function setData(id, key, value){
    var element = document.getElementById(id);
    if(element) element.setAttribute('data-' + key.replace(/[A-Z]/g, function(match){ return '-' + match.toLowerCase(); }), value == null ? '' : String(value));
  }

  function sectionHTML(){
    var model = buildBaseModel(DEFAULT_WINDOW);
    var positive = model.products.filter(function(product){ return product.averageDailyVelocity > 0; }).slice(0, 10);
    var noSales = model.products.filter(function(product){ return !(product.averageDailyVelocity > 0); });
    noSales.sort(function(a, b){
      var aCost = Number.isFinite(a.totalRemainingCost) ? a.totalRemainingCost : -1;
      var bCost = Number.isFinite(b.totalRemainingCost) ? b.totalRemainingCost : -1;
      return bCost - aCost || a.product.localeCompare(b.product);
    });
    var capital = capitalSplit(model);
    var sourceMessage = model.history.sourceAvailable
      ? 'The application does not record a definitive sales-history coverage start marker, so completeness for the full selected window cannot be automatically confirmed.'
      : 'Sales-history coverage appears incomplete for part or all of the selected window because one or more operational sales sources are unavailable.';
    var identityMessage = model.history.ambiguousLines > 0
      ? ' ' + model.history.ambiguousLines + ' line(s) were excluded because their product name matched more than one product ID.'
      : '';
    var skippedMessage = model.history.skippedLines > 0
      ? ' ' + model.history.skippedLines + ' invalid or safely unmatchable line(s) were not used.'
      : '';
    var poMessage = model.incoming.available
      ? model.incoming.openOrdersUsed + ' open purchase order(s), ' + model.incoming.linesUsed + ' line(s), were included once in incoming quantities.'
      : 'Purchase-order data is unavailable; incoming quantity is shown as unavailable and is excluded from planning calculations.';

    return ''
      + '<div class="divider"></div>'
      + '<section id="stockVelocityLab" data-stage="4A" data-version="' + VERSION + '" data-build="' + BUILD + '" aria-labelledby="stockVelocityHeading">'
      + '  <style id="stockVelocityResponsiveStyles">@media(max-width:720px){#stockVelocityLab .grid.g4{grid-template-columns:minmax(0,1fr)!important}}html.zezms-phone-layout #stockVelocityLab .table-wrap{overflow-x:auto!important;overflow-y:auto!important}html.zezms-phone-layout #stockVelocityLab .table-wrap table{width:max-content!important;max-width:none!important;min-width:720px!important}</style>'
      + '  <div class="row wrap" style="justify-content:space-between;align-items:flex-start">'
      + '    <div>'
      + '      <h3 id="stockVelocityHeading" style="margin:0">Stock Velocity &amp; Reorder Planning</h3>'
      + '      <div class="muted">Read-only analysis of recent sales velocity, current stock and temporary replenishment assumptions. Nothing here creates or changes a Purchase Order.</div>'
      + '    </div>'
      + '    <span class="pill">Stage 4A · Runtime only</span>'
      + '  </div>'
      + '  <div class="notice" style="margin-top:12px"><b>Sales-history limitation:</b> sale lines created before product IDs were recorded can only be matched by an exact, unambiguous canonical product name. Ambiguous matches are excluded rather than merged.</div>'
      + '  <div class="grid g4" style="margin-top:12px">'
      + '    <div class="field"><label for="velocityWindow">Sales lookback</label><select id="velocityWindow" onchange="ZEZMS.stockVelocity.changeWindow(this.value)"><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90" selected>Last 90 days</option></select></div>'
      + '    <div class="field"><label for="velocityLeadTime">Supplier lead time (days)</label><input id="velocityLeadTime" type="number" min="0" step="1" inputmode="numeric" placeholder="Required" oninput="ZEZMS.stockVelocity.recalculate()"></div>'
      + '    <div class="field"><label for="velocitySafetyDays">Safety Buffer — Days</label><input id="velocitySafetyDays" type="number" min="0" step="1" inputmode="numeric" value="" placeholder="0" data-semantic-default="0" oninput="ZEZMS.stockVelocity.recalculate()"></div>'
      + '    <div class="field"><label for="velocityTargetDays">Target Cover After Receipt — Days</label><input id="velocityTargetDays" type="number" min="0" step="1" inputmode="numeric" placeholder="Required" oninput="ZEZMS.stockVelocity.recalculate()"></div>'
      + '  </div>'
      + '  <div class="row wrap" style="margin-top:10px"><button class="btn primary" type="button" onclick="ZEZMS.stockVelocity.recalculate()">Recalculate Scenario</button><button class="btn" type="button" onclick="ZEZMS.stockVelocity.resetScenario()">Reset Reorder Planning</button></div>'
      + '  <div id="velocityPlanningMessage" class="muted" data-state="incomplete" style="margin-top:8px">Planning Inputs Required: enter lead time and target coverage. Safety stock defaults to 0 days.</div>'
      + '  <div id="velocityCoverage" class="notice" style="margin-top:12px">'
      + '    <div><b>Effective sales window:</b> <span id="velocityEffectiveRange" data-window-days="' + model.windowDays + '" data-start="' + model.startDay.toISOString() + '" data-end="' + model.endDay.toISOString() + '">' + formatDay(model.startDay) + ' – ' + formatDay(model.endDay) + '</span></div>'
      + '    <div><b>Valid completed sales used:</b> <span id="velocitySalesUsed" data-value="' + model.history.completedSalesUsed + '">' + model.history.completedSalesUsed.toLocaleString('en-GH') + '</span> (' + model.history.validLinesUsed.toLocaleString('en-GH') + ' product line(s)).</div>'
      + '    <div class="muted" id="velocityCoverageNotice">' + esc(sourceMessage + identityMessage + skippedMessage) + '</div>'
      + '    <div class="muted" id="velocityPONotice">' + esc(poMessage) + '</div>'
      + '  </div>'
      + '  <div id="velocityPlanningKpis" class="grid g4" style="margin-top:12px" hidden>'
      + '    <div class="card kpi"><div class="sub">Products at/below reorder point</div><div class="val" id="velocityKpiAtBelow">0</div></div>'
      + '    <div class="card kpi"><div class="sub">Suggested reorder units</div><div class="val" id="velocityKpiSuggested">0</div></div>'
      + '    <div class="card kpi"><div class="sub">Reference reorder capital</div><div class="val" id="velocityKpiCapital">—</div></div>'
      + '    <div class="card kpi"><div class="sub">Products with no recent sales</div><div class="val" id="velocityKpiNoSales">0</div></div>'
      + '  </div>'
      + '  <h4 style="margin:18px 0 8px">Stock Velocity &amp; Cover</h4>'
      + '  <div class="muted" style="margin-bottom:6px">Days of Cover assumes the recent average sales pace continues. Actual demand may change.</div>'
      + '  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="num">Current Qty</th><th class="num">Units Sold in Window</th><th class="num">30-Day Sales Pace</th><th class="num">Avg Units/Day</th><th class="num">Estimated Days of Cover</th><th>Last Sale Date</th><th class="num">Remaining Stock Cost</th></tr></thead><tbody id="stockVelocityBody">'
      + (model.products.length ? model.products.map(velocityRow).join('') : emptyRow(10, 'No current stock products are available for velocity analysis.'))
      + '  </tbody></table></div>'
      + '  <h4 style="margin:18px 0 8px">Fast Movers — Lowest Stock Cover</h4>'
      + '  <div class="muted" style="margin-bottom:6px">Products with positive recent velocity, ordered by the lowest estimated days of cover.</div>'
      + '  <div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Current Qty</th><th class="num">Units Sold in Window</th><th class="num">30-Day Sales Pace</th><th class="num">Estimated Days of Cover</th><th>Last Sale Date</th><th class="num">Stock Cost Value</th></tr></thead><tbody id="fastMoversBody">'
      + (positive.length ? positive.map(fastMoverRow).join('') : emptyRow(7, 'No products have valid recent sales in the selected window.'))
      + '  </tbody></table></div>'
      + '  <h4 style="margin:18px 0 8px">Current Stock with No Sales in Lookback</h4>'
      + '  <div class="notice" style="margin-bottom:6px">No sales in the selected window does not necessarily mean the product is obsolete or should be cleared.</div>'
      + '  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="num">Current Qty</th><th class="num">Remaining Stock Cost</th><th class="num">Listed Price</th><th>Last Sale Date</th></tr></thead><tbody id="noSalesBody">'
      + (noSales.length ? noSales.map(noSaleRow).join('') : emptyRow(7, 'Every current product has at least one valid recent sale in this window.'))
      + '  </tbody></table></div>'
      + '  <h4 style="margin:18px 0 8px">Recently Selling but Out of Stock</h4>'
      + '  <div class="muted" style="margin-bottom:6px">Shown only when a recently sold product can be identified safely and has no current positive stock aggregate. This is factual history, not a recommendation.</div>'
      + '  <div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="num">Units sold</th><th class="num">30-day pace</th><th>Last sale</th></tr></thead><tbody id="outOfStockRecentBody">'
      + (model.outOfStock.length ? model.outOfStock.map(outOfStockRow).join('') : emptyRow(6, 'No safely identified recently selling products are currently out of stock.'))
      + '  </tbody></table></div>'
      + '  <h4 style="margin:18px 0 8px">Capital by Sales Activity</h4>'
      + '  <div class="table-wrap"><table><thead><tr><th>Capital group</th><th class="num">Remaining stock cost</th><th class="num">Share</th></tr></thead><tbody id="capitalActivityBody">'
      + '    <tr data-capital-group="active" data-amount="' + dataNumber(capital.activeCapital) + '" data-percent="' + dataNumber(capital.activePercent) + '"><td>Stock with recent sales</td><td class="num">' + formatCurrency(capital.activeCapital) + '</td><td class="num">' + formatPercent(capital.activePercent) + '</td></tr>'
      + '    <tr data-capital-group="no-sales" data-amount="' + dataNumber(capital.noSaleCapital) + '" data-percent="' + dataNumber(capital.noSalePercent) + '"><td>Stock without recent sales</td><td class="num">' + formatCurrency(capital.noSaleCapital) + '</td><td class="num">' + formatPercent(capital.noSalePercent) + '</td></tr>'
      + '    <tr data-capital-group="total" data-amount="' + dataNumber(capital.totalCapital) + '"><td><b>Total current remaining stock cost</b></td><td class="num"><b>' + formatCurrency(capital.totalCapital) + '</b></td><td class="num"><b>' + (capital.totalCapital > 0 ? '100.0%' : '—') + '</b></td></tr>'
      + '  </tbody></table></div>'
      + '  <div id="capitalCostCoverage" class="muted" style="margin-top:6px">' + esc(capital.overflow ? 'One or more capital totals are too large to display reliably and are shown as unavailable.' : capital.missingCosts > 0 ? capital.missingCosts + ' current product(s) have no usable remaining-cost basis and are excluded from the capital split.' : 'All current products have a usable remaining-cost basis for this capital split.') + '</div>'
      + '  <div id="velocityReorderPreview" hidden>'
      + '    <h4 style="margin:18px 0 8px">Temporary Reorder Preview</h4>'
      + '    <div class="notice" style="margin-bottom:6px"><b>Suggested Reorder Qty — Temporary Scenario.</b> This is an advisory quantity based on recent sales pace and the temporary planning assumptions. It does not create a Purchase Order. <b>Reference Restock Capital:</b> This uses the current weighted remaining stock cost as a reference. Actual supplier purchase cost may differ.</div>'
      + '    <div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Category</th><th class="num">Current Qty</th><th class="num">Incoming Open PO</th><th class="num">Inventory Position</th><th class="num">30-Day Sales Pace</th><th class="num">Temporary Reorder Point</th><th class="num">Target Position</th><th class="num">Suggested Reorder Qty</th><th class="num">Reference Unit Cost</th><th class="num">Reference Restock Capital</th><th>Status</th></tr></thead><tbody id="reorderPreviewBody"></tbody></table></div>'
      + '  </div>'
      + '</section>';
  }

  function appendSection(html){
    var marker = html.lastIndexOf('</section>');
    if(marker < 0) return html + sectionHTML();
    return html.slice(0, marker) + sectionHTML() + html.slice(marker);
  }

  function install(){
    if(typeof window.viewDashboard !== 'function') return false;
    if(window.viewDashboard.__zezmsStockVelocityV390) return true;
    var original = window.viewDashboard;
    var wrapped = function(){
      var html = original.apply(this, arguments);
      if(typeof html !== 'string' || html.indexOf('id="stockVelocityLab"') >= 0) return html;
      return appendSection(html);
    };
    Object.keys(original).forEach(function(key){
      try{ wrapped[key] = original[key]; }catch(_error){}
    });
    wrapped.__zezmsStockVelocityV390 = true;
    wrapped.__zezmsStockVelocityV390Original = original;
    window.viewDashboard = wrapped;
    return true;
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.stockVelocity = Object.freeze({
    version: VERSION,
    build: BUILD,
    release: RELEASE,
    install: install,
    changeWindow: changeWindow,
    recalculate: recalculate,
    resetScenario: resetScenario,
    getProductSnapshot: productSnapshot,
    ensureProductSnapshot: ensureProductSnapshot,
    getRuntimeSnapshot: function(){
      var model = runtime.baseModel;
      return Object.freeze({
        windowDays: model ? model.windowDays : null,
        currentProductCount: model ? model.products.length : 0,
        outOfStockCount: model ? model.outOfStock.length : 0,
        completedSalesUsed: model ? model.history.completedSalesUsed : 0,
        renderCount: runtime.renderCount,
        scenarioCount: runtime.scenarioCount
      });
    }
  });

  install();
})();

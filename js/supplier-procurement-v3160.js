/* ZEZMS TradeFlow Owner Edition v3.16.0
   Stage 6B — Supplier & Procurement Intelligence + Replenishment Planning.
   Derived intelligence and runtime planning only. */
(function () {
  'use strict';

  var VERSION = '3.16.0';
  var BUILD = '20260822-supplier-procurement-intelligence-r51';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var HISTORY_WINDOWS = [30, 90, 180, 365, 0];
  var runtime = {
    windowDays: 365,
    model: null,
    planning: Object.create(null),
    budget: '',
    buildCount: 0,
    lastBuildMs: 0
  };

  function database() {
    try { return typeof DB === 'object' && DB ? DB : {}; } catch (_) { return {}; }
  }
  function list(value) { return Array.isArray(value) ? value : []; }
  function clean(value) { return String(value == null ? '' : value).trim(); }
  function lower(value) { return clean(value).toLocaleLowerCase(); }
  function number(value) {
    if (value == null || (typeof value === 'string' && clean(value) === '')) return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function positive(value) { var parsed = number(value); return parsed != null && parsed > 0 ? parsed : null; }
  function nonNegative(value) { var parsed = number(value); return parsed != null && parsed >= 0 ? parsed : null; }
  function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  function day(value) {
    if (!value) return null;
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  function isoDay(value) { var parsed = day(value); return parsed ? parsed.toISOString().slice(0, 10) : ''; }
  function calendarDays(start, end) {
    var first = day(start), last = day(end);
    if (!first || !last) return null;
    var result = Math.round((last.getTime() - first.getTime()) / DAY_MS);
    return result >= 0 ? result : null;
  }
  function active(record) {
    var status = clean(record && record.status).toUpperCase();
    return status !== 'VOID' && status !== 'UNDONE' && status !== 'CANCELLED';
  }
  function esc(value) {
    return clean(value).replace(/[&<>"']/g, function (character) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ''); }
  function money(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : 'GH₵ ' + Number(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function qty(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-GH', { minimumFractionDigits:0, maximumFractionDigits:2 });
  }
  function percent(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-GH', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%';
  }
  function dateLabel(value) {
    var parsed = day(value);
    return parsed ? parsed.toLocaleDateString('en-GH') : '—';
  }
  function encoded(value) { return encodeURIComponent(clean(value)).replace(/'/g, '%27'); }
  function decoded(value) { try { return decodeURIComponent(clean(value)); } catch (_) { return clean(value); } }
  function validWindow(value) { var parsed = Number(value); return HISTORY_WINDOWS.indexOf(parsed) >= 0 ? parsed : 365; }
  function supplierIdentity(order, creditors) {
    var supplierId = clean(order && order.supplierId);
    var creditor = supplierId ? creditors.byId.get(lower(supplierId)) : null;
    var name = clean(creditor && creditor.name) || clean(order && order.supplierName);
    if (supplierId) return { key:'id:' + lower(supplierId), supplierId:supplierId, name:name || supplierId, contact:clean(creditor && creditor.contact) || clean(order && order.supplierContact) };
    if (!name) return null;
    var exact = creditors.exactName.get(lower(name));
    if (exact && exact.length === 1 && clean(exact[0].id)) {
      return { key:'id:' + lower(exact[0].id), supplierId:clean(exact[0].id), name:clean(exact[0].name) || name, contact:clean(exact[0].contact) || clean(order && order.supplierContact) };
    }
    return { key:'name:' + lower(name), supplierId:'', name:name, contact:clean(order && order.supplierContact) };
  }
  function creditorIndex(db) {
    var byId = new Map(), exactName = new Map();
    list(db.creditors).forEach(function (supplier) {
      var id = clean(supplier && supplier.id), name = clean(supplier && supplier.name);
      if (id) byId.set(lower(id), supplier);
      if (name) {
        var key = lower(name);
        if (!exactName.has(key)) exactName.set(key, []);
        exactName.get(key).push(supplier);
      }
    });
    return { byId:byId, exactName:exactName };
  }
  function productIndex(db) {
    var byId = new Map(), exactName = new Map();
    list(db.products).forEach(function (product) {
      var id = clean(product && (product.id || product.productId));
      var name = clean(product && (product.name || product.product));
      if (id) byId.set(lower(id), product);
      if (name) {
        var key = lower(name);
        if (!exactName.has(key)) exactName.set(key, []);
        exactName.get(key).push(product);
      }
    });
    return { byId:byId, exactName:exactName };
  }
  function resolveProduct(db, indexes, transaction, order) {
    var details = transaction && transaction.details || {};
    var stockRow = clean(details.stockRowId) ? list(db.stockRows).find(function (row) { return clean(row && row.id) === clean(details.stockRowId); }) : null;
    var explicitId = clean(transaction && (transaction.productId || transaction.productID)) || clean(stockRow && stockRow.productId);
    var name = clean(transaction && (transaction.product || transaction.productName || transaction.name)) || clean(stockRow && stockRow.productName);
    var matchingLines = list(order && order.lines).filter(function (line) {
      if (explicitId && clean(line && line.productId) === explicitId) return true;
      return name && lower(line && (line.product || line.productName)) === lower(name);
    });
    if (!explicitId && matchingLines.length === 1) explicitId = clean(matchingLines[0].productId);
    var catalog = explicitId ? indexes.byId.get(lower(explicitId)) : null;
    if (!catalog && name) {
      var exact = indexes.exactName.get(lower(name));
      if (exact && exact.length === 1) catalog = exact[0];
    }
    if (catalog) {
      explicitId = clean(catalog.id || catalog.productId) || explicitId;
      name = clean(catalog.name || catalog.product) || name;
    }
    if (!explicitId && !name) return null;
    return {
      key: explicitId ? 'id:' + lower(explicitId) : 'name:' + lower(name),
      productId:explicitId,
      product:name || explicitId,
      category:clean(catalog && catalog.category) || clean(stockRow && stockRow.category) || clean(matchingLines[0] && matchingLines[0].category)
    };
  }
  function orderIndexes(db) {
    var byId = new Map();
    list(db.purchaseOrders).forEach(function (order, index) {
      [order && order.id, order && order.poNo, order && order.purchaseOrderNo].forEach(function (value) {
        if (clean(value)) byId.set(lower(value), { order:order, index:index });
      });
    });
    return byId;
  }
  function velocitySnapshot() {
    try {
      var velocity = window.ZEZMS && window.ZEZMS.stockVelocity;
      if (velocity && typeof velocity.ensureProductSnapshot === 'function') return velocity.ensureProductSnapshot();
      if (velocity && typeof velocity.getProductSnapshot === 'function') return velocity.getProductSnapshot();
    } catch (_) {}
    return { products:[], planning:null };
  }
  function snapshotIndex(snapshot) {
    var byId = new Map(), byName = new Map(), planning = new Map();
    list(snapshot && snapshot.products).concat(list(snapshot && snapshot.outOfStockProducts)).forEach(function (product) {
      if (clean(product.productId)) byId.set(lower(product.productId), product);
      if (clean(product.product)) byName.set(lower(product.product), product);
    });
    list(snapshot && snapshot.planning && snapshot.planning.products).concat(list(snapshot && snapshot.planning && snapshot.planning.outOfStockProducts)).forEach(function (item) { planning.set(clean(item.key), item); });
    return { byId:byId, byName:byName, planning:planning };
  }
  function snapshotProduct(index, product) {
    return (clean(product.productId) && index.byId.get(lower(product.productId))) || index.byName.get(lower(product.product)) || null;
  }
  function sourceObservations(db, windowDays, now, indexes) {
    var orderMap = orderIndexes(db), seen = new Set(), observations = [], completedOrderIds = new Set();
    var end = day(now) || day(new Date()), start = windowDays ? new Date(end.getTime() - windowDays * DAY_MS) : null;
    list(db.inventoryTxns).forEach(function (transaction, index) {
      if (!active(transaction)) return;
      if (clean(transaction.type).toUpperCase() !== 'STOCK_IN' || clean(transaction.subtype).toUpperCase() !== 'PURCHASE_ORDER') return;
      var transactionId = clean(transaction.id || transaction.transactionId);
      var dedupe = transactionId ? 'id:' + lower(transactionId) : 'index:' + index;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      var orderId = clean(transaction.purchaseOrderId || transaction.details && transaction.details.purchaseOrderId || transaction.reference);
      var orderEntry = orderMap.get(lower(orderId));
      var order = orderEntry && orderEntry.order;
      if (!order || clean(order.status).toUpperCase() !== 'COMMITTED') return;
      var supplier = supplierIdentity(order, indexes.creditors);
      var product = resolveProduct(db, indexes.products, transaction, order);
      var purchaseDate = day(transaction.date || order.committedAt || order.date);
      var quantity = positive(transaction.qty);
      var unitCost = positive(transaction.details && transaction.details.uCost);
      var amount = positive(transaction.amount);
      if (unitCost == null && amount != null && quantity != null) unitCost = amount / quantity;
      if (amount == null && unitCost != null && quantity != null) amount = quantity * unitCost;
      if (!supplier || !product || !purchaseDate || quantity == null || unitCost == null || amount == null) return;
      if (purchaseDate > end || (start && purchaseDate < start)) return;
      observations.push({
        id:transactionId || dedupe,
        orderId:clean(order.id || order.poNo),
        poNo:clean(order.poNo || order.id),
        date:purchaseDate.toISOString(),
        timestamp:purchaseDate.getTime(),
        supplierKey:supplier.key,
        supplierId:supplier.supplierId,
        supplier:supplier.name,
        productKey:product.key,
        productId:product.productId,
        product:product.product,
        category:product.category,
        quantity:quantity,
        unitCost:unitCost,
        purchaseValue:round2(amount)
      });
      completedOrderIds.add(clean(order.id || order.poNo));
    });
    observations.sort(function (a, b) { return b.timestamp - a.timestamp || a.id.localeCompare(b.id); });
    return { observations:observations, completedOrderIds:completedOrderIds, start:start, end:end };
  }
  function openOrders(db, indexes, now) {
    var today = day(now) || day(new Date());
    return list(db.purchaseOrders).filter(function (order) { return clean(order && order.status || 'OPEN').toUpperCase() === 'OPEN'; }).map(function (order) {
      var supplier = supplierIdentity(order, indexes.creditors) || { key:'unknown:' + lower(order.id || order.poNo), supplierId:'', name:'Unknown supplier' };
      var lines = list(order.lines).map(function (line) {
        var quantity = positive(line && line.qty);
        var unitCost = positive(line && line.unitCost);
        return {
          productId:clean(line && line.productId), product:clean(line && (line.product || line.productName)),
          quantity:quantity || 0, unitCost:unitCost, value:quantity != null && unitCost != null ? round2(quantity * unitCost) : 0
        };
      }).filter(function (line) { return line.quantity > 0; });
      var created = day(order.date || order.createdAt);
      var expected = day(order.expectedDate || order.dueDate || order.deliveryDate);
      var age = created ? calendarDays(created, today) : null;
      var due = '—';
      if (expected) {
        var dueDays = calendarDays(today, expected);
        if (expected.getTime() === today.getTime()) due = 'Due Today';
        else if (expected < today) due = 'Overdue';
        else if (dueDays != null) due = 'Upcoming';
      }
      return {
        id:clean(order.id || order.poNo), poNo:clean(order.poNo || order.id), supplierKey:supplier.key,
        supplierId:supplier.supplierId, supplier:supplier.name, createdDate:created ? created.toISOString() : '',
        expectedDate:expected ? expected.toISOString() : '', ageDays:age,
        ageLabel:age == null ? '—' : age === 0 ? 'Created today' : age + ' days open', dueStatus:due,
        lines:lines, products:Array.from(new Set(lines.map(function (line) { return line.product; }).filter(Boolean))),
        unitsOrdered:lines.reduce(function (sum, line) { return sum + line.quantity; }, 0),
        unitsRemaining:lines.reduce(function (sum, line) { return sum + line.quantity; }, 0),
        remainingValue:round2(lines.reduce(function (sum, line) { return sum + line.value; }, 0))
      };
    }).sort(function (a, b) { return (a.createdDate || '').localeCompare(b.createdDate || '') || a.poNo.localeCompare(b.poNo); });
  }
  function validLeadTimes(db, completedOrderIds, indexes, windowDays, now) {
    var end = day(now) || day(new Date()), start = windowDays ? new Date(end.getTime() - windowDays * DAY_MS) : null;
    var result = [];
    list(db.purchaseOrders).forEach(function (order) {
      if (clean(order.status).toUpperCase() !== 'COMMITTED') return;
      if (!completedOrderIds.has(clean(order.id || order.poNo))) return;
      var created = day(order.date || order.createdAt), completed = day(order.committedAt || order.receivedAt || order.completedAt);
      var days = calendarDays(created, completed);
      var supplier = supplierIdentity(order, indexes.creditors);
      if (!supplier || days == null || !completed || completed > end || (start && completed < start)) return;
      result.push({ supplierKey:supplier.key, supplierId:supplier.supplierId, supplier:supplier.name, orderId:clean(order.id || order.poNo), days:days });
    });
    return result;
  }
  function initialSupplier(key, observation) {
    return { key:key, supplierId:observation.supplierId, supplier:observation.supplier, unitsPurchased:0, purchaseValue:0, transactionIds:new Set(), productKeys:new Set(), lastPurchaseDate:'', leadTimes:[], openOrders:0, openPOValue:0, observations:[] };
  }
  function initialProduct(key, observation) {
    return { key:key, productId:observation.productId, product:observation.product, category:observation.category, unitsPurchased:0, purchaseValue:0, supplierKeys:new Set(), observations:[] };
  }
  function buildModel(db, options) {
    var started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    db = db || {};
    options = options || {};
    var windowDays = validWindow(options.windowDays);
    var now = options.now || new Date();
    var indexes = { creditors:creditorIndex(db), products:productIndex(db) };
    var actual = sourceObservations(db, windowDays, now, indexes);
    var open = openOrders(db, indexes, now);
    var snapshot = options.velocitySnapshot || { products:[], planning:null };
    var velocity = snapshotIndex(snapshot);
    var suppliers = new Map(), products = new Map();
    actual.observations.forEach(function (observation) {
      if (!suppliers.has(observation.supplierKey)) suppliers.set(observation.supplierKey, initialSupplier(observation.supplierKey, observation));
      if (!products.has(observation.productKey)) products.set(observation.productKey, initialProduct(observation.productKey, observation));
      var supplier = suppliers.get(observation.supplierKey), product = products.get(observation.productKey);
      supplier.unitsPurchased += observation.quantity;
      supplier.purchaseValue += observation.purchaseValue;
      supplier.transactionIds.add(observation.orderId);
      supplier.productKeys.add(observation.productKey);
      supplier.observations.push(observation);
      if (!supplier.lastPurchaseDate || observation.date > supplier.lastPurchaseDate) supplier.lastPurchaseDate = observation.date;
      product.unitsPurchased += observation.quantity;
      product.purchaseValue += observation.purchaseValue;
      product.supplierKeys.add(observation.supplierKey);
      product.observations.push(observation);
    });
    open.forEach(function (order) {
      if (!suppliers.has(order.supplierKey)) suppliers.set(order.supplierKey, { key:order.supplierKey, supplierId:order.supplierId, supplier:order.supplier, unitsPurchased:0, purchaseValue:0, transactionIds:new Set(), productKeys:new Set(), lastPurchaseDate:'', leadTimes:[], openOrders:0, openPOValue:0, observations:[] });
      var supplier = suppliers.get(order.supplierKey);
      supplier.openOrders += 1;
      supplier.openPOValue += order.remainingValue;
    });
    validLeadTimes(db, actual.completedOrderIds, indexes, windowDays, now).forEach(function (entry) {
      if (suppliers.has(entry.supplierKey)) suppliers.get(entry.supplierKey).leadTimes.push(entry.days);
    });
    var totalValue = round2(actual.observations.reduce(function (sum, observation) { return sum + observation.purchaseValue; }, 0));
    var totalUnits = actual.observations.reduce(function (sum, observation) { return sum + observation.quantity; }, 0);
    var supplierList = Array.from(suppliers.values()).map(function (supplier) {
      supplier.purchaseValue = round2(supplier.purchaseValue);
      supplier.purchaseShare = totalValue > 0 ? supplier.purchaseValue / totalValue * 100 : 0;
      supplier.completedTransactions = supplier.transactionIds.size;
      supplier.distinctProducts = supplier.productKeys.size;
      supplier.averagePurchaseValue = supplier.completedTransactions ? supplier.purchaseValue / supplier.completedTransactions : null;
      supplier.averageLeadTime = supplier.leadTimes.length ? supplier.leadTimes.reduce(function (sum, value) { return sum + value; }, 0) / supplier.leadTimes.length : null;
      supplier.leadTimeSampleSize = supplier.leadTimes.length;
      supplier.productsSupplied = Array.from(supplier.productKeys).map(function (key) {
        var history = supplier.observations.filter(function (observation) { return observation.productKey === key; }).sort(function (a, b) { return b.timestamp - a.timestamp; });
        var first = history[0], lowest = history.slice().sort(function (a, b) { return a.unitCost - b.unitCost || b.timestamp - a.timestamp; })[0];
        return { productKey:key, productId:first.productId, product:first.product, lastPurchaseDate:first.date, lastUnitCost:first.unitCost, lowestUnitCost:lowest.unitCost, unitsPurchased:history.reduce(function (sum, item) { return sum + item.quantity; }, 0), purchaseValue:round2(history.reduce(function (sum, item) { return sum + item.purchaseValue; }, 0)) };
      }).sort(function (a, b) { return b.purchaseValue - a.purchaseValue || a.product.localeCompare(b.product); });
      return supplier;
    }).sort(function (a, b) { return b.purchaseValue - a.purchaseValue || b.unitsPurchased - a.unitsPurchased || a.supplier.localeCompare(b.supplier); });
    var productList = Array.from(products.values()).map(function (product) {
      product.observations.sort(function (a, b) { return b.timestamp - a.timestamp || a.id.localeCompare(b.id); });
      var latest = product.observations[0] || null, previous = product.observations[1] || null;
      var lowest = product.observations.slice().sort(function (a, b) { return a.unitCost - b.unitCost || b.timestamp - a.timestamp; })[0] || null;
      var velocityProduct = snapshotProduct(velocity, product);
      var plan = velocityProduct ? velocity.planning.get(clean(velocityProduct.key)) : null;
      product.currentStock = velocityProduct ? nonNegative(velocityProduct.remainingQty) : null;
      product.remainingStockCost = velocityProduct ? nonNegative(velocityProduct.totalRemainingCost) : null;
      product.thirtyDayPace = velocityProduct ? nonNegative(velocityProduct.thirtyDayPace) : null;
      product.daysCover = velocityProduct ? nonNegative(velocityProduct.estimatedDaysOfCover) : null;
      product.incomingQty = velocityProduct && velocityProduct.incomingKnown !== false ? nonNegative(velocityProduct.incomingOpenPOQty) : null;
      product.suggestedQty = plan ? nonNegative(plan.suggestedReorderQuantity) : null;
      product.lastSupplier = latest ? latest.supplier : '';
      product.lastSupplierKey = latest ? latest.supplierKey : '';
      product.lastPurchaseDate = latest ? latest.date : '';
      product.lastUnitCost = latest ? latest.unitCost : null;
      product.previousUnitCost = previous ? previous.unitCost : null;
      product.costChange = latest && previous ? latest.unitCost - previous.unitCost : null;
      product.costChangePercent = latest && previous && previous.unitCost > 0 ? (latest.unitCost - previous.unitCost) / previous.unitCost * 100 : null;
      product.supplierCount = product.supplierKeys.size;
      product.lowestUnitCost = lowest ? lowest.unitCost : null;
      product.lowestSupplier = lowest ? lowest.supplier : '';
      product.lowestDate = lowest ? lowest.date : '';
      product.purchaseShare = totalValue > 0 ? product.purchaseValue / totalValue * 100 : 0;
      product.supplierChoices = Array.from(product.supplierKeys).map(function (key) {
        var history = product.observations.filter(function (item) { return item.supplierKey === key; });
        return { key:key, supplierId:history[0].supplierId, supplier:history[0].supplier, latestUnitCost:history[0].unitCost, latestDate:history[0].date };
      }).sort(function (a, b) { return b.latestDate.localeCompare(a.latestDate) || a.supplier.localeCompare(b.supplier); });
      return product;
    }).sort(function (a, b) { return a.product.localeCompare(b.product) || a.productId.localeCompare(b.productId); });
    var velocityProducts = list(snapshot && snapshot.products).concat(list(snapshot && snapshot.outOfStockProducts));
    velocityProducts.forEach(function (item) {
      var key = clean(item.productId) ? 'id:' + lower(item.productId) : 'name:' + lower(item.product);
      if (products.has(key)) return;
      var plan = velocity.planning.get(clean(item.key));
      productList.push({ key:key, productId:clean(item.productId), product:clean(item.product), category:clean(item.category), unitsPurchased:0, purchaseValue:0, supplierKeys:new Set(), observations:[], currentStock:nonNegative(item.remainingQty), remainingStockCost:nonNegative(item.totalRemainingCost), thirtyDayPace:nonNegative(item.thirtyDayPace), daysCover:nonNegative(item.estimatedDaysOfCover), incomingQty:item.incomingKnown === false ? null : nonNegative(item.incomingOpenPOQty), suggestedQty:plan ? nonNegative(plan.suggestedReorderQuantity) : null, lastSupplier:'', lastSupplierKey:'', lastPurchaseDate:'', lastUnitCost:null, previousUnitCost:null, costChange:null, costChangePercent:null, supplierCount:0, lowestUnitCost:null, lowestSupplier:'', lowestDate:'', purchaseShare:0, supplierChoices:[] });
    });
    productList.sort(function (a, b) { return a.product.localeCompare(b.product) || a.productId.localeCompare(b.productId); });
    var topFiveValue = supplierList.slice(0, 5).reduce(function (sum, supplier) { return sum + supplier.purchaseValue; }, 0);
    var snapshotIncoming = snapshot && snapshot.incoming;
    var incomingKnown = snapshotIncoming && typeof snapshotIncoming.available === 'boolean'
      ? snapshotIncoming.available
      : velocityProducts.length ? velocityProducts.every(function (product) { return product.incomingKnown !== false; }) : Array.isArray(db.purchaseOrders);
    var unitsIncoming = snapshotIncoming && incomingKnown && nonNegative(snapshotIncoming.totalUnits) != null
      ? nonNegative(snapshotIncoming.totalUnits)
      : velocityProducts.length && incomingKnown
      ? velocityProducts.reduce(function (sum, product) { return sum + (nonNegative(product.incomingOpenPOQty) || 0); }, 0)
      : incomingKnown ? open.reduce(function (sum, order) { return sum + order.unitsRemaining; }, 0) : null;
    var rising = productList.filter(function (product) { return product.costChange != null && product.costChange > 0 && product.previousUnitCost > 0; }).sort(function (a, b) { return b.costChangePercent - a.costChangePercent || b.costChange - a.costChange; });
    var falling = productList.filter(function (product) { return product.costChange != null && product.costChange < 0 && product.previousUnitCost > 0; }).sort(function (a, b) { return a.costChangePercent - b.costChangePercent || a.costChange - b.costChange; });
    var capital = productList.filter(function (product) { return product.purchaseValue > 0; }).slice().sort(function (a, b) { return b.purchaseValue - a.purchaseValue || a.product.localeCompare(b.product); });
    var ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    return {
      windowDays:windowDays, startDate:actual.start ? actual.start.toISOString() : '', endDate:actual.end.toISOString(),
      completedObservations:actual.observations, suppliers:supplierList, products:productList, openOrders:open,
      risingCosts:rising, fallingCosts:falling, productCapital:capital, velocitySnapshot:snapshot,
      kpis:{ stockPurchased:totalValue, unitsPurchased:totalUnits, suppliersUsed:supplierList.filter(function (supplier) { return supplier.completedTransactions > 0; }).length, openPOCount:open.length, openPOValue:round2(open.reduce(function (sum, order) { return sum + order.remainingValue; }, 0)), unitsIncoming:unitsIncoming, incomingKnown:incomingKnown, topFiveConcentration:totalValue > 0 ? topFiveValue / totalValue * 100 : 0 },
      diagnostics:{ observationsUsed:actual.observations.length, aggregateBuildMs:ended - started }
    };
  }
  function canAccess() {
    try {
      var auth = window.ZEZMS && window.ZEZMS.staffAuth;
      if (auth && typeof auth.getContext === 'function') {
        var role = clean((auth.getContext() || {}).role).toUpperCase();
        return role === 'OWNER' || role === 'ADMIN';
      }
    } catch (_) {}
    try { return typeof isElevated === 'function' && isElevated(); } catch (_) { return false; }
  }
  function buildCurrentModel() {
    var snapshot = velocitySnapshot();
    runtime.model = buildModel(database(), { windowDays:runtime.windowDays, now:new Date(), velocitySnapshot:snapshot });
    runtime.buildCount += 1;
    runtime.lastBuildMs = runtime.model.diagnostics.aggregateBuildMs;
    return runtime.model;
  }
  function emptyRow(columns, text) { return '<tr><td colspan="' + columns + '" class="empty">' + esc(text) + '</td></tr>'; }
  function supplierRows(model) {
    var rows = model.suppliers.filter(function (supplier) { return supplier.completedTransactions > 0; }).map(function (supplier) {
      return '<tr><td><button type="button" class="link-button" onclick="ZEZMS.supplierProcurement.openSupplierDetail(\'' + encoded(supplier.key) + '\')">' + esc(supplier.supplier) + '</button></td>'
        + '<td class="num">' + supplier.completedTransactions + '</td><td class="num">' + qty(supplier.unitsPurchased) + '</td><td class="num">' + money(supplier.purchaseValue) + '</td>'
        + '<td class="num">' + percent(supplier.purchaseShare) + '</td><td class="num">' + supplier.distinctProducts + '</td><td>' + dateLabel(supplier.lastPurchaseDate) + '</td><td class="num">' + money(supplier.averagePurchaseValue) + '</td></tr>';
    }).join('');
    return rows || emptyRow(8, 'No completed supplier purchases fall within this history window.');
  }
  function productRows(model) {
    var rows = model.products.filter(function (product) { return product.observations.length; }).map(function (product) {
      var change = product.costChange == null ? '—' : money(product.costChange) + (product.costChangePercent == null ? ' · —' : ' · ' + percent(product.costChangePercent));
      return '<tr class="proc-product-row" data-product-name="' + attr(lower(product.product)) + '" data-product-id="' + attr(lower(product.productId)) + '"><td><button type="button" class="link-button" onclick="ZEZMS.supplierProcurement.openProductDetail(\'' + encoded(product.key) + '\')">' + esc(product.product) + '</button></td><td class="mono">' + esc(product.productId || '—') + '</td>'
        + '<td class="num">' + qty(product.currentStock) + '</td><td>' + esc(product.lastSupplier || '—') + '</td><td>' + dateLabel(product.lastPurchaseDate) + '</td><td class="num">' + money(product.lastUnitCost) + '</td><td class="num">' + money(product.previousUnitCost) + '</td><td class="num">' + change + '</td><td class="num">' + product.supplierCount + '</td><td class="num">' + qty(product.unitsPurchased) + '</td></tr>';
    }).join('');
    return rows || emptyRow(10, 'No valid completed product purchase history falls within this window.');
  }
  function openOrderRows(model) {
    return model.openOrders.map(function (order) {
      return '<tr><td class="mono">' + esc(order.poNo) + '</td><td>' + esc(order.supplier) + '</td><td>' + dateLabel(order.createdDate) + '</td><td>' + esc(order.ageLabel) + '</td><td>' + esc(order.products.join(', ') || '—') + '</td><td class="num">' + qty(order.unitsOrdered) + '</td><td class="num">' + qty(order.unitsRemaining) + '</td><td class="num">' + money(order.remainingValue) + '</td><td>' + dateLabel(order.expectedDate) + (order.dueStatus !== '—' ? '<br><span class="muted">' + esc(order.dueStatus) + '</span>' : '') + '</td><td><button type="button" class="btn sm ghost" onclick="ZEZMS.supplierProcurement.openPurchaseOrder(\'' + encoded(order.id) + '\')">Open Purchase Order</button></td></tr>';
    }).join('') || emptyRow(10, 'No open Purchase Orders.');
  }
  function planEntry(product) {
    if (!runtime.planning[product.key]) runtime.planning[product.key] = { include:false, plannedQty:'', supplierKey:product.lastSupplierKey || '', plannedUnitCost:'' };
    return runtime.planning[product.key];
  }
  function supplierChoice(product, selected) {
    return '<option value="">— no historical supplier —</option>' + product.supplierChoices.map(function (supplier) {
      return '<option value="' + attr(supplier.key) + '"' + (supplier.key === selected ? ' selected' : '') + '>' + esc(supplier.supplier) + '</option>';
    }).join('');
  }
  function referenceFor(product, entry) {
    return product.supplierChoices.find(function (supplier) { return supplier.key === entry.supplierKey; }) || null;
  }
  function plannedCapital(product, entry) {
    var planned = positive(entry.plannedQty), explicitCost = positive(entry.plannedUnitCost), reference = referenceFor(product, entry);
    var cost = explicitCost || positive(reference && reference.latestUnitCost);
    return planned != null && cost != null ? round2(planned * cost) : null;
  }
  function planningRows(model) {
    return model.products.map(function (product, index) {
      var entry = planEntry(product), reference = referenceFor(product, entry), capital = plannedCapital(product, entry);
      var suggestion = product.suggestedQty != null && product.suggestedQty > 0 ? qty(product.suggestedQty) : '';
      return '<tr id="procPlanRow' + index + '" data-plan-key="' + attr(product.key) + '"><td><input aria-label="Include ' + attr(product.product) + '" type="checkbox"' + (entry.include ? ' checked' : '') + ' onchange="ZEZMS.supplierProcurement.changePlan(\'' + encoded(product.key) + '\',\'include\',this.checked,' + index + ')"></td>'
        + '<td>' + esc(product.product) + '</td><td class="mono">' + esc(product.productId || '—') + '</td><td class="num">' + qty(product.currentStock) + '</td><td class="num">' + qty(product.thirtyDayPace) + '</td><td class="num">' + qty(product.daysCover) + '</td><td class="num">' + qty(product.incomingQty) + '</td><td class="num">' + qty(product.suggestedQty) + '</td>'
        + '<td><input class="proc-planned-qty" type="number" min="0" step="1" value="' + attr(entry.plannedQty) + '" placeholder="' + attr(suggestion || '0') + '" data-semantic-default="' + attr(suggestion || '0') + '" oninput="ZEZMS.supplierProcurement.changePlan(\'' + encoded(product.key) + '\',\'plannedQty\',this.value,' + index + ')"><small class="muted">Suggestion: ' + (suggestion || '—') + '</small></td>'
        + '<td><select class="proc-reference-supplier" onchange="ZEZMS.supplierProcurement.changePlan(\'' + encoded(product.key) + '\',\'supplierKey\',this.value,' + index + ')">' + supplierChoice(product, entry.supplierKey) + '</select><small class="muted">Most recent recorded supplier is the initial reference, not a recommendation.</small></td>'
        + '<td class="num proc-reference-cost">' + money(reference && reference.latestUnitCost) + '</td><td><input class="proc-planned-cost" type="number" min="0" step="0.01" value="' + attr(entry.plannedUnitCost) + '" placeholder="0" data-semantic-default="0" oninput="ZEZMS.supplierProcurement.changePlan(\'' + encoded(product.key) + '\',\'plannedUnitCost\',this.value,' + index + ')"></td><td class="num proc-estimated-capital">' + money(capital) + '</td></tr>';
    }).join('') || emptyRow(13, 'Stage 4A has no current product snapshot to plan from.');
  }
  function summarizePlanning(model, planningState, budgetValue) {
    planningState = planningState || Object.create(null);
    var total = 0, unpriced = 0, included = 0;
    model.products.forEach(function (product) {
      var entry = planningState[product.key] || { include:false, plannedQty:'', supplierKey:product.lastSupplierKey || '', plannedUnitCost:'' };
      if (!entry.include) return;
      included += 1;
      var reference = referenceFor(product, entry), cost = positive(entry.plannedUnitCost) || positive(reference && reference.latestUnitCost);
      if (cost == null) unpriced += 1;
      var capital = plannedCapital(product, entry);
      if (capital != null) total += capital;
    });
    var budget = positive(budgetValue), remaining = budget == null ? null : round2(budget - total);
    return { total:round2(total), unpriced:unpriced, included:included, budget:budget, remaining:remaining };
  }
  function planSummary(model) { return summarizePlanning(model, runtime.planning, runtime.budget); }
  function draftPayload(model, planningState) {
    planningState = planningState || Object.create(null);
    var selected = model.products.map(function (product) {
      return { product:product, entry:planningState[product.key] || { include:false, plannedQty:'', supplierKey:product.lastSupplierKey || '', plannedUnitCost:'' } };
    }).filter(function (item) { return item.entry.include; });
    if (!selected.length) return { ok:false, code:'NO_SELECTION' };
    var supplierKeys = Array.from(new Set(selected.map(function (item) { return clean(item.entry.supplierKey); }).filter(Boolean)));
    if (supplierKeys.length !== 1 || selected.some(function (item) { return !clean(item.entry.supplierKey); })) return { ok:false, code:'MULTIPLE_OR_MISSING_SUPPLIER' };
    var supplierKey = supplierKeys[0], choice = null;
    var lines = selected.map(function (item) {
      var reference = referenceFor(item.product, item.entry);
      if (reference && reference.key === supplierKey) choice = reference;
      var planned = positive(item.entry.plannedQty), cost = positive(item.entry.plannedUnitCost) || positive(reference && reference.latestUnitCost);
      return { productId:item.product.productId, product:item.product.product, category:item.product.category, qty:planned, unitCost:cost };
    });
    if (!choice || !choice.supplierId) return { ok:false, code:'NO_EXISTING_SUPPLIER_ID' };
    if (lines.some(function (line) { return line.qty == null; })) return { ok:false, code:'INVALID_QUANTITY' };
    if (lines.some(function (line) { return line.unitCost == null; })) return { ok:false, code:'MISSING_COST' };
    return { ok:true, supplierId:choice.supplierId, lines:lines, source:'SUPPLIER_PROCUREMENT_PLANNING' };
  }
  function updatePlanSummary() {
    if (!runtime.model) return;
    var summary = planSummary(runtime.model);
    var totalNode = document.getElementById('procPlannedCapital'), missingNode = document.getElementById('procMissingCost'), budgetNode = document.getElementById('procBudgetResult');
    if (totalNode) totalNode.textContent = money(summary.total);
    if (missingNode) missingNode.textContent = String(summary.unpriced);
    if (budgetNode) budgetNode.textContent = summary.budget == null ? 'Enter an optional budget to compare.' : summary.remaining >= 0 ? 'Remaining Budget: ' + money(summary.remaining) : 'Over plan by ' + money(Math.abs(summary.remaining));
  }
  function topSupplierRows(model) {
    return model.suppliers.filter(function (supplier) { return supplier.completedTransactions > 0; }).slice(0, 5).map(function (supplier) {
      return '<tr><td>' + esc(supplier.supplier) + '</td><td class="num">' + money(supplier.purchaseValue) + '</td><td class="num">' + percent(supplier.purchaseShare) + '</td><td class="num">' + qty(supplier.unitsPurchased) + '</td><td class="num">' + supplier.distinctProducts + '</td></tr>';
    }).join('') || emptyRow(5, 'No completed purchases in this window.');
  }
  function movementRows(products) {
    return products.map(function (product) {
      return '<tr><td>' + esc(product.product) + '</td><td class="mono">' + esc(product.productId || '—') + '</td><td class="num">' + money(product.previousUnitCost) + '</td><td class="num">' + money(product.lastUnitCost) + '</td><td class="num">' + money(product.costChange) + '</td><td class="num">' + percent(product.costChangePercent) + '</td></tr>';
    }).join('') || emptyRow(6, 'No products meet this factual two-observation condition.');
  }
  function capitalRows(model) {
    return model.productCapital.map(function (product) {
      return '<tr><td>' + esc(product.product) + '</td><td class="mono">' + esc(product.productId || '—') + '</td><td class="num">' + qty(product.unitsPurchased) + '</td><td class="num">' + money(product.purchaseValue) + '</td><td class="num">' + percent(product.purchaseShare) + '</td><td class="num">' + qty(product.currentStock) + '</td><td class="num">' + money(product.remainingStockCost) + '</td></tr>';
    }).join('') || emptyRow(7, 'No completed product purchases in this window.');
  }
  function viewHTML() {
    if (!canAccess()) return '<div class="card"><h3>Supplier &amp; Procurement Intelligence</h3><p class="muted">Owner or Administrator access is required.</p></div>';
    var model = buildCurrentModel(), summary = planSummary(model);
    return '<section id="supplierProcurementLab" data-stage="6B" data-version="' + VERSION + '" data-build="' + BUILD + '">'
      + '<style id="supplierProcurementStyles">#supplierProcurementLab{min-width:0}#supplierProcurementLab input,#supplierProcurementLab select,#supplierProcurementLab textarea{background:#081221;color:#f8fafc;border:1px solid #475569;caret-color:#f8fafc}#supplierProcurementLab input::placeholder{color:#94a3b8;opacity:1}#supplierProcurementLab input:focus,#supplierProcurementLab select:focus{border-color:var(--teal2);outline:2px solid rgba(45,212,191,.35);outline-offset:1px}#supplierProcurementLab option{background:#081221;color:#f8fafc}#supplierProcurementLab .link-button{color:#5eead4;text-decoration:underline;text-underline-offset:2px;text-align:left}#supplierProcurementLab .proc-controls{align-items:end}#supplierProcurementLab .proc-wide-table{max-width:100%;overflow-x:auto}#supplierProcurementLab .proc-wide-table table{min-width:980px}#supplierProcurementLab .proc-plan-table table{min-width:1500px}#supplierProcurementLab .proc-plan-table input,#supplierProcurementLab .proc-plan-table select{min-width:105px}@media(max-width:600px){#supplierProcurementLab .grid.g2,#supplierProcurementLab .grid.g3,#supplierProcurementLab .grid.g4,#supplierProcurementLab .grid.g6{grid-template-columns:1fr!important}#supplierProcurementLab .proc-controls{display:grid;grid-template-columns:1fr}#supplierProcurementLab .proc-controls .field{width:100%;margin:0 0 10px}#supplierProcurementLab .table-wrap{max-width:100%;overflow-x:auto}#supplierProcurementLab .table-wrap table{width:max-content;max-width:none}}</style>'
      + '<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">Supplier &amp; Procurement Intelligence</h2><p class="muted">Completed purchasing history is kept separate from current open Purchase Orders. Intelligence is derived and planning is runtime-only.</p></div><span class="pill">Stage 6B · Owner/Admin</span></div>'
      + '<div class="card"><div class="row proc-controls"><div class="field" style="min-width:250px"><label>Completed Purchase History</label><select id="procHistoryWindow" onchange="ZEZMS.supplierProcurement.changeWindow(this.value)"><option value="30"' + (model.windowDays === 30 ? ' selected' : '') + '>30 Days</option><option value="90"' + (model.windowDays === 90 ? ' selected' : '') + '>90 Days</option><option value="180"' + (model.windowDays === 180 ? ' selected' : '') + '>180 Days</option><option value="365"' + (model.windowDays === 365 ? ' selected' : '') + '>365 Days</option><option value="0"' + (model.windowDays === 0 ? ' selected' : '') + '>All Available History</option></select></div><div class="muted">Open PO intelligence always uses all current OPEN orders, regardless of this completed-history window.</div></div></div>'
      + '<div class="grid g6" style="margin-top:12px"><div class="card kpi"><div class="sub">Stock Purchased</div><div class="val">' + money(model.kpis.stockPurchased) + '</div></div><div class="card kpi"><div class="sub">Units Purchased</div><div class="val">' + qty(model.kpis.unitsPurchased) + '</div></div><div class="card kpi"><div class="sub">Suppliers Used</div><div class="val">' + model.kpis.suppliersUsed + '</div></div><div class="card kpi"><div class="sub">Open Purchase Orders</div><div class="val">' + model.kpis.openPOCount + '</div></div><div class="card kpi"><div class="sub">Open PO Value</div><div class="val">' + money(model.kpis.openPOValue) + '</div></div><div class="card kpi"><div class="sub">Units Incoming</div><div class="val">' + qty(model.kpis.unitsIncoming) + '</div></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Supplier Purchase Summary</h3><div class="table-wrap proc-wide-table"><table><thead><tr><th>Supplier</th><th>Completed Purchase Transactions</th><th>Units Purchased</th><th>Purchase Value</th><th>Purchase Share %</th><th>Distinct Products Supplied</th><th>Last Purchase Date</th><th>Average Completed Purchase Value</th></tr></thead><tbody>' + supplierRows(model) + '</tbody></table></div></div>'
      + '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>Top-5 Supplier Purchase Concentration</h3><div class="val">' + percent(model.kpis.topFiveConcentration) + '</div><p class="muted">Factual share of completed purchase capital represented by up to five largest suppliers.</p></div><div class="card"><h3>Largest Suppliers by Purchase Capital</h3><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Purchase Value</th><th>Share</th><th>Units</th><th>Products Supplied</th></tr></thead><tbody>' + topSupplierRows(model) + '</tbody></table></div></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Product Procurement History</h3><div class="row proc-controls"><div class="field" style="flex:1"><label>Search Product Name</label><input id="procProductSearchName" type="search" placeholder="Partial, case-insensitive" oninput="ZEZMS.supplierProcurement.filterProducts()"></div><div class="field" style="flex:1"><label>Search Product ID</label><input id="procProductSearchId" type="search" placeholder="Partial Product ID" oninput="ZEZMS.supplierProcurement.filterProducts()"></div><button type="button" class="btn sm ghost" onclick="ZEZMS.supplierProcurement.clearProductSearch()">Clear Search</button></div><p class="muted">Costs are recorded purchase costs from completed supplier purchases, not market prices.</p><div class="table-wrap proc-wide-table"><table><thead><tr><th>Product</th><th>Product ID</th><th>Current Stock</th><th>Last Supplier</th><th>Last Purchase Date</th><th>Last Unit Cost</th><th>Previous Unit Cost</th><th>Cost Change</th><th>Suppliers Used</th><th>Units Purchased</th></tr></thead><tbody id="procProductHistoryBody">' + productRows(model) + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Open Purchase Orders</h3><p class="muted">There is no partial-receipt model: every valid line on an OPEN order remains fully expected.</p><div class="table-wrap proc-wide-table"><table><thead><tr><th>PO Number</th><th>Supplier</th><th>Created Date</th><th>Age</th><th>Products</th><th>Units Ordered</th><th>Units Remaining</th><th>Remaining Value</th><th>Expected/Target Date</th><th>Action</th></tr></thead><tbody>' + openOrderRows(model) + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Replenishment Planning</h3><p class="muted">Uses the current Stage 4A snapshot. Suggested quantities remain read-only guidance; Planned Qty and budget are blank runtime inputs. Nothing is ordered automatically.</p><div class="grid g3"><div class="field"><label>Available Purchase Budget</label><input id="procBudget" type="number" min="0" step="0.01" value="' + attr(runtime.budget) + '" placeholder="0" data-semantic-default="0" oninput="ZEZMS.supplierProcurement.changeBudget(this.value)"><small class="muted">Runtime only; no PIN and no persistence.</small></div><div class="card kpi"><div class="sub">Total Planned Purchase Capital</div><div class="val" id="procPlannedCapital">' + money(summary.total) + '</div></div><div class="card kpi"><div class="sub">Lines Missing Cost Reference</div><div class="val" id="procMissingCost">' + summary.unpriced + '</div></div></div><div id="procBudgetResult" class="notice" style="margin:8px 0">' + (summary.budget == null ? 'Enter an optional budget to compare.' : summary.remaining >= 0 ? 'Remaining Budget: ' + money(summary.remaining) : 'Over plan by ' + money(Math.abs(summary.remaining))) + '</div><div class="table-wrap proc-wide-table proc-plan-table"><table><thead><tr><th>Include</th><th>Product</th><th>Product ID</th><th>Current Stock</th><th>30-Day Sales Pace</th><th>Days Cover</th><th>Incoming Qty</th><th>Stage 4A Suggested Qty</th><th>Planned Qty</th><th>Reference Supplier</th><th>Historical Reference Unit Cost</th><th>Planned Unit Cost</th><th>Estimated Purchase Capital</th></tr></thead><tbody>' + planningRows(model) + '</tbody></table></div><div class="row" style="margin-top:12px"><button type="button" class="btn" onclick="ZEZMS.supplierProcurement.createDraftPurchaseOrder()">Create Draft Purchase Order</button><span class="muted">One existing supplier per Draft PO. The existing PO form opens for review before Save.</span></div></div>'
      + '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>Products with Higher Recent Purchase Cost</h3><p class="muted">Latest versus previous recorded completed purchase; this is not a market-inflation claim.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>ID</th><th>Previous</th><th>Latest</th><th>Change</th><th>Change %</th></tr></thead><tbody>' + movementRows(model.risingCosts) + '</tbody></table></div></div><div class="card"><h3>Products with Lower Recent Purchase Cost</h3><p class="muted">Latest versus previous recorded completed purchase; this is not a supplier-discount claim.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>ID</th><th>Previous</th><th>Latest</th><th>Change</th><th>Change %</th></tr></thead><tbody>' + movementRows(model.fallingCosts) + '</tbody></table></div></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Products Receiving Most Purchase Capital</h3><p class="muted">Factual historical purchasing capital versus current inventory context; no overbought/underbought classification is made.</p><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Units Purchased</th><th>Purchase Value</th><th>Purchase Share</th><th>Current Stock</th><th>Current Remaining Stock Cost</th></tr></thead><tbody>' + capitalRows(model) + '</tbody></table></div></div>'
      + '</section>';
  }
  function changeWindow(value) {
    runtime.windowDays = validWindow(value);
    if (typeof render === 'function') render();
  }
  function filterProducts() {
    var name = lower((document.getElementById('procProductSearchName') || {}).value), id = lower((document.getElementById('procProductSearchId') || {}).value);
    Array.prototype.forEach.call(document.querySelectorAll('#procProductHistoryBody .proc-product-row'), function (row) {
      row.style.display = (!name || clean(row.dataset.productName).indexOf(name) >= 0) && (!id || clean(row.dataset.productId).indexOf(id) >= 0) ? '' : 'none';
    });
  }
  function clearProductSearch() {
    var name = document.getElementById('procProductSearchName'), id = document.getElementById('procProductSearchId');
    if (name) name.value = '';
    if (id) id.value = '';
    filterProducts();
  }
  function changePlan(key, field, value, rowIndex) {
    key = decoded(key);
    var product = runtime.model && runtime.model.products.find(function (item) { return item.key === key; });
    if (!product) return;
    var entry = planEntry(product);
    if (field === 'include') entry.include = !!value;
    else if (field === 'plannedQty' || field === 'plannedUnitCost') entry[field] = clean(value);
    else if (field === 'supplierKey') entry.supplierKey = clean(value);
    var row = document.getElementById('procPlanRow' + Number(rowIndex));
    if (row) {
      var reference = referenceFor(product, entry), capital = plannedCapital(product, entry);
      var referenceNode = row.querySelector('.proc-reference-cost'), capitalNode = row.querySelector('.proc-estimated-capital');
      if (referenceNode) referenceNode.textContent = money(reference && reference.latestUnitCost);
      if (capitalNode) capitalNode.textContent = money(capital);
    }
    updatePlanSummary();
  }
  function changeBudget(value) { runtime.budget = clean(value); updatePlanSummary(); }
  function createDraftPurchaseOrder() {
    if (!canAccess()) { if (typeof toast === 'function') toast('Owner or Administrator access is required.', 'err'); return false; }
    var prepared = draftPayload(runtime.model, runtime.planning);
    if (!prepared.ok) {
      var messages = {
        NO_SELECTION:['Select at least one planning line.', 'warn'],
        MULTIPLE_OR_MISSING_SUPPLIER:['Selected planning lines must use one existing supplier.', 'err'],
        NO_EXISTING_SUPPLIER_ID:['The selected reference supplier has no existing creditor Supplier ID.', 'err'],
        INVALID_QUANTITY:['Enter a positive Planned Qty for every included line.', 'err'],
        MISSING_COST:['Every included line requires a historical or planned Unit Cost.', 'err']
      };
      var message = messages[prepared.code] || ['The Draft Purchase Order could not be prepared.', 'err'];
      if (typeof toast === 'function') toast(message[0], message[1]);
      return false;
    }
    var maintenance = window.ZEZMS && window.ZEZMS.ownerMaintenance;
    if (!maintenance || typeof maintenance.preparePurchaseOrderDraft !== 'function') { if (typeof toast === 'function') toast('The existing Purchase Order form is unavailable.', 'err'); return false; }
    return maintenance.preparePurchaseOrderDraft(prepared) === true;
  }
  function openPurchaseOrder(id) {
    if (!canAccess()) return;
    if (typeof window.showPurchaseOrder === 'function') window.showPurchaseOrder(decoded(id));
  }
  function openSupplierDetail(key) {
    key = decoded(key);
    var supplier = runtime.model && runtime.model.suppliers.find(function (item) { return item.key === key; });
    if (!supplier || typeof openModal !== 'function') return;
    var rows = supplier.productsSupplied.map(function (product) { return '<tr><td>' + esc(product.product) + '</td><td class="mono">' + esc(product.productId || '—') + '</td><td>' + dateLabel(product.lastPurchaseDate) + '</td><td class="num">' + money(product.lastUnitCost) + '</td><td class="num">' + money(product.lowestUnitCost) + '</td><td class="num">' + qty(product.unitsPurchased) + '</td><td class="num">' + money(product.purchaseValue) + '</td></tr>'; }).join('') || emptyRow(7, 'No completed products in this window.');
    var lead = supplier.averageLeadTime == null ? '—' : Number(supplier.averageLeadTime).toLocaleString('en-GH', { maximumFractionDigits:1 }) + ' days (n=' + supplier.leadTimeSampleSize + ')';
    openModal('<div id="supplierProcurementDetail"><h3>Supplier Procurement Summary</h3><div class="grid g4"><div class="card"><span class="muted">Supplier</span><br><b>' + esc(supplier.supplier) + '</b></div><div class="card"><span class="muted">Completed Purchases</span><br><b>' + supplier.completedTransactions + '</b></div><div class="card"><span class="muted">Purchase Value</span><br><b>' + money(supplier.purchaseValue) + '</b></div><div class="card"><span class="muted">Units Purchased</span><br><b>' + qty(supplier.unitsPurchased) + '</b></div><div class="card"><span class="muted">Distinct Products</span><br><b>' + supplier.distinctProducts + '</b></div><div class="card"><span class="muted">Last Purchase</span><br><b>' + dateLabel(supplier.lastPurchaseDate) + '</b></div><div class="card"><span class="muted">Average Purchase Value</span><br><b>' + money(supplier.averagePurchaseValue) + '</b></div><div class="card"><span class="muted">Average Historical Lead Time</span><br><b>' + lead + '</b></div><div class="card"><span class="muted">Open Purchase Orders</span><br><b>' + supplier.openOrders + '</b></div><div class="card"><span class="muted">Open PO Value</span><br><b>' + money(supplier.openPOValue) + '</b></div></div><h3 style="margin-top:16px">Products Supplied</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Last Purchase Date</th><th>Last Unit Cost</th><th>Lowest Recorded Unit Cost</th><th>Units Purchased</th><th>Purchase Value</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="row" style="margin-top:12px"><button type="button" class="btn ghost" onclick="closeModal()">Close</button></div></div>', 'modal-wide-quotation');
  }
  function openProductDetail(key) {
    key = decoded(key);
    var product = runtime.model && runtime.model.products.find(function (item) { return item.key === key; });
    if (!product || typeof openModal !== 'function') return;
    var rows = product.observations.map(function (item) { return '<tr><td>' + esc(item.supplier) + '</td><td>' + dateLabel(item.date) + '</td><td class="num">' + money(item.unitCost) + '</td><td class="num">' + qty(item.quantity) + '</td><td class="num">' + money(item.purchaseValue) + '</td><td class="mono">' + esc(item.poNo || '—') + '</td></tr>'; }).join('') || emptyRow(6, 'No completed supplier history in this window.');
    openModal('<div id="productProcurementDetail"><h3>Product Procurement Detail</h3><div class="grid g4"><div class="card"><span class="muted">Product</span><br><b>' + esc(product.product) + '</b><br><span class="mono">' + esc(product.productId || '—') + '</span></div><div class="card"><span class="muted">Current Stock</span><br><b>' + qty(product.currentStock) + '</b></div><div class="card"><span class="muted">Remaining Stock Cost</span><br><b>' + money(product.remainingStockCost) + '</b></div><div class="card"><span class="muted">Stage 4A 30-Day Sales Pace</span><br><b>' + qty(product.thirtyDayPace) + '</b></div><div class="card"><span class="muted">Stage 4A Days Cover</span><br><b>' + qty(product.daysCover) + '</b></div><div class="card"><span class="muted">Stage 4A Suggested Qty</span><br><b>' + qty(product.suggestedQty) + '</b></div><div class="card"><span class="muted">Incoming Qty</span><br><b>' + qty(product.incomingQty) + '</b></div><div class="card"><span class="muted">Last Purchase Cost</span><br><b>' + money(product.lastUnitCost) + '</b></div><div class="card"><span class="muted">Most Recent Supplier</span><br><b>' + esc(product.lastSupplier || '—') + '</b></div><div class="card"><span class="muted">Lowest Recorded Unit Cost</span><br><b>' + money(product.lowestUnitCost) + '</b><br><span class="muted">' + esc(product.lowestSupplier || '—') + ' · ' + dateLabel(product.lowestDate) + '</span></div></div><h3 style="margin-top:16px">Supplier History for ' + esc(product.product) + '</h3><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Purchase Date</th><th>Unit Cost</th><th>Quantity</th><th>Purchase Value</th><th>Purchase/PO Reference</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="row" style="margin-top:12px"><button type="button" class="btn ghost" onclick="closeModal()">Close</button></div></div>', 'modal-wide-quotation');
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.supplierProcurement = Object.freeze({
    version:VERSION, build:BUILD, viewHTML:viewHTML, changeWindow:changeWindow,
    filterProducts:filterProducts, clearProductSearch:clearProductSearch,
    changePlan:changePlan, changeBudget:changeBudget, createDraftPurchaseOrder:createDraftPurchaseOrder,
    openPurchaseOrder:openPurchaseOrder, openSupplierDetail:openSupplierDetail, openProductDetail:openProductDetail,
    refresh:function () { if (typeof render === 'function') render(); },
    getRuntime:function () { return { windowDays:runtime.windowDays, buildCount:runtime.buildCount, lastBuildMs:runtime.lastBuildMs, budget:runtime.budget, model:runtime.model }; },
    _test:Object.freeze({ buildModel:buildModel, planSummary:planSummary, summarizePlanning:summarizePlanning, draftPayload:draftPayload, plannedCapital:plannedCapital, calendarDays:calendarDays, validWindow:validWindow, sourceObservations:sourceObservations, openOrders:openOrders })
  });
}());

(function(){
  'use strict';

  var VERSION = '3.11.0';
  var BUILD = '20260814-sales-channel-capture-r43';
  var RELEASE = 'Customer Capture & Sales Channel Attribution';
  var DEFAULT_WINDOW = '365';
  var SALES_CHANNELS = Object.freeze([
    'Walk-in','WhatsApp','Facebook','TikTok','Instagram','Phone Call','Referral','Corporate/B2B','Other'
  ]);
  var ANALYTICAL_CHANNELS = Object.freeze(SALES_CHANNELS.concat(['Unspecified']));
  var DIGITAL_CHANNELS = Object.freeze(['WhatsApp','Facebook','TikTok','Instagram','Phone Call']);

  if(window.ZEZMS && window.ZEZMS.customerIntelligence
    && window.ZEZMS.customerIntelligence.version === VERSION
    && typeof window.viewDashboard === 'function'
    && window.viewDashboard.__zezmsCustomerIntelligenceV3100){
    return;
  }

  var runtime = {
    windowValue: DEFAULT_WINDOW,
    model: null,
    searchTerm: '',
    selectedCustomerKey: '',
    renderCount: 0,
    scanCount: 0,
    refreshCount: 0
  };

  function clean(value){
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }
  function collapse(value){ return clean(value).replace(/\s+/g, ' '); }
  function canonical(value){ return collapse(value).toLocaleLowerCase(); }
  function salesChannel(value){
    var raw = canonical(value);
    return SALES_CHANNELS.find(function(channel){ return canonical(channel) === raw; }) || 'Unspecified';
  }
  function salesChannelOther(record, details, channel){
    if(channel !== 'Other') return '';
    details = details && typeof details === 'object' ? details : {};
    return (collapse(record && record.salesChannelOther) || collapse(details.salesChannelOther)).slice(0, 100);
  }
  function list(value){ return Array.isArray(value) ? value : []; }
  function finite(value){
    if(value == null || (typeof value === 'string' && !clean(value))) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function positive(value){
    var number = finite(value);
    return number != null && number > 0 ? number : null;
  }
  function safeAdd(left, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return null;
    var result = left + right;
    return Number.isFinite(result) ? result : null;
  }
  function safeMultiply(left, right){
    if(!Number.isFinite(left) || !Number.isFinite(right)) return null;
    var result = left * right;
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
  function freezeDeep(value){
    if(Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
    if(value && typeof value === 'object'){
      var copy = {};
      Object.keys(value).forEach(function(key){ copy[key] = freezeDeep(value[key]); });
      return Object.freeze(copy);
    }
    return value;
  }
  function dataNumber(value){ return Number.isFinite(value) ? String(value) : ''; }
  function formatInteger(value){ return Number.isFinite(value) ? Number(value).toLocaleString('en-GH') : '—'; }
  function formatQuantity(value){
    if(!Number.isFinite(value)) return '—';
    return Number(value).toLocaleString('en-GH', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
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
    return Number.isFinite(value)
      ? Number(value).toLocaleString('en-GH', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%'
      : '—';
  }
  function formatDay(day){
    if(!day) return '—';
    var parts = String(day).split('-').map(Number);
    if(parts.length !== 3) return '—';
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : '—';
  }

  function ownerAdmin(){
    try{
      if(typeof session !== 'undefined' && session){
        var commercialRole = clean(session.commercialRole).toUpperCase();
        if(commercialRole) return commercialRole === 'OWNER' || commercialRole === 'ADMIN';
        var legacyRole = clean(session.role).toUpperCase();
        if(legacyRole || session.adminMode === true){
          return legacyRole === 'ADMIN' || session.adminMode === true;
        }
      }
    }catch(_error){}
    try{
      var auth = window.ZEZMS && window.ZEZMS.staffAuth;
      var context = auth && typeof auth.getContext === 'function' ? auth.getContext() : null;
      var role = clean(context && context.role).toUpperCase();
      return role === 'OWNER' || role === 'ADMIN';
    }catch(_error2){ return false; }
  }

  function pad(number){ return String(number).padStart(2, '0'); }
  function dayFromDate(date){
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function localDay(value){
    if(value instanceof Date){
      return Number.isFinite(value.getTime()) ? dayFromDate(value) : '';
    }
    var raw = clean(value);
    if(!raw) return '';
    var exact = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if(exact){
      var exactDate = new Date(Number(exact[1]), Number(exact[2]) - 1, Number(exact[3]));
      return Number.isFinite(exactDate.getTime())
        && exactDate.getFullYear() === Number(exact[1])
        && exactDate.getMonth() === Number(exact[2]) - 1
        && exactDate.getDate() === Number(exact[3])
        ? raw
        : '';
    }
    var date = new Date(raw);
    return Number.isFinite(date.getTime()) ? dayFromDate(date) : '';
  }
  function dayDate(day){
    var parts = String(day || '').split('-').map(Number);
    if(parts.length !== 3 || !parts.every(Number.isFinite)) return null;
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  function shiftDay(day, offset){
    var date = dayDate(day);
    if(!date) return '';
    date.setDate(date.getDate() + offset);
    return dayFromDate(date);
  }
  function calendarDays(fromDay, toDay){
    var from = dayDate(fromDay);
    var to = dayDate(toDay);
    if(!from || !to) return null;
    var utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    var difference = Math.floor((utcTo - utcFrom) / 86400000);
    return Number.isFinite(difference) && difference >= 0 ? difference : null;
  }
  function validWindow(value){
    var text = clean(value).toLowerCase();
    return text === '30' || text === '90' || text === '180' || text === '365' || text === 'all'
      ? text
      : DEFAULT_WINDOW;
  }

  var PLACEHOLDER_NAMES = Object.freeze({
    'walk-in': true,
    'walk in': true,
    'walk-in / not captured': true,
    'walk in / not captured': true,
    'unidentified customer': true,
    'anonymous': true,
    'n/a': true,
    'na': true,
    'none': true,
    'unknown': true
  });

  function customerName(value){
    if(typeof value !== 'string') return null;
    var display = collapse(value);
    var key = canonical(display);
    return display && !PLACEHOLDER_NAMES[key] ? { display:display, key:key } : null;
  }
  function phoneIdentity(value){
    var raw = collapse(value);
    if(!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
    var digits = raw.replace(/\D/g, '');
    if(/^00233\d{9}$/.test(digits)) digits = digits.slice(2);
    if(/^0\d{9}$/.test(digits)) digits = '233' + digits.slice(1);
    if(!/^\d{7,15}$/.test(digits) || /^0+$/.test(digits)) return null;
    return {
      key: digits,
      display: /^233\d{9}$/.test(digits) ? '+' + digits : digits
    };
  }
  function customerIdentity(transaction){
    var phone = phoneIdentity(transaction.phone);
    var name = customerName(transaction.name);
    if(phone){
      return {
        key: 'phone:' + phone.key,
        kind: 'phone',
        phone: phone.display,
        name: name
      };
    }
    if(name){
      return { key:'name:' + name.key, kind:'name', phone:'', name:name };
    }
    return null;
  }

  function activeRecord(record){
    if(!record || record.voided) return false;
    var status = clean(record.status || 'ACTIVE').toUpperCase();
    return status !== 'VOID' && status !== 'UNDONE' && status !== 'CANCELLED';
  }
  function lineValue(line){
    var recorded = finite(line && (line.amount != null ? line.amount : line.total));
    if(recorded != null) return recorded;
    var qty = finite(line && line.qty);
    var price = finite(line && (line.price != null ? line.price : line.uPrice));
    var discount = finite(line && line.disc);
    if(qty == null || price == null) return null;
    var gross = safeMultiply(qty, price);
    return gross == null ? null : safeAdd(gross, -(discount == null ? 0 : discount));
  }
  function sumLineValues(lines){
    var total = 0;
    var found = false;
    list(lines).forEach(function(line){
      var amount = lineValue(line);
      if(amount == null) return;
      var next = safeAdd(total, amount);
      if(next == null) return;
      total = next;
      found = true;
    });
    return found ? total : null;
  }
  function receiptValue(record, lines){
    var total = finite(record && (record.total != null ? record.total : record.totalAmount));
    if(total != null) return total;
    var subtotal = finite(record && record.subtotal);
    var vat = finite(record && record.vatAmount);
    if(subtotal != null){
      var withVat = safeAdd(subtotal, vat == null ? 0 : vat);
      if(withVat != null) return withVat;
    }
    return sumLineValues(lines);
  }
  function quickValue(record, lines){
    var amount = finite(record && (record.amount != null ? record.amount : record.total));
    return amount != null ? amount : sumLineValues(lines);
  }
  function metadata(record, details){
    details = details && typeof details === 'object' ? details : {};
    return {
      name: clean(record && (record.customerName || record.customer))
        || clean(details.customerName || details.customer),
      phone: clean(record && (record.customerPhone || record.contact || record.telephone || record.phone || record.tel))
        || clean(details.customerPhone || details.contact || details.telephone || details.phone || details.tel),
      location: collapse(record && record.location) || collapse(details.location)
    };
  }

  function scanTransactions(data){
    runtime.scanCount += 1;
    var transactions = [];
    var seen = new Set();
    var duplicateTransactionsSkipped = 0;
    var excludedInactive = 0;
    var invalidDates = 0;

    function add(prefix, record, index, lines, value){
      if(!activeRecord(record)){
        excludedInactive += 1;
        return;
      }
      var stableId = clean(record && (record.receiptNo || record.id || record.transactionId || record.reference));
      var key = prefix + ':' + (stableId ? canonical(stableId) : 'record-' + index);
      if(seen.has(key)){
        duplicateTransactionsSkipped += 1;
        return;
      }
      seen.add(key);
      var day = localDay(record && (record.date || record.saleDate || record.createdAt));
      if(!day){
        invalidDates += 1;
        return;
      }
      var details = record && record.details;
      var meta = metadata(record, details);
      var channel = salesChannel(record && record.salesChannel || details && details.salesChannel);
      transactions.push({
        key: key,
        id: stableId || prefix + '-' + (index + 1),
        source: prefix === 'receipt' ? 'DB.sales' : 'DB.inventoryTxns',
        sourceType: prefix,
        day: day,
        value: value,
        valueKnown: Number.isFinite(value),
        name: meta.name,
        phone: meta.phone,
        location: meta.location,
        salesChannel: channel,
        salesChannelOther: salesChannelOther(record, details, channel),
        lines: list(lines)
      });
    }

    list(data && data.sales).forEach(function(record, index){
      var lines = list(record && record.lines);
      add('receipt', record, index, lines, receiptValue(record, lines));
    });
    list(data && data.inventoryTxns).forEach(function(record, index){
      var type = clean(record && record.type).toUpperCase();
      var subtype = clean(record && record.subtype).toUpperCase();
      if(type !== 'SALE_OUT' || subtype !== 'QUICK') return;
      var lines = list(record && record.details && record.details.lines);
      add('quick', record, index, lines, quickValue(record, lines));
    });
    return {
      transactions: transactions,
      duplicateTransactionsSkipped: duplicateTransactionsSkipped,
      excludedInactive: excludedInactive,
      invalidDates: invalidDates
    };
  }

  function productResolver(products){
    var byId = new Map();
    var byName = new Map();
    list(products).forEach(function(product){
      var id = clean(product && (product.id || product.productId));
      var name = collapse(product && (product.name || product.product));
      if(id){
        var idKey = canonical(id);
        if(!byId.has(idKey)) byId.set(idKey, []);
        byId.get(idKey).push(product);
      }
      if(name){
        var nameKey = canonical(name);
        if(!byName.has(nameKey)) byName.set(nameKey, []);
        byName.get(nameKey).push(product);
      }
    });
    return function(line){
      var explicitId = clean(line && (line.productId || line.productID));
      var lineName = collapse(line && (line.product || line.name));
      var directCategory = collapse(line && line.category);
      var match = null;
      if(explicitId){
        var idBucket = byId.get(canonical(explicitId));
        if(idBucket && idBucket.length === 1) match = idBucket[0];
      }else if(lineName){
        var nameBucket = byName.get(canonical(lineName));
        if(nameBucket && nameBucket.length === 1) match = nameBucket[0];
      }
      var matchedId = clean(match && (match.id || match.productId));
      var productName = lineName || collapse(match && (match.name || match.product));
      var productKey = explicitId
        ? 'id:' + canonical(explicitId)
        : matchedId
          ? 'id:' + canonical(matchedId)
          : productName
            ? 'name:' + canonical(productName)
            : '';
      return {
        key: productKey,
        name: productName || 'Unnamed product',
        category: directCategory || collapse(match && match.category),
        categoryReliable: !!(directCategory || collapse(match && match.category))
      };
    };
  }

  function customerRecord(identity, transaction){
    return {
      key: identity.key,
      identityKind: identity.kind,
      displayName: identity.name ? identity.name.display : 'Customer ' + identity.phone,
      nameDay: identity.name ? transaction.day : '',
      telephone: identity.phone,
      locationMap: new Map(),
      firstPurchase: transaction.day,
      lastPurchase: transaction.day,
      transactionKeys: new Set(),
      totalSales: 0,
      knownValueTransactions: 0,
      missingValueTransactions: 0,
      totalQuantity: 0,
      products: new Map(),
      categories: new Map(),
      channels: new Map()
    };
  }
  function addAffinity(customer, transaction, resolveProduct){
    transaction.lines.forEach(function(line){
      var resolved = resolveProduct(line);
      var qty = positive(line && line.qty);
      var amount = lineValue(line);
      if(qty != null){
        var nextQuantity = safeAdd(customer.totalQuantity, qty);
        if(nextQuantity != null) customer.totalQuantity = nextQuantity;
      }
      if(!resolved.key) return;
      if(!customer.products.has(resolved.key)){
        customer.products.set(resolved.key, {
          key: resolved.key,
          product: resolved.name,
          quantity: 0,
          salesValue: 0,
          knownSalesLines: 0,
          recentPurchase: transaction.day,
          category: resolved.category,
          categoryReliable: resolved.categoryReliable
        });
      }
      var product = customer.products.get(resolved.key);
      if(qty != null){
        var productQuantity = safeAdd(product.quantity, qty);
        if(productQuantity != null) product.quantity = productQuantity;
      }
      if(amount != null){
        var productSales = safeAdd(product.salesValue, amount);
        if(productSales != null){
          product.salesValue = productSales;
          product.knownSalesLines += 1;
        }
      }
      if(transaction.day > product.recentPurchase) product.recentPurchase = transaction.day;
      if(!product.category && resolved.category) product.category = resolved.category;
      product.categoryReliable = product.categoryReliable || resolved.categoryReliable;

      if(resolved.categoryReliable && resolved.category){
        var categoryKey = canonical(resolved.category);
        if(!customer.categories.has(categoryKey)){
          customer.categories.set(categoryKey, {
            category: resolved.category,
            quantity: 0,
            salesValue: 0,
            knownSalesLines: 0
          });
        }
        var category = customer.categories.get(categoryKey);
        if(qty != null){
          var categoryQuantity = safeAdd(category.quantity, qty);
          if(categoryQuantity != null) category.quantity = categoryQuantity;
        }
        if(amount != null){
          var categorySales = safeAdd(category.salesValue, amount);
          if(categorySales != null){
            category.salesValue = categorySales;
            category.knownSalesLines += 1;
          }
        }
      }
    });
  }

  function addCustomerChannel(customer, transaction){
    var channelName = transaction.salesChannel || 'Unspecified';
    if(!customer.channels.has(channelName)) customer.channels.set(channelName, { channel:channelName, transactions:0, sales:0, knownSales:0 });
    var channel = customer.channels.get(channelName);
    channel.transactions += 1;
    if(transaction.valueKnown){
      var next = safeAdd(channel.sales, transaction.value);
      if(next != null){ channel.sales = next; channel.knownSales += 1; }
    }
  }

  function finalCustomer(customer, today){
    var locations = Array.from(customer.locationMap.values());
    var products = Array.from(customer.products.values()).map(function(product){
      return {
        key: product.key,
        product: product.product,
        quantity: product.quantity,
        salesValue: product.knownSalesLines ? product.salesValue : null,
        mostRecentPurchase: product.recentPurchase,
        category: product.categoryReliable ? product.category : ''
      };
    }).sort(function(left, right){
      return (Number.isFinite(right.salesValue) ? right.salesValue : -Infinity)
        - (Number.isFinite(left.salesValue) ? left.salesValue : -Infinity)
        || right.quantity - left.quantity
        || left.product.localeCompare(right.product);
    });
    var categories = Array.from(customer.categories.values()).map(function(category){
      return {
        category: category.category,
        quantity: category.quantity,
        salesValue: category.knownSalesLines ? category.salesValue : null
      };
    }).sort(function(left, right){
      return (Number.isFinite(right.salesValue) ? right.salesValue : -Infinity)
        - (Number.isFinite(left.salesValue) ? left.salesValue : -Infinity)
      || left.category.localeCompare(right.category);
    });
    var channelBreakdown = Array.from(customer.channels.values()).map(function(channel){
      return {
        channel: channel.channel,
        transactions: channel.transactions,
        sales: channel.knownSales ? channel.sales : null
      };
    }).sort(function(left, right){
      return right.transactions - left.transactions
        || (Number.isFinite(right.sales) ? right.sales : -Infinity) - (Number.isFinite(left.sales) ? left.sales : -Infinity)
        || ANALYTICAL_CHANNELS.indexOf(left.channel) - ANALYTICAL_CHANNELS.indexOf(right.channel);
    });
    var transactions = customer.transactionKeys.size;
    return {
      key: customer.key,
      identityKind: customer.identityKind,
      displayName: customer.displayName,
      telephone: customer.telephone,
      location: locations.length === 1 ? locations[0] : '',
      locationState: locations.length < 2 ? (locations.length ? 'reliable' : 'missing') : 'multiple',
      firstPurchase: customer.firstPurchase,
      lastPurchase: customer.lastPurchase,
      transactions: transactions,
      totalSales: customer.knownValueTransactions ? customer.totalSales : null,
      salesValueComplete: customer.missingValueTransactions === 0,
      knownValueTransactions: customer.knownValueTransactions,
      missingValueTransactions: customer.missingValueTransactions,
      totalQuantity: customer.totalQuantity,
      averageTransactionValue: customer.missingValueTransactions === 0 && transactions > 0
        ? customer.totalSales / transactions
        : null,
      daysSinceLastPurchase: calendarDays(customer.lastPurchase, today),
      distinctProducts: products.length,
      distinctCategories: categories.length,
      repeat: transactions >= 2,
      products: products,
      categories: categories,
      mostUsedSalesChannel: channelBreakdown.length ? channelBreakdown[0].channel : 'Unspecified',
      channelBreakdown: channelBreakdown,
      searchText: canonical(customer.displayName + ' ' + customer.telephone)
    };
  }
  function compareValue(left, right){
    var leftValue = Number.isFinite(left.totalSales) ? left.totalSales : -Infinity;
    var rightValue = Number.isFinite(right.totalSales) ? right.totalSales : -Infinity;
    return rightValue - leftValue || right.transactions - left.transactions || left.displayName.localeCompare(right.displayName);
  }
  function compareFrequency(left, right){
    return right.transactions - left.transactions
      || (Number.isFinite(right.totalSales) ? right.totalSales : -Infinity)
        - (Number.isFinite(left.totalSales) ? left.totalSales : -Infinity)
      || right.lastPurchase.localeCompare(left.lastPurchase)
      || left.displayName.localeCompare(right.displayName);
  }
  function recencyBucket(days){
    if(!Number.isFinite(days)) return '';
    if(days <= 30) return 'Purchased within 30 days';
    if(days <= 90) return '31–90 days';
    if(days <= 180) return '91–180 days';
    if(days <= 365) return '181–365 days';
    return 'More than 365 days';
  }

  function deriveModel(data, options){
    options = options || {};
    var windowValue = validWindow(options.windowValue);
    var today = localDay(options.today) || dayFromDate(new Date());
    var scanned = scanTransactions(data || {});
    var eligible = scanned.transactions.filter(function(transaction){ return transaction.day <= today; });
    var earliest = eligible.reduce(function(result, transaction){
      return !result || transaction.day < result ? transaction.day : result;
    }, '');
    var startDay = windowValue === 'all' ? earliest : shiftDay(today, -(Number(windowValue) - 1));
    var windowTransactions = eligible.filter(function(transaction){
      return (!startDay || transaction.day >= startDay) && transaction.day <= today;
    });
    var resolveProduct = productResolver(data && data.products);
    var customersMap = new Map();
    var identifiedTransactions = 0;
    var unidentifiedTransactions = 0;
    var totalSales = 0;
    var identifiedSales = 0;
    var unidentifiedSales = 0;
    var invalidValueTransactions = 0;

    windowTransactions.forEach(function(transaction){
      if(transaction.valueKnown){
        var totalNext = safeAdd(totalSales, transaction.value);
        if(totalNext != null) totalSales = totalNext;
      }else{
        invalidValueTransactions += 1;
      }
      var identity = customerIdentity(transaction);
      if(!identity){
        unidentifiedTransactions += 1;
        if(transaction.valueKnown){
          var unidentifiedNext = safeAdd(unidentifiedSales, transaction.value);
          if(unidentifiedNext != null) unidentifiedSales = unidentifiedNext;
        }
        return;
      }
      identifiedTransactions += 1;
      if(transaction.valueKnown){
        var identifiedNext = safeAdd(identifiedSales, transaction.value);
        if(identifiedNext != null) identifiedSales = identifiedNext;
      }
      if(!customersMap.has(identity.key)) customersMap.set(identity.key, customerRecord(identity, transaction));
      var customer = customersMap.get(identity.key);
      if(customer.transactionKeys.has(transaction.key)) return;
      customer.transactionKeys.add(transaction.key);
      if(identity.name && (!customer.nameDay || transaction.day >= customer.nameDay)){
        customer.displayName = identity.name.display;
        customer.nameDay = transaction.day;
      }
      if(transaction.location){
        var locationKey = canonical(transaction.location);
        if(locationKey && !customer.locationMap.has(locationKey)) customer.locationMap.set(locationKey, transaction.location);
      }
      if(transaction.day < customer.firstPurchase) customer.firstPurchase = transaction.day;
      if(transaction.day > customer.lastPurchase) customer.lastPurchase = transaction.day;
      if(transaction.valueKnown){
        var customerNext = safeAdd(customer.totalSales, transaction.value);
        if(customerNext != null){
          customer.totalSales = customerNext;
          customer.knownValueTransactions += 1;
        }
      }else{
        customer.missingValueTransactions += 1;
      }
      addAffinity(customer, transaction, resolveProduct);
      addCustomerChannel(customer, transaction);
    });

    var customers = Array.from(customersMap.values()).map(function(customer){ return finalCustomer(customer, today); });
    var topCustomers = customers.slice().sort(compareValue);
    var frequentCustomers = customers.slice().sort(compareFrequency);
    var repeatCustomers = customers.filter(function(customer){ return customer.repeat; });
    var recentRepeatCustomers = repeatCustomers.slice().sort(function(left, right){
      return right.lastPurchase.localeCompare(left.lastPurchase) || compareFrequency(left, right);
    });
    var recencyReview = repeatCustomers.slice().sort(function(left, right){
      return right.daysSinceLastPurchase - left.daysSinceLastPurchase || compareValue(left, right);
    });
    var repeatSales = repeatCustomers.reduce(function(sum, customer){
      var next = safeAdd(sum, customer.totalSales);
      return next == null ? sum : next;
    }, 0);
    var topFiveSales = topCustomers.slice(0, 5).reduce(function(sum, customer){
      var next = safeAdd(sum, customer.totalSales);
      return next == null ? sum : next;
    }, 0);
    var recencyLabels = [
      'Purchased within 30 days',
      '31–90 days',
      '91–180 days',
      '181–365 days',
      'More than 365 days'
    ];
    var recency = recencyLabels.map(function(label){ return { label:label, customerCount:0, salesValue:0 }; });
    customers.forEach(function(customer){
      var label = recencyBucket(customer.daysSinceLastPurchase);
      var bucket = recency.find(function(item){ return item.label === label; });
      if(!bucket) return;
      bucket.customerCount += 1;
      var next = safeAdd(bucket.salesValue, customer.totalSales);
      if(next != null) bucket.salesValue = next;
    });

    var customerByKey = new Map(customers.map(function(customer){ return [customer.key, customer]; }));
    var channelMap = new Map();
    ANALYTICAL_CHANNELS.forEach(function(channel){
      channelMap.set(channel, {
        channel:channel, transactions:0, sales:0, knownSalesTransactions:0,
        identifiedTransactions:0, customerKeys:new Set(), repeatCustomerTransactions:0, repeatCustomerSales:0
      });
    });
    windowTransactions.forEach(function(transaction){
      var channel = channelMap.get(transaction.salesChannel) || channelMap.get('Unspecified');
      channel.transactions += 1;
      if(transaction.valueKnown){
        var channelSalesNext = safeAdd(channel.sales, transaction.value);
        if(channelSalesNext != null){ channel.sales = channelSalesNext; channel.knownSalesTransactions += 1; }
      }
      var identity = customerIdentity(transaction);
      if(!identity) return;
      channel.identifiedTransactions += 1;
      channel.customerKeys.add(identity.key);
      var joinedCustomer = customerByKey.get(identity.key);
      if(joinedCustomer && joinedCustomer.repeat){
        channel.repeatCustomerTransactions += 1;
        if(transaction.valueKnown){
          var repeatChannelNext = safeAdd(channel.repeatCustomerSales, transaction.value);
          if(repeatChannelNext != null) channel.repeatCustomerSales = repeatChannelNext;
        }
      }
    });
    var channelRows = ANALYTICAL_CHANNELS.map(function(channelName){
      var channel = channelMap.get(channelName);
      return {
        channel: channelName,
        transactions: channel.transactions,
        totalSales: channel.sales,
        salesShare: totalSales ? (channel.sales / totalSales) * 100 : 0,
        averageTransactionValue: channel.transactions ? channel.sales / channel.transactions : null,
        identifiedCustomerTransactions: channel.identifiedTransactions,
        identificationCoverage: channel.transactions ? (channel.identifiedTransactions / channel.transactions) * 100 : 0,
        distinctCustomers: channel.customerKeys.size,
        repeatCustomerTransactions: channel.repeatCustomerTransactions,
        repeatCustomerSales: channel.repeatCustomerSales
      };
    });
    var salesByChannel = channelRows.filter(function(channel){ return channel.channel !== 'Unspecified' || channel.transactions > 0; }).sort(function(left, right){
      return right.totalSales - left.totalSales || right.transactions - left.transactions
        || ANALYTICAL_CHANNELS.indexOf(left.channel) - ANALYTICAL_CHANNELS.indexOf(right.channel);
    });
    var digitalChannels = channelRows.filter(function(channel){ return DIGITAL_CHANNELS.indexOf(channel.channel) >= 0; });
    var specifiedTransactions = channelRows.filter(function(channel){ return channel.channel !== 'Unspecified'; }).reduce(function(sum, channel){ return sum + channel.transactions; }, 0);
    var attributedSales = channelRows.filter(function(channel){ return channel.channel !== 'Unspecified'; }).reduce(function(sum, channel){ return sum + channel.totalSales; }, 0);
    var digitalSales = digitalChannels.reduce(function(sum, channel){ return sum + channel.totalSales; }, 0);
    var topSalesChannel = salesByChannel.filter(function(channel){ return channel.channel !== 'Unspecified' && channel.transactions > 0; })[0] || null;
    var identifiedCustomers = customers.length;
    var totalTransactions = windowTransactions.length;
    var kpis = {
      identifiedCustomers: identifiedCustomers,
      repeatCustomers: repeatCustomers.length,
      repeatCustomerRate: identifiedCustomers ? (repeatCustomers.length / identifiedCustomers) * 100 : 0,
      repeatCustomerSales: repeatSales,
      repeatCustomerSalesShare: identifiedSales ? (repeatSales / identifiedSales) * 100 : 0,
      unidentifiedSales: unidentifiedSales,
      unidentifiedSalesShare: totalSales ? (unidentifiedSales / totalSales) * 100 : 0,
      averageIdentifiedCustomerValue: identifiedCustomers ? identifiedSales / identifiedCustomers : 0,
      topFiveConcentration: identifiedSales ? (topFiveSales / identifiedSales) * 100 : 0,
      totalSales: totalSales,
      identifiedSales: identifiedSales
    };
    return freezeDeep({
      version: VERSION,
      build: BUILD,
      release: RELEASE,
      window: {
        value: windowValue,
        startDay: startDay,
        endDay: today,
        earliestAvailableDay: earliest,
        label: windowValue === 'all' ? 'All Available History' : 'Last ' + windowValue + ' days'
      },
      sources: {
        receipts: 'DB.sales',
        quickSales: 'DB.inventoryTxns SALE_OUT/QUICK',
        printableReceiptsScanned: false
      },
      coverage: {
        totalTransactions: totalTransactions,
        identifiedTransactions: identifiedTransactions,
        unidentifiedTransactions: unidentifiedTransactions,
        identificationCoverage: totalTransactions ? (identifiedTransactions / totalTransactions) * 100 : 0
      },
      quality: {
        duplicateTransactionsSkipped: scanned.duplicateTransactionsSkipped,
        excludedInactive: scanned.excludedInactive,
        invalidDates: scanned.invalidDates,
        invalidValueTransactions: invalidValueTransactions
      },
      kpis: kpis,
      customers: customers,
      channelIntelligence: {
        canonicalChannels: SALES_CHANNELS,
        analyticalChannels: ANALYTICAL_CHANNELS,
        digitalChannels: DIGITAL_CHANNELS,
        attributedSales: attributedSales,
        attributionCoverage: totalTransactions ? (specifiedTransactions / totalTransactions) * 100 : 0,
        digitalSales: digitalSales,
        digitalSalesShare: totalSales ? (digitalSales / totalSales) * 100 : 0,
        topSalesChannel: topSalesChannel ? topSalesChannel.channel : 'Not enough attributed sales',
        salesByChannel: salesByChannel,
        digitalByChannel: digitalChannels
      },
      topCustomers: topCustomers,
      frequentCustomers: frequentCustomers,
      recentRepeatCustomers: recentRepeatCustomers,
      recencyReview: recencyReview,
      recency: recency,
      transactionCustomerKeys: windowTransactions.map(function(transaction){
        var identity = customerIdentity(transaction);
        return { transactionKey:transaction.key, customerKey:identity ? identity.key : null };
      })
    });
  }

  function currentDB(){
    try{
      return typeof DB !== 'undefined' && DB ? DB : {};
    }catch(_error){ return {}; }
  }
  function buildModel(){
    runtime.model = deriveModel(currentDB(), { windowValue:runtime.windowValue });
    runtime.renderCount += 1;
    if(runtime.selectedCustomerKey && !runtime.model.customers.some(function(customer){ return customer.key === runtime.selectedCustomerKey; })){
      runtime.selectedCustomerKey = '';
    }
    return runtime.model;
  }

  function repeatStatus(customer){ return customer.repeat ? 'Repeat Customer' : 'One Recorded Transaction'; }
  function customerRow(customer, kind){
    var common = '<td class="ci-customer"><b>' + esc(customer.displayName) + '</b></td>'
      + '<td class="ci-phone">' + esc(customer.telephone || '—') + '</td>';
    if(kind === 'top'){
      return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="top">' + common
        + '<td>' + esc(customer.location || '—') + '</td><td class="num">' + formatInteger(customer.transactions) + '</td>'
        + '<td class="num">' + formatCurrency(customer.totalSales) + '</td><td class="num">' + formatCurrency(customer.averageTransactionValue) + '</td>'
        + '<td>' + formatDay(customer.firstPurchase) + '</td><td>' + formatDay(customer.lastPurchase) + '</td>'
        + '<td class="num">' + formatInteger(customer.daysSinceLastPurchase) + '</td><td>' + esc(repeatStatus(customer)) + '</td></tr>';
    }
    if(kind === 'frequent'){
      return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="frequent">' + common
        + '<td class="num">' + formatInteger(customer.transactions) + '</td><td class="num">' + formatCurrency(customer.totalSales) + '</td>'
        + '<td class="num">' + formatCurrency(customer.averageTransactionValue) + '</td><td>' + formatDay(customer.lastPurchase) + '</td>'
        + '<td class="num">' + formatInteger(customer.daysSinceLastPurchase) + '</td><td class="num">' + formatInteger(customer.distinctProducts) + '</td></tr>';
    }
    if(kind === 'recent'){
      return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="recent-repeat">' + common
        + '<td class="num">' + formatInteger(customer.transactions) + '</td><td class="num">' + formatCurrency(customer.totalSales) + '</td>'
        + '<td>' + formatDay(customer.lastPurchase) + '</td><td class="num">' + formatInteger(customer.daysSinceLastPurchase) + '</td>'
        + '<td class="num">' + formatInteger(customer.distinctProducts) + '</td><td class="num">' + formatInteger(customer.distinctCategories) + '</td></tr>';
    }
    if(kind === 'review'){
      return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="recency-review">' + common
        + '<td class="num">' + formatInteger(customer.transactions) + '</td><td class="num">' + formatCurrency(customer.totalSales) + '</td>'
        + '<td>' + formatDay(customer.lastPurchase) + '</td><td class="num">' + formatInteger(customer.daysSinceLastPurchase) + '</td></tr>';
    }
    if(kind === 'concentration'){
      var identifiedSales = runtime.model && runtime.model.kpis.identifiedSales;
      var share = identifiedSales
        ? (Number.isFinite(customer.totalSales) ? (customer.totalSales / identifiedSales) * 100 : null)
        : 0;
      return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="concentration"><td><b>' + esc(customer.displayName) + '</b></td>'
        + '<td class="num">' + formatCurrency(customer.totalSales) + '</td><td class="num">' + formatPercent(share) + '</td>'
        + '<td class="num">' + formatInteger(customer.transactions) + '</td><td>' + formatDay(customer.lastPurchase) + '</td></tr>';
    }
    return '<tr data-customer-key="' + esc(customer.key) + '" data-customer-row="value-frequency"><td><b>' + esc(customer.displayName) + '</b></td>'
      + '<td class="num">' + formatInteger(customer.transactions) + '</td><td class="num">' + formatCurrency(customer.totalSales) + '</td>'
      + '<td class="num">' + formatCurrency(customer.averageTransactionValue) + '</td><td class="num">' + formatInteger(customer.daysSinceLastPurchase) + '</td></tr>';
  }
  function emptyRow(columns, text){ return '<tr><td colspan="' + columns + '" class="empty">' + esc(text) + '</td></tr>'; }
  function rows(customers, kind, limit, columns, emptyText){
    var selected = Number.isFinite(limit) ? customers.slice(0, limit) : customers;
    return selected.length ? selected.map(function(customer){ return customerRow(customer, kind); }).join('') : emptyRow(columns, emptyText);
  }
  function coverageHTML(model){
    return '<div class="card" id="customerDataCoverage" style="margin-top:12px"><h4 style="margin-top:0">Customer Data Coverage</h4>'
      + '<div class="grid g4"><div><div class="sub">Completed Transactions</div><b id="customerCoverageTotal" data-value="' + model.coverage.totalTransactions + '">' + formatInteger(model.coverage.totalTransactions) + '</b></div>'
      + '<div><div class="sub">With Identifiable Customer</div><b id="customerCoverageIdentified" data-value="' + model.coverage.identifiedTransactions + '">' + formatInteger(model.coverage.identifiedTransactions) + '</b></div>'
      + '<div><div class="sub">Without Identifiable Customer</div><b id="customerCoverageUnidentified" data-value="' + model.coverage.unidentifiedTransactions + '">' + formatInteger(model.coverage.unidentifiedTransactions) + '</b></div>'
      + '<div><div class="sub">Customer Identification Coverage</div><b id="customerCoveragePercent" data-value="' + dataNumber(model.coverage.identificationCoverage) + '">' + formatPercent(model.coverage.identificationCoverage) + '</b></div></div>'
      + '<div class="muted" style="margin-top:8px">Unidentified transactions remain separate transactions; they are not combined into one person.</div></div>';
  }
  function searchResultsHTML(){
    var model = runtime.model;
    var term = canonical(runtime.searchTerm);
    if(!term) return emptyRow(8, 'Type a customer name or complete/partial telephone number to search this in-memory customer aggregate.');
    var matches = model.customers.filter(function(customer){ return customer.searchText.indexOf(term) >= 0; }).sort(compareValue);
    return matches.length
      ? matches.map(function(customer){ return customerRow(customer, 'frequent'); }).join('')
      : emptyRow(8, 'No identified customer matches this search.');
  }
  function detailHTML(){
    var model = runtime.model;
    var customer = model.customers.find(function(item){ return item.key === runtime.selectedCustomerKey; });
    if(!customer){
      return '<div class="empty" id="customerDetailEmpty">Select an identified customer to view a read-only purchase summary.</div>';
    }
    var productRows = customer.products.length ? customer.products.map(function(product){
      return '<tr data-affinity-product="' + esc(product.key) + '"><td><b>' + esc(product.product) + '</b></td><td class="num">' + formatQuantity(product.quantity) + '</td>'
        + '<td class="num">' + formatCurrency(product.salesValue) + '</td><td>' + formatDay(product.mostRecentPurchase) + '</td></tr>';
    }).join('') : emptyRow(4, 'No reliable product lines are available for this customer in the selected window.');
    var categoryRows = customer.categories.length ? customer.categories.map(function(category){
      return '<tr data-affinity-category="1"><td><b>' + esc(category.category) + '</b></td><td class="num">' + formatQuantity(category.quantity) + '</td><td class="num">' + formatCurrency(category.salesValue) + '</td></tr>';
    }).join('') : emptyRow(3, 'No reliable product-category mapping is available for this customer.');
    var channelRows = customer.channelBreakdown.length ? customer.channelBreakdown.map(function(channel){
      return '<tr data-customer-channel="' + esc(channel.channel) + '"><td><b>' + esc(channel.channel) + '</b></td><td class="num">' + formatInteger(channel.transactions) + '</td><td class="num">' + formatCurrency(channel.sales) + '</td></tr>';
    }).join('') : emptyRow(3, 'No sales-channel metadata is available for this customer.');
    return '<div id="customerDetailSummary" data-customer-key="' + esc(customer.key) + '"><div class="grid g4">'
      + '<div><div class="sub">Transactions</div><b data-detail="transactions">' + formatInteger(customer.transactions) + '</b></div>'
      + '<div><div class="sub">Total Sales</div><b data-detail="sales">' + formatCurrency(customer.totalSales) + '</b></div>'
      + '<div><div class="sub">First Purchase</div><b data-detail="first">' + formatDay(customer.firstPurchase) + '</b></div>'
      + '<div><div class="sub">Last Purchase</div><b data-detail="last">' + formatDay(customer.lastPurchase) + '</b></div></div>'
      + '<div class="muted" style="margin-top:8px">Avg Transaction Value: <b>' + formatCurrency(customer.averageTransactionValue) + '</b>. Most Used Sales Channel: <b data-detail="most-used-channel">' + esc(customer.mostUsedSalesChannel) + '</b>. Product/category sales use recorded line values and do not allocate receipt VAT.</div>'
      + '<h5>Products Purchased</h5><div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Quantity Purchased</th><th class="num">Sales Value</th><th>Most Recent Purchase</th></tr></thead><tbody>' + productRows + '</tbody></table></div>'
      + '<h5>Category Summary</h5><div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">Quantity</th><th class="num">Sales Value</th></tr></thead><tbody>' + categoryRows + '</tbody></table></div>'
      + '<h5>Sales Channel Breakdown</h5><div class="table-wrap"><table><thead><tr><th>Channel</th><th class="num">Transactions</th><th class="num">Sales</th></tr></thead><tbody>' + channelRows + '</tbody></table></div></div>';
  }

  function salesChannelIntelligenceHTML(model){
    var intelligence = model.channelIntelligence;
    var channelRows = intelligence.salesByChannel.map(function(channel){
      return '<tr data-sales-channel="' + esc(channel.channel) + '"><td><b>' + esc(channel.channel) + '</b></td>'
        + '<td class="num">' + formatInteger(channel.transactions) + '</td><td class="num">' + formatCurrency(channel.totalSales) + '</td>'
        + '<td class="num">' + formatPercent(channel.salesShare) + '</td><td class="num">' + formatCurrency(channel.averageTransactionValue) + '</td>'
        + '<td class="num">' + formatPercent(channel.identificationCoverage) + '</td><td class="num">' + formatInteger(channel.distinctCustomers) + '</td></tr>';
    }).join('') || emptyRow(7, 'No completed sales are available in the selected window.');
    var digitalRows = intelligence.digitalByChannel.map(function(channel){
      return '<tr data-digital-channel="' + esc(channel.channel) + '"><td><b>' + esc(channel.channel) + '</b></td>'
        + '<td class="num">' + formatInteger(channel.transactions) + '</td><td class="num">' + formatCurrency(channel.totalSales) + '</td>'
        + '<td class="num">' + formatPercent(channel.salesShare) + '</td><td class="num">' + formatCurrency(channel.averageTransactionValue) + '</td>'
        + '<td class="num">' + formatInteger(channel.distinctCustomers) + '</td><td class="num">' + formatCurrency(channel.repeatCustomerSales) + '</td></tr>';
    }).join('');
    return '<div class="card" id="salesChannelIntelligence" style="margin-top:12px"><div class="row wrap" style="justify-content:space-between;align-items:flex-start">'
      + '<div><h4 style="margin:0">Sales Channel Intelligence</h4><div class="muted">Declared transaction source within the selected Customer-history window. This is not advertising ROI.</div></div><span class="pill">Stage 5B</span></div>'
      + '<div class="grid g4" id="salesChannelKpis" style="margin-top:12px">'
      + '<div class="card kpi teal"><div class="sub">Attributed Sales</div><div class="val" id="channelKpiAttributedSales" data-value="' + dataNumber(intelligence.attributedSales) + '">' + formatCurrency(intelligence.attributedSales) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Channel Attribution Coverage</div><div class="val" id="channelKpiAttributionCoverage" data-value="' + dataNumber(intelligence.attributionCoverage) + '">' + formatPercent(intelligence.attributionCoverage) + '</div></div>'
      + '<div class="card kpi green"><div class="sub">Digital/Remote-Origin Sales</div><div class="val" id="channelKpiDigitalSales" data-value="' + dataNumber(intelligence.digitalSales) + '">' + formatCurrency(intelligence.digitalSales) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Digital/Remote-Origin Sales Share</div><div class="val" id="channelKpiDigitalShare" data-value="' + dataNumber(intelligence.digitalSalesShare) + '">' + formatPercent(intelligence.digitalSalesShare) + '</div></div></div>'
      + '<div class="notice" id="topSalesChannel" style="margin-top:10px"><b>Top Sales Channel:</b> ' + esc(intelligence.topSalesChannel) + '</div>'
      + '<h4>Sales by Channel</h4><div class="table-wrap"><table><thead><tr><th>Channel</th><th class="num">Transactions</th><th class="num">Total Sales</th><th class="num">Sales Share %</th><th class="num">Avg Transaction Value</th><th class="num">Identified Customer %</th><th class="num">Distinct Customers</th></tr></thead><tbody id="salesByChannelRows">' + channelRows + '</tbody></table></div>'
      + '<h4>Digital &amp; Remote Sales</h4><div class="muted">WhatsApp, Facebook, TikTok, Instagram and Phone Call only.</div><div class="table-wrap"><table><thead><tr><th>Channel</th><th class="num">Transactions</th><th class="num">Sales</th><th class="num">Sales Share</th><th class="num">Avg Transaction Value</th><th class="num">Identified Customers</th><th class="num">Repeat-Customer Sales</th></tr></thead><tbody id="digitalSalesChannelRows">' + digitalRows + '</tbody></table></div></div>';
  }

  function sectionHTML(){
    var model = buildModel();
    var rangeText = model.window.value === 'all'
      ? (model.window.earliestAvailableDay ? 'Earliest completed sale used: ' + formatDay(model.window.earliestAvailableDay) + '; analysis end: ' + formatDay(model.window.endDay) : 'No valid completed-sale date is available')
      : formatDay(model.window.startDay) + ' – ' + formatDay(model.window.endDay);
    var qualityText = model.quality.invalidValueTransactions
      ? model.quality.invalidValueTransactions + ' transaction(s) have no reliable value and are excluded from monetary totals rather than treated as zero.'
      : '';
    var options = model.customers.slice().sort(function(left, right){ return left.displayName.localeCompare(right.displayName); }).map(function(customer){
      return '<option value="' + esc(customer.key) + '"' + (customer.key === runtime.selectedCustomerKey ? ' selected' : '') + '>' + esc(customer.displayName + (customer.telephone ? ' · ' + customer.telephone : '')) + '</option>';
    }).join('');
    var recencyRows = model.recency.map(function(bucket){
      return '<tr data-recency-bucket="' + esc(bucket.label) + '"><td>' + esc(bucket.label) + '</td><td class="num">' + formatInteger(bucket.customerCount) + '</td><td class="num">' + formatCurrency(bucket.salesValue) + '</td></tr>';
    }).join('');

    return '<div class="divider"></div><section id="customerIntelligenceLab" class="customer-intelligence-view" data-stage="5B" data-version="' + VERSION + '" data-build="' + BUILD + '" data-window="' + esc(model.window.value) + '" aria-labelledby="customerIntelligenceHeading">'
      + '<style id="customerIntelligenceResponsiveStyles">#customerIntelligenceLab .ci-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap}#customerIntelligenceLab .ci-controls label{min-width:190px;flex:1}#customerIntelligenceLab .ci-customer,#customerIntelligenceLab .ci-phone{max-width:240px;overflow-wrap:anywhere}#customerIntelligenceLab select,#customerIntelligenceLab input{box-sizing:border-box;max-width:100%;width:100%;padding:10px 12px;background:#0b1220!important;color:#f1f5f9!important;border:1px solid #475569!important;border-radius:10px;outline:none}#customerIntelligenceLab input::placeholder{color:#94a3b8!important;opacity:1}#customerIntelligenceLab select:focus,#customerIntelligenceLab input:focus{border-color:#14b8a6!important;box-shadow:0 0 0 3px rgba(20,184,166,.20)!important}#customerIntelligenceLab select:disabled,#customerIntelligenceLab input:disabled,#customerIntelligenceLab input[readonly]{background:#111c2f!important;color:#cbd5e1!important;opacity:.78}#customerIntelligenceLab select option{background:#0b1220;color:#f1f5f9}#customerIntelligenceLab input:-webkit-autofill{-webkit-text-fill-color:#f1f5f9!important;box-shadow:0 0 0 1000px #0b1220 inset!important;caret-color:#f1f5f9}@media(max-width:720px){#customerIntelligenceLab .grid.g4{grid-template-columns:minmax(0,1fr)!important}#customerIntelligenceLab .ci-controls{display:grid;grid-template-columns:minmax(0,1fr)}#customerIntelligenceLab select,#customerIntelligenceLab input{min-width:0;min-height:52px;font-size:16px}}html.zezms-phone-layout #customerIntelligenceLab .table-wrap{overflow-x:auto!important;overflow-y:auto!important}html.zezms-phone-layout #customerIntelligenceLab .table-wrap table{width:max-content!important;max-width:none!important;min-width:700px!important}</style>'
      + '<style id="customerIntelligencePhoneControlStyles">html.zezms-phone-layout #customerIntelligenceLab select,html.zezms-phone-layout #customerIntelligenceLab input{min-width:0!important;max-width:100%!important;min-height:52px!important;font-size:16px!important}</style>'
      + '<div class="row wrap" style="justify-content:space-between;align-items:flex-start"><div><h3 id="customerIntelligenceHeading" style="margin:0">Customer Relationship Intelligence</h3>'
      + '<div class="muted">Read-only analysis of identifiable completed-sale customers and declared Sales Source. No customer or transaction record is changed.</div></div><span class="pill">Stages 5A + 5B · Read only</span></div>'
      + '<div class="ci-controls card" style="margin-top:12px"><label><span class="sub">Customer-history window</span><select id="customerHistoryWindow" onchange="ZEZMS.customerIntelligence.setWindow(this.value)">'
      + ['30','90','180','365','all'].map(function(value){ var label = value === 'all' ? 'All Available History' : 'Last ' + value + ' days'; return '<option value="' + value + '"' + (value === model.window.value ? ' selected' : '') + '>' + label + '</option>'; }).join('')
      + '</select></label><div style="flex:2;min-width:240px"><div class="sub">Effective completed-sale dates</div><b id="customerWindowDates">' + esc(rangeText) + '</b></div></div>'
      + '<div class="notice" style="margin-top:10px">Receipt transactions and customer/channel metadata come from active <code>DB.sales</code>; active Quick Sale data comes from <code>DB.inventoryTxns</code>. The duplicate printable receipt register is not scanned. Missing or malformed historical channel metadata is reported as Unspecified.' + (qualityText ? ' ' + esc(qualityText) : '') + '</div>'
      + '<div class="grid g4" id="customerPrimaryKpis" style="margin-top:12px">'
      + '<div class="card kpi teal"><div class="sub">Identified Customers</div><div class="val" id="customerKpiIdentified" data-value="' + model.kpis.identifiedCustomers + '">' + formatInteger(model.kpis.identifiedCustomers) + '</div></div>'
      + '<div class="card kpi green"><div class="sub">Repeat Customers</div><div class="val" id="customerKpiRepeat" data-value="' + model.kpis.repeatCustomers + '">' + formatInteger(model.kpis.repeatCustomers) + '</div></div>'
      + '<div class="card kpi amber"><div class="sub">Repeat Customer Rate</div><div class="val" id="customerKpiRepeatRate" data-value="' + dataNumber(model.kpis.repeatCustomerRate) + '">' + formatPercent(model.kpis.repeatCustomerRate) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Sales from Repeat Customers</div><div class="val" id="customerKpiRepeatSales" data-value="' + dataNumber(model.kpis.repeatCustomerSales) + '">' + formatCurrency(model.kpis.repeatCustomerSales) + '</div><div class="muted" id="customerKpiRepeatSalesShare" data-value="' + dataNumber(model.kpis.repeatCustomerSalesShare) + '">' + formatPercent(model.kpis.repeatCustomerSalesShare) + ' of identified-customer sales</div></div></div>'
      + '<div class="grid g4" id="customerSecondaryKpis" style="margin-top:12px">'
      + '<div class="card kpi"><div class="sub">Unidentified Sales Value</div><div class="val" id="customerKpiUnidentifiedSales" data-value="' + dataNumber(model.kpis.unidentifiedSales) + '">' + formatCurrency(model.kpis.unidentifiedSales) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Unidentified Sales Share</div><div class="val" id="customerKpiUnidentifiedShare" data-value="' + dataNumber(model.kpis.unidentifiedSalesShare) + '">' + formatPercent(model.kpis.unidentifiedSalesShare) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Average Identified Customer Value</div><div class="val" id="customerKpiAverageValue" data-value="' + dataNumber(model.kpis.averageIdentifiedCustomerValue) + '">' + formatCurrency(model.kpis.averageIdentifiedCustomerValue) + '</div></div>'
      + '<div class="card kpi"><div class="sub">Top-5 Customer Sales Concentration</div><div class="val" id="customerKpiTopFive" data-value="' + dataNumber(model.kpis.topFiveConcentration) + '">' + formatPercent(model.kpis.topFiveConcentration) + '</div><div class="muted">Dependence on the five highest-value identifiable customers.</div></div></div>'
      + coverageHTML(model)
      + salesChannelIntelligenceHTML(model)
      + '<div class="card" style="margin-top:12px"><h4 style="margin-top:0">Customer Search</h4><label><span class="sub">Name or telephone</span><input id="customerIntelligenceSearch" type="search" autocomplete="off" value="' + esc(runtime.searchTerm) + '" placeholder="Search the derived customer list" oninput="ZEZMS.customerIntelligence.search(this.value)"></label><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Total Sales</th><th>Avg Transaction Value</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Distinct Products</th></tr></thead><tbody id="customerSearchResults">' + searchResultsHTML() + '</tbody></table></div></div>'
      + '<h4>Top Customers by Sales — Top 20</h4><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Location</th><th>Transactions</th><th>Total Sales</th><th>Avg Transaction Value</th><th>First Purchase</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Repeat Status</th></tr></thead><tbody id="topCustomersBySales">' + rows(model.topCustomers, 'top', 20, 10, 'No identified customers are available in this window.') + '</tbody></table></div>'
      + '<h4>Most Frequent Customers — Top 20</h4><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Total Sales</th><th>Avg Transaction Value</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Distinct Products</th></tr></thead><tbody id="mostFrequentCustomers">' + rows(model.frequentCustomers, 'frequent', 20, 8, 'No identified customers are available in this window.') + '</tbody></table></div>'
      + '<h4>Recent Repeat Customers</h4><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Total Sales</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Distinct Products</th><th>Distinct Categories</th></tr></thead><tbody id="recentRepeatCustomers">' + rows(model.recentRepeatCustomers, 'recent', null, 8, 'No repeat customers are available in this window.') + '</tbody></table></div>'
      + '<h4>Customer Recency</h4><div class="muted">Sales shown are the completed-sale values represented within the selected analysis window.</div><div class="table-wrap"><table><thead><tr><th>Recency bucket</th><th>Customer count</th><th>Total sales in selected window</th></tr></thead><tbody id="customerRecencyBuckets">' + recencyRows + '</tbody></table></div>'
      + '<h4>Customer Recency Review</h4><div class="muted">Identified repeat customers only, shown for visibility without automatic status labels or contact instructions.</div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Telephone</th><th>Transactions</th><th>Total Sales</th><th>Last Purchase</th><th>Days Since Last Purchase</th></tr></thead><tbody id="customerRecencyReview">' + rows(model.recencyReview, 'review', null, 6, 'No repeat customers are available for recency review.') + '</tbody></table></div>'
      + '<div class="card" style="margin-top:12px"><h4 style="margin-top:0">Customer Purchase Summary</h4><label><span class="sub">Identified customer</span><select id="customerDetailSelector" onchange="ZEZMS.customerIntelligence.selectCustomer(this.value)"><option value="">Select a customer</option>' + options + '</select></label><div id="customerPurchaseDetail" style="margin-top:12px">' + detailHTML() + '</div></div>'
      + '<h4>Customer Sales Concentration — Top 10</h4><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Total Sales</th><th>% of Identified Customer Sales</th><th>Transactions</th><th>Last Purchase</th></tr></thead><tbody id="customerConcentration">' + rows(model.topCustomers, 'concentration', 10, 5, 'No identified customer sales are available in this window.') + '</tbody></table></div>'
      + '<h4>Customer Value &amp; Frequency</h4><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Transactions</th><th>Total Sales</th><th>Avg Transaction Value</th><th>Days Since Last Purchase</th></tr></thead><tbody id="customerValueFrequency">' + rows(model.topCustomers, 'value-frequency', null, 5, 'No identified customers are available in this window.') + '</tbody></table></div>'
      + '<div class="muted" style="margin-top:12px">Runtime-only analysis. No Customer Master, customer merge, outbound communication, marketing ROI claim, database migration or analytical write is created. Name-only identities remain separate from telephone identities; no fuzzy matching is used.</div>'
      + '</section>';
  }

  function appendSection(html){
    var marker = html.lastIndexOf('</section>');
    return marker < 0 ? html + sectionHTML() : html.slice(0, marker) + sectionHTML() + html.slice(marker);
  }
  function replaceSection(){
    var existing = document.getElementById('customerIntelligenceLab');
    if(!existing || !ownerAdmin()) return false;
    var holder = document.createElement('div');
    holder.innerHTML = sectionHTML();
    var replacement = holder.querySelector('#customerIntelligenceLab');
    if(!replacement) return false;
    existing.replaceWith(replacement);
    runtime.refreshCount += 1;
    return true;
  }
  function setWindow(value){
    runtime.windowValue = validWindow(value);
    runtime.searchTerm = '';
    runtime.selectedCustomerKey = '';
    return replaceSection();
  }
  function search(value){
    runtime.searchTerm = collapse(value);
    var body = document.getElementById('customerSearchResults');
    if(body && runtime.model) body.innerHTML = searchResultsHTML();
    return runtime.model
      ? runtime.model.customers.filter(function(customer){ return customer.searchText.indexOf(canonical(runtime.searchTerm)) >= 0; })
      : [];
  }
  function selectCustomer(key){
    runtime.selectedCustomerKey = clean(key);
    var detail = document.getElementById('customerPurchaseDetail');
    if(detail && runtime.model) detail.innerHTML = detailHTML();
    return runtime.model && runtime.model.customers.find(function(customer){ return customer.key === runtime.selectedCustomerKey; }) || null;
  }
  function refresh(){ return replaceSection(); }
  function install(){
    if(typeof window.viewDashboard !== 'function') return false;
    if(window.viewDashboard.__zezmsCustomerIntelligenceV3100) return true;
    var original = window.viewDashboard;
    var wrapped = function(){
      var html = original.apply(this, arguments);
      if(typeof html !== 'string' || html.indexOf('id="customerIntelligenceLab"') >= 0 || !ownerAdmin()) return html;
      return appendSection(html);
    };
    Object.keys(original).forEach(function(key){
      try{ wrapped[key] = original[key]; }catch(_error){}
    });
    wrapped.__zezmsCustomerIntelligenceV3100 = true;
    wrapped.__zezmsCustomerIntelligenceV3100Original = original;
    window.viewDashboard = wrapped;
    return true;
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.customerIntelligence = Object.freeze({
    version: VERSION,
    build: BUILD,
    release: RELEASE,
    install: install,
    refresh: refresh,
    setWindow: setWindow,
    search: search,
    selectCustomer: selectCustomer,
    deriveSnapshot: function(data, options){ return deriveModel(data || {}, options || {}); },
    getCustomerSnapshot: function(){ return runtime.model || freezeDeep({ customers:[], kpis:{}, coverage:{}, window:{} }); },
    getChannelSnapshot: function(){ return runtime.model && runtime.model.channelIntelligence || freezeDeep({ salesByChannel:[], digitalByChannel:[] }); },
    getRuntimeSnapshot: function(){
      return freezeDeep({
        windowValue: runtime.windowValue,
        searchTerm: runtime.searchTerm,
        selectedCustomerKey: runtime.selectedCustomerKey,
        renderCount: runtime.renderCount,
        scanCount: runtime.scanCount,
        refreshCount: runtime.refreshCount
      });
    },
    normalizeTelephone: function(value){ var result = phoneIdentity(value); return result ? result.display : ''; },
    canonicalCustomerName: function(value){ var result = customerName(value); return result ? result.key : ''; },
    canonicalSalesChannel: salesChannel
  });
  install();
}());

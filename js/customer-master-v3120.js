/* ZEZMS TradeFlow Owner Edition v3.14.0
   Persistent Customer Master & Relationship Management Foundation.
   Profile data is persisted; every financial/relationship value is derived from
   completed sales and is never written back to the Customer Master. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var VERSION = '3.14.0';
  var BUILD = '20260820-customer-outreach-r48';
  var RELEASE = 'Customer Outreach & Contact Actions';
  var MAX_NOTES = 1000;
  var runtime = {
    byId: new Map(), byPhone: new Map(), byHistoricalPhone: new Map(), byName: new Map(), searchRows: [],
    model: null, selectedId: '', searchTerm: '', preview: null, indexVersion: 0
  };

  function clean(value) { return value == null ? '' : String(value).trim(); }
  function collapse(value) { return clean(value).replace(/\s+/g, ' '); }
  function canonical(value) { return collapse(value).toLocaleLowerCase(); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ' '); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function now() { return new Date().toISOString(); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function finite(value) { var number = Number(value); return Number.isFinite(number) ? number : 0; }
  function active(record) {
    if(!record || record.voided) return false;
    var status = clean(record.status || 'ACTIVE').toUpperCase();
    return status !== 'VOID' && status !== 'UNDONE' && status !== 'CANCELLED';
  }
  function ownerAdmin() {
    try {
      if(ZEZMS.staffAuth && typeof ZEZMS.staffAuth.getContext === 'function') {
        var role = clean(ZEZMS.staffAuth.getContext().role).toUpperCase();
        return role === 'OWNER' || role === 'ADMIN';
      }
    } catch(_error) {}
    try { return session && (session.role === 'ADMIN' || session.adminMode === true); } catch(_error2) { return false; }
  }
  function notify(message, type) {
    if(typeof toast === 'function') toast(message, type || 'ok');
  }
  function phoneIdentity(value) {
    var raw = collapse(value);
    if(!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
    var digits = raw.replace(/\D/g, '');
    if(/^00233\d{9}$/.test(digits)) digits = digits.slice(2);
    if(/^0\d{9}$/.test(digits)) digits = '233' + digits.slice(1);
    if(!/^\d{7,15}$/.test(digits) || /^0+$/.test(digits)) return null;
    return { key:digits, display:/^233\d{9}$/.test(digits) ? '+' + digits : raw };
  }
  function customerName(value) {
    var display = collapse(value);
    return display ? { display:display, key:canonical(display) } : null;
  }
  var HISTORICAL_PLACEHOLDER_NAMES = Object.freeze({
    'walk-in':true, 'walk in':true, 'walk-in / not captured':true, 'walk in / not captured':true,
    'unidentified customer':true, 'anonymous':true, 'n/a':true, 'na':true, 'none':true, 'unknown':true
  });
  function historicalCustomerName(value) {
    var name = customerName(value);
    return name && !HISTORICAL_PLACEHOLDER_NAMES[name.key] ? name : null;
  }
  function hash32(value, seed) {
    var hash = seed >>> 0;
    for(var i=0; i<value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  function stableCustomerId(kind, key) {
    var token = String(kind || '') + ':' + String(key || '');
    return 'CUS-' + (kind === 'phone' ? 'P' : 'N')
      + hash32(token, 2166136261).slice(0, 6)
      + hash32(token.split('').reverse().join(''), 2246822519).slice(0, 4);
  }
  function ensureDB() {
    if(typeof DB === 'undefined' || !DB) return [];
    if(!Array.isArray(DB.customers)) DB.customers = [];
    return DB.customers;
  }
  function refreshIndex() {
    var customers = ensureDB();
    runtime.byId = new Map(); runtime.byPhone = new Map(); runtime.byHistoricalPhone = new Map(); runtime.byName = new Map();
    runtime.searchRows = [];
    customers.forEach(function (customer) {
      if(!customer || typeof customer !== 'object') return;
      customer.customerId = clean(customer.customerId) || stableCustomerId(
        customer.phoneKey ? 'phone' : 'name', customer.phoneKey || canonical(customer.name)
      );
      var phone = phoneIdentity(customer.phone || customer.phoneKey);
      customer.phoneKey = phone ? phone.key : '';
      customer.phoneAliases = list(customer.phoneAliases).map(function (value) {
        var alias = phoneIdentity(value); return alias ? alias.key : '';
      }).filter(Boolean).filter(function (value, index, values) { return value !== customer.phoneKey && values.indexOf(value) === index; });
      customer.identityQuality = customer.phoneKey ? 'phone' : 'name-only';
      if(!customer.createdAt) customer.createdAt = customer.updatedAt || now();
      if(!customer.updatedAt) customer.updatedAt = customer.createdAt;
      runtime.byId.set(customer.customerId, customer);
      if(customer.phoneKey && !runtime.byPhone.has(customer.phoneKey)) runtime.byPhone.set(customer.phoneKey, customer);
      if(customer.phoneKey && !runtime.byHistoricalPhone.has(customer.phoneKey)) runtime.byHistoricalPhone.set(customer.phoneKey, customer);
      customer.phoneAliases.forEach(function (alias) { if(!runtime.byHistoricalPhone.has(alias)) runtime.byHistoricalPhone.set(alias, customer); });
      var nameKey = canonical(customer.name);
      if(nameKey && !customer.phoneKey && !runtime.byName.has(nameKey)) runtime.byName.set(nameKey, customer);
      runtime.searchRows.push({
        customer:customer,
        haystack:canonical(customer.customerId + ' ' + customer.name + ' ' + customer.phone + ' ' + customer.phoneKey)
      });
    });
    runtime.indexVersion += 1;
    return runtime;
  }
  function findById(id) { return runtime.byId.get(clean(id)) || null; }
  function findByPhone(value) {
    var phone = phoneIdentity(value);
    return phone ? (runtime.byPhone.get(phone.key) || null) : null;
  }
  function findNameOnly(value) { return runtime.byName.get(canonical(value)) || null; }
  function uniqueId(kind, key) {
    var base = stableCustomerId(kind, key), id = base, suffix = 1;
    while(runtime.byId.has(id)) {
      var existing = runtime.byId.get(id);
      if((kind === 'phone' && existing.phoneKey === key)
        || (kind === 'name' && !existing.phoneKey && canonical(existing.name) === key)) return id;
      id = base + '-' + suffix++;
    }
    return id;
  }
  function normalizeRecord(record) {
    var phone = phoneIdentity(record.phone || record.phoneKey);
    var created = clean(record.createdAt) || now();
    return {
      customerId:clean(record.customerId),
      name:collapse(record.name),
      phone:phone ? (collapse(record.phone) || phone.display) : '',
      phoneKey:phone ? phone.key : '',
      phoneAliases:list(record.phoneAliases),
      location:collapse(record.location),
      notes:clean(record.notes).slice(0, MAX_NOTES),
      identityQuality:phone ? 'phone' : 'name-only',
      createdAt:created,
      updatedAt:clean(record.updatedAt) || created,
      source:clean(record.source) || 'manual',
      locationSource:clean(record.locationSource) || ''
    };
  }
  function matchingCustomer(payload, allowNameOnly) {
    var phone = phoneIdentity(payload.phone || payload.phoneKey);
    if(phone) return runtime.byHistoricalPhone.get(phone.key) || null;
    return allowNameOnly ? (runtime.byName.get(canonical(payload.name)) || null) : null;
  }
  function upsertProfile(payload, options) {
    options = options || {};
    ensureDB(); if(!options.deferIndex) refreshIndex();
    var phone = phoneIdentity(payload.phone || payload.phoneKey);
    var name = customerName(payload.name);
    if(!phone && !options.allowNameOnly) return null;
    if(!phone && !name) return null;
    var customer = matchingCustomer(payload, !!options.allowNameOnly);
    var timestamp = clean(payload.updatedAt) || now();
    var created = false;
    if(!customer) {
      var kind = phone ? 'phone' : 'name';
      var key = phone ? phone.key : name.key;
      customer = normalizeRecord({
        customerId:uniqueId(kind, key), name:name ? name.display : '',
        phone:phone ? (collapse(payload.phone) || phone.display) : '', phoneKey:phone ? phone.key : '',
        location:payload.location, notes:payload.notes, createdAt:timestamp, updatedAt:timestamp,
        source:payload.source || options.source || 'manual',
        locationSource:options.manual ? 'manual' : (collapse(payload.location) ? 'history' : '')
      });
      DB.customers.push(customer); created = true;
    } else {
      if(!customer.name && name) customer.name = name.display;
      if(!customer.phone && phone) customer.phone = collapse(payload.phone) || phone.display;
      if(!customer.phoneKey && phone) customer.phoneKey = phone.key;
      if(!customer.location && customer.locationSource !== 'manual' && collapse(payload.location)) {
        customer.location = collapse(payload.location);
        if(!customer.locationSource) customer.locationSource = options.manual ? 'manual' : 'history';
      }
      if(options.manual && clean(payload.notes) && !customer.notes) customer.notes = clean(payload.notes).slice(0, MAX_NOTES);
      customer.identityQuality = customer.phoneKey ? 'phone' : 'name-only';
      customer.updatedAt = timestamp;
    }
    if(options.deferIndex) {
      runtime.byId.set(customer.customerId, customer);
      if(customer.phoneKey) {
        runtime.byPhone.set(customer.phoneKey, customer);
        runtime.byHistoricalPhone.set(customer.phoneKey, customer);
      } else if(canonical(customer.name)) runtime.byName.set(canonical(customer.name), customer);
    } else refreshIndex();
    if(options.persist !== false && typeof saveDB === 'function') saveDB();
    return { customer:customer, created:created };
  }
  function upsertAfterCommittedSale(payload) {
    var phone = phoneIdentity(payload && payload.phone);
    if(!phone) return null;
    var before = clone(ensureDB());
    try {
      return upsertProfile(Object.assign({}, payload, { phoneKey:phone.key }), {
        persist:true, allowNameOnly:false, source:payload.source || 'sale'
      });
    } catch(error) {
      DB.customers = before;
      refreshIndex();
      throw error;
    }
  }
  function resolveCustomerId(payload) {
    refreshIndex();
    var phone = phoneIdentity(payload && payload.phone);
    var selected = findById(payload && payload.selectedId);
    if(selected && phone && selected.phoneKey === phone.key) return selected.customerId;
    var exact = phone && runtime.byPhone.get(phone.key);
    if(exact) return exact.customerId;
    return phone ? stableCustomerId('phone', phone.key) : '';
  }

  function transactionRows() {
    var rows = [];
    list(DB && DB.sales).forEach(function (sale) {
      if(!active(sale)) return;
      rows.push({
        id:clean(sale.receiptNo || sale.id), customerId:clean(sale.customerId),
        name:collapse(sale.customer || sale.customerName), phone:collapse(sale.contact || sale.customerPhone),
        location:collapse(sale.location), date:clean(sale.date), amount:finite(sale.total != null ? sale.total : sale.totalAmount),
        salesChannel:collapse(sale.salesChannel) || 'Unspecified', lines:list(sale.lines), source:'receipt'
      });
    });
    list(DB && DB.inventoryTxns).forEach(function (txn) {
      if(!active(txn) || clean(txn.type).toUpperCase() !== 'SALE_OUT' || clean(txn.subtype).toUpperCase() !== 'QUICK') return;
      var details = txn.details && typeof txn.details === 'object' ? txn.details : {};
      rows.push({
        id:clean(txn.id || txn.reference), customerId:clean(txn.customerId || details.customerId),
        name:collapse(txn.customerName || details.customerName), phone:collapse(txn.customerPhone || details.customerPhone),
        location:collapse(txn.location || details.location), date:clean(txn.date), amount:finite(txn.amount),
        salesChannel:collapse(txn.salesChannel || details.salesChannel) || 'Unspecified',
        lines:list(details.lines).length ? list(details.lines) : list(txn.lines), source:'quick-sale'
      });
    });
    return rows;
  }
  function candidateKey(txn) {
    var phone = phoneIdentity(txn.phone), name = historicalCustomerName(txn.name);
    if(phone) return { key:'phone:' + phone.key, kind:'phone', phone:phone, name:name };
    if(name) return { key:'name:' + name.key, kind:'name-only', phone:null, name:name };
    return null;
  }
  function buildHistoryPreview() {
    refreshIndex();
    var grouped = new Map(), unresolved = 0, ambiguous = 0;
    transactionRows().forEach(function (txn) {
      var identity = candidateKey(txn);
      if(!identity) { unresolved += 1; return; }
      var group = grouped.get(identity.key);
      if(!group) {
        group = { key:identity.key, kind:identity.kind, phone:identity.phone, name:identity.name, location:'', transactions:0, source:txn.source };
        grouped.set(identity.key, group);
      }
      group.transactions += 1;
      if(!group.name && identity.name) group.name = identity.name;
      if(!group.location && txn.location) group.location = txn.location;
    });
    var phoneCounts = new Map(), nameCounts = new Map();
    ensureDB().forEach(function (customer) {
      if(customer.phoneKey) phoneCounts.set(customer.phoneKey, (phoneCounts.get(customer.phoneKey) || 0) + 1);
      list(customer.phoneAliases).forEach(function (alias) { phoneCounts.set(alias, (phoneCounts.get(alias) || 0) + 1); });
      if(!customer.phoneKey && canonical(customer.name)) nameCounts.set(canonical(customer.name), (nameCounts.get(canonical(customer.name)) || 0) + 1);
    });
    var candidates = Array.from(grouped.values()), existing = 0, potential = 0;
    candidates.forEach(function (candidate) {
      var matchCount = candidate.phone ? (phoneCounts.get(candidate.phone.key) || 0) : (nameCounts.get(candidate.name.key) || 0);
      if(matchCount > 1) ambiguous += 1;
      if(matchCount) existing += 1; else potential += 1;
    });
    return {
      identifiable:candidates.length,
      phoneBased:candidates.filter(function (c) { return c.kind === 'phone'; }).length,
      nameOnly:candidates.filter(function (c) { return c.kind === 'name-only'; }).length,
      existingMatches:existing, potentialNew:potential, unresolvedAmbiguous:unresolved + ambiguous,
      unresolvedTransactions:unresolved, ambiguousIdentities:ambiguous, candidates:candidates
    };
  }
  function previewHTML(preview) {
    return '<h3>Build Customer Master from Sales History</h3>'
      + '<p class="muted">This preview reads completed sales only. It will write Customer Master profiles only and will not modify sales, receipts, inventory transactions or accounting values.</p>'
      + '<div class="grid g2">'
      + '<div class="statline"><span>Identifiable transaction-derived customers</span><b>' + preview.identifiable + '</b></div>'
      + '<div class="statline"><span>Phone-based customers</span><b>' + preview.phoneBased + '</b></div>'
      + '<div class="statline"><span>Name-only customers</span><b>' + preview.nameOnly + '</b></div>'
      + '<div class="statline"><span>Existing Customer Master matches</span><b>' + preview.existingMatches + '</b></div>'
      + '<div class="statline"><span>Potential new master records</span><b>' + preview.potentialNew + '</b></div>'
      + '<div class="statline"><span>Unresolved / ambiguous identities</span><b>' + preview.unresolvedAmbiguous + '</b></div>'
      + '</div><p class="muted" style="font-size:11px">Matching is exact normalised telephone, then exact canonical name only when both sides have no usable telephone. No fuzzy merge is performed.</p>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.customerMaster.confirmBuildFromHistory()">Build / Refresh Customer Master</button>'
      + '<button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function showBuildPreview() {
    if(!ownerAdmin()) { notify('Only Owner or Admin can build the Customer Master.', 'err'); return; }
    runtime.preview = buildHistoryPreview();
    if(typeof openModal === 'function') openModal(previewHTML(runtime.preview));
  }
  function confirmBuildFromHistory() {
    if(!ownerAdmin()) { notify('Only Owner or Admin can build the Customer Master.', 'err'); return; }
    if(!window.confirm('Create or safely refresh Customer Master profiles from completed sales history? Historical transactions will remain unchanged.')) return;
    var preview = buildHistoryPreview(), before = clone(ensureDB()), created = 0, matched = 0;
    try {
      preview.candidates.forEach(function (candidate) {
        var result = upsertProfile({
          name:candidate.name ? candidate.name.display : (candidate.phone ? candidate.phone.display : 'Customer'),
          phone:candidate.phone ? candidate.phone.display : '', phoneKey:candidate.phone ? candidate.phone.key : '',
          location:candidate.location, source:'sales-history', updatedAt:now()
        }, { persist:false, allowNameOnly:true, source:'sales-history', deferIndex:true });
        if(result && result.created) created += 1; else if(result) matched += 1;
      });
      saveDB(); refreshIndex(); runtime.model = null;
      if(typeof closeModal === 'function') closeModal();
      notify('Customer Master refreshed: ' + created + ' created, ' + matched + ' matched.');
      if(typeof render === 'function') render();
    } catch(error) {
      DB.customers = before; refreshIndex();
      notify('Customer Master import failed: ' + (error.message || error), 'err');
    }
  }

  function productCategory(name) {
    var key = canonical(name), product = list(DB && DB.products).find(function (item) {
      return canonical(item && item.name) === key;
    });
    return collapse(product && product.category);
  }
  function dateValue(value) { var ms = Date.parse(value || ''); return Number.isFinite(ms) ? ms : 0; }
  function lineValue(line) {
    if(line && line.amount != null) return finite(line.amount);
    if(line && line.total != null) return finite(line.total);
    return Math.max(0, finite(line && (line.qty || line.quantity)) * finite(line && (line.price || line.uPrice)) - finite(line && (line.disc || line.discount)));
  }
  function preparedModel() {
    refreshIndex();
    var stats = new Map();
    ensureDB().forEach(function (customer) {
      stats.set(customer.customerId, {
        customer:customer, transactions:0, lifetimeSales:0, firstMs:0, lastMs:0,
        totalQuantity:0, products:new Set(), categories:new Set(), channels:new Map(), history:[], profileConflict:false
      });
    });
    transactionRows().forEach(function (txn) {
      var customer = findById(txn.customerId), phone = phoneIdentity(txn.phone), nameKey = canonical(txn.name);
      if(!customer && phone) customer = runtime.byHistoricalPhone.get(phone.key) || null;
      if(!customer && !phone && nameKey) customer = runtime.byName.get(nameKey) || null;
      if(!customer || !stats.has(customer.customerId)) return;
      var stat = stats.get(customer.customerId), ms = dateValue(txn.date), lines = txn.lines;
      stat.transactions += 1; stat.lifetimeSales += txn.amount;
      if(ms && (!stat.firstMs || ms < stat.firstMs)) stat.firstMs = ms;
      if(ms && ms > stat.lastMs) stat.lastMs = ms;
      stat.channels.set(txn.salesChannel, (stat.channels.get(txn.salesChannel) || 0) + 1);
      if(phone && canonical(txn.name) && canonical(customer.name) && canonical(txn.name) !== canonical(customer.name)) stat.profileConflict = true;
      if(!lines.length) lines = [{ product:'Transaction total', qty:0, amount:txn.amount }];
      lines.forEach(function (line) {
        var product = collapse(line.product || line.productName || line.name) || 'Transaction total';
        var qty = finite(line.qty != null ? line.qty : line.quantity), value = lineValue(line);
        stat.totalQuantity += qty;
        if(product !== 'Transaction total') stat.products.add(canonical(product));
        var category = productCategory(product); if(category) stat.categories.add(canonical(category));
        stat.history.push({ date:txn.date, id:txn.id, product:product, qty:qty, value:value, salesChannel:txn.salesChannel });
      });
    });
    var rows = Array.from(stats.values()).map(function (stat) {
      var mostUsed = Array.from(stat.channels.entries()).sort(function (a,b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })[0];
      stat.firstPurchase = stat.firstMs ? new Date(stat.firstMs).toISOString() : '';
      stat.lastPurchase = stat.lastMs ? new Date(stat.lastMs).toISOString() : '';
      stat.daysSince = stat.lastMs ? Math.max(0, Math.floor((Date.now() - stat.lastMs) / 86400000)) : null;
      stat.average = stat.transactions ? stat.lifetimeSales / stat.transactions : 0;
      stat.mostUsedChannel = mostUsed ? mostUsed[0] : 'Unspecified';
      stat.history.sort(function (a,b) { return dateValue(b.date) - dateValue(a.date); });
      stat.searchText = canonical(stat.customer.customerId + ' ' + stat.customer.name + ' ' + stat.customer.phone + ' ' + stat.customer.phoneKey);
      return stat;
    }).sort(function (a,b) { return canonical(a.customer.name).localeCompare(canonical(b.customer.name)); });
    return {
      rows:rows,
      total:rows.length,
      phoneIdentified:rows.filter(function (row) { return !!row.customer.phoneKey; }).length,
      nameOnly:rows.filter(function (row) { return !row.customer.phoneKey; }).length,
      withPurchases:rows.filter(function (row) { return row.transactions > 0; }).length
    };
  }
  function moneyValue(value) {
    try { if(typeof money === 'function') return money(value); } catch(_error) {}
    return 'GH₵ ' + finite(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function formatDate(value) { return value ? new Date(value).toLocaleDateString('en-GB') : '—'; }
  function qualityBadge(customer) {
    return customer.phoneKey
      ? '<span class="badge ok">Phone identity</span>'
      : '<span class="badge warn">Name-only identity — review recommended</span>';
  }
  function filteredRows() {
    var term = canonical(runtime.searchTerm);
    return !term ? runtime.model.rows : runtime.model.rows.filter(function (row) { return row.searchText.indexOf(term) >= 0; });
  }
  function tableRowsHTML() {
    var rows = filteredRows();
    if(!rows.length) return '<tr><td colspan="11" class="empty">No Customer Master record matches this search.</td></tr>';
    return rows.map(function (row) {
      var c = row.customer;
      return '<tr><td class="mono">' + esc(c.customerId) + '</td><td><button class="btn sm ghost" onclick="ZEZMS.customerMaster.selectCustomer(\'' + attr(c.customerId) + '\')">' + esc(c.name || 'Unnamed customer') + '</button></td>'
        + '<td>' + esc(c.phone || '—') + '</td><td>' + esc(c.location || '—') + '</td><td>' + qualityBadge(c) + (row.profileConflict ? ' <span class="badge warn">Possible profile conflict</span>' : '') + '</td>'
        + '<td class="right">' + row.transactions + '</td><td class="right mono">' + esc(moneyValue(row.lifetimeSales)) + '</td>'
        + '<td>' + formatDate(row.firstPurchase) + '</td><td>' + formatDate(row.lastPurchase) + '</td><td class="right">' + (row.daysSince == null ? '—' : row.daysSince) + '</td><td>' + esc(row.mostUsedChannel) + '</td></tr>';
    }).join('');
  }
  function selectedStat() {
    if(!runtime.model) return null;
    return runtime.model.rows.find(function (row) { return row.customer.customerId === runtime.selectedId; }) || runtime.model.rows[0] || null;
  }
  function detailHTML() {
    var row = selectedStat();
    if(!row) return '<div class="empty">Create or import a customer to view profile and relationship details.</div>';
    runtime.selectedId = row.customer.customerId;
    var c = row.customer;
    var history = row.history.map(function (item) {
      return '<tr><td>' + formatDate(item.date) + '</td><td class="mono">' + esc(item.id) + '</td><td>' + esc(item.product) + '</td><td class="right">' + item.qty + '</td><td class="right mono">' + esc(moneyValue(item.value)) + '</td><td>' + esc(item.salesChannel) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No recorded purchase history.</td></tr>';
    return '<div class="card"><h3>Profile</h3><div class="statline"><span>Customer ID</span><b class="mono">' + esc(c.customerId) + '</b></div>'
      + '<div class="grid g2"><div class="field"><label>Name</label><input id="cmEditName" maxlength="120" value="' + attr(c.name) + '"></div>'
      + '<div class="field"><label>Telephone</label><input id="cmEditPhone" maxlength="40" inputmode="tel" value="' + attr(c.phone) + '"></div>'
      + '<div class="field"><label>Location</label><input id="cmEditLocation" maxlength="200" value="' + attr(c.location) + '"></div>'
      + '<div class="field"><label>Identity Quality</label><div>' + qualityBadge(c) + '</div></div></div>'
      + '<div class="field"><label>Notes (maximum ' + MAX_NOTES + ' characters)</label><textarea id="cmEditNotes" maxlength="' + MAX_NOTES + '" rows="4">' + esc(c.notes || '') + '</textarea></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.customerMaster.saveSelectedProfile()">Save Profile</button></div>'
      + '<p class="muted" style="font-size:11px">Created ' + esc(formatDate(c.createdAt)) + ' · Updated ' + esc(formatDate(c.updatedAt)) + '. Profile edits never rewrite historical transactions.</p></div>'
      + '<div class="card" style="margin-top:12px"><h3>Relationship Summary</h3><div class="grid g2">'
      + '<div class="statline"><span>First Purchase</span><b>' + formatDate(row.firstPurchase) + '</b></div><div class="statline"><span>Last Purchase</span><b>' + formatDate(row.lastPurchase) + '</b></div>'
      + '<div class="statline"><span>Days Since Last Purchase</span><b>' + (row.daysSince == null ? '—' : row.daysSince) + '</b></div><div class="statline"><span>Distinct Transactions</span><b>' + row.transactions + '</b></div>'
      + '<div class="statline"><span>Lifetime Sales</span><b>' + esc(moneyValue(row.lifetimeSales)) + '</b></div><div class="statline"><span>Average Transaction Value</span><b>' + esc(moneyValue(row.average)) + '</b></div>'
      + '<div class="statline"><span>Total Quantity Purchased</span><b>' + row.totalQuantity + '</b></div><div class="statline"><span>Distinct Products</span><b>' + row.products.size + '</b></div>'
      + '<div class="statline"><span>Distinct Categories</span><b>' + row.categories.size + '</b></div><div class="statline"><span>Repeat Customer</span><b>' + (row.transactions > 1 ? 'Yes' : 'No') + '</b></div>'
      + '<div class="statline"><span>Most Used Sales Source</span><b>' + esc(row.mostUsedChannel) + '</b></div>'
      + (ZEZMS.customerOutreach && typeof ZEZMS.customerOutreach.relationshipSummaryHTML === 'function' ? ZEZMS.customerOutreach.relationshipSummaryHTML(c.customerId) : '') + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Purchase History</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Receipt/Transaction ID</th><th>Product</th><th class="right">Quantity</th><th class="right">Sales Value</th><th>Sales Source</th></tr></thead><tbody>' + history + '</tbody></table></div></div>'
      + (ZEZMS.customerOutreach && typeof ZEZMS.customerOutreach.customerDetailHTML === 'function' ? ZEZMS.customerOutreach.customerDetailHTML(c.customerId) : '')
      + (ZEZMS.customerFollowups && typeof ZEZMS.customerFollowups.customerDetailHTML === 'function' ? ZEZMS.customerFollowups.customerDetailHTML(c.customerId) : '');
  }
  function viewHTML() {
    if(!ownerAdmin()) return '<div class="card"><div class="empty">Customer Master is available only to Owner or Admin.</div></div>';
    runtime.model = preparedModel();
    if(!findById(runtime.selectedId)) runtime.selectedId = runtime.model.rows[0] ? runtime.model.rows[0].customer.customerId : '';
    return '<div data-customer-master-version="' + VERSION + '" data-build="' + BUILD + '"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><div><h2 style="margin:0">Customer Master</h2><p class="muted" style="margin:4px 0 0">Persistent customer profiles joined to read-only completed-sale history.</p></div><div class="row"><button class="btn ghost" onclick="ZEZMS.customerMaster.showBuildPreview()">Build Customer Master from Sales History</button><button class="btn" onclick="ZEZMS.customerMaster.openManualCreate()">Add Customer</button></div></div>'
      + '<div class="kpis"><div class="kpi"><small>Total Customer Records</small><b>' + runtime.model.total + '</b></div><div class="kpi"><small>Phone-Identified Customers</small><b>' + runtime.model.phoneIdentified + '</b></div><div class="kpi"><small>Name-Only Customers</small><b>' + runtime.model.nameOnly + '</b></div><div class="kpi"><small>Customers with Recorded Purchases</small><b>' + runtime.model.withPurchases + '</b></div></div>'
      + '<div class="card" style="margin-top:12px"><div class="field"><label>Search by Customer Name, Telephone or Customer ID</label><input id="cmSearch" type="search" autocomplete="off" value="' + attr(runtime.searchTerm) + '" oninput="ZEZMS.customerMaster.search(this.value)"></div><div class="table-wrap"><table><thead><tr><th>Customer ID</th><th>Customer Name</th><th>Telephone</th><th>Location</th><th>Identity Quality</th><th>Transactions</th><th>Lifetime Sales</th><th>First Purchase</th><th>Last Purchase</th><th>Days Since Last Purchase</th><th>Most Used Sales Source</th></tr></thead><tbody id="cmTableBody">' + tableRowsHTML() + '</tbody></table></div></div>'
      + '<div id="cmDetail" style="margin-top:12px">' + detailHTML() + '</div></div>';
  }
  function search(value) {
    runtime.searchTerm = clean(value);
    var body = document.getElementById('cmTableBody');
    if(body && runtime.model) body.innerHTML = tableRowsHTML();
  }
  function selectCustomer(id) {
    runtime.selectedId = clean(id);
    var detail = document.getElementById('cmDetail'); if(detail) detail.innerHTML = detailHTML();
  }
  function saveSelectedProfile() {
    if(!ownerAdmin()) { notify('Only Owner or Admin can edit customers.', 'err'); return; }
    refreshIndex(); var customer = findById(runtime.selectedId); if(!customer) return;
    var name = collapse((document.getElementById('cmEditName') || {}).value);
    var rawPhone = collapse((document.getElementById('cmEditPhone') || {}).value);
    var phone = phoneIdentity(rawPhone);
    if(!name) { notify('Customer Name is required.', 'err'); return; }
    if(!phone) { notify('A usable nonblank telephone number is required.', 'err'); return; }
    var duplicate = runtime.byPhone.get(phone.key);
    if(duplicate && duplicate.customerId !== customer.customerId) { notify('Another customer already uses this telephone number.', 'err'); return; }
    var previousPhoneKey = clean(customer.phoneKey);
    customer.name = name; customer.phone = rawPhone; customer.phoneKey = phone.key;
    customer.phoneAliases = list(customer.phoneAliases);
    if(previousPhoneKey && previousPhoneKey !== phone.key && customer.phoneAliases.indexOf(previousPhoneKey) < 0) customer.phoneAliases.push(previousPhoneKey);
    customer.phoneAliases = customer.phoneAliases.filter(function (key) { return key && key !== phone.key; });
    customer.location = collapse((document.getElementById('cmEditLocation') || {}).value);
    customer.locationSource = 'manual';
    customer.notes = clean((document.getElementById('cmEditNotes') || {}).value).slice(0, MAX_NOTES);
    customer.identityQuality = 'phone'; customer.updatedAt = now();
    try { saveDB(); refreshIndex(); runtime.model = null; notify('Customer profile saved.'); render(); }
    catch(error) { notify('Customer profile could not be saved: ' + (error.message || error), 'err'); }
  }
  function openManualCreate() {
    if(!ownerAdmin()) { notify('Only Owner or Admin can create customers.', 'err'); return; }
    openModal('<h3>Add Customer</h3><div class="field"><label>Customer Name</label><input id="cmNewName" maxlength="120"></div><div class="field"><label>Telephone</label><input id="cmNewPhone" maxlength="40" inputmode="tel"></div><div class="field"><label>Location (optional)</label><input id="cmNewLocation" maxlength="200"></div><div class="field"><label>Notes (optional)</label><textarea id="cmNewNotes" maxlength="' + MAX_NOTES + '" rows="4"></textarea></div><div class="row"><button class="btn" onclick="ZEZMS.customerMaster.createManual()">Create Customer</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  }
  function createManual() {
    if(!ownerAdmin()) { notify('Only Owner or Admin can create customers.', 'err'); return; }
    var name = collapse((document.getElementById('cmNewName') || {}).value);
    var rawPhone = collapse((document.getElementById('cmNewPhone') || {}).value), phone = phoneIdentity(rawPhone);
    if(!name) { notify('Customer Name is required.', 'err'); return; }
    if(!phone) { notify('A usable telephone number is required.', 'err'); return; }
    refreshIndex(); if(runtime.byPhone.has(phone.key)) { notify('Another customer already uses this telephone number.', 'err'); return; }
    try {
      var result = upsertProfile({ name:name, phone:rawPhone, location:(document.getElementById('cmNewLocation') || {}).value, notes:(document.getElementById('cmNewNotes') || {}).value, source:'manual' }, { manual:true, persist:true });
      runtime.selectedId = result.customer.customerId; runtime.model = null; closeModal(); notify('Customer created.'); render();
    } catch(error) { notify('Customer could not be created: ' + (error.message || error), 'err'); }
  }

  function posLookupHTML() {
    refreshIndex();
    return '<div class="field" style="position:relative"><label>Find Customer</label><input id="posCustomerLookup" autocomplete="off" placeholder="Search name, telephone or Customer ID" oninput="ZEZMS.customerMaster.searchPOS(this.value)"><div id="posCustomerResults" class="suggest"></div></div><div id="posCustomerMatch" class="muted" style="font-size:11px;margin:-4px 0 8px"></div>';
  }
  function searchPOS(value) {
    var box = document.getElementById('posCustomerResults'), term = canonical(value);
    if(!box) return;
    if(!term) { box.innerHTML = ''; box.classList.remove('show'); return; }
    var matches = runtime.searchRows.filter(function (row) { return row.haystack.indexOf(term) >= 0; }).slice(0, 10);
    box.innerHTML = matches.length ? matches.map(function (row) {
      var c = row.customer;
      return '<div onclick="ZEZMS.customerMaster.selectPOS(\'' + attr(c.customerId) + '\')"><b>' + esc(c.name || 'Unnamed customer') + '</b><br><span class="muted">' + esc(c.phone || 'No telephone') + (c.location ? ' · ' + esc(c.location) : '') + '</span></div>';
    }).join('') : '<div class="none">No Customer Master match</div>';
    box.classList.add('show');
  }
  function selectPOS(id) {
    refreshIndex(); var customer = findById(id); if(!customer) return;
    var name = document.getElementById('posCust'), phone = document.getElementById('posTel'), location = document.getElementById('posLoc');
    if(name) name.value = customer.name || '';
    if(phone) phone.value = customer.phone || '';
    if(location && customer.location) location.value = customer.location;
    try { cart._cust = customer.name || ''; cart._tel = customer.phone || ''; if(customer.location) cart._loc = customer.location; cart._customerId = customer.customerId; } catch(_error) {}
    var box = document.getElementById('posCustomerResults'); if(box) { box.innerHTML = ''; box.classList.remove('show'); }
    var input = document.getElementById('posCustomerLookup'); if(input) input.value = customer.customerId + ' · ' + customer.name;
    var status = document.getElementById('posCustomerMatch'); if(status) status.textContent = 'Selected Customer Master record: ' + customer.name + ' (' + customer.customerId + ').';
  }
  function onPOSTelephoneInput(value) {
    try { cart._tel = value; } catch(_error) {}
    refreshIndex(); var identity = phoneIdentity(value), found = identity ? runtime.byPhone.get(identity.key) : null;
    var status = document.getElementById('posCustomerMatch');
    if(!found) {
      if(status) status.textContent = '';
      try { if(cart._customerId) { var selected = findById(cart._customerId); if(!selected || !identity || selected.phoneKey !== identity.key) cart._customerId = ''; } } catch(_error2) {}
      return;
    }
    if(status) status.innerHTML = 'Existing customer found: <b>' + esc(found.name) + '</b> · <button class="btn sm ghost" type="button" onclick="ZEZMS.customerMaster.selectPOS(\'' + attr(found.customerId) + '\')">Use customer</button>';
  }
  function onRemoteUpdate() { refreshIndex(); runtime.model = null; }

  refreshIndex();
  window.addEventListener('zezms-customer-master-updated', onRemoteUpdate);
  ZEZMS.customerMaster = {
    version:VERSION, build:BUILD, release:RELEASE, maxNotes:MAX_NOTES,
    ensureDB:ensureDB, refreshIndex:refreshIndex, normalizeTelephone:function (value) { var p=phoneIdentity(value); return p ? p.display : ''; },
    phoneKey:function (value) { var p=phoneIdentity(value); return p ? p.key : ''; }, canonicalName:canonical,
    stableCustomerId:stableCustomerId, findById:function (id) { refreshIndex(); return findById(id); },
    findByPhone:function (value) { refreshIndex(); return findByPhone(value); }, resolveCustomerId:resolveCustomerId,
    upsertProfile:upsertProfile, upsertAfterCommittedSale:upsertAfterCommittedSale,
    buildHistoryPreview:buildHistoryPreview, showBuildPreview:showBuildPreview, confirmBuildFromHistory:confirmBuildFromHistory,
    viewHTML:viewHTML, search:search, selectCustomer:selectCustomer, saveSelectedProfile:saveSelectedProfile,
    openManualCreate:openManualCreate, createManual:createManual,
    posLookupHTML:posLookupHTML, searchPOS:searchPOS, selectPOS:selectPOS, onPOSTelephoneInput:onPOSTelephoneInput,
    getRelationshipSnapshot:preparedModel,
    getRuntimeSnapshot:function () { return { indexVersion:runtime.indexVersion, customerCount:runtime.searchRows.length, selectedId:runtime.selectedId, modelReady:!!runtime.model }; },
    _test:{ preparedModel:preparedModel, transactionRows:transactionRows }
  };
}());

/* ZEZMS TradeFlow Owner Edition v3.15.0
   Warranty policy, entitlements, historical reconstruction and claims.
   Claim outcomes never post stock, cash, sales, purchase orders or corrections. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var VERSION = '3.15.0';
  var BUILD = '20260821-sales-pipeline-stock-warranty-r49';
  var CLAIM_STATUSES = Object.freeze(['Open', 'In Progress', 'Resolved', 'Rejected', 'Cancelled']);
  var RESOLUTIONS = Object.freeze(['Repaired', 'Replaced', 'No Fault Found', 'Warranty Exclusion', 'Goodwill Assistance', 'Other']);
  var historicalPreview = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
    });
  }
  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function isoNow() { return new Date().toISOString(); }
  function localDate(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function parseDate(value) {
    var parts = String(value || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }
  function displayDate(value) {
    var date = parseDate(value) || (value ? new Date(value) : null);
    return !date || Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }
  function daysInMonth(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
  function addCalendarMonths(dateText, months) {
    var date = parseDate(dateText);
    if (!date) throw new Error('A valid sale date is required for warranty expiry.');
    var targetIndex = date.getMonth() + Number(months || 0);
    var year = date.getFullYear() + Math.floor(targetIndex / 12);
    var month = ((targetIndex % 12) + 12) % 12;
    var day = Math.min(date.getDate(), daysInMonth(year, month));
    return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  function dayDifference(fromText, toText) {
    var from = parseDate(fromText), to = parseDate(toText);
    if (!from || !to) return 0;
    return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
  }
  function hash(value) {
    var source = String(value || ''), result = 2166136261;
    for (var index = 0; index < source.length; index += 1) { result ^= source.charCodeAt(index); result = Math.imul(result, 16777619); }
    return (result >>> 0).toString(36).toUpperCase().padStart(7, '0');
  }
  function stableWarrantyId(transactionId, customerId, productId, lineIndex, source) {
    return 'WAR-' + hash([transactionId, customerId, productId, lineIndex, source].join('|'));
  }
  function uid(prefix) {
    var random = Math.random().toString(36).slice(2, 8).toUpperCase();
    try { if (crypto && crypto.randomUUID) random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); } catch (_) {}
    return prefix + Date.now().toString(36).toUpperCase() + '-' + random;
  }
  function notify(message, type) { if (typeof toast === 'function') toast(message, type || 'ok'); }
  function save() { if (typeof saveDB !== 'function') throw new Error('The database save service is unavailable.'); saveDB(); }
  function ensureModel() {
    if (typeof DB === 'undefined' || !DB) return false;
    if (!DB.warrantySettings || typeof DB.warrantySettings !== 'object' || Array.isArray(DB.warrantySettings)) {
      DB.warrantySettings = { defaultMonths:12, categoryOverrides:{}, configured:false, updatedAt:'' };
    }
    if (!Number.isFinite(Number(DB.warrantySettings.defaultMonths))) DB.warrantySettings.defaultMonths = 12;
    DB.warrantySettings.defaultMonths = Math.max(0, Math.min(60, Math.round(Number(DB.warrantySettings.defaultMonths))));
    if (!DB.warrantySettings.categoryOverrides || typeof DB.warrantySettings.categoryOverrides !== 'object' || Array.isArray(DB.warrantySettings.categoryOverrides)) DB.warrantySettings.categoryOverrides = {};
    if (!Array.isArray(DB.warranties)) DB.warranties = [];
    if (!Array.isArray(DB.warrantyClaims)) DB.warrantyClaims = [];
    return true;
  }
  function ownerAdmin() {
    try {
      var auth = ZEZMS.staffAuth;
      if (auth && typeof auth.getContext === 'function') {
        var role = String((auth.getContext() || {}).role || '').toUpperCase();
        return role === 'OWNER' || role === 'ADMIN';
      }
    } catch (_) {}
    try { return typeof isElevated === 'function' && isElevated(); } catch (_) { return false; }
  }
  function requireOwnerAdmin() { if (!ownerAdmin()) throw new Error('Only the Owner or an Administrator can manage warranties.'); }
  function currentUser() { try { return String(session && session.cashier || 'Owner/Admin'); } catch (_) { return 'Owner/Admin'; } }
  function customer(customerId) {
    return (DB.customers || []).find(function (item) { return String(item.customerId || item.id || '') === String(customerId || ''); }) || null;
  }
  function productForLine(line) {
    var productId = String(line.productId || '');
    return (DB.products || []).find(function (item) { return productId && String(item.id || '') === productId; })
      || (DB.products || []).find(function (item) { return String(item.name || '').toLowerCase() === String(line.product || line.productName || line.name || '').toLowerCase(); }) || null;
  }
  function policyMonths(category) {
    ensureModel();
    var key = String(category || '');
    if (Object.prototype.hasOwnProperty.call(DB.warrantySettings.categoryOverrides, key)) return Math.max(0, Math.min(60, Math.round(Number(DB.warrantySettings.categoryOverrides[key]) || 0)));
    return Math.max(0, Math.min(60, Math.round(Number(DB.warrantySettings.defaultMonths) || 0)));
  }
  function savePolicy(defaultMonths, overrides) {
    requireOwnerAdmin(); ensureModel();
    var value = Number(defaultMonths);
    if (!Number.isFinite(value) || value < 0 || value > 60 || Math.round(value) !== value) throw new Error('Default warranty months must be a whole number from 0 to 60.');
    var normalized = {};
    Object.keys(overrides || {}).forEach(function (category) {
      var months = Number(overrides[category]);
      if (!Number.isFinite(months) || months < 0 || months > 60 || Math.round(months) !== months) throw new Error('Warranty months for ' + category + ' must be a whole number from 0 to 60.');
      normalized[category] = months;
    });
    DB.warrantySettings = { defaultMonths:value, categoryOverrides:normalized, configured:true, updatedAt:isoNow(), updatedBy:currentUser() };
    save(); return clone(DB.warrantySettings);
  }
  function warrantyStatus(record, todayText) {
    if (String(record.statusOverride || '').toLowerCase().indexOf('void') === 0) return 'Voided';
    var today = todayText || localDate();
    return dayDifference(today, record.endDate) >= 0 ? 'Active' : 'Expired';
  }
  function daysRemainingText(record, todayText) {
    if (warrantyStatus(record, todayText) === 'Voided') return 'Voided';
    var diff = dayDifference(todayText || localDate(), record.endDate);
    if (diff > 0) return diff + (diff === 1 ? ' day remaining' : ' days remaining');
    if (diff === 0) return 'Expires today';
    var elapsed = Math.abs(diff);
    return 'Expired ' + elapsed + (elapsed === 1 ? ' day ago' : ' days ago');
  }
  function claimForWarranty(warrantyId) {
    return (DB.warrantyClaims || []).filter(function (item) { return String(item.warrantyId) === String(warrantyId); })
      .sort(function (a, b) { return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0); })[0] || null;
  }
  function usableCustomer(customerId, phone) {
    var item = customer(customerId);
    if (!item) return null;
    var key = '';
    try { if (ZEZMS.customerMaster && ZEZMS.customerMaster.phoneKey) key = ZEZMS.customerMaster.phoneKey(item.phone || phone); } catch (_) {}
    return key ? item : null;
  }
  function buildWarrantyRecords(detail, sourceOverride) {
    ensureModel();
    var source = sourceOverride || (detail.saleType === 'QUICK' ? 'Identified Quick Sale' : 'Completed Receipt');
    var linkedCustomer = customer(detail.customerId);
    if (!linkedCustomer) return { records:[], skipped:[{ reason:'Customer Master identity unavailable' }] };
    if (detail.saleType === 'QUICK' && !usableCustomer(detail.customerId, detail.customerPhone)) return { records:[], skipped:[{ reason:'Quick Sale has no usable telephone identity' }] };
    var transactionId = String(detail.transactionId || '');
    if (!transactionId) return { records:[], skipped:[{ reason:'Sale transaction identity unavailable' }] };
    var purchaseDate = localDate(detail.date);
    var skipped = [];
    var records = [];
    (detail.lines || []).forEach(function (line, lineIndex) {
      var product = productForLine(line);
      if (!product) { skipped.push({ lineIndex:lineIndex, reason:'Product could not be resolved' }); return; }
      var months = policyMonths(product.category || '');
      if (months <= 0) { skipped.push({ lineIndex:lineIndex, reason:'Current policy is No Warranty' }); return; }
      // SALE is the stable identity source so later historical reconstruction cannot duplicate a live-sale entitlement.
      var warrantyId = stableWarrantyId(transactionId, detail.customerId, product.id || product.name, lineIndex, 'SALE');
      var now = isoNow();
      records.push({
        warrantyId:warrantyId, customerId:String(detail.customerId), saleTransactionId:transactionId,
        receiptNumber:detail.saleType === 'RECEIPT' ? transactionId : '', productId:String(product.id || ''),
        productNameSnapshot:product.name, categorySnapshot:product.category || '', coveredQty:Number(line.qty != null ? line.qty : line.quantity) || 0,
        purchaseDate:purchaseDate, warrantyMonths:months, startDate:purchaseDate, endDate:addCalendarMonths(purchaseDate, months),
        source:source, statusOverride:'', serialNumber:'', notes:'', createdAt:now, updatedAt:now, sourceLineIndex:lineIndex
      });
    });
    return { records:records, skipped:skipped };
  }
  function createForCompletedSale(detail, options) {
    var built = buildWarrantyRecords(detail || {}, options && options.source);
    var added = [];
    built.records.forEach(function (record) {
      if (!DB.warranties.some(function (item) { return String(item.warrantyId) === record.warrantyId; })) { DB.warranties.push(record); added.push(record); }
    });
    if (added.length && !(options && options.noSave)) save();
    return { created:added, skipped:built.skipped, proposed:built.records.length };
  }
  function voidBySale(transactionId, options) {
    ensureModel(); var changed = [];
    DB.warranties.forEach(function (record) {
      if (String(record.saleTransactionId) !== String(transactionId || '') || warrantyStatus(record) === 'Voided') return;
      record.statusOverride = 'Voided — Sale Reversed'; record.updatedAt = isoNow(); changed.push(record.warrantyId);
    });
    if (changed.length && !(options && options.noSave)) save();
    return changed;
  }
  function updateWarrantyDetails(warrantyId, serialNumber, notes) {
    requireOwnerAdmin();
    var record = DB.warranties.find(function (item) { return String(item.warrantyId) === String(warrantyId); });
    if (!record) throw new Error('Warranty not found.');
    record.serialNumber = String(serialNumber || '').trim().slice(0, 180);
    record.notes = String(notes || '').trim().slice(0, 2000);
    record.updatedAt = isoNow(); save(); return record;
  }
  function recordClaim(data) {
    requireOwnerAdmin(); ensureModel();
    var input = data || {};
    var warranty = DB.warranties.find(function (item) { return String(item.warrantyId) === String(input.warrantyId || ''); });
    if (!warranty) throw new Error('Warranty not found.');
    var claimDate = String(input.claimDate || localDate());
    if (!parseDate(claimDate)) throw new Error('A valid Claim Date is required.');
    var issue = String(input.issueDescription || '').trim().slice(0, 2000);
    if (!issue) throw new Error('Issue Description is required.');
    if (warrantyStatus(warranty) === 'Expired' && input.confirmExpired !== true) throw new Error('Warranty has expired. Confirm historical/customer-service claim recording explicitly.');
    var now = isoNow();
    var claim = {
      claimId:uid('WCL-'), warrantyId:warranty.warrantyId, customerId:warranty.customerId,
      claimDate:claimDate, issueDescription:issue, status:'Open', resolution:'', resolutionNotes:'',
      resolvedAt:'', createdAt:now, updatedAt:now, createdBy:currentUser()
    };
    DB.warrantyClaims.push(claim); save(); return claim;
  }
  function updateClaim(claimId, changes) {
    requireOwnerAdmin(); ensureModel();
    var claim = DB.warrantyClaims.find(function (item) { return String(item.claimId) === String(claimId || ''); });
    if (!claim) throw new Error('Warranty claim not found.');
    var input = changes || {};
    var status = input.status != null ? String(input.status) : claim.status;
    if (CLAIM_STATUSES.indexOf(status) < 0) throw new Error('Select a valid claim status.');
    var resolution = input.resolution != null ? String(input.resolution) : claim.resolution;
    if (status === 'Resolved' && RESOLUTIONS.indexOf(resolution) < 0) throw new Error('Select a controlled resolution outcome.');
    if (resolution && RESOLUTIONS.indexOf(resolution) < 0) throw new Error('Select a controlled resolution outcome.');
    claim.status = status; claim.resolution = status === 'Resolved' ? resolution : (resolution || '');
    if (input.resolutionNotes != null) claim.resolutionNotes = String(input.resolutionNotes).trim().slice(0, 2000);
    claim.resolvedAt = status === 'Resolved' ? (claim.resolvedAt || isoNow()) : '';
    claim.updatedAt = isoNow(); save(); return claim;
  }
  function metrics(todayText) {
    ensureModel(); var today = todayText || localDate();
    var active = DB.warranties.filter(function (item) { return warrantyStatus(item, today) === 'Active'; });
    return {
      active:active.length,
      expiring30:active.filter(function (item) { var days = dayDifference(today, item.endDate); return days >= 0 && days <= 30; }).length,
      expired:DB.warranties.filter(function (item) { return warrantyStatus(item, today) === 'Expired'; }).length,
      openClaims:DB.warrantyClaims.filter(function (item) { return item.status === 'Open' || item.status === 'In Progress'; }).length,
      activeCustomers:new Set(active.map(function (item) { return item.customerId; }).filter(Boolean)).size
    };
  }
  function phoneKey(value) {
    try { if (ZEZMS.customerMaster && ZEZMS.customerMaster.phoneKey) return ZEZMS.customerMaster.phoneKey(value); } catch (_) {}
    return String(value || '').replace(/\D/g, '').replace(/^2330/, '233');
  }
  function filterWarranties(criteria) {
    ensureModel(); var query = criteria || {};
    var name = String(query.customerName || '').trim().toLowerCase();
    var telephone = phoneKey(query.telephone || '');
    var receipt = String(query.receipt || '').trim().toLowerCase();
    var product = String(query.product || '').trim().toLowerCase();
    return DB.warranties.filter(function (record) {
      var cust = customer(record.customerId) || {};
      return (!name || String(cust.name || '').toLowerCase().indexOf(name) >= 0)
        && (!telephone || phoneKey(cust.phone || '').indexOf(telephone) >= 0)
        && (!receipt || String(record.receiptNumber || record.saleTransactionId || '').toLowerCase().indexOf(receipt) >= 0)
        && (!product || (String(record.productNameSnapshot || '') + ' ' + String(record.productId || '')).toLowerCase().indexOf(product) >= 0);
    });
  }
  function historicalSaleDetails() {
    var results = [];
    (DB.sales || []).forEach(function (sale) {
      if (['VOID','UNDONE','CANCELLED'].indexOf(String(sale.status || '').toUpperCase()) >= 0) return;
      var cust = customer(sale.customerId);
      if (!cust && ZEZMS.customerMaster && ZEZMS.customerMaster.findByPhone) cust = ZEZMS.customerMaster.findByPhone(sale.contact || sale.phone || '');
      results.push({ saleType:'RECEIPT', transactionId:sale.receiptNo || sale.id, customerId:cust ? cust.customerId : '', customerPhone:sale.contact || '', date:sale.date, lines:sale.lines || [] });
    });
    (DB.inventoryTxns || []).forEach(function (txn) {
      if (txn.type !== 'SALE_OUT' || txn.subtype !== 'QUICK' || ['VOID','UNDONE','CANCELLED'].indexOf(String(txn.status || '').toUpperCase()) >= 0) return;
      var cust = customer(txn.customerId);
      if (!cust && ZEZMS.customerMaster && ZEZMS.customerMaster.findByPhone) cust = ZEZMS.customerMaster.findByPhone(txn.customerPhone || '');
      results.push({ saleType:'QUICK', transactionId:txn.id, customerId:cust ? cust.customerId : '', customerPhone:txn.customerPhone || '', date:txn.date, lines:txn.details && txn.details.lines || [] });
    });
    return results;
  }
  function previewHistoricalBuild() {
    requireOwnerAdmin(); ensureModel();
    var sales = historicalSaleDetails();
    var preview = { completedSales:sales.length, eligibleSaleLines:0, identifiableCustomers:0, policyEligible:0, existing:0, proposed:[], ambiguous:0 };
    sales.forEach(function (detail) {
      preview.eligibleSaleLines += (detail.lines || []).length;
      if (!detail.customerId) { preview.ambiguous += (detail.lines || []).length || 1; return; }
      preview.identifiableCustomers += 1;
      var built = buildWarrantyRecords(detail, 'Historical Sales Reconstruction');
      preview.policyEligible += built.records.length;
      preview.ambiguous += built.skipped.filter(function (item) { return item.reason.indexOf('Product') >= 0; }).length;
      built.records.forEach(function (record) {
        if (DB.warranties.some(function (item) { return item.warrantyId === record.warrantyId; })) preview.existing += 1;
        else preview.proposed.push(record);
      });
    });
    historicalPreview = preview;
    return clone(preview);
  }
  function commitHistoricalBuild(preview) {
    requireOwnerAdmin(); ensureModel(); var source = preview || historicalPreview;
    if (!source || !Array.isArray(source.proposed)) throw new Error('Run historical warranty preview first.');
    var added = [];
    source.proposed.forEach(function (record) {
      if (!DB.warranties.some(function (item) { return item.warrantyId === record.warrantyId; })) { DB.warranties.push(clone(record)); added.push(record.warrantyId); }
    });
    if (added.length) save(); historicalPreview = null; return added;
  }
  function showHistoricalPreview() {
    try {
      var preview = previewHistoricalBuild();
      openModal('<h3>Build Warranty Register from Sales History</h3><div class="card" style="border-color:#f59e0b"><b>Historical policy warning</b><p>Historical warranty reconstruction uses the current warranty policy because the original policy was not recorded at sale time. Review before confirming.</p></div>'
        + '<div class="statline"><span>Completed sales reviewed</span><b>' + preview.completedSales + '</b></div><div class="statline"><span>Eligible completed sale lines</span><b>' + preview.eligibleSaleLines + '</b></div><div class="statline"><span>Identifiable customers</span><b>' + preview.identifiableCustomers + '</b></div><div class="statline"><span>Products/categories with current warranty policy</span><b>' + preview.policyEligible + '</b></div><div class="statline"><span>Already-existing warranties</span><b>' + preview.existing + '</b></div><div class="statline"><span>Proposed new warranties</span><b>' + preview.proposed.length + '</b></div><div class="statline"><span>Ambiguous/unresolved records</span><b>' + preview.ambiguous + '</b></div>'
        + '<div class="row" style="margin-top:14px"><button class="btn warn" onclick="ZEZMS.warrantyManagement.confirmHistoricalBuild()">Confirm Historical Build</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
    } catch (error) { notify(error.message || error, 'err'); }
  }
  function confirmHistoricalBuild() {
    try { var added = commitHistoricalBuild(); closeModal(); notify(added.length + ' historical warranty record(s) created.'); render(); }
    catch (error) { notify(error.message || error, 'err'); }
  }
  function categories() {
    return Array.from(new Set((DB.products || []).map(function (item) { return String(item.category || '').trim(); }).filter(Boolean))).sort();
  }
  function policyHTML() {
    ensureModel(); var settings = DB.warrantySettings;
    var defaultValue = settings.configured ? String(settings.defaultMonths) : '';
    var rows = categories().map(function (category, index) {
      var has = Object.prototype.hasOwnProperty.call(settings.categoryOverrides, category);
      return '<tr><td>' + esc(category) + '</td><td><input class="warranty-category-months" data-category="' + attr(category) + '" type="number" min="0" max="60" step="1" value="' + (has ? attr(settings.categoryOverrides[category]) : '') + '" placeholder="Default: ' + attr(settings.defaultMonths) + '"></td><td>' + (has && Number(settings.categoryOverrides[category]) === 0 ? 'No Warranty' : (has ? esc(settings.categoryOverrides[category] + ' months') : 'Uses default')) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="empty">Add product categories to configure overrides.</td></tr>';
    return '<div class="card" style="margin-top:12px"><h3>Warranty Policy</h3><p class="muted">0 = No Warranty. Maximum 60 months. Blank category fields inherit the default.</p><div class="field"><label>Default Warranty Months</label><input id="warrantyDefaultMonths" type="number" min="0" max="60" step="1" value="' + defaultValue + '" placeholder="12"><small class="muted">' + (settings.configured ? 'Persisted policy shown.' : '12 months is background guidance until you save the policy.') + '</small></div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Warranty Months</th><th>Effect</th></tr></thead><tbody>' + rows + '</tbody></table></div><button class="btn" onclick="ZEZMS.warrantyManagement.savePolicyForm()">Save Warranty Policy</button></div>';
  }
  function savePolicyForm() {
    try {
      var field = document.getElementById('warrantyDefaultMonths');
      var defaultValue = String(field && field.value || '').trim();
      if (!defaultValue) defaultValue = String(DB.warrantySettings.defaultMonths == null ? 12 : DB.warrantySettings.defaultMonths);
      var overrides = {};
      document.querySelectorAll('.warranty-category-months').forEach(function (input) { if (String(input.value).trim() !== '') overrides[input.dataset.category] = Number(input.value); });
      savePolicy(Number(defaultValue), overrides); notify('Warranty policy saved. Existing warranties remain unchanged.'); render();
    } catch (error) { notify(error.message || error, 'err'); }
  }
  function recordClaimForm(warrantyId) {
    var warranty = DB.warranties.find(function (item) { return item.warrantyId === warrantyId; });
    if (!warranty) throw new Error('Warranty not found.');
    var status = warrantyStatus(warranty);
    return '<h3>Record Warranty Claim</h3><div class="statline"><span>Warranty</span><b class="mono">' + esc(warranty.warrantyId) + '</b></div><div class="statline"><span>Coverage</span><b>' + esc(status) + '</b></div>'
      + (status === 'Expired' ? '<div class="card" style="border-color:#f59e0b"><b>Warranty has expired.</b><p>This claim can be stored only for historical/customer-service purposes after explicit confirmation.</p><label><input id="claimExpiredConfirm" type="checkbox"> I confirm recording an expired-warranty claim.</label></div>' : '')
      + '<div class="field"><label>Claim Date</label><input id="claimDate" type="date" value="' + localDate() + '"></div><div class="field"><label>Issue Description</label><textarea id="claimIssue" rows="5" maxlength="2000"></textarea></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.warrantyManagement.saveClaimForm(\'' + attr(warrantyId) + '\')">Record Claim</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function openClaimForm(warrantyId) { try { requireOwnerAdmin(); openModal(recordClaimForm(warrantyId)); } catch (error) { notify(error.message || error, 'err'); } }
  function saveClaimForm(warrantyId) {
    try {
      var claim = recordClaim({ warrantyId:warrantyId, claimDate:(document.getElementById('claimDate') || {}).value, issueDescription:(document.getElementById('claimIssue') || {}).value, confirmExpired:!!((document.getElementById('claimExpiredConfirm') || {}).checked) });
      closeModal(); notify('Warranty claim recorded · ' + claim.claimId); render();
    } catch (error) { notify(error.message || error, 'err'); }
  }
  function claimUpdateForm(claimId) {
    var claim = DB.warrantyClaims.find(function (item) { return item.claimId === claimId; });
    if (!claim) throw new Error('Claim not found.');
    function opts(values, selected) { return values.map(function (value) { return '<option value="' + attr(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join(''); }
    return '<h3>Update Warranty Claim</h3><div class="statline"><span>Claim ID</span><b class="mono">' + esc(claim.claimId) + '</b></div><div class="field"><label>Status</label><select id="claimStatus" onchange="ZEZMS.warrantyManagement.toggleResolution()">' + opts(CLAIM_STATUSES, claim.status) + '</select></div>'
      + '<div id="claimResolutionWrap"' + (claim.status === 'Resolved' ? '' : ' hidden') + '><div class="field"><label>Resolution</label><select id="claimResolution"><option value="">Select outcome</option>' + opts(RESOLUTIONS, claim.resolution) + '</select></div><div class="card" style="margin-bottom:10px"><b>Stock safeguard</b><p class="muted">Choosing Replaced records an outcome only. It creates no stock movement, Sale Out, Stock Correction or cash entry.</p></div></div>'
      + '<div class="field"><label>Resolution Notes</label><textarea id="claimResolutionNotes" rows="4">' + esc(claim.resolutionNotes || '') + '</textarea></div><div class="row"><button class="btn" onclick="ZEZMS.warrantyManagement.saveClaimUpdate(\'' + attr(claimId) + '\')">Save Claim</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function openClaimUpdate(claimId) { try { openModal(claimUpdateForm(claimId)); } catch (error) { notify(error.message || error, 'err'); } }
  function toggleResolution() { var wrap = document.getElementById('claimResolutionWrap'), status = document.getElementById('claimStatus'); if (wrap) wrap.hidden = !status || status.value !== 'Resolved'; }
  function saveClaimUpdate(claimId) {
    try { updateClaim(claimId, { status:(document.getElementById('claimStatus') || {}).value, resolution:(document.getElementById('claimResolution') || {}).value, resolutionNotes:(document.getElementById('claimResolutionNotes') || {}).value }); closeModal(); notify('Warranty claim updated.'); render(); }
    catch (error) { notify(error.message || error, 'err'); }
  }
  function detailHTML(warrantyId) {
    var record = DB.warranties.find(function (item) { return String(item.warrantyId) === String(warrantyId); });
    if (!record) return '<div class="empty">Warranty not found.</div>';
    var cust = customer(record.customerId) || {};
    var claims = DB.warrantyClaims.filter(function (item) { return item.warrantyId === record.warrantyId; }).sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); });
    var rows = claims.map(function (claim) { return '<tr><td class="mono">' + esc(claim.claimId) + '</td><td>' + displayDate(claim.claimDate) + '</td><td>' + esc(claim.issueDescription) + '</td><td>' + esc(claim.status) + '</td><td>' + esc(claim.resolution || '—') + '</td><td>' + (claim.resolvedAt ? displayDate(claim.resolvedAt) : '—') + '</td><td>' + esc(claim.resolutionNotes || '—') + '</td><td><button class="btn sm ghost" onclick="ZEZMS.warrantyManagement.openClaimUpdate(\'' + attr(claim.claimId) + '\')">Update</button></td></tr>'; }).join('') || '<tr><td colspan="8" class="empty">No warranty claims.</td></tr>';
    return '<h3>Warranty Detail</h3><div class="grid g2"><div><div class="statline"><span>Warranty ID</span><b class="mono">' + esc(record.warrantyId) + '</b></div><div class="statline"><span>Customer</span><b>' + esc(cust.name || '') + '</b></div><div class="statline"><span>Telephone</span><b>' + esc(cust.phone || '') + '</b></div><div class="statline"><span>Product</span><b>' + esc(record.productNameSnapshot) + '</b></div><div class="statline"><span>Product ID</span><b class="mono">' + esc(record.productId) + '</b></div></div><div><div class="statline"><span>Purchase Date</span><b>' + displayDate(record.purchaseDate) + '</b></div><div class="statline"><span>Warranty Period</span><b>' + esc(record.warrantyMonths) + ' months</b></div><div class="statline"><span>Warranty End</span><b>' + displayDate(record.endDate) + '</b></div><div class="statline"><span>Status</span><b>' + esc(warrantyStatus(record)) + '</b></div><div class="statline"><span>Source</span><b>' + esc(record.source) + '</b></div></div></div>'
      + '<div class="grid g2"><div class="field"><label>Serial Number / Device Identifier (optional)</label><input id="warrantySerial" maxlength="180" value="' + attr(record.serialNumber || '') + '"></div><div class="field"><label>Warranty Notes</label><textarea id="warrantyNotes" rows="3">' + esc(record.notes || '') + '</textarea></div></div><div class="row"><button class="btn" onclick="ZEZMS.warrantyManagement.saveWarrantyDetail(\'' + attr(record.warrantyId) + '\')">Save Warranty Details</button><button class="btn warn" onclick="ZEZMS.warrantyManagement.openClaimForm(\'' + attr(record.warrantyId) + '\')">Record Warranty Claim</button></div>'
      + '<div class="card" style="margin-top:12px"><h3>Claim History</h3><div class="table-wrap"><table><thead><tr><th>Claim ID</th><th>Date</th><th>Issue</th><th>Status</th><th>Resolution</th><th>Resolution Date</th><th>Notes</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function openWarranty(warrantyId) { openModal(detailHTML(warrantyId) + '<div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">Close</button></div>'); }
  function saveWarrantyDetail(warrantyId) {
    try { updateWarrantyDetails(warrantyId, (document.getElementById('warrantySerial') || {}).value, (document.getElementById('warrantyNotes') || {}).value); notify('Warranty details saved.'); }
    catch (error) { notify(error.message || error, 'err'); }
  }
  function searchFromUI() {
    var criteria = { customerName:(document.getElementById('warrantySearchName') || {}).value, telephone:(document.getElementById('warrantySearchPhone') || {}).value, receipt:(document.getElementById('warrantySearchReceipt') || {}).value, product:(document.getElementById('warrantySearchProduct') || {}).value };
    var ids = new Set(filterWarranties(criteria).map(function (item) { return item.warrantyId; }));
    document.querySelectorAll('.warranty-register-row').forEach(function (row) { row.style.display = ids.has(row.dataset.warrantyId) ? '' : 'none'; });
  }
  function warrantyRows() {
    return DB.warranties.slice().sort(function (a, b) { return Date.parse(b.purchaseDate || 0) - Date.parse(a.purchaseDate || 0); }).map(function (record) {
      var cust = customer(record.customerId) || {}, claim = claimForWarranty(record.warrantyId);
      return '<tr class="warranty-register-row" data-warranty-id="' + attr(record.warrantyId) + '"><td class="mono">' + esc(record.warrantyId) + '</td><td>' + esc(cust.name || 'Customer unavailable') + '</td><td>' + esc(cust.phone || '—') + '</td><td>' + esc(record.productNameSnapshot) + '</td><td class="mono">' + esc(record.productId) + '</td><td class="mono">' + esc(record.receiptNumber || record.saleTransactionId) + '</td><td>' + displayDate(record.purchaseDate) + '</td><td>' + esc(record.warrantyMonths) + ' months</td><td>' + displayDate(record.endDate) + '</td><td>' + esc(daysRemainingText(record)) + '</td><td>' + esc(warrantyStatus(record)) + '</td><td>' + esc(claim ? claim.status : 'No claim') + '</td><td><button class="btn sm ghost" onclick="ZEZMS.warrantyManagement.openWarranty(\'' + attr(record.warrantyId) + '\')">Open</button></td></tr>';
    }).join('') || '<tr><td colspan="13" class="empty">No warranty records.</td></tr>';
  }
  function viewHTML() {
    ensureModel(); var stat = metrics();
    return '<div data-warranty-management="' + VERSION + '"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div><h2 style="margin:0">Warranty Management</h2><p class="muted" style="margin:4px 0">Entitlements are linked to Customer Master and completed sales.</p></div><button class="btn ghost" onclick="ZEZMS.warrantyManagement.showHistoricalPreview()">Build Warranty Register from Sales History</button></div>'
      + '<div class="grid g2"><div class="field"><label>Search Customer Name</label><input id="warrantySearchName" oninput="ZEZMS.warrantyManagement.searchFromUI()" placeholder="Partial, case-insensitive"></div><div class="field"><label>Search Telephone Number</label><input id="warrantySearchPhone" inputmode="tel" oninput="ZEZMS.warrantyManagement.searchFromUI()" placeholder="Formatting differences are normalised"></div><div class="field"><label>Search Receipt Number</label><input id="warrantySearchReceipt" oninput="ZEZMS.warrantyManagement.searchFromUI()"></div><div class="field"><label>Search Product Name / Product ID</label><input id="warrantySearchProduct" oninput="ZEZMS.warrantyManagement.searchFromUI()"></div></div>'
      + '<div class="grid g3"><div class="card kpi green"><h3>Active Warranties</h3><div class="val">' + stat.active + '</div></div><div class="card kpi amber"><h3>Expiring Within 30 Days</h3><div class="val">' + stat.expiring30 + '</div></div><div class="card kpi blue"><h3>Expired Warranties</h3><div class="val">' + stat.expired + '</div></div><div class="card kpi pink"><h3>Open Warranty Claims</h3><div class="val">' + stat.openClaims + '</div></div><div class="card kpi teal"><h3>Customers with Active Warranty</h3><div class="val">' + stat.activeCustomers + '</div></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Warranty Register</h3><div class="table-wrap"><table><thead><tr><th>Warranty ID</th><th>Customer</th><th>Telephone</th><th>Product</th><th>Product ID</th><th>Receipt</th><th>Purchase Date</th><th>Warranty Period</th><th>Warranty End</th><th>Days Remaining</th><th>Status</th><th>Claim Status</th><th>Action</th></tr></thead><tbody>' + warrantyRows() + '</tbody></table></div></div>' + policyHTML() + '</div>';
  }
  function customerSummaryHTML(customerId) {
    ensureModel(); var rows = DB.warranties.filter(function (item) { return String(item.customerId) === String(customerId || ''); });
    var body = rows.map(function (record) { var claim = claimForWarranty(record.warrantyId); return '<tr><td>' + esc(record.productNameSnapshot) + '</td><td>' + displayDate(record.purchaseDate) + '</td><td>' + displayDate(record.endDate) + '</td><td>' + esc(warrantyStatus(record)) + '</td><td>' + esc(claim ? claim.status : 'No claim') + '</td><td><button class="btn sm ghost" onclick="ZEZMS.warrantyManagement.openWarranty(\'' + attr(record.warrantyId) + '\')">Open</button></td></tr>'; }).join('') || '<tr><td colspan="6" class="empty">No warranties linked to this customer.</td></tr>';
    return '<div class="card" style="margin-top:12px"><h3>Warranties</h3><div class="table-wrap"><table><thead><tr><th>Product</th><th>Purchase Date</th><th>Warranty End</th><th>Status</th><th>Claim Status</th><th>Action</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function installRender() {
    if (typeof render !== 'function' || render.__warrantyManagementV3150) return;
    var previous = render;
    render = function () {
      if (currentView !== 'warranty-management') return previous.apply(this, arguments);
      if (!ownerAdmin()) { notify('Only the Owner or an Administrator can open Warranty Management.', 'err'); currentView = 'pos'; return previous(); }
      if (typeof updatePeriodUI === 'function') updatePeriodUI(); if (typeof applyRoleUI === 'function') applyRoleUI();
      document.getElementById('viewRoot').innerHTML = viewHTML(); return true;
    };
    render.__warrantyManagementV3150 = true;
  }
  window.addEventListener('zezms-sale-committed', function (event) {
    try {
      var result = createForCompletedSale(event && event.detail || {});
      if (result.created.length) notify(result.created.length + ' warranty entitlement(s) registered.');
    } catch (error) { console.error('Warranty persistence failed after completed sale', error); notify('Sale completed, but warranty records could not be created: ' + (error.message || error), 'warn'); }
  });
  window.addEventListener('zezms-sale-reversed', function (event) {
    try { voidBySale(event && event.detail && event.detail.transactionId, { noSave:true }); }
    catch (error) { console.error('Warranty void after sale reversal failed', error); }
  });
  ensureModel(); installRender();
  ZEZMS.warrantyManagement = {
    version:VERSION, build:BUILD, claimStatuses:CLAIM_STATUSES, resolutions:RESOLUTIONS,
    ensureModel:ensureModel, policyMonths:policyMonths, savePolicy:savePolicy,
    stableWarrantyId:stableWarrantyId, addCalendarMonths:addCalendarMonths, warrantyStatus:warrantyStatus, daysRemainingText:daysRemainingText,
    createForCompletedSale:createForCompletedSale, voidBySale:voidBySale, updateWarrantyDetails:updateWarrantyDetails,
    recordClaim:recordClaim, updateClaim:updateClaim, metrics:metrics, filterWarranties:filterWarranties,
    previewHistoricalBuild:previewHistoricalBuild, commitHistoricalBuild:commitHistoricalBuild,
    viewHTML:viewHTML, customerSummaryHTML:customerSummaryHTML, searchFromUI:searchFromUI,
    savePolicyForm:savePolicyForm, showHistoricalPreview:showHistoricalPreview, confirmHistoricalBuild:confirmHistoricalBuild,
    openWarranty:openWarranty, saveWarrantyDetail:saveWarrantyDetail, openClaimForm:openClaimForm, saveClaimForm:saveClaimForm,
    openClaimUpdate:openClaimUpdate, toggleResolution:toggleResolution, saveClaimUpdate:saveClaimUpdate,
    _test:{ buildWarrantyRecords:buildWarrantyRecords, historicalSaleDetails:historicalSaleDetails, phoneKey:phoneKey, dayDifference:dayDifference }
  };
}());

/* ZEZMS TradeFlow Owner Edition v3.28.23 / r67W.
   Proforma invoices are non-posting documents in the established quotations
   collection. This module owns only the Proforma page and never wraps global
   rendering, navigation, permissions, or quotation functions. */
(function () {
  'use strict';

  var VERSION = '3.28.23';
  var BUILD = '20260921-r67w-proforma-fleet-print';
  var ROUTE = 'proforma-invoices';
  var DOCUMENT_TYPE = 'PROFORMA_INVOICE';
  var PRICE_ADJUSTMENT_PIN = '0000';
  var draft = null;
  var itemDraft = null;
  var editorVisible = false;
  var adjustmentUnlocked = false;
  var vatUnlocked = false;

  function db() { return (typeof DB !== 'undefined' && DB) || window.DB || {}; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]; }); }
  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
  function number(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function round(value) { return Math.round(number(value) * 100) / 100; }
  function money(value) { try { return typeof window.fmt === 'function' ? window.fmt(value) : 'GH₵ ' + number(value).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }); } catch (_) { return 'GH₵ ' + number(value).toFixed(2); } }
  function notify(message, tone) { try { if (typeof window.toast === 'function') window.toast(message, tone || 'ok'); } catch (_) {} }
  function isoNow() { return new Date().toISOString(); }
  function today() { var date = new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function collection() { var data = db(); if (!Array.isArray(data.quotations)) data.quotations = []; return data.quotations; }
  function isProforma(record) { return String(record && record.documentType || '').toUpperCase() === DOCUMENT_TYPE; }
  function proformas() { return collection().filter(isProforma); }
  /* `quotations` is a strict M4/3 collection: its cloud identity is quotationId.
     r67V saved PFIs with an id and proformaNo but omitted that identity, so they
     stayed local. The PFI number is already stable and unique, so reuse it rather
     than creating a second business identifier. */
  function syncIdentity(record) { return String(record && (record.quotationId || record.id || record.proformaNo) || '').trim(); }
  function repairLegacySyncIdentities() {
    var repaired = [];
    proformas().forEach(function (record) {
      var identity = syncIdentity(record);
      if (!identity || String(record.quotationId || '') === identity) return;
      var collision = collection().some(function (other) { return other !== record && String(other && other.quotationId || '') === identity; });
      if (collision) return;
      record.quotationId = identity;
      repaired.push(identity);
    });
    if (repaired.length) {
      if (typeof window.saveDB !== 'function') throw new Error('The database save service is unavailable for the Proforma sync-identity repair.');
      window.saveDB();
      notify(repaired.length + ' legacy Proforma ' + (repaired.length === 1 ? 'identity was' : 'identities were') + ' prepared for normal M4/3 sync. No sale, stock, cash or account entry was created.', 'ok');
    }
    return repaired;
  }
  function stockRows() { return Array.isArray(db().stockRows) ? db().stockRows : []; }
  function productList() { return Array.isArray(db().products) ? db().products : []; }
  function customerList() { return Array.isArray(db().customers) ? db().customers : []; }
  function currentPrice(product) {
    try { if (typeof window.getBaseUnitPrice === 'function') return round(window.getBaseUnitPrice(product.name)); } catch (_) {}
    return round(product && product.uPrice);
  }
  function productByName(value) {
    var query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return productList().find(function (product) { return String(product && product.name || '').trim().toLowerCase() === query; }) || null;
  }
  function productById(value) {
    var query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return productList().find(function (product) { return String(product && product.id || '').trim().toLowerCase() === query; }) || null;
  }
  function availableStock(product) {
    if (!product) return 0;
    var period = null;
    try { if (typeof window.getLatestMonth === 'function') period = window.getLatestMonth(); } catch (_) {}
    return round(stockRows().filter(function (row) {
      var same = product.id && row.productId ? String(row.productId) === String(product.id) : String(row.productName || '').toLowerCase() === String(product.name || '').toLowerCase();
      return same && (!period || (Number(row.year) === Number(period.year) && Number(row.month) === Number(period.month)));
    }).reduce(function (sum, row) { return sum + number(row.rStock); }, 0));
  }
  function nextNumber(date) {
    var compact = String(date || today()).replace(/[^0-9]/g, '').slice(0, 8);
    var prefix = 'PFI-' + compact + '-';
    var largest = proformas().reduce(function (highest, record) {
      var suffix = String(record.proformaNo || '').slice(prefix.length);
      return String(record.proformaNo || '').indexOf(prefix) === 0 && /^\d+$/.test(suffix) ? Math.max(highest, Number(suffix)) : highest;
    }, 0);
    return prefix + String(largest + 1).padStart(3, '0');
  }
  function blankDraft() {
    var date = today();
    return { id:'', proformaNo:nextNumber(date), date:date, validUntil:'', reference:'', notes:'', terms:'', customerId:'', customerName:'', telephone:'', location:'', vatRate:0, lines:[] };
  }
  function activeDraft() { if (!draft) draft = blankDraft(); return draft; }
  function blankItem() { return { productId:'', productName:'', availableStock:0, baseUnitPrice:0, priceAdjustment:0, quantity:1 }; }
  function activeItem() { if (!itemDraft) itemDraft = blankItem(); return itemDraft; }
  function lineTotal(line) { return round(number(line && line.quantity) * number(line && line.effectiveUnitPrice != null ? line.effectiveUnitPrice : line && line.unitPrice)); }
  function totals(record) {
    var source = record || activeDraft();
    var subtotal = round((source.lines || []).reduce(function (sum, line) { return sum + lineTotal(line); }, 0));
    var vatRate = Math.max(0, Math.min(100, number(source.vatRate)));
    var vatAmount = round(subtotal * vatRate / 100);
    /* A PFI is a non-posting proposal. Its protected VAT rate is calculated
       directly from the draft rather than inheriting Sale Out's posting-state
       switches, which can legitimately report zero for an inactive tax mode. */
    return { subtotal:subtotal, vatRate:vatRate, vatAmount:vatAmount, grandTotal:round(subtotal + vatAmount) };
  }
  function field(id) { return document.getElementById(id); }
  function value(id) { var node = field(id); return node ? String(node.value || '') : ''; }
  function captureEditor() {
    if (!editorVisible) return activeDraft();
    var current = activeDraft();
    current.date = value('pfiDate') || current.date || today();
    current.validUntil = value('pfiValidUntil');
    current.reference = value('pfiReference').trim();
    current.notes = value('pfiNotes').trim();
    current.terms = value('pfiTerms').trim();
    current.customerName = value('pfiCustomerName').trim();
    current.telephone = value('pfiTelephone').trim();
    current.location = value('pfiLocation').trim();
    current.vatRate = Math.max(0, Math.min(100, number(value('pfiVatRate'))));
    if (!current.id) current.proformaNo = nextNumber(current.date);
    return current;
  }
  function customerOptions(selected) {
    return '<option value="">Find saved customer</option>' + customerList().map(function (customer) {
      var id = String(customer && (customer.id || customer.customerId) || '');
      var label = String(customer && (customer.name || customer.customerName) || '');
      return '<option value="' + attr(id) + '"' + (id === String(selected || '') ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  function productOptions(property) {
    return productList().map(function (product) { return '<option value="' + attr(product && product[property] || '') + '"></option>'; }).join('');
  }
  function registerHTML() {
    return '<div class="card" id="pfiRegister"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">Proforma Invoices</h2><p class="muted" style="margin:5px 0 0">Pre-sale commercial documents. Saving never posts Sale Out, stock, cash, FIFO, debtors, creditors or accounts.</p></div><button type="button" class="btn" onclick="ZEZMS.proformaInvoiceR67W.newDraft()">New Proforma Invoice</button></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Date</th><th>Proforma No.</th><th>Customer</th><th>Telephone</th><th class="right">Total</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody id="pfiHistoryBody">' + historyRows() + '</tbody></table></div></div>';
  }
  /* Links deliberately carry the register actions. Existing financial modules
     may legitimately listen for generic table buttons; PFI controls have their
     own explicit actions and must not participate in those unrelated paths. */
  function historyRows() {
    var rows = proformas().slice().sort(function (left, right) { return String(right.updatedAt || right.date || '').localeCompare(String(left.updatedAt || left.date || '')); });
    if (!rows.length) return '<tr><td colspan="7" class="empty">No saved Proforma Invoices yet.</td></tr>';
    return rows.map(function (record) {
      var key = String(record.id || record.proformaNo || '');
      var actions = '<a href="#pfi-view" role="button" class="btn sm ghost" data-pfi-id="' + attr(key) + '" onpointerdown="ZEZMS.proformaInvoiceR67W.show(this.dataset.pfiId);event.preventDefault();event.stopPropagation()" onclick="ZEZMS.proformaInvoiceR67W.show(this.dataset.pfiId);return false">View Proforma</a>'
        + '<a href="#pfi-edit" role="button" class="btn sm ghost" data-pfi-id="' + attr(key) + '" onpointerdown="ZEZMS.proformaInvoiceR67W.edit(this.dataset.pfiId);event.preventDefault();event.stopPropagation()" onclick="ZEZMS.proformaInvoiceR67W.edit(this.dataset.pfiId);return false">Edit Proforma</a>'
        + '<a href="#pfi-print" role="button" class="btn sm ghost" data-pfi-id="' + attr(key) + '" onpointerdown="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);event.preventDefault();event.stopPropagation()" onclick="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);return false">Print Proforma</a>';
      return '<tr data-pfi-record="' + attr(key) + '"><td>' + esc(record.date || '') + '</td><td class="mono">' + esc(record.proformaNo || record.id) + '</td><td>' + esc(record.customerName || record.customer || '') + '</td><td>' + esc(record.telephone || record.contact || '') + '</td><td class="right mono">' + esc(money(totals(record).grandTotal)) + '</td><td><span class="badge ok">' + esc(record.status || 'OPEN') + '</span></td><td class="right"><div class="row" style="gap:5px;justify-content:flex-end">' + actions + '</div></td></tr>';
    }).join('');
  }
  function editorHTML() {
    var current = activeDraft(); var item = activeItem();
    var calculated = totals(current);
    var rows = current.lines.map(function (line, index) {
      return '<tr><td>' + (index + 1) + '</td><td class="mono">' + esc(line.productId) + '</td><td>' + esc(line.productName) + '</td><td class="right">' + esc(line.quantity) + '</td><td class="right mono">' + esc(money(line.baseUnitPrice)) + '</td><td class="right mono">' + esc(money(line.priceAdjustment)) + '</td><td class="right mono">' + esc(money(line.effectiveUnitPrice)) + '</td><td class="right mono">' + esc(money(lineTotal(line))) + '</td><td class="right"><button type="button" class="btn sm danger" onclick="ZEZMS.proformaInvoiceR67W.removeLine(' + index + ')">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="9" class="empty">Add products to this non-posting Proforma Invoice.</td></tr>';
    return '<div class="card" id="pfiEditorPanel"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><h3 style="margin:0">' + (current.id ? 'Edit Proforma Invoice' : 'New Proforma Invoice') + '</h3><p class="muted" style="margin:4px 0 0">The editor is local to this page; adding lines does not reload the application.</p></div><button type="button" class="btn ghost" onclick="ZEZMS.proformaInvoiceR67W.cancelEditor()">Close editor</button></div><div class="grid g2" style="margin-top:12px"><div class="field"><label>Find Customer</label><select id="pfiCustomerSelect" onchange="ZEZMS.proformaInvoiceR67W.selectCustomer()">' + customerOptions(current.customerId) + '</select></div><div class="field"><label>Customer Name</label><input id="pfiCustomerName" value="' + attr(current.customerName) + '" autocomplete="name"></div><div class="field"><label>Telephone</label><input id="pfiTelephone" value="' + attr(current.telephone) + '" inputmode="tel"></div><div class="field"><label>Location</label><input id="pfiLocation" value="' + attr(current.location) + '"></div><div class="field"><label>Proforma No.</label><input value="' + attr(current.proformaNo) + '" readonly></div><div class="field"><label>Date</label><input id="pfiDate" type="date" value="' + attr(current.date) + '"></div><div class="field"><label>Valid Until</label><input id="pfiValidUntil" type="date" value="' + attr(current.validUntil) + '"></div><div class="field"><label>Reference</label><input id="pfiReference" value="' + attr(current.reference) + '"></div></div><div class="field"><label>Notes</label><textarea id="pfiNotes" style="min-height:64px">' + esc(current.notes) + '</textarea></div><div class="field"><label>Terms</label><textarea id="pfiTerms" style="min-height:64px">' + esc(current.terms) + '</textarea></div><hr><h3>Add item</h3><div class="grid g3"><div class="field"><label>Search Product Name</label><input id="pfiProductName" list="pfiNames" oninput="ZEZMS.proformaInvoiceR67W.productFromName()" value="' + attr(item.productName) + '" placeholder="Product name"><datalist id="pfiNames">' + productOptions('name') + '</datalist></div><div class="field"><label>Search Product ID</label><input id="pfiProductId" list="pfiIds" oninput="ZEZMS.proformaInvoiceR67W.productFromId()" value="' + attr(item.productId) + '" placeholder="Product ID"><datalist id="pfiIds">' + productOptions('id') + '</datalist></div><div class="field"><label>Available stock</label><input id="pfiAvailableStock" value="' + attr(item.availableStock) + '" readonly><small class="muted">Display warning only; Proforma does not reserve stock.</small></div><div class="field"><label>Base Unit Price</label><input id="pfiBaseUnitPrice" value="' + attr(number(item.baseUnitPrice).toFixed(2)) + '" readonly></div><div class="field"><label>Price Adjustment</label><input id="pfiPriceAdjustment" type="number" step="0.01" value="' + attr(number(item.priceAdjustment).toFixed(2)) + '" readonly oninput="ZEZMS.proformaInvoiceR67W.updateEffectivePrice()"><button type="button" class="btn sm ghost" style="margin-top:5px" onclick="ZEZMS.proformaInvoiceR67W.unlockAdjustment()">Unlock price adjustment (PIN)</button></div><div class="field"><label>Effective Unit Price</label><input id="pfiEffectiveUnitPrice" value="' + attr(round(number(item.baseUnitPrice) + number(item.priceAdjustment)).toFixed(2)) + '" readonly></div><div class="field"><label>Quantity</label><input id="pfiQuantity" type="number" min="0.01" step="0.01" value="' + attr(item.quantity) + '" oninput="ZEZMS.proformaInvoiceR67W.setQuantity()"></div></div><div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn" onclick="ZEZMS.proformaInvoiceR67W.addLine()">Add line</button><button type="button" class="btn ghost" onclick="ZEZMS.proformaInvoiceR67W.clearItem()">Clear item</button></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>No.</th><th>Product ID</th><th>Product Name</th><th class="right">Qty</th><th class="right">Base Price</th><th class="right">Adjustment</th><th class="right">Effective Price</th><th class="right">Line Total</th><th></th></tr></thead><tbody id="pfiLineBody">' + rows + '</tbody></table></div><div class="grid g3" style="margin-top:12px"><div class="field"><label>VAT (%)</label><input id="pfiVatRate" type="number" min="0" max="100" step="0.01" value="' + attr(current.vatRate) + '" readonly><button type="button" class="btn sm ghost" style="margin-top:5px" onclick="ZEZMS.proformaInvoiceR67W.unlockVat()">Unlock VAT (PIN)</button></div><div class="statline"><span>Subtotal</span><b id="pfiSubtotal" class="mono">' + esc(money(calculated.subtotal)) + '</b></div><div class="statline"><span>Grand Total</span><b id="pfiGrandTotal" class="mono">' + esc(money(calculated.grandTotal)) + '</b></div></div><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn" onclick="ZEZMS.proformaInvoiceR67W.save()">Save Proforma Invoice</button>' + (current.id ? '<a href="#pfi-print" role="button" class="btn ghost" data-pfi-id="' + attr(current.id) + '" onpointerdown="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);event.preventDefault();event.stopPropagation()" onclick="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);return false">Print / Reprint PDF</a>' : '') + '</div></div>';
  }
  function refreshPage() {
    var root = document.querySelector('section[data-zezms-proforma-invoice-r67w]');
    if (root) root.outerHTML = viewHTML();
  }
  function updateTotalsUI() { var calculated = totals(captureEditor()); var subtotal = field('pfiSubtotal'); var total = field('pfiGrandTotal'); if (subtotal) subtotal.textContent = money(calculated.subtotal); if (total) total.textContent = money(calculated.grandTotal); }
  function showEditor() { editorVisible = true; var slot = field('pfiEditorSlot'); if (slot) slot.innerHTML = editorHTML(); }
  function newDraft() { draft = blankDraft(); itemDraft = blankItem(); adjustmentUnlocked = false; vatUnlocked = false; showEditor(); }
  function cancelEditor() { captureEditor(); editorVisible = false; adjustmentUnlocked = false; vatUnlocked = false; var slot = field('pfiEditorSlot'); if (slot) slot.innerHTML = ''; }
  function selectCustomer() {
    var selected = value('pfiCustomerSelect');
    var customer = customerList().find(function (item) { return String(item && (item.id || item.customerId) || '') === selected; });
    if (!customer) return;
    var current = activeDraft(); current.customerId = selected; current.customerName = String(customer.name || customer.customerName || ''); current.telephone = String(customer.tel || customer.telephone || customer.phone || ''); current.location = String(customer.location || customer.address || '');
    if (field('pfiCustomerName')) field('pfiCustomerName').value = current.customerName;
    if (field('pfiTelephone')) field('pfiTelephone').value = current.telephone;
    if (field('pfiLocation')) field('pfiLocation').value = current.location;
  }
  function setProduct(product) {
    if (!product) return false;
    var item = activeItem(); item.productId = String(product.id || ''); item.productName = String(product.name || ''); item.availableStock = availableStock(product); item.baseUnitPrice = currentPrice(product); if (!adjustmentUnlocked) item.priceAdjustment = 0;
    if (field('pfiProductName')) field('pfiProductName').value = String(product.name || '');
    if (field('pfiProductId')) field('pfiProductId').value = String(product.id || '');
    if (field('pfiAvailableStock')) field('pfiAvailableStock').value = String(item.availableStock);
    if (field('pfiBaseUnitPrice')) field('pfiBaseUnitPrice').value = item.baseUnitPrice.toFixed(2);
    if (!adjustmentUnlocked && field('pfiPriceAdjustment')) field('pfiPriceAdjustment').value = '0.00';
    updateEffectivePrice();
    return true;
  }
  function productFromName() { return setProduct(productByName(value('pfiProductName'))); }
  function productFromId() { return setProduct(productById(value('pfiProductId'))); }
  function updateEffectivePrice() { var item = activeItem(); item.baseUnitPrice = number(value('pfiBaseUnitPrice')) || item.baseUnitPrice; item.priceAdjustment = number(value('pfiPriceAdjustment')); var price = round(item.baseUnitPrice + item.priceAdjustment); var effective = field('pfiEffectiveUnitPrice'); if (effective) effective.value = price.toFixed(2); }
  function setQuantity() { activeItem().quantity = number(value('pfiQuantity')) || 0; }
  function guardedUnlock(title, callback) {
    try {
      if (typeof window.promptPIN === 'function') { window.promptPIN(title, PRICE_ADJUSTMENT_PIN, callback); return true; }
    } catch (_) {}
    notify('The protected PIN service is unavailable. No protected value was changed.', 'warn');
    return false;
  }
  function bindAdjustmentInput(input) { if (!input) return; input.readOnly = false; input.oninput = updateEffectivePrice; }
  function unlockAdjustment() { return guardedUnlock('Proforma Price Adjustment Entry Guard', function () { adjustmentUnlocked = true; var input = field('pfiPriceAdjustment'); if (input) { bindAdjustmentInput(input); input.focus(); } notify('Price Adjustment unlocked for this line only.', 'ok'); }); }
  function bindVatInput(input) { if (!input) return; input.readOnly = false; input.oninput = function () { activeDraft().vatRate = Math.max(0, Math.min(100, number(input.value))); updateTotalsUI(); }; }
  function unlockVat() { return guardedUnlock('Proforma VAT Entry Guard', function () { vatUnlocked = true; var input = field('pfiVatRate'); if (input) { bindVatInput(input); input.focus(); } notify('VAT unlocked for this Proforma draft.', 'ok'); }); }
  function clearItem() { adjustmentUnlocked = false; itemDraft = blankItem(); if (field('pfiProductName')) field('pfiProductName').value = ''; if (field('pfiProductId')) field('pfiProductId').value = ''; if (field('pfiAvailableStock')) field('pfiAvailableStock').value = '0'; if (field('pfiBaseUnitPrice')) field('pfiBaseUnitPrice').value = '0.00'; if (field('pfiPriceAdjustment')) { field('pfiPriceAdjustment').value = '0.00'; field('pfiPriceAdjustment').readOnly = true; } if (field('pfiEffectiveUnitPrice')) field('pfiEffectiveUnitPrice').value = '0.00'; if (field('pfiQuantity')) field('pfiQuantity').value = '1'; }
  function addLine() {
    captureEditor();
    var item = activeItem(); var product = productById(value('pfiProductId')) || productByName(value('pfiProductName')) || productById(item.productId) || productByName(item.productName);
    var quantity = number(value('pfiQuantity')) || item.quantity; var base = number(value('pfiBaseUnitPrice')) || item.baseUnitPrice; var adjustment = number(value('pfiPriceAdjustment')) || item.priceAdjustment; var stock = availableStock(product);
    if (!product) { notify('Choose a current product by Name or Product ID before adding a line.', 'warn'); return false; }
    if (!(quantity > 0)) { notify('Quantity must be greater than zero.', 'warn'); return false; }
    if (adjustment !== 0 && !adjustmentUnlocked) { notify('Price Adjustment is locked. Use the protected 0000 PIN before changing it.', 'warn'); return false; }
    if (quantity > stock) notify('Quantity exceeds displayed available stock. This is a warning only; the Proforma does not reserve stock.', 'warn');
    activeDraft().lines.push({ productId:String(product.id || ''), productName:String(product.name || ''), quantity:quantity, availableStock:stock, baseUnitPrice:base, priceAdjustment:round(adjustment), effectiveUnitPrice:round(base + adjustment), unitPrice:round(base + adjustment) });
    var body = field('pfiLineBody'); if (body) { showEditor(); } else { showEditor(); }
    clearItem(); updateTotalsUI();
    return true;
  }
  function removeLine(index) { captureEditor(); activeDraft().lines.splice(Number(index), 1); showEditor(); }
  function save() {
    var current = captureEditor();
    if (!current.customerName) { notify('Customer Name is required before saving a Proforma Invoice.', 'warn'); return false; }
    if (!current.lines.length) { notify('Add at least one product before saving a Proforma Invoice.', 'warn'); return false; }
    var now = isoNow(); var rows = collection(); var existing = rows.find(function (record) { return isProforma(record) && (String(record && record.id || '') === String(current.id || '') || String(record && record.proformaNo || '') === String(current.proformaNo || '')); }) || null; var calculated = totals(current);
    var recordId = String(existing && existing.id || current.id || current.proformaNo || '');
    var record = { id:recordId, quotationId:syncIdentity(existing) || recordId, proformaNo:existing ? existing.proformaNo : current.proformaNo, documentType:DOCUMENT_TYPE, status:existing && existing.status ? existing.status : 'OPEN', date:current.date, validUntil:current.validUntil, reference:current.reference, notes:current.notes, terms:current.terms, customerId:current.customerId, customerName:current.customerName, customer:current.customerName, telephone:current.telephone, contact:current.telephone, location:current.location, lines:current.lines.map(function (line) { return Object.assign({}, line, { lineTotal:lineTotal(line) }); }), subtotal:calculated.subtotal, vatRate:calculated.vatRate, vatAmount:calculated.vatAmount, total:calculated.grandTotal, grandTotal:calculated.grandTotal, createdAt:existing && existing.createdAt ? existing.createdAt : now, updatedAt:now, cashier:(window.session && window.session.cashier) || '' };
    if (existing) Object.assign(existing, record); else rows.push(record);
    if (typeof window.saveDB !== 'function') throw new Error('The database save service is unavailable.');
    window.saveDB();
    draft = clone(record); cancelEditor(); refreshPage();
    /* A pre-existing save hook may refresh the current route after persistence.
       Repaint only the dedicated register on the next turn so that hook cannot
       leave the PFI history stale. This never invokes global render/navigation. */
    window.setTimeout(refreshPage, 250);
    notify(existing ? 'Proforma Invoice updated. No Sale Out, stock, cash, FIFO or account entry was created.' : 'Proforma Invoice saved. No Sale Out, stock, cash, FIFO or account entry was created.', 'ok');
    return record;
  }
  function recordById(id) { return proformas().find(function (record) { var key = String(id || ''); return String(record && record.id || '') === key || String(record && record.proformaNo || '') === key || String(record && record.quotationId || '') === key; }) || null; }
  function edit(id) { var record = recordById(id); if (!record) { notify('Proforma Invoice not found.', 'err'); return false; } draft = clone(record); if (!draft.id) draft.id = String(record.proformaNo || id || ''); itemDraft = blankItem(); adjustmentUnlocked = false; vatUnlocked = false; showEditor(); return true; }
  function previewHTML(record) {
    var calculated = totals(record); var rows = (record.lines || []).map(function (line) { return '<tr><td>' + esc(line.productName || line.product) + '</td><td class="right">' + esc(line.quantity) + '</td><td class="right mono">' + esc(money(line.effectiveUnitPrice != null ? line.effectiveUnitPrice : line.unitPrice)) + '</td><td class="right mono">' + esc(money(lineTotal(line))) + '</td></tr>'; }).join('');
    return '<div class="card" id="pfiPreview"><div class="row" style="justify-content:space-between"><div><h3 style="margin:0">PROFORMA INVOICE</h3><p class="muted">' + esc(record.proformaNo || record.id) + ' · ' + esc(record.date) + '</p></div><button type="button" class="btn ghost" onclick="ZEZMS.proformaInvoiceR67W.closePreview()">Close preview</button></div><div class="grid g2"><div><b>Customer</b><br>' + esc(record.customerName || record.customer) + '<br>' + esc(record.telephone || record.contact || '') + '<br>' + esc(record.location || '') + '</div><div><b>Valid Until</b><br>' + esc(record.validUntil || 'Not specified') + '<br><b>Reference</b><br>' + esc(record.reference || '-') + '</div></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Effective Unit Price</th><th class="right">Line Total</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="statline" style="margin-top:12px"><span>Grand Total</span><b class="mono">' + esc(money(calculated.grandTotal)) + '</b></div><p class="muted">This Proforma Invoice is a preliminary commercial document and does not confirm payment or completion of sale.</p><a href="#pfi-print" role="button" class="btn" data-pfi-id="' + attr(record.id) + '" onpointerdown="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);event.preventDefault();event.stopPropagation()" onclick="ZEZMS.proformaInvoiceR67W.download(this.dataset.pfiId);return false">Download PDF</a></div>';
  }
  function show(id) { var record = recordById(id); if (!record) return false; var slot = field('pfiPreviewSlot'); if (slot) slot.innerHTML = previewHTML(record); return true; }
  function closePreview() { var slot = field('pfiPreviewSlot'); if (slot) slot.innerHTML = ''; }
  async function buildPdf(record) {
    var pdfExport = window.ZEZMS && window.ZEZMS.pdfExport;
    var SimplePDF = pdfExport && pdfExport.SimplePDF;
    if (typeof SimplePDF !== 'function') throw new Error('The established offline PDF engine is unavailable.');
    var watermark = typeof pdfExport.loadDocumentWatermark === 'function' ? await pdfExport.loadDocumentWatermark() : null;
    var business = db().business || window.BUSINESS || {}; var calculated = totals(record); var pdf = new SimplePDF({ width:595, height:842 }, { margin:36, watermark:watermark });
    pdf.heading(String(business.name || 'ZEZMS TradeFlow'), 16); pdf.paragraph([business.address, business.tel ? 'Tel: ' + business.tel : ''].filter(Boolean).join(' | '), { size:8.5, after:6 }); pdf.heading('PROFORMA INVOICE', 14); pdf.keyValue('Proforma No.', record.proformaNo || record.id || ''); pdf.keyValue('Date', record.date || ''); pdf.keyValue('Valid Until', record.validUntil || 'Not specified'); pdf.keyValue('Customer', record.customerName || record.customer || ''); pdf.keyValue('Telephone', record.telephone || record.contact || ''); pdf.keyValue('Location', record.location || ''); pdf.keyValue('Reference', record.reference || '-'); pdf.paragraph('Pre-sale commercial proposal only. It does not reserve stock, confirm payment, or complete a sale.', { size:9, bold:true, after:8 });
    pdf.table(['#', 'Product', 'Qty', 'Base', 'Adjustment', 'Effective', 'Line Total'], (record.lines || []).map(function (line, index) { return [String(index + 1), String(line.productName || line.product || ''), String(line.quantity), money(line.baseUnitPrice), money(line.priceAdjustment), money(line.effectiveUnitPrice != null ? line.effectiveUnitPrice : line.unitPrice), money(lineTotal(line))]; }), [24, 152, 42, 73, 78, 78, 76], ['right', 'left', 'right', 'right', 'right', 'right', 'right']);
    pdf.summary([{ label:'Subtotal', value:money(calculated.subtotal) }, { label:'VAT (' + calculated.vatRate + '%)', value:money(calculated.vatAmount) }, { label:'Grand Total', value:money(calculated.grandTotal), strong:true }]); if (record.terms) pdf.paragraph('Terms: ' + record.terms, { size:8.5 }); if (record.notes) pdf.paragraph('Notes: ' + record.notes, { size:8.5 }); pdf.signatures('Authorised Signature', 'Customer acknowledgement', { approved:true }); pdf.paragraph('This Proforma Invoice is a preliminary commercial document and does not confirm payment or completion of sale.', { size:8.5, bold:true }); return pdf.finish();
  }
  async function download(id) { var record = recordById(id); if (!record) { notify('Proforma Invoice not found.', 'err'); return false; } try { var bytes = await buildPdf(record); var blob = new Blob([bytes], { type:'application/pdf' }); var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = String(record.proformaNo || record.id || 'Proforma-Invoice').replace(/[^A-Za-z0-9_-]+/g, '_') + '.pdf'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000); notify('Proforma Invoice PDF downloaded. No sale or financial entry was created.', 'ok'); return true; } catch (error) { notify(error && error.message ? error.message : String(error), 'err'); return false; } }
  function viewHTML() {
    /* A pre-existing live-sync refresh may ask the central router to render the
       current route. Rehydrate only this page's in-memory draft; never replace
       global render/nav/access functions or observe the document. */
    repairLegacySyncIdentities();
    if (editorVisible && (vatUnlocked || adjustmentUnlocked)) window.setTimeout(function () { if (vatUnlocked) bindVatInput(field('pfiVatRate')); if (adjustmentUnlocked) bindAdjustmentInput(field('pfiPriceAdjustment')); }, 0);
    return '<section data-zezms-proforma-invoice-r67w><style>[data-zezms-proforma-invoice-r67w] textarea{min-height:64px}[data-zezms-proforma-invoice-r67w] #pfiEditorPanel{margin-top:12px}@media(max-width:700px){[data-zezms-proforma-invoice-r67w] .grid.g3{grid-template-columns:1fr!important}[data-zezms-proforma-invoice-r67w] .table-wrap{font-size:12px}}</style>' + registerHTML() + '<div id="pfiEditorSlot">' + (editorVisible ? editorHTML() : '') + '</div><div id="pfiPreviewSlot"></div></section>';
  }

  window.viewProformaInvoices = viewHTML;
  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.proformaInvoiceR67W = Object.freeze({ version:VERSION, build:BUILD, route:ROUTE, documentType:DOCUMENT_TYPE, priceAdjustmentPin:PRICE_ADJUSTMENT_PIN, proformas:proformas, totals:totals, repairLegacySyncIdentities:repairLegacySyncIdentities, newDraft:newDraft, cancelEditor:cancelEditor, selectCustomer:selectCustomer, productFromName:productFromName, productFromId:productFromId, updateEffectivePrice:updateEffectivePrice, setQuantity:setQuantity, unlockAdjustment:unlockAdjustment, unlockVat:unlockVat, clearItem:clearItem, addLine:addLine, removeLine:removeLine, save:save, edit:edit, show:show, closePreview:closePreview, buildPdf:buildPdf, download:download, viewHTML:viewHTML });
}());

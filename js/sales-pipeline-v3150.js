/* ZEZMS TradeFlow Owner Edition v3.15.0
   Stage 6A sales opportunities and quotations.
   Quotations are commercial proposals only: this module never posts stock, cash, debt or profit. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var VERSION = '3.15.0';
  var BUILD = '20260821-sales-pipeline-stock-warranty-r49';
  var OPPORTUNITY_STATUSES = Object.freeze(['New', 'Contacted', 'Quotation Prepared', 'Negotiating', 'Won', 'Lost', 'Cancelled']);
  var QUOTATION_STATUSES = Object.freeze(['Draft', 'Issued', 'Accepted', 'Rejected', 'Expired', 'Converted', 'Cancelled']);
  var LOST_REASONS = Object.freeze(['Price', 'Product Unavailable', 'Customer Chose Competitor', 'Customer Postponed Purchase', 'No Response', 'Financing/Budget', 'Requirement Changed', 'Other']);
  var SALES_CHANNELS = Object.freeze(['Walk-in', 'WhatsApp', 'Facebook', 'TikTok', 'Instagram', 'Phone Call', 'Referral', 'Corporate/B2B', 'Other']);
  var ACTIVE_OPPORTUNITY = new Set(['New', 'Contacted', 'Quotation Prepared', 'Negotiating']);
  var ACTIVE_QUOTATION = new Set(['Draft', 'Issued', 'Accepted']);
  var draftLines = [];
  var editingQuotationId = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
    });
  }

  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function money(value) {
    return 'GH₵ ' + (Number(value) || 0).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function number(value) { return (Number(value) || 0).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function round2(value) { return Math.round((Number(value) || 0) * 100) / 100; }
  function isoNow() { return new Date().toISOString(); }
  function localDate(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function displayDate(value) {
    if (!value) return '—';
    var date = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }
  function uid(prefix) {
    var random = Math.random().toString(36).slice(2, 8).toUpperCase();
    try { if (crypto && crypto.randomUUID) random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); } catch (_) {}
    return prefix + Date.now().toString(36).toUpperCase() + '-' + random;
  }
  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
  }
  function save() {
    if (typeof saveDB !== 'function') throw new Error('The database save service is unavailable.');
    saveDB();
  }
  function ensureModel() {
    if (typeof DB === 'undefined' || !DB) return false;
    if (!Array.isArray(DB.salesOpportunities)) DB.salesOpportunities = [];
    if (!Array.isArray(DB.quotations)) DB.quotations = [];
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
  function requireOwnerAdmin() {
    if (!ownerAdmin()) throw new Error('Only the Owner or an Administrator can manage the sales pipeline.');
  }
  function customer(customerId) {
    ensureModel();
    return (DB.customers || []).find(function (item) { return String(item.customerId || item.id || '') === String(customerId || ''); }) || null;
  }
  function customerName(customerId) { var item = customer(customerId); return item ? (item.name || 'Unnamed customer') : 'Customer unavailable'; }
  function opportunity(opportunityId) {
    ensureModel();
    return DB.salesOpportunities.find(function (item) { return String(item.opportunityId) === String(opportunityId || ''); }) || null;
  }
  function quotation(quotationId) {
    ensureModel();
    return DB.quotations.find(function (item) { return String(item.quotationId) === String(quotationId || ''); }) || null;
  }
  function productByIdentity(value) {
    var query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return (DB.products || []).find(function (item) {
      return String(item.id || '').trim().toLowerCase() === query || String(item.name || '').trim().toLowerCase() === query;
    }) || null;
  }
  function productByLine(line) {
    return (DB.products || []).find(function (item) { return line.productId && String(item.id || '') === String(line.productId); })
      || (DB.products || []).find(function (item) { return String(item.name || '').toLowerCase() === String(line.productName || '').toLowerCase(); }) || null;
  }
  function latestPeriod() {
    if (typeof getLatestMonth === 'function') return getLatestMonth();
    return { year:DB.selectedYear, month:DB.selectedMonth };
  }
  function availableForProduct(product) {
    if (!product) return 0;
    var period = latestPeriod();
    return round2((DB.stockRows || []).filter(function (row) {
      var sameIdentity = product.id && row.productId ? String(row.productId) === String(product.id) : String(row.productName || '') === String(product.name || '');
      return sameIdentity && Number(row.year) === Number(period.year) && Number(row.month) === Number(period.month);
    }).reduce(function (sum, row) { return sum + (Number(row.rStock) || 0); }, 0));
  }
  function currentUnitPrice(product) {
    if (!product) return 0;
    try { if (typeof getBaseUnitPrice === 'function') return round2(getBaseUnitPrice(product.name)); } catch (_) {}
    return round2(product.uPrice);
  }
  function normalizeLine(source) {
    var quantity = Number(source.quantity != null ? source.quantity : source.qty) || 0;
    var unitPrice = Number(source.unitPrice != null ? source.unitPrice : source.uPrice) || 0;
    var discount = Number(source.discount != null ? source.discount : source.disc) || 0;
    return {
      productId:String(source.productId || ''),
      productName:String(source.productName || source.product || source.name || ''),
      category:String(source.category || ''),
      quantity:round2(quantity),
      unitPrice:round2(unitPrice),
      discount:round2(discount),
      vatTreatment:String(source.vatTreatment || 'STANDARD'),
      lineTotal:round2(quantity * unitPrice - discount),
      quotedAvailableQty:round2(source.quotedAvailableQty)
    };
  }
  function totals(lines, vatRate) {
    var normalized = (lines || []).map(normalizeLine);
    var subtotal = round2(normalized.reduce(function (sum, line) { return sum + line.lineTotal; }, 0));
    var discount = round2(normalized.reduce(function (sum, line) { return sum + line.discount; }, 0));
    var rate = Math.max(0, Math.min(100, Number(vatRate) || 0));
    var vatAmount = round2(subtotal * rate / 100);
    return { subtotal:subtotal, discount:discount, vatRate:rate, vatAmount:vatAmount, grandTotal:round2(subtotal + vatAmount) };
  }
  function quoteTotal(record) {
    return totals(record && record.lineItems || [], record && record.vatRate).grandTotal;
  }
  function customerOptions(selectedId) {
    return '<option value="">Select an existing Customer Master customer</option>' + (DB.customers || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }).map(function (item) {
      var id = item.customerId || item.id || '';
      return '<option value="' + attr(id) + '"' + (String(id) === String(selectedId || '') ? ' selected' : '') + '>'
        + esc(item.name || 'Unnamed') + ' · ' + esc(item.phone || '') + '</option>';
    }).join('');
  }
  function optionList(values, selected) {
    return values.map(function (value) { return '<option value="' + attr(value) + '"' + (String(value) === String(selected || '') ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('');
  }
  function createOpportunity(data) {
    requireOwnerAdmin();
    ensureModel();
    var input = data || {};
    if (!customer(input.customerId)) throw new Error('Select an existing Customer Master customer.');
    var title = String(input.title || '').trim().slice(0, 180);
    if (!title) throw new Error('Opportunity title is required.');
    var status = OPPORTUNITY_STATUSES.indexOf(input.status) >= 0 ? input.status : 'New';
    if (status === 'Lost' && LOST_REASONS.indexOf(input.lostReason) < 0) throw new Error('Select a valid lost reason.');
    var now = isoNow();
    var record = {
      opportunityId:uid('OPP-'), customerId:String(input.customerId), title:title,
      salesChannel:SALES_CHANNELS.indexOf(input.salesChannel) >= 0 ? input.salesChannel : 'Walk-in',
      status:status, createdAt:now, updatedAt:now,
      expectedDecisionDate:String(input.expectedDecisionDate || ''), notes:String(input.notes || '').trim().slice(0, 2000),
      lostReason:status === 'Lost' ? String(input.lostReason || '') : '', wonTransactionId:String(input.wonTransactionId || '')
    };
    DB.salesOpportunities.push(record);
    save();
    return record;
  }
  function updateOpportunity(opportunityId, changes) {
    requireOwnerAdmin();
    var record = opportunity(opportunityId);
    if (!record) throw new Error('Sales opportunity not found.');
    var input = changes || {};
    if (input.customerId != null && !customer(input.customerId)) throw new Error('Select an existing Customer Master customer.');
    if (input.title != null && !String(input.title).trim()) throw new Error('Opportunity title is required.');
    if (input.status != null && OPPORTUNITY_STATUSES.indexOf(input.status) < 0) throw new Error('Invalid opportunity status.');
    var nextStatus = input.status != null ? input.status : record.status;
    var nextLost = input.lostReason != null ? input.lostReason : record.lostReason;
    if (nextStatus === 'Lost' && LOST_REASONS.indexOf(nextLost) < 0) throw new Error('A controlled lost reason is required.');
    ['customerId','title','salesChannel','status','expectedDecisionDate','notes','wonTransactionId'].forEach(function (field) {
      if (input[field] != null) record[field] = String(input[field]).trim();
    });
    record.lostReason = nextStatus === 'Lost' ? String(nextLost || '') : '';
    record.updatedAt = isoNow();
    save();
    return record;
  }
  function createQuotation(data) {
    requireOwnerAdmin();
    ensureModel();
    var input = data || {};
    if (!customer(input.customerId)) throw new Error('Select an existing Customer Master customer.');
    if (input.opportunityId) {
      var linked = opportunity(input.opportunityId);
      if (!linked) throw new Error('Linked sales opportunity not found.');
      if (String(linked.customerId) !== String(input.customerId)) throw new Error('Quotation customer must match the opportunity customer.');
    }
    var lines = (input.lineItems || []).map(normalizeLine);
    if (!lines.length) throw new Error('Add at least one quotation product.');
    lines.forEach(function (line) {
      if (!line.productId || !line.productName) throw new Error('Every quotation line requires a valid Product ID and Product Name.');
      if (!(line.quantity > 0)) throw new Error('Quotation quantity must be greater than zero.');
      if (line.unitPrice < 0 || line.discount < 0 || line.discount > line.quantity * line.unitPrice) throw new Error('Quotation price or discount is invalid.');
    });
    var status = QUOTATION_STATUSES.indexOf(input.status) >= 0 ? input.status : 'Draft';
    var now = isoNow();
    var record = {
      quotationId:uid('QUO-'), opportunityId:String(input.opportunityId || ''), customerId:String(input.customerId),
      quotationDate:String(input.quotationDate || localDate()), validUntil:String(input.validUntil || ''), status:status,
      lineItems:lines, vatRate:Math.max(0, Math.min(100, Number(input.vatRate) || 0)),
      notes:String(input.notes || '').trim().slice(0, 3000), terms:String(input.terms || '').trim().slice(0, 2000),
      createdAt:now, updatedAt:now, convertedTransactionId:'',
      rootQuotationId:String(input.rootQuotationId || ''), revisionOf:String(input.revisionOf || ''), revisionNumber:Number(input.revisionNumber) || 1
    };
    if (!record.rootQuotationId) record.rootQuotationId = record.quotationId;
    DB.quotations.push(record);
    if (record.opportunityId) {
      var op = opportunity(record.opportunityId);
      if (op && ACTIVE_OPPORTUNITY.has(op.status)) { op.status = 'Quotation Prepared'; op.updatedAt = now; }
    }
    save();
    return record;
  }
  function editDraftQuotation(quotationId, data) {
    requireOwnerAdmin();
    var record = quotation(quotationId);
    if (!record) throw new Error('Quotation not found.');
    if (record.status !== 'Draft') throw new Error('Issued or accepted quotation terms are protected. Duplicate it as a revision.');
    var input = data || {};
    if (input.customerId && !customer(input.customerId)) throw new Error('Select an existing Customer Master customer.');
    if (input.opportunityId) {
      var op = opportunity(input.opportunityId);
      if (!op || String(op.customerId) !== String(input.customerId || record.customerId)) throw new Error('Quotation customer must match the opportunity customer.');
    }
    var lines = (input.lineItems || record.lineItems || []).map(normalizeLine);
    if (!lines.length) throw new Error('Add at least one quotation product.');
    lines.forEach(function (line) {
      if (!(line.quantity > 0) || line.unitPrice < 0 || line.discount < 0 || line.discount > line.quantity * line.unitPrice) throw new Error('A quotation line contains invalid commercial values.');
    });
    ['customerId','opportunityId','quotationDate','validUntil','notes','terms'].forEach(function (field) {
      if (input[field] != null) record[field] = String(input[field]);
    });
    if (input.vatRate != null) record.vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
    record.lineItems = lines;
    record.updatedAt = isoNow();
    save();
    return record;
  }
  function setQuotationStatus(quotationId, nextStatus) {
    requireOwnerAdmin();
    var record = quotation(quotationId);
    if (!record) throw new Error('Quotation not found.');
    if (QUOTATION_STATUSES.indexOf(nextStatus) < 0) throw new Error('Invalid quotation status.');
    if (record.status === 'Converted' && nextStatus !== 'Converted') throw new Error('A converted quotation cannot be reopened.');
    record.status = nextStatus;
    record.updatedAt = isoNow();
    save();
    return record;
  }
  function duplicateRevision(quotationId) {
    requireOwnerAdmin();
    var source = quotation(quotationId);
    if (!source) throw new Error('Quotation not found.');
    return createQuotation({
      opportunityId:source.opportunityId, customerId:source.customerId, quotationDate:localDate(), validUntil:source.validUntil,
      status:'Draft', lineItems:clone(source.lineItems), vatRate:source.vatRate, notes:source.notes, terms:source.terms,
      rootQuotationId:source.rootQuotationId || source.quotationId, revisionOf:source.quotationId, revisionNumber:(Number(source.revisionNumber) || 1) + 1
    });
  }
  function latestQuoteForOpportunity(opportunityId) {
    return (DB.quotations || []).filter(function (record) { return String(record.opportunityId || '') === String(opportunityId || ''); })
      .sort(function (a, b) { return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0); })[0] || null;
  }
  function latestActiveQuotes() {
    var groups = Object.create(null);
    (DB.quotations || []).forEach(function (record) {
      var key = record.opportunityId ? 'OPP:' + record.opportunityId : 'ROOT:' + (record.rootQuotationId || record.quotationId);
      var current = groups[key];
      if (!current || Date.parse(record.updatedAt || record.createdAt || 0) > Date.parse(current.updatedAt || current.createdAt || 0)) groups[key] = record;
    });
    return Object.keys(groups).map(function (key) { return groups[key]; }).filter(function (record) { return ACTIVE_QUOTATION.has(record.status); });
  }
  function pipelineMetrics() {
    ensureModel();
    var open = DB.salesOpportunities.filter(function (record) { return ACTIVE_OPPORTUNITY.has(record.status); });
    var latest = latestActiveQuotes();
    var converted = DB.quotations.filter(function (record) { return record.status === 'Converted'; }).length;
    var rejected = DB.quotations.filter(function (record) { return record.status === 'Rejected'; }).length;
    var denominator = converted + rejected;
    var openValue = round2(latest.reduce(function (sum, record) { return sum + quoteTotal(record); }, 0));
    var corporateValue = round2(latest.reduce(function (sum, record) {
      var op = opportunity(record.opportunityId);
      return sum + (op && op.salesChannel === 'Corporate/B2B' ? quoteTotal(record) : 0);
    }, 0));
    return {
      openOpportunities:open.length, openQuotationValue:openValue,
      acceptedNotConverted:DB.quotations.filter(function (record) { return record.status === 'Accepted' && !record.convertedTransactionId; }).length,
      won:DB.salesOpportunities.filter(function (record) { return record.status === 'Won'; }).length,
      lost:DB.salesOpportunities.filter(function (record) { return record.status === 'Lost'; }).length,
      pipelineCustomers:new Set(open.map(function (record) { return record.customerId; }).filter(Boolean)).size,
      corporateValue:corporateValue, conversionRate:denominator ? round2(converted / denominator * 100) : 0
    };
  }
  function markConverted(quotationId, transactionId) {
    var record = quotation(quotationId);
    if (!record || record.status === 'Converted') return false;
    record.status = 'Converted';
    record.convertedTransactionId = String(transactionId || '');
    record.updatedAt = isoNow();
    if (record.opportunityId) {
      var op = opportunity(record.opportunityId);
      if (op) { op.status = 'Won'; op.wonTransactionId = String(transactionId || ''); op.updatedAt = isoNow(); }
    }
    save();
    return true;
  }
  function loadIntoSaleOut(quotationId) {
    requireOwnerAdmin();
    var record = quotation(quotationId);
    if (!record) throw new Error('Quotation not found.');
    if (record.status !== 'Accepted') throw new Error('Only an Accepted quotation can be loaded into Sale Out.');
    if (record.convertedTransactionId) throw new Error('This quotation is already linked to a completed sale.');
    var linkedCustomer = customer(record.customerId);
    if (!linkedCustomer) throw new Error('The linked Customer Master record is unavailable.');
    var nextCart = record.lineItems.map(function (line) {
      var product = productByLine(line);
      if (!product) throw new Error('Current Product Catalog record is missing for ' + line.productName + '.');
      return { name:product.name, qty:Number(line.quantity) || 0, uPrice:Number(line.unitPrice) || 0, disc:Number(line.discount) || 0 };
    });
    if (typeof cart === 'undefined') throw new Error('Sale Out cart is unavailable.');
    if (cart.length && !window.confirm('Replace the current Sale Out cart with this accepted quotation?')) return false;
    cart = nextCart;
    cart._customerId = String(record.customerId || '');
    cart._cust = linkedCustomer.name || '';
    cart._tel = linkedCustomer.phone || '';
    cart._loc = linkedCustomer.location || '';
    cart._salesChannel = (opportunity(record.opportunityId) || {}).salesChannel || 'Walk-in';
    cart._salesChannelOther = '';
    cart._vatRate = Number(record.vatRate) || 0;
    cart._withholdingTaxRate = 0;
    try { withholdingTaxRateUnlocked = false; } catch (_) {}
    cart._paid = '';
    cart._sourceQuotationId = record.quotationId;
    if (typeof nav === 'function') nav('pos');
    notify('Quotation loaded into Sale Out. Stock and all financial rules will be revalidated when the sale is completed.');
    return true;
  }

  function opportunityForm(record) {
    var item = record || {};
    var editing = !!item.opportunityId;
    var lost = item.status === 'Lost';
    return '<h3>' + (editing ? 'Update Sales Opportunity' : 'New Sales Opportunity') + '</h3>'
      + '<div class="field"><label>Existing Customer Master customer</label><select id="oppCustomer">' + customerOptions(item.customerId) + '</select></div>'
      + '<div class="field"><label>Opportunity</label><input id="oppTitle" maxlength="180" value="' + attr(item.title || '') + '" placeholder="Products or requirement requested"></div>'
      + '<div class="grid g2"><div class="field"><label>Sales Source</label><select id="oppChannel">' + optionList(SALES_CHANNELS, item.salesChannel || 'Walk-in') + '</select></div>'
      + '<div class="field"><label>Status</label><select id="oppStatus" onchange="ZEZMS.salesPipeline.toggleLostReason()">' + optionList(OPPORTUNITY_STATUSES, item.status || 'New') + '</select></div></div>'
      + '<div id="oppLostReasonWrap" class="field"' + (lost ? '' : ' hidden') + '><label>Lost reason</label><select id="oppLostReason">' + optionList(LOST_REASONS, item.lostReason || LOST_REASONS[0]) + '</select></div>'
      + '<div class="field"><label>Expected Decision Date</label><input id="oppDecision" type="date" value="' + attr(item.expectedDecisionDate || '') + '"></div>'
      + '<div class="field"><label>Notes</label><textarea id="oppNotes" rows="4">' + esc(item.notes || '') + '</textarea></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.salesPipeline.saveOpportunityForm(\'' + attr(item.opportunityId || '') + '\')">' + (editing ? 'Save Changes' : 'Create Opportunity') + '</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function openOpportunityForm(opportunityId) {
    requireOwnerAdmin();
    var item = opportunityId ? opportunity(opportunityId) : null;
    if (opportunityId && !item) throw new Error('Sales opportunity not found.');
    openModal(opportunityForm(item));
  }
  function saveOpportunityForm(opportunityId) {
    try {
      var data = {
        customerId:document.getElementById('oppCustomer').value,
        title:document.getElementById('oppTitle').value,
        salesChannel:document.getElementById('oppChannel').value,
        status:document.getElementById('oppStatus').value,
        lostReason:document.getElementById('oppLostReason').value,
        expectedDecisionDate:document.getElementById('oppDecision').value,
        notes:document.getElementById('oppNotes').value
      };
      if (opportunityId) updateOpportunity(opportunityId, data); else createOpportunity(data);
      closeModal(); notify(opportunityId ? 'Opportunity updated.' : 'Opportunity created.'); render();
    } catch (error) { notify(error.message || String(error), 'err'); }
  }
  function toggleLostReason() {
    var select = document.getElementById('oppStatus');
    var wrap = document.getElementById('oppLostReasonWrap');
    if (wrap) wrap.hidden = !select || select.value !== 'Lost';
  }
  function opportunitySelectOptions(customerId, selected) {
    return '<option value="">Standalone quotation (no opportunity)</option>' + DB.salesOpportunities.filter(function (record) {
      return !customerId || String(record.customerId) === String(customerId);
    }).map(function (record) {
      return '<option value="' + attr(record.opportunityId) + '"' + (String(record.opportunityId) === String(selected || '') ? ' selected' : '') + '>' + esc(record.opportunityId + ' · ' + record.title) + '</option>';
    }).join('');
  }
  function productDatalist() {
    return '<datalist id="quoteProductOptions">' + (DB.products || []).map(function (product) {
      return '<option value="' + attr(product.id || product.name) + '">' + esc((product.id || 'No ID') + ' · ' + product.name) + '</option>';
    }).join('') + '</datalist>';
  }
  function quoteEditor(record, preselectedOpportunityId) {
    var item = record || {};
    editingQuotationId = item.quotationId || '';
    draftLines = clone(item.lineItems || []);
    var preOp = preselectedOpportunityId ? opportunity(preselectedOpportunityId) : null;
    var selectedCustomer = item.customerId || (preOp && preOp.customerId) || '';
    var selectedOpportunity = item.opportunityId || preselectedOpportunityId || '';
    var defaultVat = item.vatRate != null ? item.vatRate : 0;
    return '<h3>' + (item.quotationId ? 'Edit Draft Quotation' : 'New Quotation') + '</h3>'
      + '<p class="muted">This is a commercial proposal only. Saving or accepting it does not reserve stock or post a sale.</p>'
      + '<div class="grid g2"><div class="field"><label>Existing Customer Master customer</label><select id="quoteCustomer" onchange="ZEZMS.salesPipeline.refreshOpportunityOptions()">' + customerOptions(selectedCustomer) + '</select></div>'
      + '<div class="field"><label>Sales Opportunity</label><select id="quoteOpportunity">' + opportunitySelectOptions(selectedCustomer, selectedOpportunity) + '</select></div></div>'
      + '<div class="grid g3"><div class="field"><label>Quotation Date</label><input id="quoteDate" type="date" value="' + attr(item.quotationDate || localDate()) + '"></div>'
      + '<div class="field"><label>Valid Until</label><input id="quoteValid" type="date" value="' + attr(item.validUntil || '') + '"></div>'
      + '<div class="field"><label>VAT %</label><input id="quoteVat" type="number" min="0" max="100" step="0.01" value="' + attr(defaultVat || '') + '" placeholder="0" data-semantic-default="0" oninput="ZEZMS.salesPipeline.renderDraftLines()"></div></div>'
      + '<div class="card" style="margin:8px 0"><h3>Add Product</h3>' + productDatalist()
      + '<div class="row"><div class="field" style="flex:1"><label>Search Product Name or Product ID</label><input id="quoteProductSearch" list="quoteProductOptions" placeholder="Partial search is available in the list"></div>'
      + '<button class="btn" style="margin-top:18px" onclick="ZEZMS.salesPipeline.addDraftProduct()">Add Product</button></div></div>'
      + '<div id="quoteDraftLines"></div>'
      + '<div class="grid g2"><div class="field"><label>Notes</label><textarea id="quoteNotes" rows="3">' + esc(item.notes || '') + '</textarea></div><div class="field"><label>Terms</label><textarea id="quoteTerms" rows="3">' + esc(item.terms || '') + '</textarea></div></div>'
      + '<div class="row"><button class="btn" onclick="ZEZMS.salesPipeline.saveQuotationForm()">Save Draft</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>';
  }
  function openQuotationForm(quotationId, opportunityId) {
    requireOwnerAdmin();
    var item = quotationId ? quotation(quotationId) : null;
    if (item && item.status !== 'Draft') throw new Error('Commercial terms are protected after issue. Duplicate this quotation as a revision.');
    openModal(quoteEditor(item, opportunityId));
    setTimeout(renderDraftLines, 0);
  }
  function refreshOpportunityOptions() {
    var customerId = document.getElementById('quoteCustomer').value;
    var select = document.getElementById('quoteOpportunity');
    if (select) select.innerHTML = opportunitySelectOptions(customerId, '');
  }
  function addDraftProduct() {
    var input = document.getElementById('quoteProductSearch');
    var raw = String(input && input.value || '').trim();
    var product = productByIdentity(raw);
    if (!product) {
      var low = raw.toLowerCase();
      var matches = (DB.products || []).filter(function (item) {
        return String(item.name || '').toLowerCase().indexOf(low) >= 0 || String(item.id || '').toLowerCase().indexOf(low) >= 0;
      });
      if (matches.length === 1) product = matches[0];
    }
    if (!product) { notify('Select one matching Product Name or Product ID.', 'err'); return; }
    var existing = draftLines.find(function (line) { return String(line.productId) === String(product.id); });
    if (existing) { existing.quantity = round2((Number(existing.quantity) || 0) + 1); existing.lineTotal = round2(existing.quantity * existing.unitPrice - existing.discount); }
    else draftLines.push(normalizeLine({
      productId:product.id, productName:product.name, category:product.category || '', quantity:1,
      unitPrice:currentUnitPrice(product), discount:0, vatTreatment:'STANDARD', quotedAvailableQty:availableForProduct(product)
    }));
    if (input) input.value = '';
    renderDraftLines();
  }
  function syncDraftLine(index, field, value) {
    var line = draftLines[index];
    if (!line) return;
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) numeric = 0;
    line[field] = round2(numeric);
    line.lineTotal = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) - (Number(line.discount) || 0));
    renderDraftLines();
  }
  function removeDraftLine(index) { draftLines.splice(index, 1); renderDraftLines(); }
  function renderDraftLines() {
    var host = document.getElementById('quoteDraftLines');
    if (!host) return;
    var vat = Number((document.getElementById('quoteVat') || {}).value) || 0;
    var computed = totals(draftLines, vat);
    var rows = draftLines.map(function (line, index) {
      var product = productByLine(line);
      var available = availableForProduct(product);
      var warning = Number(line.quantity) > available ? '<div style="color:#f59e0b;font-size:11px">Quoted quantity exceeds current stock.</div>' : '';
      return '<tr><td><b>' + esc(line.productName) + '</b><br><span class="muted mono">' + esc(line.productId) + '</span></td><td>' + esc(line.category) + '</td>'
        + '<td class="right">' + number(available) + warning + '</td>'
        + '<td><input aria-label="Quantity" type="number" min="0.01" step="0.01" value="' + attr(line.quantity) + '" onchange="ZEZMS.salesPipeline.syncDraftLine(' + index + ',\'quantity\',this.value)"></td>'
        + '<td><input aria-label="Unit price" type="number" min="0" step="0.01" value="' + attr(line.unitPrice) + '" onchange="ZEZMS.salesPipeline.syncDraftLine(' + index + ',\'unitPrice\',this.value)"></td>'
        + '<td><input aria-label="Discount" type="number" min="0" step="0.01" value="' + attr(line.discount) + '" onchange="ZEZMS.salesPipeline.syncDraftLine(' + index + ',\'discount\',this.value)"></td>'
        + '<td class="mono right">' + number(line.lineTotal) + '</td><td><button class="btn sm danger" onclick="ZEZMS.salesPipeline.removeDraftLine(' + index + ')">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No quotation products added.</td></tr>';
    host.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th class="right">Current Stock</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th class="right">Line Total</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="card" style="margin:10px 0"><div class="statline"><span>Subtotal</span><b>' + money(computed.subtotal) + '</b></div><div class="statline"><span>Discount</span><b>' + money(computed.discount) + '</b></div><div class="statline"><span>VAT (' + number(computed.vatRate) + '%)</span><b>' + money(computed.vatAmount) + '</b></div><div class="statline"><span>Grand Total</span><b>' + money(computed.grandTotal) + '</b></div></div>';
  }
  function saveQuotationForm() {
    try {
      var data = {
        customerId:document.getElementById('quoteCustomer').value,
        opportunityId:document.getElementById('quoteOpportunity').value,
        quotationDate:document.getElementById('quoteDate').value,
        validUntil:document.getElementById('quoteValid').value,
        vatRate:document.getElementById('quoteVat').value,
        notes:document.getElementById('quoteNotes').value,
        terms:document.getElementById('quoteTerms').value,
        lineItems:clone(draftLines), status:'Draft'
      };
      var saved = editingQuotationId ? editDraftQuotation(editingQuotationId, data) : createQuotation(data);
      closeModal(); notify('Draft quotation saved · ' + saved.quotationId); render();
    } catch (error) { notify(error.message || String(error), 'err'); }
  }
  function changeQuotationStatus(quotationId, status) {
    try {
      if (!window.confirm('Change this quotation to ' + status + '? This action does not post stock or accounts.')) return;
      setQuotationStatus(quotationId, status); notify('Quotation status updated.'); render();
    } catch (error) { notify(error.message || String(error), 'err'); }
  }
  function reviseQuotation(quotationId) {
    try { var next = duplicateRevision(quotationId); notify('Revision draft created · ' + next.quotationId); openQuotationForm(next.quotationId); }
    catch (error) { notify(error.message || String(error), 'err'); }
  }
  function loadQuote(quotationId) { try { loadIntoSaleOut(quotationId); } catch (error) { notify(error.message || String(error), 'err'); } }
  function nextFollowup(op) {
    var rows = (DB.customerFollowups || []).filter(function (item) {
      return String(item.opportunityId || '') === String(op.opportunityId) || (!item.opportunityId && String(item.customerId || '') === String(op.customerId));
    }).filter(function (item) { return item.status !== 'Completed' && item.status !== 'Cancelled'; }).sort(function (a, b) { return Date.parse(a.dueAt || a.followupDate || 0) - Date.parse(b.dueAt || b.followupDate || 0); });
    return rows[0] || null;
  }
  function scheduleFollowup(opportunityId) {
    var op = opportunity(opportunityId);
    if (!op) { notify('Opportunity not found.', 'err'); return; }
    if (ZEZMS.customerFollowups && typeof ZEZMS.customerFollowups.openSchedule === 'function') {
      ZEZMS.customerFollowups.openSchedule(op.customerId, { opportunityId:op.opportunityId });
    } else if (typeof nav === 'function') nav('customer-followups');
  }
  function metricsTiles(metrics) {
    var tiles = [
      ['Open Opportunities', metrics.openOpportunities], ['Open Quotation Value', money(metrics.openQuotationValue)],
      ['Accepted Not Converted', metrics.acceptedNotConverted], ['Won', metrics.won], ['Lost', metrics.lost],
      ['Pipeline Customers', metrics.pipelineCustomers], ['Corporate/B2B Pipeline Value', money(metrics.corporateValue)],
      ['Quotation Conversion Rate', number(metrics.conversionRate) + '%']
    ];
    return '<div class="grid g3" style="margin-bottom:12px">' + tiles.map(function (tile) { return '<div class="card kpi teal"><h3>' + esc(tile[0]) + '</h3><div class="val mono" style="font-size:20px">' + esc(tile[1]) + '</div></div>'; }).join('') + '</div>';
  }
  function viewOpportunities() {
    ensureModel();
    var metrics = pipelineMetrics();
    var allRows = DB.salesOpportunities.slice().sort(function (a, b) { return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0); });
    function row(op) {
      var q = latestQuoteForOpportunity(op.opportunityId);
      var follow = nextFollowup(op);
      var status = op.status === 'Won' && !op.wonTransactionId ? 'Won — sale not linked' : op.status;
      return '<tr><td class="mono">' + esc(op.opportunityId) + '</td><td>' + esc(customerName(op.customerId)) + '</td><td>' + esc(op.title) + '</td><td>' + esc(op.salesChannel) + '</td><td>' + esc(status) + (op.status === 'Lost' ? '<br><small>' + esc(op.lostReason) + '</small>' : '') + '</td>'
        + '<td class="mono">' + esc(q ? q.quotationId : '—') + '</td><td class="mono right">' + (q ? money(quoteTotal(q)) : '—') + '</td><td>' + displayDate(op.expectedDecisionDate) + '</td><td>' + displayDate(op.updatedAt) + '</td><td>' + (follow ? displayDate(follow.dueAt || follow.followupDate) : '—') + '</td>'
        + '<td><div class="row"><button class="btn sm ghost" onclick="ZEZMS.salesPipeline.openOpportunityForm(\'' + attr(op.opportunityId) + '\')">Edit</button><button class="btn sm" onclick="ZEZMS.salesPipeline.openQuotationForm(\'\',\'' + attr(op.opportunityId) + '\')">Quotation</button><button class="btn sm ghost" onclick="ZEZMS.salesPipeline.scheduleFollowup(\'' + attr(op.opportunityId) + '\')">Follow-up</button></div></td></tr>';
    }
    var active = allRows.filter(function (op) { return ACTIVE_OPPORTUNITY.has(op.status); });
    var lost = allRows.filter(function (op) { return op.status === 'Lost'; });
    var accepted = DB.quotations.filter(function (q) { return q.status === 'Accepted' && !q.convertedTransactionId; });
    var acceptedRows = accepted.map(function (q) { return '<tr><td class="mono">' + esc(q.quotationId) + '</td><td>' + esc(customerName(q.customerId)) + '</td><td class="right mono">' + money(quoteTotal(q)) + '</td><td>' + displayDate(q.validUntil) + '</td><td><button class="btn sm" onclick="ZEZMS.salesPipeline.loadQuote(\'' + attr(q.quotationId) + '\')">Load into Sale Out</button></td></tr>'; }).join('') || '<tr><td colspan="5" class="empty">No accepted quotation is awaiting sale.</td></tr>';
    return '<div data-sales-pipeline="' + VERSION + '">' + metricsTiles(metrics)
      + '<div class="row" style="justify-content:space-between;margin-bottom:10px"><div><h3 style="margin:0">Active Sales Opportunities</h3><p class="muted" style="margin:4px 0">Potential business only; no value here is booked revenue.</p></div><button class="btn" onclick="ZEZMS.salesPipeline.openOpportunityForm()">New Opportunity</button></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Opportunity ID</th><th>Customer</th><th>Opportunity</th><th>Sales Source</th><th>Status</th><th>Latest Quotation</th><th class="right">Quoted Value</th><th>Expected Decision Date</th><th>Last Updated</th><th>Next Follow-up</th><th>Actions</th></tr></thead><tbody>' + (active.map(row).join('') || '<tr><td colspan="11" class="empty">No active sales opportunities.</td></tr>') + '</tbody></table></div>'
      + '<div class="card" style="margin-top:12px"><h3>Accepted Quotations Awaiting Sale</h3><div class="table-wrap"><table><thead><tr><th>Quotation ID</th><th>Customer</th><th class="right">Total</th><th>Valid Until</th><th>Action</th></tr></thead><tbody>' + acceptedRows + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Lost Opportunity Review</h3><div class="table-wrap"><table><thead><tr><th>Opportunity ID</th><th>Customer</th><th>Opportunity</th><th>Reason</th><th>Last Updated</th><th>Action</th></tr></thead><tbody>' + (lost.map(function (op) { return '<tr><td class="mono">' + esc(op.opportunityId) + '</td><td>' + esc(customerName(op.customerId)) + '</td><td>' + esc(op.title) + '</td><td>' + esc(op.lostReason) + '</td><td>' + displayDate(op.updatedAt) + '</td><td><button class="btn sm ghost" onclick="ZEZMS.salesPipeline.openOpportunityForm(\'' + attr(op.opportunityId) + '\')">View / Edit</button></td></tr>'; }).join('') || '<tr><td colspan="6" class="empty">No lost opportunities.</td></tr>') + '</tbody></table></div></div></div>';
  }
  function quoteActionHTML(q) {
    var buttons = ['<button class="btn sm ghost" onclick="ZEZMS.salesPipeline.viewQuotation(\'' + attr(q.quotationId) + '\')">View</button>'];
    if (q.status === 'Draft') buttons.push('<button class="btn sm" onclick="ZEZMS.salesPipeline.openQuotationForm(\'' + attr(q.quotationId) + '\')">Edit</button>', '<button class="btn sm ghost" onclick="ZEZMS.salesPipeline.changeQuotationStatus(\'' + attr(q.quotationId) + '\',\'Issued\')">Issue</button>');
    if (q.status === 'Issued') buttons.push('<button class="btn sm" onclick="ZEZMS.salesPipeline.changeQuotationStatus(\'' + attr(q.quotationId) + '\',\'Accepted\')">Accept</button>', '<button class="btn sm danger" onclick="ZEZMS.salesPipeline.changeQuotationStatus(\'' + attr(q.quotationId) + '\',\'Rejected\')">Reject</button>');
    if (q.status !== 'Draft' && q.status !== 'Converted' && q.status !== 'Cancelled') buttons.push('<button class="btn sm ghost" onclick="ZEZMS.salesPipeline.reviseQuotation(\'' + attr(q.quotationId) + '\')">Duplicate as Revision</button>');
    if (q.status === 'Accepted' && !q.convertedTransactionId) buttons.push('<button class="btn sm" onclick="ZEZMS.salesPipeline.loadQuote(\'' + attr(q.quotationId) + '\')">Load into Sale Out</button>');
    buttons.push('<button class="btn sm ghost" onclick="ZEZMS.salesPipeline.printQuotation(\'' + attr(q.quotationId) + '\')">Print</button>', '<button class="btn sm ghost" onclick="ZEZMS.salesPipeline.downloadQuotationPDF(\'' + attr(q.quotationId) + '\')">PDF</button>');
    return '<div class="row">' + buttons.join('') + '</div>';
  }
  function viewQuotations() {
    ensureModel();
    var rows = DB.quotations.slice().sort(function (a, b) { return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0); }).map(function (q) {
      var op = opportunity(q.opportunityId);
      return '<tr class="quote-register-row" data-id="' + attr(String(q.quotationId).toLowerCase()) + '" data-customer="' + attr(customerName(q.customerId).toLowerCase()) + '" data-status="' + attr(String(q.status).toLowerCase()) + '"><td class="mono">' + esc(q.quotationId) + (Number(q.revisionNumber) > 1 ? '<br><small>Revision ' + esc(q.revisionNumber) + '</small>' : '') + '</td><td>' + esc(customerName(q.customerId)) + '</td><td>' + displayDate(q.quotationDate) + '</td><td>' + displayDate(q.validUntil) + '</td><td>' + esc(q.status) + '</td><td class="mono right">' + money(quoteTotal(q)) + '</td><td>' + esc(op ? op.title : '—') + '</td><td>' + displayDate(q.updatedAt) + '</td><td>' + quoteActionHTML(q) + '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="empty">No quotations saved.</td></tr>';
    return '<div data-quotations="' + VERSION + '"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div><h3 style="margin:0">Quotations</h3><p class="muted" style="margin:4px 0">Quotations do not reserve or deduct stock.</p></div><button class="btn" onclick="ZEZMS.salesPipeline.openQuotationForm()">New Quotation</button></div>'
      + '<div class="grid g3"><div class="field"><label>Search Quotation ID</label><input id="quoteSearchId" oninput="ZEZMS.salesPipeline.filterQuotations()"></div><div class="field"><label>Search Customer</label><input id="quoteSearchCustomer" oninput="ZEZMS.salesPipeline.filterQuotations()"></div><div class="field"><label>Status</label><select id="quoteSearchStatus" onchange="ZEZMS.salesPipeline.filterQuotations()"><option value="">All statuses</option>' + optionList(QUOTATION_STATUSES, '') + '</select></div></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Quotation ID</th><th>Customer</th><th>Date</th><th>Valid Until</th><th>Status</th><th class="right">Total</th><th>Opportunity</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody id="quotationRegisterBody">' + rows + '</tbody></table></div></div>';
  }
  function filterQuotations() {
    var id = String((document.getElementById('quoteSearchId') || {}).value || '').trim().toLowerCase();
    var cust = String((document.getElementById('quoteSearchCustomer') || {}).value || '').trim().toLowerCase();
    var status = String((document.getElementById('quoteSearchStatus') || {}).value || '').trim().toLowerCase();
    document.querySelectorAll('.quote-register-row').forEach(function (row) {
      row.style.display = (!id || row.dataset.id.indexOf(id) >= 0) && (!cust || row.dataset.customer.indexOf(cust) >= 0) && (!status || row.dataset.status === status) ? '' : 'none';
    });
  }
  function quoteDocumentHTML(record, printable) {
    var cust = customer(record.customerId) || {};
    var biz = DB.business || (typeof BUSINESS !== 'undefined' ? BUSINESS : {});
    var computed = totals(record.lineItems, record.vatRate);
    var rows = record.lineItems.map(function (line, index) { return '<tr><td>' + (index + 1) + '</td><td class="mono">' + esc(line.productId) + '</td><td>' + esc(line.productName) + '</td><td class="right">' + number(line.quantity) + '</td><td class="right">' + number(line.unitPrice) + '</td><td class="right">' + number(line.discount) + '</td><td class="right">' + number(line.lineTotal) + '</td></tr>'; }).join('');
    return '<div class="quotation-paper" id="quotationPaper"><div class="quotation-watermark" aria-hidden="true"></div><div class="quotation-content"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">' + esc(biz.name || 'ZEZMS TradeFlow') + '</h2><div>' + esc(biz.address || '') + '<br>Tel: ' + esc(biz.tel || '') + '</div></div><div style="text-align:right"><h1 style="margin:0">QUOTATION</h1><b>' + esc(record.quotationId) + '</b><br>Status: ' + esc(record.status) + '</div></div><hr>'
      + '<div class="grid g2"><div><b>Customer</b><br>' + esc(cust.name || '') + '<br>' + esc(cust.phone || '') + '<br>' + esc(cust.location || '') + '</div><div style="text-align:right"><b>Date:</b> ' + displayDate(record.quotationDate) + '<br><b>Valid Until:</b> ' + displayDate(record.validUntil) + '</div></div>'
      + '<table style="width:100%;margin-top:14px;border-collapse:collapse"><thead><tr><th>#</th><th>Product ID</th><th>Product</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Discount</th><th class="right">Total</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div style="margin:14px 0 0 auto;max-width:280px"><div class="statline"><span>Subtotal</span><b>' + money(computed.subtotal) + '</b></div><div class="statline"><span>Discount</span><b>' + money(computed.discount) + '</b></div><div class="statline"><span>VAT (' + number(computed.vatRate) + '%)</span><b>' + money(computed.vatAmount) + '</b></div><div class="statline"><span>Grand Total</span><b>' + money(computed.grandTotal) + '</b></div></div>'
      + (record.notes ? '<p><b>Notes:</b> ' + esc(record.notes) + '</p>' : '') + (record.terms ? '<p><b>Terms:</b> ' + esc(record.terms) + '</p>' : '')
      + '<div style="margin-top:50px;width:46%;border-top:1px solid #111;text-align:center;padding-top:5px">Authorised Signature</div><p class="muted" style="margin-top:25px">This quotation is an offer only and is not proof of payment, stock reservation or completed sale.</p></div></div>';
  }
  function viewQuotation(quotationId) {
    var record = quotation(quotationId);
    if (!record) { notify('Quotation not found.', 'err'); return; }
    openModal(quoteDocumentHTML(record, false) + '<div class="row" style="margin-top:12px"><button class="btn" onclick="ZEZMS.salesPipeline.printQuotation(\'' + attr(record.quotationId) + '\')">System Print</button><button class="btn ghost" onclick="ZEZMS.salesPipeline.downloadQuotationPDF(\'' + attr(record.quotationId) + '\')">Download PDF</button><button class="btn ghost" onclick="closeModal()">Close</button></div>');
  }
  function printQuotation(quotationId) {
    var record = quotation(quotationId);
    if (!record) { notify('Quotation not found.', 'err'); return; }
    var frame = document.createElement('iframe');
    frame.style.position = 'fixed'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><title>Quotation ' + esc(record.quotationId) + '</title><style>@page{size:A5;margin:10mm}body{font:11px Arial;color:#111}.row{display:flex;gap:10px}.grid{display:grid}.g2{grid-template-columns:1fr 1fr}.right{text-align:right}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:4px}.statline{display:flex;justify-content:space-between;padding:3px}.quotation-paper{position:relative}.quotation-content{position:relative;z-index:2}.quotation-watermark{position:absolute;inset:0;background:url(assets/zez-document-watermark.jpg) center/contain no-repeat;opacity:.10;z-index:1}.muted{color:#555}</style></head><body>' + quoteDocumentHTML(record, true) + '</body></html>');
    doc.close();
    setTimeout(function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(function () { frame.remove(); }, 1000); } }, 250);
  }
  async function downloadQuotationPDF(quotationId) {
    var record = quotation(quotationId);
    if (!record) { notify('Quotation not found.', 'err'); return; }
    if (!ZEZMS.pdfExport || !ZEZMS.pdfExport.SimplePDF) { notify('PDF service is unavailable.', 'err'); return; }
    try {
      var watermark = await ZEZMS.pdfExport.loadDocumentWatermark();
      var pdf = new ZEZMS.pdfExport.SimplePDF({ width:419.53, height:595.28 }, { margin:28.35, watermark:watermark });
      var biz = DB.business || BUSINESS;
      var cust = customer(record.customerId) || {};
      var computed = totals(record.lineItems, record.vatRate);
      pdf.drawText(String(biz.name || 'ZEZMS TradeFlow'), pdf.margin, pdf.y, 12.5, true);
      pdf.drawText('QUOTATION', pdf.width - pdf.margin, pdf.y, 16, true, 'right'); pdf.y += 22;
      pdf.drawText(String(biz.address || ''), pdf.margin, pdf.y, 8.5, false);
      pdf.drawText('Quotation No: ' + record.quotationId, pdf.width - pdf.margin, pdf.y, 8.5, true, 'right'); pdf.y += 12;
      pdf.drawText('Tel: ' + String(biz.tel || ''), pdf.margin, pdf.y, 8.5, false);
      pdf.drawText('Date: ' + displayDate(record.quotationDate), pdf.width - pdf.margin, pdf.y, 8.5, false, 'right'); pdf.y += 12;
      pdf.drawText('Valid Until: ' + displayDate(record.validUntil), pdf.width - pdf.margin, pdf.y, 8.5, false, 'right'); pdf.y += 16;
      pdf.line(pdf.margin, pdf.y, pdf.width - pdf.margin, pdf.y, .1); pdf.y += 10;
      pdf.keyValue('Customer', cust.name || '-'); pdf.keyValue('Telephone', cust.phone || '-'); pdf.keyValue('Location', cust.location || '-'); pdf.y += 4;
      pdf.table(['#','Product ID','Product','Qty','Price','Discount','Total'], record.lineItems.map(function (line, index) {
        return [String(index + 1), line.productId || '-', line.productName || '', number(line.quantity), number(line.unitPrice), number(line.discount), number(line.lineTotal)];
      }), [16,45,100,33,56,49,64], ['center','left','left','right','right','right','right']);
      pdf.summary([{label:'Subtotal',value:'GHS ' + number(computed.subtotal)},{label:'Discount',value:'GHS ' + number(computed.discount)},{label:'VAT (' + number(computed.vatRate) + '%)',value:'GHS ' + number(computed.vatAmount)},{label:'Grand total',value:'GHS ' + number(computed.grandTotal),strong:true}]);
      if (record.notes) pdf.paragraph('Notes: ' + record.notes, { size:8.5 });
      if (record.terms) pdf.paragraph('Terms: ' + record.terms, { size:8.5 });
      pdf.signatures('Authorised Signature', 'Customer acknowledgement', { approved:false });
      pdf.paragraph('This quotation is an offer only and is not proof of payment, stock reservation or completed sale.', { size:8 });
      var bytes = pdf.finish();
      var blob = new Blob([bytes], { type:'application/pdf' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'Quotation-' + record.quotationId + '.pdf'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
      notify('Quotation PDF downloaded.');
    } catch (error) { console.error(error); notify('Quotation PDF failed: ' + (error.message || error), 'err'); }
  }
  function installStyles() {
    if (document.getElementById('salesPipelineV3150Styles')) return;
    var style = document.createElement('style'); style.id = 'salesPipelineV3150Styles';
    style.textContent = '.quotation-paper{position:relative;background:#fff;color:#111;padding:18px;min-height:520px}.quotation-content{position:relative;z-index:2}.quotation-watermark{position:absolute;inset:0;background:url(assets/zez-document-watermark.jpg) center/contain no-repeat;opacity:.10;z-index:1;pointer-events:none}.quotation-paper table th,.quotation-paper table td{border:1px solid #999;padding:5px}.quotation-paper .muted{color:#555}@media(max-width:600px){[data-sales-pipeline] .table-wrap,[data-quotations] .table-wrap{overflow-x:auto}.quotation-paper{padding:10px}.quotation-paper h1{font-size:20px}}';
    document.head.appendChild(style);
  }
  function installRender() {
    if (typeof render !== 'function' || render.__salesPipelineV3150) return;
    var previous = render;
    render = function () {
      if (currentView !== 'quotations' && currentView !== 'sales-opportunities') return previous.apply(this, arguments);
      if (!ownerAdmin()) { notify('Only the Owner or an Administrator can open this sales-pipeline page.', 'err'); currentView = 'pos'; return previous(); }
      if (typeof updatePeriodUI === 'function') updatePeriodUI();
      if (typeof applyRoleUI === 'function') applyRoleUI();
      var root = document.getElementById('viewRoot');
      root.innerHTML = currentView === 'quotations' ? viewQuotations() : viewOpportunities();
      return true;
    };
    render.__salesPipelineV3150 = true;
  }
  window.addEventListener('zezms-sale-committed', function (event) {
    var detail = event && event.detail || {};
    if (!detail.sourceQuotationId || !detail.transactionId) return;
    try { if (markConverted(detail.sourceQuotationId, detail.transactionId)) notify('Accepted quotation converted and linked to the completed sale.'); }
    catch (error) { console.error('Quotation conversion link failed after completed sale', error); notify('Sale completed, but the quotation link could not be updated: ' + (error.message || error), 'warn'); }
  });
  ensureModel();
  installStyles();
  installRender();
  ZEZMS.salesPipeline = {
    version:VERSION, build:BUILD,
    opportunityStatuses:OPPORTUNITY_STATUSES, quotationStatuses:QUOTATION_STATUSES, lostReasons:LOST_REASONS,
    ensureModel:ensureModel, createOpportunity:createOpportunity, updateOpportunity:updateOpportunity,
    createQuotation:createQuotation, editDraftQuotation:editDraftQuotation, setQuotationStatus:setQuotationStatus,
    duplicateRevision:duplicateRevision, totals:totals, quoteTotal:quoteTotal, pipelineMetrics:pipelineMetrics,
    loadIntoSaleOut:loadIntoSaleOut, markConverted:markConverted,
    viewOpportunities:viewOpportunities, viewQuotations:viewQuotations,
    openOpportunityForm:function (id) { try { openOpportunityForm(id); } catch (error) { notify(error.message || error, 'err'); } },
    saveOpportunityForm:saveOpportunityForm, toggleLostReason:toggleLostReason, scheduleFollowup:scheduleFollowup,
    openQuotationForm:function (id, opId) { try { openQuotationForm(id, opId); } catch (error) { notify(error.message || error, 'err'); } },
    refreshOpportunityOptions:refreshOpportunityOptions, addDraftProduct:addDraftProduct, syncDraftLine:syncDraftLine,
    removeDraftLine:removeDraftLine, renderDraftLines:renderDraftLines, saveQuotationForm:saveQuotationForm,
    changeQuotationStatus:changeQuotationStatus, reviseQuotation:reviseQuotation, loadQuote:loadQuote,
    filterQuotations:filterQuotations, viewQuotation:viewQuotation, printQuotation:printQuotation, downloadQuotationPDF:downloadQuotationPDF,
    _test:{ normalizeLine:normalizeLine, availableForProduct:availableForProduct, latestActiveQuotes:latestActiveQuotes, productByIdentity:productByIdentity }
  };
}());

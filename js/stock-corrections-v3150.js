/* ZEZMS TradeFlow Owner Edition v3.15.1
   Audited stock corrections. recordSaleOutFIFO() is deliberately not called or modified. */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  var VERSION = '3.15.1';
  var BUILD = '20260821-stage6a-ui-integration-fix-r50';
  var TYPES = Object.freeze(['Quantity Increase', 'Quantity Decrease']);
  var REASONS = Object.freeze(['Physical Count Adjustment', 'Damaged Stock', 'Lost/Missing Stock', 'Found Stock', 'Data Entry Correction', 'Stock-In Omission', 'Other']);
  var pendingCorrection = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character];
    });
  }
  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function round2(value) { return Math.round((Number(value) || 0) * 100) / 100; }
  function money(value) { return 'GH₵ ' + (Number(value) || 0).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function number(value) { return (Number(value) || 0).toLocaleString('en-GH', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function isoNow() { return new Date().toISOString(); }
  function uid(prefix) {
    var random = Math.random().toString(36).slice(2, 8).toUpperCase();
    try { if (crypto && crypto.randomUUID) random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); } catch (_) {}
    return prefix + Date.now().toString(36).toUpperCase() + '-' + random;
  }
  function notify(message, type) { if (typeof toast === 'function') toast(message, type || 'ok'); }
  function ensureModel() {
    if (typeof DB === 'undefined' || !DB) return false;
    if (!Array.isArray(DB.stockCorrections)) DB.stockCorrections = [];
    return true;
  }
  function save() {
    if (typeof saveDB !== 'function') throw new Error('The database save service is unavailable.');
    saveDB();
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
  function requireOwnerAdmin() { if (!ownerAdmin()) throw new Error('Only the Owner or an Administrator can record stock corrections.'); }
  function currentUser() {
    try { if (session && session.cashier) return String(session.cashier); } catch (_) {}
    return 'Owner/Admin';
  }
  function period() {
    if (typeof getLatestMonth === 'function') return getLatestMonth();
    return { year:DB.selectedYear, month:DB.selectedMonth };
  }
  function productById(productId) {
    ensureModel();
    return (DB.products || []).find(function (item) { return String(item.id || '') === String(productId || ''); }) || null;
  }
  function productByIdentity(productId, productName) {
    return productById(productId) || (DB.products || []).find(function (item) { return String(item.name || '').toLowerCase() === String(productName || '').toLowerCase(); }) || null;
  }
  function matchesRow(row, product) {
    if (!row || !product) return false;
    if (product.id && row.productId) return String(row.productId) === String(product.id);
    return String(row.productName || '') === String(product.name || '');
  }
  function currentRows(product) {
    var latest = period();
    return (DB.stockRows || []).filter(function (row) {
      return matchesRow(row, product) && Number(row.year) === Number(latest.year) && Number(row.month) === Number(latest.month);
    });
  }
  function remaining(row) {
    return round2(row.rStock != null ? Number(row.rStock) : (Number(row.qtyIn) || 0) - (Number(row.qtyOut) || 0));
  }
  function currentQuantity(product) { return round2(currentRows(product).reduce(function (sum, row) { return sum + Math.max(0, remaining(row)); }, 0)); }
  function currentValue(product) { return round2(currentRows(product).reduce(function (sum, row) { return sum + Math.max(0, remaining(row)) * (Number(row.uCost) || 0); }, 0)); }
  function weightedCost(product) { var qty = currentQuantity(product); return qty > 0 ? round2(currentValue(product) / qty) : 0; }
  function orderedDepletionPlan(product, quantity) {
    var candidates = currentRows(product).filter(function (row) { return remaining(row) > 0; });
    var available = round2(candidates.reduce(function (sum, row) { return sum + remaining(row); }, 0));
    if (available < quantity - 1e-9) throw new Error('Correction quantity exceeds current available stock. Requested: ' + number(quantity) + ', Available: ' + number(available) + '.');
    var left = quantity;
    var plan = [];
    while (left > 1e-9) {
      var best = null;
      candidates.forEach(function (row) {
        if (remaining(row) <= 0) return;
        var already = plan.filter(function (part) { return part.stockRowId === row.id; }).reduce(function (sum, part) { return sum + part.quantity; }, 0);
        if (remaining(row) - already <= 1e-9) return;
        if (!best || Number(row.uCost) < Number(best.uCost)) best = row;
      });
      if (!best) throw new Error('A safe non-sale stock-depletion plan could not be built.');
      var allocatedAlready = plan.filter(function (part) { return part.stockRowId === best.id; }).reduce(function (sum, part) { return sum + part.quantity; }, 0);
      var take = Math.min(left, remaining(best) - allocatedAlready);
      plan.push({ stockRowId:best.id, quantity:round2(take), unitCost:round2(best.uCost), beforeRStock:remaining(best), afterRStock:round2(remaining(best) - allocatedAlready - take) });
      left = round2(left - take);
    }
    return plan;
  }
  function prepareCorrection(data) {
    requireOwnerAdmin();
    ensureModel();
    var input = data || {};
    var product = productByIdentity(input.productId, input.productName);
    if (!product) throw new Error('Select a valid Product Catalog record.');
    var type = String(input.correctionType || '');
    if (TYPES.indexOf(type) < 0) throw new Error('Select a valid correction type.');
    var quantity = round2(input.quantity);
    if (!(quantity > 0)) throw new Error('Correction quantity must be greater than zero.');
    var reason = String(input.reason || '');
    if (REASONS.indexOf(reason) < 0) throw new Error('Select a controlled correction reason.');
    var otherDetail = String(input.otherDetail || '').trim().slice(0, 250);
    if (reason === 'Other' && !otherDetail) throw new Error('Describe the Other correction reason.');
    var notes = String(input.notes || '').trim().slice(0, 2000);
    var unitCost = type === 'Quantity Increase' ? round2(input.unitCost) : 0;
    if (type === 'Quantity Increase' && !(unitCost > 0)) throw new Error('Actual Unit Cost is required and must be greater than zero for a quantity increase.');
    var beforeQty = currentQuantity(product);
    if (type === 'Quantity Decrease' && quantity > beforeQty + 1e-9) throw new Error('Correction quantity cannot exceed current available stock.');
    var plan = type === 'Quantity Decrease' ? orderedDepletionPlan(product, quantity) : [];
    var impact = type === 'Quantity Increase'
      ? round2(quantity * unitCost)
      : -round2(plan.reduce(function (sum, part) { return sum + part.quantity * part.unitCost; }, 0));
    return {
      productId:String(product.id || ''), productName:product.name, category:product.category || '',
      correctionType:type, quantity:quantity, unitCost:unitCost, reason:reason,
      reasonDetail:reason === 'Other' ? otherDetail : '', notes:notes,
      beforeQty:beforeQty, afterQty:round2(beforeQty + (type === 'Quantity Increase' ? quantity : -quantity)),
      referenceValueImpact:impact, allocationPlan:plan, preparedAt:isoNow()
    };
  }
  function applyDecrease(plan) {
    var allocations = [];
    (plan || []).forEach(function (part) {
      var row = (DB.stockRows || []).find(function (item) { return String(item.id) === String(part.stockRowId); });
      if (!row) throw new Error('Stock layer is missing: ' + part.stockRowId + '.');
      var before = remaining(row);
      if (before < Number(part.quantity) - 1e-9) throw new Error('Stock changed after preview. Re-open the correction and review current quantities.');
      row.rStock = round2(before - Number(part.quantity));
      allocations.push({ stockRowId:row.id, quantity:round2(part.quantity), unitCost:round2(row.uCost), beforeRStock:before, afterRStock:row.rStock });
    });
    return allocations;
  }
  function createIncreaseLayer(prepared, correctionId) {
    var product = productByIdentity(prepared.productId, prepared.productName);
    var latest = period();
    var row = {
      id:uid('SCROW-'), productName:product.name, category:product.category || prepared.category || '',
      year:Number(latest.year), month:Number(latest.month), qtyIn:prepared.quantity, rStock:prepared.quantity,
      uCost:prepared.unitCost, qtyOut:0, uPrice:Number(product.uPrice) || 0, disc:0, tSales:0, profit:0, aPrice:0,
      productId:String(product.id || ''), source:'STOCK_CORRECTION', correctionId:correctionId, createdAt:isoNow()
    };
    DB.stockRows.push(row);
    return [{ stockRowId:row.id, quantity:prepared.quantity, unitCost:prepared.unitCost, beforeRStock:0, afterRStock:prepared.quantity, createdLayer:true }];
  }
  function commitCorrection(prepared) {
    requireOwnerAdmin();
    ensureModel();
    var input = clone(prepared || pendingCorrection);
    if (!input) throw new Error('Correction preview is unavailable.');
    var product = productByIdentity(input.productId, input.productName);
    if (!product) throw new Error('The Product Catalog record is unavailable.');
    if (Math.abs(currentQuantity(product) - Number(input.beforeQty)) > 1e-9) throw new Error('Stock changed after preview. Re-open the correction before committing.');
    var beforeRows = clone(DB.stockRows);
    var beforeCorrections = clone(DB.stockCorrections);
    var correctionId = uid('SC-');
    try {
      var allocations = input.correctionType === 'Quantity Increase'
        ? createIncreaseLayer(input, correctionId)
        : applyDecrease(input.allocationPlan);
      var record = {
        correctionId:correctionId, productId:String(product.id || ''), productNameSnapshot:product.name,
        correctionType:input.correctionType, quantity:round2(input.quantity), unitCost:round2(input.unitCost),
        reason:input.reason, reasonDetail:input.reasonDetail || '', notes:input.notes || '',
        beforeQty:round2(input.beforeQty), afterQty:round2(input.afterQty), referenceValueImpact:round2(input.referenceValueImpact),
        createdAt:isoNow(), createdBy:currentUser(), status:'Completed', reversalOf:'',
        adjustmentTxnIds:allocations.map(function (part) { return part.stockRowId; }), allocations:allocations
      };
      DB.stockCorrections.push(record);
      save();
      pendingCorrection = null;
      return record;
    } catch (error) {
      DB.stockRows = beforeRows;
      DB.stockCorrections = beforeCorrections;
      throw error;
    }
  }
  function correction(correctionId) {
    ensureModel();
    return DB.stockCorrections.find(function (item) { return String(item.correctionId) === String(correctionId || ''); }) || null;
  }
  function reverseCorrection(correctionId) {
    requireOwnerAdmin();
    var original = correction(correctionId);
    if (!original) throw new Error('Stock correction not found.');
    if (original.status !== 'Completed') throw new Error('Only a completed, unreversed correction is eligible.');
    if (original.reversalOf) throw new Error('A compensating reversal record cannot be reversed again in Stage 6A.');
    var product = productByIdentity(original.productId, original.productNameSnapshot);
    if (!product) throw new Error('The Product Catalog record required for reversal is unavailable.');
    var beforeRows = clone(DB.stockRows);
    var beforeCorrections = clone(DB.stockCorrections);
    var reversalId = uid('SC-');
    var beforeQty = currentQuantity(product);
    try {
      var allocations = [];
      var type;
      var impact;
      if (original.correctionType === 'Quantity Increase') {
        type = 'Quantity Decrease';
        (original.allocations || []).forEach(function (part) {
          var row = DB.stockRows.find(function (item) { return String(item.id) === String(part.stockRowId); });
          if (!row || remaining(row) < Number(part.quantity) - 1e-9) {
            throw new Error('Unsafe reversal blocked: stock from this old increase has already been sold or depleted.');
          }
          var before = remaining(row);
          row.rStock = round2(before - Number(part.quantity));
          allocations.push({ stockRowId:row.id, quantity:round2(part.quantity), unitCost:round2(part.unitCost), beforeRStock:before, afterRStock:row.rStock, reversesLayer:true });
        });
        impact = -Math.abs(Number(original.referenceValueImpact) || 0);
      } else {
        type = 'Quantity Increase';
        (original.allocations || []).forEach(function (part) {
          var row = DB.stockRows.find(function (item) { return String(item.id) === String(part.stockRowId); });
          if (!row) throw new Error('Unsafe reversal blocked: original stock layer is missing.');
          var before = remaining(row);
          row.rStock = round2(before + Number(part.quantity));
          allocations.push({ stockRowId:row.id, quantity:round2(part.quantity), unitCost:round2(part.unitCost), beforeRStock:before, afterRStock:row.rStock, restoresLayer:true });
        });
        impact = Math.abs(Number(original.referenceValueImpact) || 0);
      }
      var reversal = {
        correctionId:reversalId, productId:original.productId, productNameSnapshot:original.productNameSnapshot,
        correctionType:type, quantity:round2(original.quantity), unitCost:round2(original.unitCost),
        reason:'Data Entry Correction', reasonDetail:'', notes:'Compensating reversal of ' + original.correctionId,
        beforeQty:beforeQty, afterQty:currentQuantity(product), referenceValueImpact:round2(impact),
        createdAt:isoNow(), createdBy:currentUser(), status:'Completed', reversalOf:original.correctionId,
        adjustmentTxnIds:allocations.map(function (part) { return part.stockRowId; }), allocations:allocations
      };
      DB.stockCorrections.push(reversal);
      original.status = 'Reversed'; original.reversedAt = isoNow(); original.reversedBy = currentUser(); original.reversalCorrectionId = reversalId;
      save();
      return reversal;
    } catch (error) {
      DB.stockRows = beforeRows; DB.stockCorrections = beforeCorrections; throw error;
    }
  }
  function matchingProducts(nameQuery, idQuery) {
    var name = String(nameQuery || '').trim().toLowerCase();
    var productId = String(idQuery || '').trim().toLowerCase();
    return (DB.products || []).filter(function (item) {
      return (!name || String(item.name || '').toLowerCase().indexOf(name) >= 0)
        && (!productId || String(item.id || '').toLowerCase().indexOf(productId) >= 0);
    }).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function productOptions(selectedId, nameQuery, idQuery) {
    var products = matchingProducts(nameQuery, idQuery);
    var selected = productById(selectedId);
    if (selected && !products.some(function (item) { return String(item.id || '') === String(selectedId); })) products.unshift(selected);
    return '<option value="">Select Product</option>' + products.map(function (item) {
      return '<option value="' + attr(item.id || '') + '"' + (String(item.id || '') === String(selectedId || '') ? ' selected' : '') + '>' + esc((item.id || 'No ID') + ' · ' + item.name) + '</option>';
    }).join('');
  }
  function optionList(values, selected) { return values.map(function (value) { return '<option value="' + attr(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join(''); }
  function correctionForm(productId) {
    var product = productById(productId);
    var guide = product ? weightedCost(product) : 0;
    return '<div id="stockCorrectionModal"><h3>Correct Stock</h3><p class="muted">Owner/Admin audited correction. This is not a sale, purchase order, supplier payment or direct lot-cost editor.</p>'
      + '<div class="grid g2"><div class="field"><label>Search Product Name</label><input id="stockCorrectionSearchName" type="search" autocomplete="off" placeholder="Partial, case-insensitive" oninput="ZEZMS.stockCorrections.filterProducts()"></div><div class="field"><label>Search Product ID</label><input id="stockCorrectionSearchId" type="search" autocomplete="off" placeholder="Partial or exact Product ID" oninput="ZEZMS.stockCorrections.filterProducts()"></div></div>'
      + '<div class="row" style="margin-bottom:10px"><button type="button" class="btn sm ghost" onclick="ZEZMS.stockCorrections.clearProductSearch()">Clear Search</button><span id="stockCorrectionSearchCount" class="pill">' + (DB.products || []).length + ' products</span></div>'
      + '<div class="field"><label>Product</label><select id="scProduct" onchange="ZEZMS.stockCorrections.refreshCorrectionForm()">' + productOptions(productId) + '</select></div>'
      + '<div class="grid g2"><div class="field"><label>Correction Type</label><select id="scType" onchange="ZEZMS.stockCorrections.refreshCorrectionForm()">' + optionList(TYPES, 'Quantity Increase') + '</select></div><div class="field"><label>Correction Qty</label><input id="scQty" type="number" min="0.01" step="0.01" placeholder="Enter actual discrepancy"></div></div>'
      + '<div id="scCostWrap" class="field"><label>Actual Unit Cost</label><input id="scCost" type="number" min="0.01" step="0.01" placeholder="Required; enter actual cost basis"><small class="muted">Reference weighted cost only: <span id="scWeightedCost">' + money(guide) + '</span>. It is not inserted into the textbox.</small></div>'
      + '<div class="field"><label>Reason</label><select id="scReason" onchange="ZEZMS.stockCorrections.refreshCorrectionForm()">' + optionList(REASONS, 'Physical Count Adjustment') + '</select></div>'
      + '<div id="scOtherWrap" class="field" hidden><label>Other reason detail</label><input id="scOther" maxlength="250"></div>'
      + '<div class="field"><label>Notes</label><textarea id="scNotes" rows="3"></textarea></div>'
      + '<div class="row"><button type="button" class="btn warn" onclick="ZEZMS.stockCorrections.previewCorrection()">Preview Correction</button><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button></div></div>';
  }
  function openCorrection(productId) {
    try { requireOwnerAdmin(); openModal(correctionForm(productId)); refreshCorrectionForm(); }
    catch (error) { notify(error.message || error, 'err'); }
  }
  function refreshCorrectionForm() {
    var product = productById((document.getElementById('scProduct') || {}).value);
    var type = String((document.getElementById('scType') || {}).value || '');
    var reason = String((document.getElementById('scReason') || {}).value || '');
    var cost = document.getElementById('scCostWrap'); if (cost) cost.hidden = type !== 'Quantity Increase';
    var other = document.getElementById('scOtherWrap'); if (other) other.hidden = reason !== 'Other';
    var guide = document.getElementById('scWeightedCost'); if (guide) guide.textContent = money(product ? weightedCost(product) : 0);
  }
  function filterProducts() {
    var select = document.getElementById('scProduct');
    if (!select) return;
    var selectedId = select.value;
    var name = String((document.getElementById('stockCorrectionSearchName') || {}).value || '').trim();
    var productId = String((document.getElementById('stockCorrectionSearchId') || {}).value || '').trim();
    var matches = matchingProducts(name, productId);
    select.innerHTML = productOptions(selectedId, name, productId);
    select.value = selectedId;
    var count = document.getElementById('stockCorrectionSearchCount');
    if (count) count.textContent = matches.length + (matches.length === 1 ? ' product' : ' products');
  }
  function clearProductSearch() {
    var name = document.getElementById('stockCorrectionSearchName');
    var productId = document.getElementById('stockCorrectionSearchId');
    if (name) name.value = '';
    if (productId) productId.value = '';
    filterProducts();
  }
  function previewCorrection() {
    try {
      pendingCorrection = prepareCorrection({
        productId:(document.getElementById('scProduct') || {}).value,
        correctionType:(document.getElementById('scType') || {}).value,
        quantity:(document.getElementById('scQty') || {}).value,
        unitCost:(document.getElementById('scCost') || {}).value,
        reason:(document.getElementById('scReason') || {}).value,
        otherDetail:(document.getElementById('scOther') || {}).value,
        notes:(document.getElementById('scNotes') || {}).value
      });
      var item = pendingCorrection;
      openModal('<h3>Confirm Stock Correction</h3><p class="muted">Review every value. Confirmation immediately changes current stock and creates a permanent audit record.</p>'
        + '<div class="statline"><span>Product</span><b>' + esc(item.productName) + '</b></div><div class="statline"><span>Product ID</span><b class="mono">' + esc(item.productId) + '</b></div><div class="statline"><span>Current Qty</span><b>' + number(item.beforeQty) + '</b></div><div class="statline"><span>Correction Type</span><b>' + esc(item.correctionType) + '</b></div><div class="statline"><span>Correction Qty</span><b>' + number(item.quantity) + '</b></div><div class="statline"><span>Resulting Qty</span><b>' + number(item.afterQty) + '</b></div>'
        + (item.correctionType === 'Quantity Increase' ? '<div class="statline"><span>Actual Unit Cost</span><b>' + money(item.unitCost) + '</b></div>' : '')
        + '<div class="statline"><span>Reference Value Impact</span><b>' + money(item.referenceValueImpact) + '</b></div><div class="statline"><span>Reason</span><b>' + esc(item.reason + (item.reasonDetail ? ' — ' + item.reasonDetail : '')) + '</b></div>'
        + '<div class="row" style="margin-top:14px"><button class="btn warn" onclick="ZEZMS.stockCorrections.confirmCorrection()">Confirm and Commit</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
    } catch (error) { notify(error.message || error, 'err'); }
  }
  function confirmCorrection() {
    try { var record = commitCorrection(pendingCorrection); closeModal(); notify('Stock correction committed · ' + record.correctionId); render(); }
    catch (error) { notify(error.message || error, 'err'); }
  }
  function actionsHTML(productId, productName) {
    if (!ownerAdmin()) return '<span class="muted">Restricted</span>';
    var index = (DB.products || []).findIndex(function (item) {
      return productId && item.id ? String(item.id) === String(productId) : String(item.name || '') === String(productName || '');
    });
    var edit = index >= 0 ? '<button class="btn sm ghost" onclick="editProduct(' + index + ')">Edit Product</button>' : '';
    var correct = productId ? '<button class="btn sm warn" onclick="ZEZMS.stockCorrections.openCorrection(\'' + attr(productId) + '\')">Correct Stock</button>' : '';
    return '<div class="row">' + edit + correct + '</div>';
  }
  function reverseFromUI(correctionId) {
    try {
      var original = correction(correctionId); if (!original) throw new Error('Correction not found.');
      if (!window.confirm('Create a new compensating correction for ' + original.correctionId + '? The original audit record will be retained.')) return;
      var reversal = reverseCorrection(correctionId); notify('Compensating correction created · ' + reversal.correctionId); render();
    } catch (error) { notify(error.message || error, 'err'); }
  }
  function viewCorrections() {
    ensureModel();
    var rows = DB.stockCorrections.slice().sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); }).map(function (item) {
      var action = item.status === 'Completed' && !item.reversalOf ? '<button class="btn sm warn" onclick="ZEZMS.stockCorrections.reverseFromUI(\'' + attr(item.correctionId) + '\')">Reverse Correction</button>' : '—';
      return '<tr><td class="mono">' + esc(item.correctionId) + (item.reversalOf ? '<br><small>Reversal of ' + esc(item.reversalOf) + '</small>' : '') + '</td><td>' + new Date(item.createdAt).toLocaleString('en-GB') + '</td><td>' + esc(item.productNameSnapshot) + '<br><small class="mono">' + esc(item.productId) + '</small></td><td>' + esc(item.correctionType) + '</td><td class="right mono">' + number(item.quantity) + '</td><td class="right mono">' + number(item.beforeQty) + '</td><td class="right mono">' + number(item.afterQty) + '</td><td class="right mono">' + money(item.referenceValueImpact) + '</td><td>' + esc(item.reason + (item.reasonDetail ? ' — ' + item.reasonDetail : '')) + '</td><td>' + esc(item.createdBy) + '</td><td>' + esc(item.status) + '</td><td>' + action + '</td></tr>';
    }).join('') || '<tr><td colspan="12" class="empty">No stock corrections recorded.</td></tr>';
    return '<div data-stock-corrections="' + VERSION + '"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div><h3 style="margin:0">Stock Correction History</h3><p class="muted" style="margin:4px 0">Permanent audited non-sale adjustments. Completed records cannot be deleted.</p></div><button class="btn warn" onclick="ZEZMS.stockCorrections.openCorrection()">New Stock Correction</button></div>'
      + '<div class="card" style="margin-bottom:12px"><b>Protected fields</b><p class="muted">Product ID, Qty In, Qty Out, remaining quantity, FIFO allocations, transaction IDs, lot dates and historical Unit Cost are not directly editable. Edit Product reuses the verified Product Catalog editor for Name, Category and Listed Selling Price only.</p></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Correction ID</th><th>Date</th><th>Product</th><th>Type</th><th class="right">Quantity</th><th class="right">Before Qty</th><th class="right">After Qty</th><th class="right">Value Impact</th><th>Reason</th><th>User</th><th>Status</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function installRender() {
    if (typeof render !== 'function' || render.__stockCorrectionsV3150) return;
    var previous = render;
    render = function () {
      if (currentView !== 'stock-corrections') return previous.apply(this, arguments);
      if (!ownerAdmin()) { notify('Only the Owner or an Administrator can open Stock Corrections.', 'err'); currentView = 'pos'; return previous(); }
      if (typeof updatePeriodUI === 'function') updatePeriodUI(); if (typeof applyRoleUI === 'function') applyRoleUI();
      document.getElementById('viewRoot').innerHTML = viewCorrections(); return true;
    };
    render.__stockCorrectionsV3150 = true;
  }
  function installStyles() {
    if (document.getElementById('stockCorrectionsV3151Styles')) return;
    var style = document.createElement('style');
    style.id = 'stockCorrectionsV3151Styles';
    style.textContent = '#stockCorrectionModal input,#stockCorrectionModal select,#stockCorrectionModal textarea{background:#081221;color:#f8fafc;border:1px solid #475569;caret-color:#f8fafc}#stockCorrectionModal input::placeholder,#stockCorrectionModal textarea::placeholder{color:#94a3b8;opacity:1}#stockCorrectionModal input:focus,#stockCorrectionModal select:focus,#stockCorrectionModal textarea:focus{color:#fff;border-color:var(--teal2);outline:2px solid rgba(45,212,191,.35);outline-offset:1px}#stockCorrectionModal input[readonly],#stockCorrectionModal input:disabled,#stockCorrectionModal select:disabled{background:#111c2f;color:#cbd5e1;opacity:1}#stockCorrectionModal option{background:#081221;color:#f8fafc}@media(max-width:600px){#stockCorrectionModal .grid.g2{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  ensureModel(); installStyles(); installRender();
  ZEZMS.stockCorrections = {
    version:VERSION, build:BUILD, types:TYPES, reasons:REASONS,
    ensureModel:ensureModel, currentQuantity:currentQuantity, weightedCost:weightedCost,
    prepareCorrection:prepareCorrection, commitCorrection:commitCorrection, reverseCorrection:reverseCorrection,
    actionsHTML:actionsHTML, openCorrection:openCorrection, refreshCorrectionForm:refreshCorrectionForm,
    filterProducts:filterProducts, clearProductSearch:clearProductSearch,
    previewCorrection:previewCorrection, confirmCorrection:confirmCorrection, reverseFromUI:reverseFromUI,
    viewHTML:viewCorrections,
    _test:{ orderedDepletionPlan:orderedDepletionPlan, remaining:remaining, matchesRow:matchesRow, matchingProducts:matchingProducts }
  };
}());

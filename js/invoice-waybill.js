/* ZEZMS TradeFlow v3.4.11 — Electronic Invoice & Waybill
   Creates printable commercial documents without posting stock or KPI changes.
   An invoice can be loaded into Sale Out; stock is deducted only when the sale is completed. */
(function () {
  'use strict';

  const BUILD = '20260808-owner-maintenance-r32';
  const ACTIVE = 'ACTIVE';
  const VOID = 'VOID';
  let invoicePriceAdjustmentUnlocked = false;
  let activeCommercialDocument = null;
  let documentPrintBusy = false;
  let editingInvoiceId = '';
  let editingWaybillId = '';

  const invoiceDraft = {
    lines: [], customer: '', location: '', contact: '', tin: '', reference: '',
    dueDate: '', terms: 'Payment due on or before the due date.', notes: '', vatRate: 0
  };
  const waybillDraft = {
    lines: [], consignee: '', location: '', contact: '', vehicleNo: '', driver: '',
    reference: '', notes: ''
  };

  function canManageDocuments() {
    try {
      if (ZEZMS.staffAuth && ZEZMS.staffAuth.isActive && ZEZMS.staffAuth.isActive()) {
        return !!ZEZMS.staffAuth.can('MANAGE_DOCUMENTS');
      }
    } catch (_) {}
    return isElevated();
  }

  function resetInvoiceDraft() {
    Object.assign(invoiceDraft, { lines: [], customer: '', location: '', contact: '', tin: '', reference: '', dueDate: '', terms: 'Payment due on or before the due date.', notes: '', vatRate: 0 });
    invoicePriceAdjustmentUnlocked = false;
  }

  function resetWaybillDraft() {
    Object.assign(waybillDraft, { lines: [], consignee: '', location: '', contact: '', vehicleNo: '', driver: '', reference: '', notes: '' });
  }

  function ensureModel() {
    let changed = false;
    if (!Array.isArray(DB.invoices)) { DB.invoices = []; changed = true; }
    if (!Array.isArray(DB.waybills)) { DB.waybills = []; changed = true; }
    DB.invoices.forEach((item) => {
      if (!item.id) { item.id = idStamp('INV-'); changed = true; }
      if (!item.invoiceNo) { item.invoiceNo = item.id; changed = true; }
      if (!item.status) { item.status = ACTIVE; changed = true; }
      if (!Array.isArray(item.lines)) { item.lines = []; changed = true; }
      const lineSubtotal = invoiceSubtotal(item.lines);
      if (item.subtotal == null) { item.subtotal = lineSubtotal; changed = true; }
      const legacyVat = Number(item.vatAmount != null ? item.vatAmount : item.vat) || 0;
      if (item.vatRate == null) { item.vatRate = item.subtotal > 0 ? normalizeVatPercent((legacyVat / item.subtotal) * 100) : 0; changed = true; }
      if (item.vatAmount == null) { item.vatAmount = round2(Number(item.subtotal) * normalizeVatPercent(item.vatRate) / 100); changed = true; }
      if (item.vat == null) { item.vat = item.vatAmount; changed = true; }
      if (item.total == null) { item.total = round2(Number(item.subtotal) + Number(item.vatAmount)); changed = true; }
    });
    DB.waybills.forEach((item) => {
      if (!item.id) { item.id = idStamp('WB-'); changed = true; }
      if (!item.waybillNo) { item.waybillNo = item.id; changed = true; }
      if (!item.status) { item.status = ACTIVE; changed = true; }
      if (!Array.isArray(item.lines)) { item.lines = []; changed = true; }
    });
    if (changed) saveDB();
  }

  function injectStyles() {
    if (document.getElementById('invoiceWaybillStyles')) return;
    const style = document.createElement('style');
    style.id = 'invoiceWaybillStyles';
    style.textContent = `
      .document-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,.8fr);gap:12px;align-items:start}
      .document-paper{background:#fff;color:#111;padding:24px;max-width:210mm;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45}
      .document-paper .doc-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
      .document-paper .doc-title{font-size:25px;font-weight:900;letter-spacing:2px;text-align:right}
      .document-paper table{width:100%;border-collapse:collapse;margin-top:12px}
      .document-paper th,.document-paper td{border:1px solid #aaa;padding:6px;vertical-align:top}
      .document-paper th{background:#eee;text-align:left}
      .document-paper .doc-total{width:min(100%,330px);margin-left:auto;margin-top:12px}
      .document-paper .doc-total div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}
      .document-paper .doc-total .grand{font-size:15px;font-weight:900;border-top:2px solid #111;border-bottom:2px solid #111}
      .document-paper .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
      .document-paper .signature-line{border-top:1px solid #111;padding-top:5px;text-align:center}
      .doc-register-actions{display:flex;gap:5px;flex-wrap:wrap}
      .doc-void td{opacity:.7;background:rgba(100,116,139,.12)!important}
      .doc-converted td{background:rgba(34,197,94,.08)!important}
      .doc-help{border-left:4px solid var(--teal);padding:10px 12px;background:rgba(15,118,110,.08);border-radius:8px;font-size:12px;color:var(--muted)}
      @media(max-width:900px){.document-layout{grid-template-columns:1fr}}
      @media print{.document-paper{box-shadow:none;padding:0}}
    `;
    document.head.appendChild(style);
  }

  function installNavigation() {
    TITLES.invoices = 'Invoices';
    TITLES.waybills = 'Waybills';
    if (typeof CASHIER2_ALLOWED !== 'undefined' && CASHIER2_ALLOWED && typeof CASHIER2_ALLOWED.add === 'function') {
      CASHIER2_ALLOWED.add('invoices');
      CASHIER2_ALLOWED.add('waybills');
    }
    const receiptButton = document.querySelector('#mainNav button[data-view="receipts"]');
    if (receiptButton && !document.getElementById('navInvoices')) {
      receiptButton.insertAdjacentHTML('afterend',
        '<button id="navInvoices" data-view="invoices" onclick="nav(\'invoices\')">🧾 Invoices</button>' +
        '<button id="navWaybills" data-view="waybills" onclick="nav(\'waybills\')">🚚 Waybills</button>');
    }
  }

  function availableItems() {
    return availableProductsForOpenMonth();
  }

  function selectedProduct(prefix) {
    const select = document.getElementById(prefix + 'Product');
    const name = select ? String(select.value || '') : '';
    return availableItems().find((item) => item.name === name) || null;
  }

  function productOptions() {
    const lm = getLatestMonth();
    return '<option value="">— select —</option>' + availableItems().map((item) =>
      `<option value="${escAttr(item.name)}">${esc(item.id || 'No ID')} — ${esc(item.name)} · ${fmtN(item.qty)} available</option>`
    ).join('') + (availableItems().length ? '' : `<option value="" disabled>No available products in ${monthName(lm.month)} ${lm.year}</option>`);
  }

  function searchSuggestions(prefix, mode) {
    const isId = mode === 'id';
    const input = document.getElementById(prefix + (isId ? 'SearchId' : 'SearchName'));
    const box = document.getElementById(prefix + (isId ? 'SuggestId' : 'SuggestName'));
    if (!input || !box) return;
    const query = String(input.value || '').trim().toLowerCase();
    if (!query) { box.classList.remove('show'); box.innerHTML = ''; return; }
    const results = availableItems().map((item) => ({
      item,
      score: rankProductMatch(isId ? item.id : item.name, query)
    })).filter((entry) => entry.score > 0)
      .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
    if (!results.length) {
      box.innerHTML = '<div class="none">No available product matches</div>';
      box.classList.add('show');
      return;
    }
    box.innerHTML = results.slice(0, 12).map((entry) => {
      const encoded = encodeURIComponent(entry.item.name).replace(/'/g, '%27');
      return `<div onclick="pickCommercialProduct('${prefix}','${encoded}')"><b>${esc(entry.item.name)}</b><br>` +
        `<span class="muted mono">${esc(entry.item.id || 'No ID')} · ${fmtN(entry.item.qty)} available</span></div>`;
    }).join('');
    box.classList.add('show');
  }

  function pickProduct(prefix, encodedName) {
    const name = decodeURIComponent(encodedName || '');
    const item = availableItems().find((entry) => entry.name === name);
    if (!item) { toast('That product is not available in the current month and year.', 'warn'); return; }
    const nameInput = document.getElementById(prefix + 'SearchName');
    const idInput = document.getElementById(prefix + 'SearchId');
    const select = document.getElementById(prefix + 'Product');
    if (nameInput) nameInput.value = item.name;
    if (idInput) idInput.value = item.id || '';
    if (select) select.value = item.name;
    [prefix + 'SuggestName', prefix + 'SuggestId'].forEach((id) => {
      const box = document.getElementById(id);
      if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    });
    productChanged(prefix);
  }

  function productChanged(prefix) {
    const item = selectedProduct(prefix);
    const nameInput = document.getElementById(prefix + 'SearchName');
    const idInput = document.getElementById(prefix + 'SearchId');
    const rem = document.getElementById(prefix + 'RemQty');
    if (!item) {
      if (nameInput) nameInput.value = '';
      if (idInput) idInput.value = '';
      if (rem) rem.textContent = '0';
      if (prefix === 'inv') {
        const price = document.getElementById('invUPrice');
        const adjustment = document.getElementById('invPriceAdj');
        if (price) price.value = '0';
        if (adjustment) adjustment.value = '0';
      }
      return;
    }
    if (nameInput) nameInput.value = item.name;
    if (idInput) idInput.value = item.id || '';
    if (rem) rem.textContent = fmtN(item.qty);
    if (prefix === 'inv') {
      const price = document.getElementById('invUPrice');
      const adjustment = document.getElementById('invPriceAdj');
      if (price) price.value = getBaseUnitPrice(item.name);
      if (adjustment) adjustment.value = '0';
    }
  }

  function clearEntry(prefix) {
    ['SearchName', 'SearchId'].forEach((suffix) => {
      const element = document.getElementById(prefix + suffix);
      if (element) element.value = '';
    });
    const select = document.getElementById(prefix + 'Product');
    const qty = document.getElementById(prefix + 'Qty');
    const rem = document.getElementById(prefix + 'RemQty');
    if (select) select.value = '';
    if (qty) qty.value = '1';
    if (rem) rem.textContent = '0';
    [prefix + 'SuggestName', prefix + 'SuggestId'].forEach((id) => {
      const box = document.getElementById(id);
      if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    });
    if (prefix === 'inv') {
      ['invUPrice', 'invPriceAdj', 'invDisc'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.value = '0';
      });
      invoicePriceAdjustmentUnlocked = false;
      const adjustment = document.getElementById('invPriceAdj');
      if (adjustment) adjustment.readOnly = true;
    } else {
      const unit = document.getElementById('wbUnit');
      const remarks = document.getElementById('wbLineRemarks');
      if (unit) unit.value = 'pcs';
      if (remarks) remarks.value = '';
    }
  }

  function alreadyDrafted(lines, productName) {
    return lines.filter((line) => line.product === productName)
      .reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  }

  function addInvoiceLine() {
    const item = selectedProduct('inv');
    if (!item) { toast('Select an available product.', 'err'); return; }
    const qty = Number(document.getElementById('invQty').value) || 0;
    const base = Number(document.getElementById('invUPrice').value) || 0;
    const adjustment = Number(document.getElementById('invPriceAdj').value) || 0;
    const discount = Number(document.getElementById('invDisc').value) || 0;
    if (qty <= 0) { toast('Quantity must be greater than zero.', 'err'); return; }
    if (discount < 0) { toast('Discount cannot be negative.', 'err'); return; }
    if (Math.abs(adjustment) > 1e-9 && !invoicePriceAdjustmentUnlocked) {
      toast('Invoice price adjustment is locked. Double-click it and enter the price PIN.', 'warn');
      return;
    }
    const used = alreadyDrafted(invoiceDraft.lines, item.name);
    if (used + qty > Number(item.qty) + 1e-9) {
      toast(`Cannot add ${qty} units. ${item.name} has ${fmtN(item.qty)} available and ${fmtN(used)} already in this invoice.`, 'err');
      return;
    }
    const unitPrice = round2(base + adjustment);
    const total = round2(qty * unitPrice - discount);
    if (total < 0) { toast('Discount cannot exceed the line value.', 'err'); return; }
    invoiceDraft.lines.push({
      id: idStamp('INVL-'), productId: item.id || '', product: item.name,
      qty, unitPrice, basePrice: base, priceAdjustment: adjustment, discount, total
    });
    invoicePriceAdjustmentUnlocked = false;
    render();
    toast('Invoice item added.');
  }

  function addWaybillLine() {
    const item = selectedProduct('wb');
    if (!item) { toast('Select an available product.', 'err'); return; }
    const qty = Number(document.getElementById('wbQty').value) || 0;
    const unit = String(document.getElementById('wbUnit').value || 'pcs').trim();
    const remarks = String(document.getElementById('wbLineRemarks').value || '').trim();
    if (qty <= 0) { toast('Quantity must be greater than zero.', 'err'); return; }
    const used = alreadyDrafted(waybillDraft.lines, item.name);
    if (used + qty > Number(item.qty) + 1e-9) {
      toast(`Cannot add ${qty} units. ${item.name} has ${fmtN(item.qty)} available and ${fmtN(used)} already in this waybill.`, 'err');
      return;
    }
    waybillDraft.lines.push({
      id: idStamp('WBL-'), productId: item.id || '', product: item.name,
      qty, unit: unit || 'pcs', remarks
    });
    render();
    toast('Waybill item added.');
  }

  function removeLine(type, index) {
    const draft = type === 'invoice' ? invoiceDraft : waybillDraft;
    draft.lines.splice(index, 1);
    render();
  }

  function clearDraft(type) {
    if (!confirm('Clear all items and details from this draft?')) return;
    if (type === 'invoice') {
      resetInvoiceDraft();
    } else {
      resetWaybillDraft();
    }
    render();
  }

  function invoiceSubtotal(lines) {
    return round2((lines || []).reduce((sum, line) => sum + (Number(line.total) || 0), 0));
  }

  function invoiceTotals(lines, percent) {
    const subtotal = invoiceSubtotal(lines);
    const vatRate = normalizeVatPercent(percent);
    const vat = round2(subtotal * vatRate / 100);
    return { subtotal, vatRate, vat, total: round2(subtotal + vat) };
  }

  function invoiceVatRateChanged(value) {
    invoiceDraft.vatRate = normalizeVatPercent(value);
    const totals = invoiceTotals(invoiceDraft.lines, invoiceDraft.vatRate);
    const input = document.getElementById('invVatRate');
    const label = document.getElementById('invVatRateLabel');
    const subtotal = document.getElementById('invSubtotal');
    const vat = document.getElementById('invVatAmount');
    const grand = document.getElementById('invGrandTotal');
    if (input && document.activeElement !== input) input.value = invoiceDraft.vatRate;
    if (label) label.textContent = fmtN(totals.vatRate);
    if (subtotal) subtotal.textContent = fmt(totals.subtotal);
    if (vat) vat.textContent = fmt(totals.vat);
    if (grand) grand.textContent = fmt(totals.total);
  }

  function clampInvoiceVatRate() {
    invoiceDraft.vatRate = normalizeVatPercent((document.getElementById('invVatRate') || {}).value);
    const input = document.getElementById('invVatRate');
    if (input) input.value = invoiceDraft.vatRate;
    invoiceVatRateChanged(invoiceDraft.vatRate);
  }

  function captureInvoiceFields() {
    const fields = {
      customer: 'invCustomer', location: 'invLocation', contact: 'invContact', tin: 'invTin',
      reference: 'invReference', dueDate: 'invDueDate', terms: 'invTerms', notes: 'invNotes'
    };
    Object.keys(fields).forEach((field) => {
      const element = document.getElementById(fields[field]);
      if (element) invoiceDraft[field] = String(element.value || '').trim();
    });
    const vat = document.getElementById('invVatRate');
    if (vat) invoiceDraft.vatRate = normalizeVatPercent(vat.value);
  }

  function captureWaybillFields() {
    const fields = {
      consignee: 'wbConsignee', location: 'wbLocation', contact: 'wbContact', vehicleNo: 'wbVehicleNo',
      driver: 'wbDriver', reference: 'wbReference', notes: 'wbNotes'
    };
    Object.keys(fields).forEach((field) => {
      const element = document.getElementById(fields[field]);
      if (element) waybillDraft[field] = String(element.value || '').trim();
    });
  }

  function createInvoice() {
    if (!canManageDocuments()) { toast('Document-management permission is required.', 'err'); return; }
    captureInvoiceFields();
    if (!invoiceDraft.customer) { toast('Customer name is required.', 'err'); return; }
    if (!invoiceDraft.contact) { toast('Customer telephone is required.', 'err'); return; }
    if (!invoiceDraft.lines.length) { toast('Add at least one product to the invoice.', 'err'); return; }
    const totals = invoiceTotals(invoiceDraft.lines, invoiceDraft.vatRate);
    const existing = editingInvoiceId ? findDocument('invoice', editingInvoiceId) : null;
    if (editingInvoiceId && (!existing || existing.status !== ACTIVE)) { toast('Only an open invoice can be edited.', 'err'); return; }
    const id = existing ? existing.id : idStamp('INV-');
    const values = {
      id, invoiceNo: existing ? existing.invoiceNo : id, date: existing ? existing.date : nowISO(), dueDate: invoiceDraft.dueDate,
      customer: invoiceDraft.customer, location: invoiceDraft.location,
      contact: invoiceDraft.contact, tin: invoiceDraft.tin, reference: invoiceDraft.reference,
      terms: invoiceDraft.terms, notes: invoiceDraft.notes,
      subtotal: totals.subtotal, vatRate: totals.vatRate, vatAmount: totals.vat, vat: totals.vat, total: totals.total,
      status: ACTIVE, cashier: existing ? existing.cashier : session.cashier, cashierTel: existing ? existing.cashierTel : session.tel,
      year: getLatestMonth().year, month: getLatestMonth().month,
      lines: deepClone(invoiceDraft.lines)
    };
    const record = existing || values;
    if (existing) {
      Object.assign(record, values, {
        editRevision: (Number(existing.editRevision) || 0) + 1,
        updatedAt: nowISO(), updatedBy: session.cashier
      });
    } else DB.invoices.push(record);
    saveDB();
    const wasEditing = !!existing;
    editingInvoiceId = '';
    resetInvoiceDraft();
    toast((wasEditing ? 'Invoice updated · ' : 'Invoice saved · ') + record.invoiceNo);
    showCommercialDocument('invoice', record);
  }

  function createWaybill() {
    if (!canManageDocuments()) { toast('Document-management permission is required.', 'err'); return; }
    captureWaybillFields();
    if (!waybillDraft.consignee) { toast('Consignee/customer name is required.', 'err'); return; }
    if (!waybillDraft.lines.length) { toast('Add at least one product to the waybill.', 'err'); return; }
    const existing = editingWaybillId ? findDocument('waybill', editingWaybillId) : null;
    if (editingWaybillId && (!existing || existing.status !== ACTIVE)) { toast('Only an active waybill can be edited.', 'err'); return; }
    const id = existing ? existing.id : idStamp('WB-');
    const values = {
      id, waybillNo: existing ? existing.waybillNo : id, date: existing ? existing.date : nowISO(), consignee: waybillDraft.consignee,
      location: waybillDraft.location, contact: waybillDraft.contact,
      vehicleNo: waybillDraft.vehicleNo, driver: waybillDraft.driver,
      reference: waybillDraft.reference, notes: waybillDraft.notes,
      status: ACTIVE, cashier: existing ? existing.cashier : session.cashier, cashierTel: existing ? existing.cashierTel : session.tel,
      year: getLatestMonth().year, month: getLatestMonth().month,
      lines: deepClone(waybillDraft.lines)
    };
    const record = existing || values;
    if (existing) {
      Object.assign(record, values, {
        editRevision: (Number(existing.editRevision) || 0) + 1,
        updatedAt: nowISO(), updatedBy: session.cashier
      });
    } else DB.waybills.push(record);
    saveDB();
    const wasEditing = !!existing;
    editingWaybillId = '';
    resetWaybillDraft();
    toast((wasEditing ? 'Waybill updated · ' : 'Waybill saved · ') + record.waybillNo);
    showCommercialDocument('waybill', record);
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function invoicePaperHTML(record) {
    const biz = DB.business || BUSINESS;
    const totals = invoiceTotals(record.lines || [], record.vatRate != null ? record.vatRate : 0);
    const rows = (record.lines || []).map((line, index) => `<tr>
      <td style="text-align:center">${index + 1}</td><td class="mono">${esc(line.productId || '—')}</td>
      <td>${esc(line.product)}</td><td style="text-align:right">${fmtN(line.qty)}</td>
      <td style="text-align:right">${fmtN(line.unitPrice)}</td><td style="text-align:right">${fmtN(line.discount || 0)}</td>
      <td style="text-align:right">${fmtN(line.total)}</td></tr>`).join('');
    const voided = record.status === VOID;
    return `<div class="document-paper" style="position:relative">
      ${voided ? '<div style="position:absolute;inset:42% 0 auto;text-align:center;font-size:76px;font-weight:900;color:rgba(185,28,28,.17);transform:rotate(-20deg);letter-spacing:10px">VOID</div>' : ''}
      <div class="doc-head"><div><div style="font-size:20px;font-weight:900">${esc(biz.name)}</div>
        <div>${esc(biz.address || '')}</div><div>Tel: ${esc(biz.tel || '')}</div></div>
        <div><div class="doc-title">INVOICE</div><div>Invoice No: <b>${esc(record.invoiceNo)}</b></div>
        <div>Date: ${formatDate(record.date)}</div><div>Due: ${formatDate(record.dueDate)}</div></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div><b>BILL TO</b><br><strong>${esc(record.customer)}</strong><br>${esc(record.location || '')}<br>${esc(record.contact || '')}${record.tin ? '<br>TIN: ' + esc(record.tin) : ''}</div>
        <div><b>REFERENCE</b><br>${esc(record.reference || '—')}<br><b>Prepared by:</b> ${esc(record.cashier || '')}</div>
      </div>
      <table><thead><tr><th>#</th><th>Product ID</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Discount</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="doc-total"><div><span>Subtotal</span><b>GH₵ ${fmtN(record.subtotal != null ? record.subtotal : totals.subtotal)}</b></div>
        <div><span>VAT (${fmtN(record.vatRate != null ? record.vatRate : totals.vatRate)}%)</span><b>GH₵ ${fmtN(record.vatAmount != null ? record.vatAmount : (record.vat != null ? record.vat : totals.vat))}</b></div>
        <div class="grand"><span>GRAND TOTAL</span><b>GH₵ ${fmtN(record.total != null ? record.total : totals.total)}</b></div></div>
      ${record.terms ? `<div style="margin-top:22px"><b>Terms:</b> ${esc(record.terms)}</div>` : ''}
      ${record.notes ? `<div style="margin-top:8px"><b>Notes:</b> ${esc(record.notes)}</div>` : ''}
      <div class="signature-grid"><div class="signature-line">For ${esc(biz.name)}</div><div class="signature-line">Customer signature</div></div>
    </div>`;
  }

  function waybillPaperHTML(record) {
    const biz = DB.business || BUSINESS;
    const rows = (record.lines || []).map((line, index) => `<tr>
      <td style="text-align:center">${index + 1}</td><td class="mono">${esc(line.productId || '—')}</td>
      <td>${esc(line.product)}</td><td style="text-align:right">${fmtN(line.qty)}</td>
      <td>${esc(line.unit || 'pcs')}</td><td>${esc(line.remarks || '')}</td></tr>`).join('');
    const voided = record.status === VOID;
    return `<div class="document-paper" style="position:relative">
      ${voided ? '<div style="position:absolute;inset:42% 0 auto;text-align:center;font-size:76px;font-weight:900;color:rgba(185,28,28,.17);transform:rotate(-20deg);letter-spacing:10px">VOID</div>' : ''}
      <div class="doc-head"><div><div style="font-size:20px;font-weight:900">${esc(biz.name)}</div>
        <div>${esc(biz.address || '')}</div><div>Tel: ${esc(biz.tel || '')}</div></div>
        <div><div class="doc-title">WAYBILL</div><div>Waybill No: <b>${esc(record.waybillNo)}</b></div><div>Date: ${formatDate(record.date)}</div></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div><b>CONSIGNEE / CUSTOMER</b><br><strong>${esc(record.consignee)}</strong><br>${esc(record.location || '')}<br>${esc(record.contact || '')}</div>
        <div><b>REFERENCE:</b> ${esc(record.reference || '—')}<br><b>Vehicle No:</b> ${esc(record.vehicleNo || '—')}<br><b>Driver:</b> ${esc(record.driver || '—')}<br><b>Issued by:</b> ${esc(record.cashier || '')}</div>
      </div>
      <table><thead><tr><th>#</th><th>Product ID</th><th>Product description</th><th style="text-align:right">Quantity</th><th>Unit</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>
      ${record.notes ? `<div style="margin-top:18px"><b>Delivery notes:</b> ${esc(record.notes)}</div>` : ''}
      <div class="signature-grid"><div class="signature-line">Goods issued by</div><div class="signature-line">Goods received by</div></div>
      <div style="margin-top:14px;font-size:10px">The recipient confirms that the goods listed above were received in the stated quantities and apparent condition.</div>
    </div>`;
  }

  function documentHTML(type, record) {
    return type === 'invoice' ? invoicePaperHTML(record) : waybillPaperHTML(record);
  }

  function showCommercialDocument(type, record) {
    activeCommercialDocument = { type, record: deepClone(record) };
    openModal(`${documentHTML(type, record)}<div class="row" style="margin-top:12px">
      <button class="btn" onclick="printActiveCommercialDocument()">Print one copy</button>
      <button class="btn ghost" onclick="closeModal();render()">Close</button>
    </div>`);
  }

  function cleanupPrintFrame(frame) {
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    documentPrintBusy = false;
  }

  function printCommercialDocument(type, record) {
    if (documentPrintBusy) { toast('A document print window is already opening.', 'warn'); return; }
    documentPrintBusy = true;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0';
    frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    const number = type === 'invoice' ? record.invoiceNo : record.waybillNo;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(number)}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
      .document-paper{background:#fff;color:#111;padding:0;font-size:12px;line-height:1.45}.doc-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
      .doc-title{font-size:25px;font-weight:900;letter-spacing:2px;text-align:right}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:6px;vertical-align:top}th{background:#eee;text-align:left}
      .doc-total{width:330px;max-width:100%;margin-left:auto;margin-top:12px}.doc-total div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}.doc-total .grand{font-size:15px;font-weight:900;border-top:2px solid #111;border-bottom:2px solid #111}
      .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}.signature-line{border-top:1px solid #111;padding-top:5px;text-align:center}
    </style></head><body>${documentHTML(type, record)}</body></html>`);
    doc.close();
    setTimeout(() => {
      try {
        const printWindow = frame.contentWindow;
        printWindow.onafterprint = () => cleanupPrintFrame(frame);
        printWindow.focus(); printWindow.print();
        setTimeout(() => cleanupPrintFrame(frame), 15000);
      } catch (error) {
        console.error('Commercial document print failed', error);
        cleanupPrintFrame(frame);
        toast('Printing could not start.', 'err');
      }
    }, 250);
  }

  function findDocument(type, id) {
    const list = type === 'invoice' ? DB.invoices : DB.waybills;
    return list.find((item) => item.id === id || item.invoiceNo === id || item.waybillNo === id) || null;
  }

  function editDocument(type, id) {
    if (!canManageDocuments()) { toast('Document-management permission is required.', 'err'); return; }
    const record = findDocument(type, id);
    if (!record) { toast('Document not found.', 'err'); return; }
    if (record.status !== ACTIVE) {
      toast(type === 'invoice' ? 'Only an open, unsold invoice can be edited.' : 'Only an active waybill can be edited.', 'warn');
      return;
    }
    const draft = type === 'invoice' ? invoiceDraft : waybillDraft;
    const alreadyEditing = type === 'invoice' ? editingInvoiceId : editingWaybillId;
    if (!alreadyEditing && draft.lines.length && !confirm('Replace the current unsaved ' + type + ' draft with this saved document?')) return;
    if (type === 'invoice') {
      Object.assign(invoiceDraft, {
        lines: deepClone(record.lines || []), customer: record.customer || '', location: record.location || '',
        contact: record.contact || '', tin: record.tin || '', reference: record.reference || '',
        dueDate: record.dueDate || '', terms: record.terms || '', notes: record.notes || '',
        vatRate: normalizeVatPercent(record.vatRate)
      });
      editingInvoiceId = record.id;
      editingWaybillId = '';
      invoicePriceAdjustmentUnlocked = false;
      closeModal(); nav('invoices');
    } else {
      Object.assign(waybillDraft, {
        lines: deepClone(record.lines || []), consignee: record.consignee || '', location: record.location || '',
        contact: record.contact || '', vehicleNo: record.vehicleNo || '', driver: record.driver || '',
        reference: record.reference || '', notes: record.notes || ''
      });
      editingWaybillId = record.id;
      editingInvoiceId = '';
      closeModal(); nav('waybills');
    }
    toast('Editing ' + (type === 'invoice' ? record.invoiceNo : record.waybillNo) + '.');
  }

  function cancelDocumentEdit(type) {
    if (!confirm('Discard the unsaved changes to this ' + type + '?')) return;
    if (type === 'invoice') {
      editingInvoiceId = '';
      resetInvoiceDraft();
    } else {
      editingWaybillId = '';
      resetWaybillDraft();
    }
    render();
  }

  function voidDocument(type, id) {
    if (!isElevated()) { toast('Only admin can void documents.', 'err'); return; }
    const record = findDocument(type, id);
    if (!record) { toast('Document not found.', 'err'); return; }
    if (record.status === VOID) { toast('This document is already void.', 'warn'); return; }
    const label = type === 'invoice' ? record.invoiceNo : record.waybillNo;
    if (!confirm('Void ' + label + '? The record will remain in the register for audit.')) return;
    record.status = VOID; record.voidedAt = nowISO(); record.voidedBy = session.cashier;
    saveDB(); toast(label + ' marked VOID.'); render();
  }

  function loadInvoiceToSale(id) {
    const invoice = findDocument('invoice', id);
    if (!invoice) { toast('Invoice not found.', 'err'); return; }
    if (invoice.status === VOID) { toast('A void invoice cannot be loaded into Sale Out.', 'err'); return; }
    if (invoice.status !== ACTIVE) { toast('This invoice has already been converted to a sale.', 'warn'); return; }
    const grouped = new Map();
    (invoice.lines || []).forEach((line) => grouped.set(line.product, (grouped.get(line.product) || 0) + (Number(line.qty) || 0)));
    for (const [name, qty] of grouped.entries()) {
      const available = stockOnHand(name);
      if (qty > available + 1e-9) {
        toast(`Invoice cannot be loaded. ${name} requires ${fmtN(qty)}, but only ${fmtN(available)} is available now.`, 'err');
        return;
      }
    }
    cart = (invoice.lines || []).map((line) => ({
      name: line.product, qty: Number(line.qty) || 0,
      uPrice: Number(line.unitPrice) || 0,
      basePrice: Number(line.basePrice != null ? line.basePrice : line.unitPrice) || 0,
      adj: Number(line.priceAdjustment) || 0,
      disc: Number(line.discount) || 0,
      lineTotal: Number(line.total) || 0
    }));
    cart._cust = invoice.customer || '';
    cart._loc = invoice.location || '';
    cart._tel = invoice.contact || '';
    cart._paid = 0;
    cart._vatRate = normalizeVatPercent(invoice.vatRate != null ? invoice.vatRate : (Number(invoice.subtotal) > 0 ? ((Number(invoice.vatAmount != null ? invoice.vatAmount : invoice.vat) || 0) / Number(invoice.subtotal)) * 100 : 0));
    cart._sourceInvoiceId = invoice.id;
    nav('pos');
    toast('Invoice loaded into Sale Out. Complete payment and print the receipt to post stock and KPIs.');
  }

  function prepareWaybillFromInvoice(id) {
    const invoice = findDocument('invoice', id);
    if (!invoice) { toast('Invoice not found.', 'err'); return; }
    if (invoice.status === VOID) { toast('A void invoice cannot create a waybill.', 'err'); return; }
    Object.assign(waybillDraft, {
      lines: (invoice.lines || []).map((line) => ({
        id: idStamp('WBL-'), productId: line.productId || '', product: line.product,
        qty: Number(line.qty) || 0, unit: 'pcs', remarks: ''
      })),
      consignee: invoice.customer || '', location: invoice.location || '',
      contact: invoice.contact || '', vehicleNo: '', driver: '',
      reference: invoice.invoiceNo || invoice.id, notes: ''
    });
    nav('waybills');
    toast('Waybill draft created from ' + invoice.invoiceNo + '.');
  }

  function invoiceBuilderHTML() {
    const lm = getLatestMonth();
    const totals = invoiceTotals(invoiceDraft.lines, invoiceDraft.vatRate);
    const editing = editingInvoiceId ? findDocument('invoice', editingInvoiceId) : null;
    const rows = invoiceDraft.lines.map((line, index) => `<tr>
      <td class="mono">${esc(line.productId || '—')}</td><td>${esc(line.product)}</td>
      <td class="right mono">${fmtN(line.qty)}</td><td class="right mono">${fmtN(line.unitPrice)}</td>
      <td class="right mono">${fmtN(line.discount || 0)}</td><td class="right mono">${fmtN(line.total)}</td>
      <td><button class="btn sm danger" onclick="removeCommercialLine('invoice',${index})">Remove</button></td></tr>`).join('') ||
      '<tr><td colspan="7" class="empty">No products added to this invoice.</td></tr>';
    const banner = editing ? `<div class="card" style="margin-bottom:12px;border-color:var(--amber)"><b>Editing ${esc(editing.invoiceNo)}</b><p class="muted" style="margin:6px 0 0">Sale Out will use this updated version after you save it.</p></div>` : '';
    return banner + `<div class="document-layout"><div>
      <div class="card sale-theme" style="margin-bottom:12px"><h3>Product entry · Invoice</h3>
        <div class="row mobile-search-row"><div class="field" style="position:relative;flex:1"><label>Search by product name</label>
          <input id="invSearchName" placeholder="Type product name…" autocomplete="off" oninput="invoiceSearchName()" onkeydown="commercialSearchKey(event,'inv','name')"><div id="invSuggestName" class="suggest"></div></div>
          <div class="field" style="position:relative;flex:1"><label>Search by product ID</label>
          <input id="invSearchId" placeholder="Type product ID…" autocomplete="off" oninput="invoiceSearchId()" onkeydown="commercialSearchKey(event,'inv','id')"><div id="invSuggestId" class="suggest"></div></div></div>
        <div class="field"><label>Available product — ${monthName(lm.month)} ${lm.year}</label><select id="invProduct" onchange="commercialProductChanged('inv')">${productOptions()}</select></div>
        <div class="row mobile-number-row"><div class="field" style="flex:1"><label>Qty</label><input id="invQty" type="number" min="0.01" step="1" value="1"></div>
          <div class="field" style="flex:1"><label>Unit price (locked)</label><input id="invUPrice" type="number" step="0.01" value="0" readonly></div>
          <div class="field" style="flex:1"><label>Price adj (dbl-click / PIN)</label><input id="invPriceAdj" type="number" step="0.01" value="0" readonly ondblclick="unlockInvoicePriceAdjustment()"></div>
          <div class="field" style="flex:1"><label>Discount (GH₵)</label><input id="invDisc" type="number" min="0" step="0.01" value="0"></div></div>
        <div class="row"><span class="pill">Remaining qty: <b id="invRemQty" class="mono">0</b></span><span class="pill">Open month: ${monthName(lm.month)} ${lm.year}</span></div>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="addInvoiceItem()">Add item</button><button class="btn ghost" onclick="clearCommercialEntry('inv')">Clear entry</button></div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">The invoice checks current stock availability but does not deduct or reserve stock. Stock is posted only after loading the invoice into Sale Out and completing the sale.</p>
      </div>
      <div class="card"><h3>Invoice items</h3><div class="table-wrap"><table><thead><tr><th>Product ID</th><th>Product</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Discount</th><th class="right">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="row" style="margin-top:8px"><button class="btn sm danger" onclick="clearCommercialDraft('invoice')">Clear draft</button></div></div>
      </div><div>
      <div class="card" style="margin-bottom:12px"><h3>Customer and terms</h3>
        <div class="field"><label>Customer name *</label><input id="invCustomer" value="${escAttr(invoiceDraft.customer)}" oninput="invoiceDraftField('customer',this.value)"></div>
        <div class="field"><label>Location</label><input id="invLocation" value="${escAttr(invoiceDraft.location)}" oninput="invoiceDraftField('location',this.value)"></div>
        <div class="field"><label>Telephone *</label><input id="invContact" value="${escAttr(invoiceDraft.contact)}" oninput="invoiceDraftField('contact',this.value)"></div>
        <div class="field"><label>TIN / Customer ID</label><input id="invTin" value="${escAttr(invoiceDraft.tin)}" oninput="invoiceDraftField('tin',this.value)"></div>
        <div class="field"><label>Reference / Purchase order</label><input id="invReference" value="${escAttr(invoiceDraft.reference)}" oninput="invoiceDraftField('reference',this.value)"></div>
        <div class="field"><label>Due date</label><input id="invDueDate" type="date" value="${escAttr(invoiceDraft.dueDate)}" oninput="invoiceDraftField('dueDate',this.value)"></div>
        <div class="field"><label>Terms</label><textarea id="invTerms" rows="2" oninput="invoiceDraftField('terms',this.value)">${esc(invoiceDraft.terms)}</textarea></div>
        <div class="field"><label>Notes</label><textarea id="invNotes" rows="2" oninput="invoiceDraftField('notes',this.value)">${esc(invoiceDraft.notes)}</textarea></div>
      </div>
      <div class="card pos-totals"><h3>Invoice summary</h3><div class="statline"><span>Subtotal</span><b class="mono" id="invSubtotal">${fmt(totals.subtotal)}</b></div>
        <div class="field" style="margin-top:10px"><label>VAT percentage (%)</label><input id="invVatRate" type="number" min="0" max="100" step="0.01" value="${totals.vatRate}" oninput="invoiceVatRateChanged(this.value)" onchange="clampInvoiceVatRate()"></div>
        <div class="statline"><span>VAT amount (<span id="invVatRateLabel">${fmtN(totals.vatRate)}</span>%)</span><b class="mono" id="invVatAmount">${fmt(totals.vat)}</b></div><div class="statline"><span>Grand total</span><b class="mono" id="invGrandTotal">${fmt(totals.total)}</b></div>
        <button class="btn ok" style="width:100%;margin-top:12px" onclick="saveElectronicInvoice()">${editing ? 'Update & open invoice' : 'Save & open invoice'}</button>
        ${editing ? '<button class="btn danger" style="width:100%;margin-top:8px" onclick="cancelCommercialEdit(\'invoice\')">Cancel edit</button>' : ''}</div>
      </div></div>`;
  }

  function invoiceRegisterHTML() {
    let list = DB.invoices.slice().reverse();
    if (session.isCashier2 && !isElevated()) list = list.filter((item) => item.cashier === session.cashier);
    const rows = list.map((item) => {
      const isVoid = item.status === VOID;
      const isConverted = item.status === 'CONVERTED';
      return `<tr class="${isVoid ? 'doc-void' : (isConverted ? 'doc-converted' : '')}"><td class="mono" style="font-size:11px">${esc(item.invoiceNo)}</td>
        <td>${esc(item.customer)}</td><td class="right mono">${fmt(item.total)}</td><td>${new Date(item.date).toLocaleString()}</td><td>${esc(item.cashier || '')}</td>
        <td>${isVoid ? '<span class="badge bad">VOID</span>' : (isConverted ? '<span class="badge ok">SOLD</span>' : '<span class="badge">OPEN</span>')}</td>
        <td><div class="doc-register-actions"><button class="btn sm ghost" onclick="showStoredCommercialDocument('invoice','${escAttr(item.id)}')">View</button>
          <button class="btn sm" onclick="printStoredCommercialDocument('invoice','${escAttr(item.id)}')">Print</button>
          ${item.status === ACTIVE && canManageDocuments() ? `<button class="btn sm ghost" onclick="editCommercialDocument('invoice','${escAttr(item.id)}')">Edit</button>` : ''}
          ${item.status === ACTIVE ? `<button class="btn sm ok" onclick="loadInvoiceIntoSale('${escAttr(item.id)}')">Sale Out</button>` : ''}${!isVoid ? `<button class="btn sm ghost" onclick="waybillFromInvoice('${escAttr(item.id)}')">Waybill</button>` : ''}
          ${isElevated() && !isVoid ? `<button class="btn sm danger" onclick="voidCommercialDocument('invoice','${escAttr(item.id)}')">Void</button>` : ''}</div></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">No invoices saved yet.</td></tr>';
    return `<div class="card" style="margin-top:12px"><h3>Invoice register</h3><div class="table-wrap"><table><thead><tr><th>Invoice #</th><th>Customer</th><th class="right">Total</th><th>Date</th><th>Prepared by</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function waybillBuilderHTML() {
    const lm = getLatestMonth();
    const editing = editingWaybillId ? findDocument('waybill', editingWaybillId) : null;
    const rows = waybillDraft.lines.map((line, index) => `<tr><td class="mono">${esc(line.productId || '—')}</td><td>${esc(line.product)}</td>
      <td class="right mono">${fmtN(line.qty)}</td><td>${esc(line.unit || 'pcs')}</td><td>${esc(line.remarks || '')}</td>
      <td><button class="btn sm danger" onclick="removeCommercialLine('waybill',${index})">Remove</button></td></tr>`).join('') ||
      '<tr><td colspan="6" class="empty">No products added to this waybill.</td></tr>';
    const banner = editing ? `<div class="card" style="margin-bottom:12px;border-color:var(--amber)"><b>Editing ${esc(editing.waybillNo)}</b><p class="muted" style="margin:6px 0 0">Printing and PDF export will use this updated version after you save it.</p></div>` : '';
    return banner + `<div class="document-layout"><div>
      <div class="card sale-theme" style="margin-bottom:12px"><h3>Product entry · Waybill</h3>
        <div class="row mobile-search-row"><div class="field" style="position:relative;flex:1"><label>Search by product name</label><input id="wbSearchName" placeholder="Type product name…" autocomplete="off" oninput="waybillSearchName()" onkeydown="commercialSearchKey(event,'wb','name')"><div id="wbSuggestName" class="suggest"></div></div>
          <div class="field" style="position:relative;flex:1"><label>Search by product ID</label><input id="wbSearchId" placeholder="Type product ID…" autocomplete="off" oninput="waybillSearchId()" onkeydown="commercialSearchKey(event,'wb','id')"><div id="wbSuggestId" class="suggest"></div></div></div>
        <div class="field"><label>Available product — ${monthName(lm.month)} ${lm.year}</label><select id="wbProduct" onchange="commercialProductChanged('wb')">${productOptions()}</select></div>
        <div class="row mobile-number-row waybill-number-row"><div class="field" style="flex:1"><label>Quantity</label><input id="wbQty" type="number" min="0.01" step="1" value="1"></div>
          <div class="field" style="flex:1"><label>Unit</label><input id="wbUnit" value="pcs" placeholder="pcs, boxes, sets…"></div>
          <div class="field" style="flex:2"><label>Line remarks</label><input id="wbLineRemarks" placeholder="Serial numbers or condition (optional)"></div></div>
        <div class="row"><span class="pill">Remaining qty: <b id="wbRemQty" class="mono">0</b></span><span class="pill">Open month: ${monthName(lm.month)} ${lm.year}</span></div>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="addWaybillItem()">Add item</button><button class="btn ghost" onclick="clearCommercialEntry('wb')">Clear entry</button></div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">A waybill documents delivery only. It does not deduct stock or change sales figures, preventing the same goods from being posted twice.</p>
      </div>
      <div class="card"><h3>Waybill items</h3><div class="table-wrap"><table><thead><tr><th>Product ID</th><th>Product</th><th class="right">Qty</th><th>Unit</th><th>Remarks</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="row" style="margin-top:8px"><button class="btn sm danger" onclick="clearCommercialDraft('waybill')">Clear draft</button></div></div>
      </div><div>
      <div class="card" style="margin-bottom:12px"><h3>Delivery information</h3>
        <div class="field"><label>Consignee / Customer *</label><input id="wbConsignee" value="${escAttr(waybillDraft.consignee)}" oninput="waybillDraftField('consignee',this.value)"></div>
        <div class="field"><label>Delivery location</label><input id="wbLocation" value="${escAttr(waybillDraft.location)}" oninput="waybillDraftField('location',this.value)"></div>
        <div class="field"><label>Telephone</label><input id="wbContact" value="${escAttr(waybillDraft.contact)}" oninput="waybillDraftField('contact',this.value)"></div>
        <div class="field"><label>Invoice / Receipt / Order reference</label><input id="wbReference" value="${escAttr(waybillDraft.reference)}" oninput="waybillDraftField('reference',this.value)"></div>
        <div class="field"><label>Vehicle number</label><input id="wbVehicleNo" value="${escAttr(waybillDraft.vehicleNo)}" oninput="waybillDraftField('vehicleNo',this.value)"></div>
        <div class="field"><label>Driver / Delivery person</label><input id="wbDriver" value="${escAttr(waybillDraft.driver)}" oninput="waybillDraftField('driver',this.value)"></div>
        <div class="field"><label>Delivery notes</label><textarea id="wbNotes" rows="3" oninput="waybillDraftField('notes',this.value)">${esc(waybillDraft.notes)}</textarea></div>
        <button class="btn ok" style="width:100%;margin-top:6px" onclick="saveElectronicWaybill()">${editing ? 'Update & open waybill' : 'Save & open waybill'}</button>
        ${editing ? '<button class="btn danger" style="width:100%;margin-top:8px" onclick="cancelCommercialEdit(\'waybill\')">Cancel edit</button>' : ''}
      </div><div class="doc-help"><b>Stock protection:</b> Create the receipt through Sale Out for the actual stock movement. Use the waybill only as the delivery document.</div>
      </div></div>`;
  }

  function waybillRegisterHTML() {
    let list = DB.waybills.slice().reverse();
    if (session.isCashier2 && !isElevated()) list = list.filter((item) => item.cashier === session.cashier);
    const rows = list.map((item) => {
      const isVoid = item.status === VOID;
      return `<tr class="${isVoid ? 'doc-void' : ''}"><td class="mono" style="font-size:11px">${esc(item.waybillNo)}</td><td>${esc(item.consignee)}</td>
        <td>${esc(item.reference || '—')}</td><td>${new Date(item.date).toLocaleString()}</td><td>${esc(item.cashier || '')}</td><td>${isVoid ? '<span class="badge bad">VOID</span>' : '<span class="badge ok">ACTIVE</span>'}</td>
        <td><div class="doc-register-actions"><button class="btn sm ghost" onclick="showStoredCommercialDocument('waybill','${escAttr(item.id)}')">View</button>
          <button class="btn sm" onclick="printStoredCommercialDocument('waybill','${escAttr(item.id)}')">Print</button>
          ${!isVoid && canManageDocuments() ? `<button class="btn sm ghost" onclick="editCommercialDocument('waybill','${escAttr(item.id)}')">Edit</button>` : ''}
          ${isElevated() && !isVoid ? `<button class="btn sm danger" onclick="voidCommercialDocument('waybill','${escAttr(item.id)}')">Void</button>` : ''}</div></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">No waybills saved yet.</td></tr>';
    return `<div class="card" style="margin-top:12px"><h3>Waybill register</h3><div class="table-wrap"><table><thead><tr><th>Waybill #</th><th>Consignee</th><th>Reference</th><th>Date</th><th>Issued by</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function viewInvoices() {
    ensureModel();
    return invoiceBuilderHTML() + invoiceRegisterHTML();
  }

  function viewWaybills() {
    ensureModel();
    return waybillBuilderHTML() + waybillRegisterHTML();
  }

  const previousRender = render;
  render = function () {
    if (currentView !== 'invoices' && currentView !== 'waybills') return previousRender();
    updatePeriodUI();
    applyRoleUI();
    const root = document.getElementById('viewRoot');
    root.innerHTML = currentView === 'invoices' ? viewInvoices() : viewWaybills();
  };

  const previousPrintReceiptSale = printReceiptSale;
  printReceiptSale = function () {
    const sourceInvoiceId = cart && cart._sourceInvoiceId ? cart._sourceInvoiceId : '';
    const previousSalesCount = DB.sales.length;
    previousPrintReceiptSale();
    if (sourceInvoiceId && DB.sales.length > previousSalesCount) {
      const invoice = DB.invoices.find((item) => item.id === sourceInvoiceId);
      const newestSale = DB.sales[DB.sales.length - 1];
      if (invoice && invoice.status !== VOID) {
        invoice.status = 'CONVERTED';
        invoice.convertedAt = nowISO();
        invoice.convertedBy = session.cashier;
        invoice.convertedReceiptNo = newestSale && newestSale.receiptNo ? newestSale.receiptNo : '';
        saveDB();
      }
    }
  };

  window.invoiceSearchName = () => searchSuggestions('inv', 'name');
  window.invoiceSearchId = () => searchSuggestions('inv', 'id');
  window.waybillSearchName = () => searchSuggestions('wb', 'name');
  window.waybillSearchId = () => searchSuggestions('wb', 'id');
  window.pickCommercialProduct = pickProduct;
  window.commercialProductChanged = productChanged;
  window.clearCommercialEntry = clearEntry;
  window.commercialSearchKey = function (event, prefix, mode) {
    const box = document.getElementById(prefix + (mode === 'id' ? 'SuggestId' : 'SuggestName'));
    if (event.key === 'Escape' && box) box.classList.remove('show');
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = box && box.querySelector('div:not(.none)');
      if (first) first.click();
    }
  };
  window.unlockInvoicePriceAdjustment = function () {
    promptPIN('Invoice Price Adjustment PIN', getPricePIN(), () => {
      invoicePriceAdjustmentUnlocked = true;
      const input = document.getElementById('invPriceAdj');
      if (input) { input.readOnly = false; input.focus(); }
      toast('Invoice price adjustment unlocked.');
    });
  };
  window.addInvoiceItem = addInvoiceLine;
  window.addWaybillItem = addWaybillLine;
  window.removeCommercialLine = removeLine;
  window.clearCommercialDraft = clearDraft;
  window.invoiceDraftField = (field, value) => { invoiceDraft[field] = value; };
  window.invoiceVatRateChanged = invoiceVatRateChanged;
  window.clampInvoiceVatRate = clampInvoiceVatRate;
  window.waybillDraftField = (field, value) => { waybillDraft[field] = value; };
  window.saveElectronicInvoice = createInvoice;
  window.saveElectronicWaybill = createWaybill;
  window.showStoredCommercialDocument = function (type, id) {
    const record = findDocument(type, id);
    if (!record) { toast('Document not found.', 'err'); return; }
    showCommercialDocument(type, record);
  };
  window.printStoredCommercialDocument = function (type, id) {
    const record = findDocument(type, id);
    if (!record) { toast('Document not found.', 'err'); return; }
    printCommercialDocument(type, record);
  };
  window.printActiveCommercialDocument = function () {
    if (!activeCommercialDocument) { toast('No invoice or waybill is open.', 'err'); return; }
    printCommercialDocument(activeCommercialDocument.type, activeCommercialDocument.record);
  };
  window.voidCommercialDocument = voidDocument;
  window.loadInvoiceIntoSale = loadInvoiceToSale;
  window.waybillFromInvoice = prepareWaybillFromInvoice;
  window.editCommercialDocument = editDocument;
  window.cancelCommercialEdit = cancelDocumentEdit;

  ensureModel();
  injectStyles();
  installNavigation();
  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.commercialDocuments = {
    version: '3.4.10', build: BUILD, ensureModel,
    viewInvoices, viewWaybills, createInvoice, createWaybill,
    loadInvoiceToSale, prepareWaybillFromInvoice, editDocument
  };
}());

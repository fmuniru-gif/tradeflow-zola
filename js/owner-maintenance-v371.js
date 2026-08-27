/* ZEZMS Owner Edition v3.7.1 - account filters and purchase orders */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260808-owner-maintenance-r30';
  const OPEN = 'OPEN';
  const COMMITTED = 'COMMITTED';
  const CANCELLED = 'CANCELLED';
  const accountFilters = { debtors: '', creditors: '', depositors: '' };
  let activePurchaseOrder = null;
  let purchaseOrderPrintBusy = false;
  const purchaseOrderDraft = emptyDraft();

  function emptyDraft() {
    return {
      lines: [], supplierId: '', supplierReference: '', expectedDate: '',
      notes: '', amountPaid: 0, wallet: ''
    };
  }

  function resetDraft() {
    Object.assign(purchaseOrderDraft, emptyDraft());
  }

  function text(value) {
    return String(value == null ? '' : value);
  }

  function safeDate(value, withTime) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return withTime ? date.toLocaleString('en-GH') : date.toLocaleDateString('en-GH');
  }

  function ensureModel() {
    let changed = false;
    if (!Array.isArray(DB.purchaseOrders)) { DB.purchaseOrders = []; changed = true; }
    DB.purchaseOrders.forEach(function (order) {
      if (!order.id) { order.id = idStamp('PO-'); changed = true; }
      if (!order.poNo) { order.poNo = order.id; changed = true; }
      if (!order.status) { order.status = OPEN; changed = true; }
      if (!Array.isArray(order.lines)) { order.lines = []; changed = true; }
      if (order.total == null) {
        order.total = round2(order.lines.reduce(function (sum, line) {
          return sum + (Number(line.total) || ((Number(line.qty) || 0) * (Number(line.unitCost) || 0)));
        }, 0));
        changed = true;
      }
      if (order.amountPaid == null) { order.amountPaid = 0; changed = true; }
      if (order.outstanding == null) {
        order.outstanding = Math.max(0, round2((Number(order.total) || 0) - (Number(order.amountPaid) || 0)));
        changed = true;
      }
    });
    if (changed) saveDB();
  }

  function staffCan(action) {
    try {
      if (ZEZMS.staffAuth && ZEZMS.staffAuth.isActive && ZEZMS.staffAuth.isActive()) {
        return !!ZEZMS.staffAuth.can(action);
      }
    } catch (_) {}
    return isElevated();
  }

  function canManagePurchaseOrders() {
    return staffCan('MANAGE_ACCOUNTS');
  }

  function canCommitPurchaseOrders() {
    return staffCan('MANAGE_ACCOUNTS') && staffCan('STOCK_IN');
  }

  function requirePurchaseOrderAccess(commit) {
    const allowed = commit ? canCommitPurchaseOrders() : canManagePurchaseOrders();
    if (!allowed) toast(commit ? 'Stock In permission is required to commit a purchase order.' : 'Account-management permission is required.', 'err');
    return allowed;
  }

  /* ---------------- Account holder dropdown filters ---------------- */
  const originalViewAccounts = viewAccounts;
  viewAccounts = function () {
    const kind = ['debtors', 'creditors', 'depositors'].includes(accTab) ? accTab : 'debtors';
    const fullAccounts = Array.isArray(DB[kind]) ? DB[kind] : [];
    const fullTransactions = Array.isArray(DB.accountTxns) ? DB.accountTxns : [];
    let selectedId = text(accountFilters[kind]);
    const selectedAccount = fullAccounts.find(function (account) { return text(account.id) === selectedId; });
    if (selectedId && !selectedAccount) {
      selectedId = '';
      accountFilters[kind] = '';
    }

    if (selectedAccount) {
      DB[kind] = fullAccounts.filter(function (account) { return text(account.id) === selectedId; });
      DB.accountTxns = fullTransactions.filter(function (txn) {
        const sameId = text(txn.accountID) === selectedId;
        const sameName = text(txn.name).trim().toLowerCase() === text(selectedAccount.name).trim().toLowerCase();
        return sameId || sameName;
      });
    }

    let result = '';
    try {
      result = originalViewAccounts();
    } finally {
      DB[kind] = fullAccounts;
      DB.accountTxns = fullTransactions;
    }

    const options = fullAccounts.slice().sort(function (a, b) {
      return text(a.name).localeCompare(text(b.name));
    }).map(function (account) {
      return '<option value="' + escAttr(account.id) + '" ' + (selectedId === text(account.id) ? 'selected' : '') + '>'
        + esc(account.name) + ' - ' + fmt(account.balance) + '</option>';
    }).join('');
    const label = kind === 'debtors' ? 'debtor' : (kind === 'creditors' ? 'creditor' : 'depositor');
    const toolbar = '<div class="card account-holder-filter" style="margin:0 0 12px">'
      + '<div class="row" style="align-items:end">'
      + '<div class="field" style="margin:0;min-width:min(100%,360px);flex:1"><label>Show records for ' + label + '</label>'
      + '<select id="accountHolderFilter" onchange="setAccountHolderFilter(this.value)">'
      + '<option value="">All ' + esc(kind) + '</option>' + options + '</select></div>'
      + '<button class="btn ghost" onclick="setAccountHolderFilter(\'\')">Clear selection</button>'
      + '</div><p class="muted" style="font-size:11px;margin:8px 0 0">Selecting a name shows that account and its transaction history. Clearing it restores everyone.</p></div>';
    return result.replace(/(<div class="tabs">[\s\S]*?<\/div>)/, '$1' + toolbar);
  };

  window.setAccountHolderFilter = function (accountId) {
    const kind = ['debtors', 'creditors', 'depositors'].includes(accTab) ? accTab : 'debtors';
    accountFilters[kind] = text(accountId);
    render();
  };

  /* ---------------- Purchase order model and form ---------------- */
  function suppliers() {
    return (DB.creditors || []).slice().sort(function (a, b) {
      return text(a.name).localeCompare(text(b.name));
    });
  }

  function purchaseOrderTotal(lines) {
    return round2((lines || []).reduce(function (sum, line) {
      return sum + round2((Number(line.qty) || 0) * (Number(line.unitCost) || 0));
    }, 0));
  }

  function purchaseOrderOutstanding() {
    return Math.max(0, round2(purchaseOrderTotal(purchaseOrderDraft.lines) - (Number(purchaseOrderDraft.amountPaid) || 0)));
  }

  function productOptions() {
    return (DB.products || []).slice().sort(function (a, b) {
      return text(a.name).localeCompare(text(b.name));
    }).map(function (product) {
      return '<option value="' + escAttr(product.id) + '">' + esc(product.id || 'No ID') + ' - ' + esc(product.name) + '</option>';
    }).join('');
  }

  function supplierOptions() {
    return suppliers().map(function (supplier) {
      return '<option value="' + escAttr(supplier.id) + '" ' + (text(purchaseOrderDraft.supplierId) === text(supplier.id) ? 'selected' : '') + '>'
        + esc(supplier.name) + ' - balance ' + fmt(supplier.balance) + '</option>';
    }).join('');
  }

  function walletOptions() {
    return CASH_TYPES.map(function (wallet) {
      return '<option value="' + escAttr(wallet) + '" ' + (purchaseOrderDraft.wallet === wallet ? 'selected' : '') + '>'
        + esc(wallet) + ' - ' + fmt(DB.cashBalances[wallet]) + '</option>';
    }).join('');
  }

  function orderLinesHTML() {
    return purchaseOrderDraft.lines.map(function (line, index) {
      return '<tr><td class="mono">' + esc(line.productId || '-') + '</td><td>' + esc(line.product) + '</td>'
        + '<td class="right mono">' + fmtN(line.qty) + '</td><td class="right mono">' + fmtN(line.unitCost) + '</td>'
        + '<td class="right mono">' + fmtN(line.unitPrice) + '</td><td class="right mono">' + fmtN(line.total) + '</td>'
        + '<td><button class="btn sm danger" onclick="removePurchaseOrderLine(' + index + ')">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No products added to this purchase order.</td></tr>';
  }

  function statusBadge(status) {
    if (status === COMMITTED) return '<span class="badge ok">COMMITTED</span>';
    if (status === CANCELLED) return '<span class="badge bad">CANCELLED</span>';
    return '<span class="badge warn">OPEN</span>';
  }

  function orderRegisterHTML() {
    const rows = (DB.purchaseOrders || []).slice().sort(function (a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    }).map(function (order) {
      const open = order.status === OPEN;
      return '<tr class="' + (order.status === CANCELLED ? 'doc-void' : (order.status === COMMITTED ? 'doc-converted' : '')) + '">'
        + '<td class="mono" style="font-size:11px">' + esc(order.poNo) + '</td><td>' + esc(order.supplierName) + '</td>'
        + '<td class="right mono">' + fmt(order.total) + '</td><td class="right mono">' + fmt(order.amountPaid) + '</td>'
        + '<td class="right mono">' + fmt(order.outstanding) + '</td><td>' + safeDate(order.date, true) + '</td><td>' + statusBadge(order.status) + '</td>'
        + '<td><div class="doc-register-actions"><button class="btn sm ghost" onclick="showPurchaseOrder(\'' + escAttr(order.id) + '\')">View</button>'
        + '<button class="btn sm" onclick="printPurchaseOrder(\'' + escAttr(order.id) + '\')">Print</button>'
        + '<button class="btn sm ghost" onclick="downloadPurchaseOrderPDF(\'' + escAttr(order.id) + '\')">PDF</button>'
        + (open && canCommitPurchaseOrders() ? '<button class="btn sm ok" onclick="commitPurchaseOrder(\'' + escAttr(order.id) + '\')">Commit to stock</button>' : '')
        + (open ? '<button class="btn sm danger" onclick="cancelPurchaseOrder(\'' + escAttr(order.id) + '\')">Cancel</button>' : '')
        + '</div></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No purchase orders saved yet.</td></tr>';

    return '<div class="card" style="margin-top:12px"><h3>Purchase order register</h3>'
      + '<div class="table-wrap"><table><thead><tr><th>PO #</th><th>Supplier</th><th class="right">Total</th><th class="right">Paid</th><th class="right">Creditor balance</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function viewPurchaseOrders() {
    ensureModel();
    const total = purchaseOrderTotal(purchaseOrderDraft.lines);
    const paid = Number(purchaseOrderDraft.amountPaid) || 0;
    const outstanding = purchaseOrderOutstanding();
    return '<div class="grid g2"><div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Supplier and order details</h3>'
      + '<div class="field"><label>Existing creditor / supplier *</label><select id="poSupplier" onchange="purchaseOrderDraftField(\'supplierId\',this.value)">'
      + '<option value="">- select supplier -</option>' + supplierOptions() + '</select></div>'
      + '<button class="btn sm ghost" onclick="openNewPurchaseOrderSupplier()">Add new supplier / creditor</button>'
      + '<div class="field" style="margin-top:10px"><label>Supplier reference / invoice</label><input id="poSupplierReference" value="' + escAttr(purchaseOrderDraft.supplierReference) + '" oninput="purchaseOrderDraftField(\'supplierReference\',this.value)"></div>'
      + '<div class="field"><label>Expected delivery date</label><input id="poExpectedDate" type="date" value="' + escAttr(purchaseOrderDraft.expectedDate) + '" oninput="purchaseOrderDraftField(\'expectedDate\',this.value)"></div>'
      + '<div class="field"><label>Notes</label><textarea id="poNotes" rows="2" oninput="purchaseOrderDraftField(\'notes\',this.value)">' + esc(purchaseOrderDraft.notes) + '</textarea></div></div>'
      + '<div class="card"><h3>Existing stock product</h3>'
      + '<div class="field"><label>Product *</label><select id="poProduct" onchange="purchaseOrderProductChanged()"><option value="">- select existing product -</option>' + productOptions() + '</select></div>'
      + '<div class="row mobile-number-row"><div class="field" style="flex:1"><label>Quantity</label><input id="poQty" type="number" min="0.01" step="1" value="1"></div>'
      + '<div class="field" style="flex:1"><label>Unit cost</label><input id="poUnitCost" type="number" min="0" step="0.01" value="0"></div>'
      + '<div class="field" style="flex:1"><label>Selling price</label><input id="poUnitPrice" type="number" min="0" step="0.01" value="0"></div></div>'
      + '<button class="btn" onclick="addPurchaseOrderLine()">Add product</button></div></div>'
      + '<div><div class="card" style="margin-bottom:12px"><h3>Order items</h3><div class="table-wrap"><table>'
      + '<thead><tr><th>Product ID</th><th>Product</th><th class="right">Qty</th><th class="right">Unit cost</th><th class="right">Selling price</th><th class="right">Line total</th><th></th></tr></thead>'
      + '<tbody>' + orderLinesHTML() + '</tbody></table></div></div>'
      + '<div class="card pos-totals"><h3>Payment and creditor posting</h3>'
      + '<div class="statline"><span>Order total</span><b class="mono" id="poOrderTotal">' + fmt(total) + '</b></div>'
      + '<div class="field" style="margin-top:10px"><label>Amount already paid to supplier (GH₵)</label><input id="poAmountPaid" type="number" min="0" step="0.01" value="' + paid + '" oninput="purchaseOrderPaymentChanged(this.value)"></div>'
      + '<div class="field"><label>Payment wallet (required when amount paid is above zero)</label><select id="poWallet" onchange="purchaseOrderDraftField(\'wallet\',this.value)"><option value="">- select wallet -</option>' + walletOptions() + '</select></div>'
      + '<div class="statline"><span>Balance added to supplier creditor account</span><b class="mono" id="poOutstanding">' + fmt(outstanding) + '</b></div>'
      + '<div class="row" style="margin-top:12px"><button class="btn" onclick="savePurchaseOrder(false)">Save purchase order</button>'
      + '<button class="btn ok" onclick="savePurchaseOrder(true)">Save & commit to stock</button>'
      + '<button class="btn danger" onclick="cancelPurchaseOrderDraft()">Cancel draft</button></div>'
      + '<p class="muted" style="font-size:11px;margin:10px 0 0">Saving posts the unpaid balance to the supplier creditor account. Stock changes only when Commit to stock is used.</p>'
      + '</div></div></div>' + orderRegisterHTML();
  }

  window.purchaseOrderDraftField = function (field, value) {
    if (Object.prototype.hasOwnProperty.call(purchaseOrderDraft, field)) purchaseOrderDraft[field] = value;
  };

  window.purchaseOrderProductChanged = function () {
    const productId = text((document.getElementById('poProduct') || {}).value);
    const product = findProductById(productId);
    if (!product) return;
    const price = document.getElementById('poUnitPrice');
    if (price) price.value = Number(product.uPrice) || 0;
    const latest = (DB.stockRows || []).filter(function (row) { return text(row.productName) === text(product.name); }).slice(-1)[0];
    const cost = document.getElementById('poUnitCost');
    if (cost && latest) cost.value = Number(latest.uCost) || 0;
  };

  window.addPurchaseOrderLine = function () {
    if (!requirePurchaseOrderAccess(false)) return;
    const productId = text((document.getElementById('poProduct') || {}).value);
    const product = findProductById(productId);
    const qty = Number((document.getElementById('poQty') || {}).value) || 0;
    const unitCost = Number((document.getElementById('poUnitCost') || {}).value) || 0;
    const unitPrice = Number((document.getElementById('poUnitPrice') || {}).value) || 0;
    if (!product) { toast('Select an existing product.', 'err'); return; }
    if (qty <= 0) { toast('Quantity must be greater than zero.', 'err'); return; }
    if (unitCost <= 0) { toast('Unit cost must be greater than zero.', 'err'); return; }
    purchaseOrderDraft.lines.push({
      id: idStamp('POL-'), productId: product.id, product: product.name,
      category: product.category || '', qty: qty, unitCost: unitCost,
      unitPrice: unitPrice || Number(product.uPrice) || 0,
      total: round2(qty * unitCost)
    });
    render();
    toast('Product added to purchase order.');
  };

  window.removePurchaseOrderLine = function (index) {
    purchaseOrderDraft.lines.splice(Number(index), 1);
    render();
  };

  window.purchaseOrderPaymentChanged = function (value) {
    purchaseOrderDraft.amountPaid = Math.max(0, Number(value) || 0);
    const node = document.getElementById('poOutstanding');
    if (node) node.textContent = fmt(purchaseOrderOutstanding());
  };

  window.cancelPurchaseOrderDraft = function () {
    if ((purchaseOrderDraft.lines.length || purchaseOrderDraft.supplierId) && !confirm('Clear this unsaved purchase order draft?')) return;
    resetDraft();
    render();
  };

  window.openNewPurchaseOrderSupplier = function () {
    if (!requirePurchaseOrderAccess(false)) return;
    openModal('<h3>Add supplier / creditor</h3>'
      + '<div class="field"><label>Supplier name *</label><input id="poNewSupplierName"></div>'
      + '<div class="field"><label>Contact / phone</label><input id="poNewSupplierContact"></div>'
      + '<div class="field"><label>Description</label><input id="poNewSupplierDescription" value="Purchase order supplier"></div>'
      + '<div class="row"><button class="btn" onclick="saveNewPurchaseOrderSupplier()">Save supplier</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  };

  window.saveNewPurchaseOrderSupplier = function () {
    if (!requirePurchaseOrderAccess(false)) return;
    const name = text((document.getElementById('poNewSupplierName') || {}).value).trim();
    const contact = text((document.getElementById('poNewSupplierContact') || {}).value).trim();
    const description = text((document.getElementById('poNewSupplierDescription') || {}).value).trim();
    if (!name) { toast('Supplier name is required.', 'err'); return; }
    const id = getOrCreateAccount('creditors', name, contact, description || 'Purchase order supplier');
    const supplier = DB.creditors.find(function (item) { return text(item.id) === text(id); });
    if (supplier) {
      if (contact && !supplier.contact) supplier.contact = contact;
      if (description && !supplier.description) supplier.description = description;
    }
    purchaseOrderDraft.supplierId = id;
    saveDB();
    closeModal();
    render();
    toast('Supplier ready for this purchase order.');
  };

  function capturePurchaseOrderFields() {
    const supplierField = document.getElementById('poSupplier');
    const referenceField = document.getElementById('poSupplierReference');
    const expectedDateField = document.getElementById('poExpectedDate');
    const notesField = document.getElementById('poNotes');
    const paidField = document.getElementById('poAmountPaid');
    const walletField = document.getElementById('poWallet');
    if (supplierField) purchaseOrderDraft.supplierId = text(supplierField.value);
    if (referenceField) purchaseOrderDraft.supplierReference = text(referenceField.value).trim();
    if (expectedDateField) purchaseOrderDraft.expectedDate = text(expectedDateField.value).trim();
    if (notesField) purchaseOrderDraft.notes = text(notesField.value).trim();
    if (paidField) purchaseOrderDraft.amountPaid = Math.max(0, Number(paidField.value) || 0);
    if (walletField) purchaseOrderDraft.wallet = text(walletField.value);
  }

  window.savePurchaseOrder = function (commitAfterSave) {
    if (!requirePurchaseOrderAccess(!!commitAfterSave)) return;
    capturePurchaseOrderFields();
    const supplier = DB.creditors.find(function (item) { return text(item.id) === text(purchaseOrderDraft.supplierId); });
    const total = purchaseOrderTotal(purchaseOrderDraft.lines);
    const paid = round2(Number(purchaseOrderDraft.amountPaid) || 0);
    const outstanding = round2(total - paid);
    if (!supplier) { toast('Select an existing supplier or add a new one.', 'err'); return; }
    if (!purchaseOrderDraft.lines.length || total <= 0) { toast('Add at least one product to the purchase order.', 'err'); return; }
    if (paid < 0 || paid > total + 1e-9) { toast('Amount paid cannot exceed the order total.', 'err'); return; }
    if (paid > 0 && !purchaseOrderDraft.wallet) { toast('Select the wallet used for the supplier payment.', 'err'); return; }
    if (paid > (Number(DB.cashBalances[purchaseOrderDraft.wallet]) || 0) + 1e-9) { toast('The selected wallet has insufficient balance.', 'err'); return; }

    const period = getLatestMonth();
    const id = idStamp('PO-');
    const record = {
      id: id, poNo: id, date: nowISO(), expectedDate: purchaseOrderDraft.expectedDate,
      supplierId: supplier.id, supplierName: supplier.name, supplierContact: supplier.contact || '',
      supplierReference: purchaseOrderDraft.supplierReference, notes: purchaseOrderDraft.notes,
      total: total, amountPaid: paid, outstanding: outstanding, paymentWallet: purchaseOrderDraft.wallet,
      status: OPEN, cashier: session.cashier, cashierTel: session.tel,
      year: period.year, month: period.month, lines: deepClone(purchaseOrderDraft.lines),
      accountTxnId: '', cashLogId: '', committedTransactionIds: []
    };

    const creditorBefore = Number(supplier.balance) || 0;
    supplier.balance = round2(creditorBefore + outstanding);
    supplier.date = nowISO();
    const accountTxn = outstanding > 0 ? logAccountTxn(
      supplier.id, 'CREDITOR', supplier.name, 'PURCHASE ORDER', outstanding, supplier.balance, record.poNo,
      { kind: 'creditors', source: 'PURCHASE_ORDER', purchaseOrderId: record.id, beforeBalance: creditorBefore, afterBalance: supplier.balance }
    ) : null;
    let cashEntry = null;
    if (paid > 0) {
      cashEntry = adjustCash(purchaseOrderDraft.wallet, 'Deduct', paid, 'Purchase order payment ' + record.poNo, {
        source: 'PURCHASE_ORDER', purchaseOrderId: record.id
      });
    }
    record.accountTxnId = accountTxn ? accountTxn.id : '';
    record.cashLogId = cashEntry ? cashEntry.id : '';
    if (cashEntry) cashEntry.meta = Object.assign({}, cashEntry.meta || {}, { source: 'PURCHASE_ORDER', purchaseOrderId: record.id });
    DB.purchaseOrders.push(record);
    saveDB();
    resetDraft();
    toast('Purchase order saved - ' + record.poNo + '. Supplier balance increased by ' + fmt(outstanding) + '.');
    if (commitAfterSave) commitPurchaseOrder(record.id, true);
    else showPurchaseOrder(record.id);
  };

  function findPurchaseOrder(id) {
    return (DB.purchaseOrders || []).find(function (order) {
      return text(order.id) === text(id) || text(order.poNo) === text(id);
    }) || null;
  }

  function postPurchaseLineToStock(order, line) {
    const product = findProductById(line.productId) || findProductByName(line.product);
    if (!product) throw new Error('Product no longer exists: ' + line.product);
    const period = getLatestMonth();
    const qty = Number(line.qty) || 0;
    const unitCost = Number(line.unitCost) || 0;
    const unitPrice = Number(line.unitPrice) || Number(product.uPrice) || 0;
    if (qty <= 0 || unitCost <= 0) throw new Error('Invalid quantity or unit cost for ' + product.name + '.');
    let row = DB.stockRows.find(function (item) {
      return item.productName === product.name && Number(item.year) === Number(period.year)
        && Number(item.month) === Number(period.month) && Number(item.uCost) === unitCost;
    });
    const beforeRow = row ? deepClone(row) : null;
    if (row) {
      row.productId = row.productId || product.id;
      row.qtyIn = round2((Number(row.qtyIn) || 0) + qty);
      row.rStock = round2(rowRemainingQty(beforeRow) + qty);
      if (unitPrice > 0) row.uPrice = unitPrice;
    } else {
      row = {
        id: idStamp('STKIN-'), productId: product.id, productName: product.name,
        category: line.category || product.category || '', year: period.year, month: period.month,
        qtyIn: qty, rStock: qty, uCost: unitCost, qtyOut: 0,
        uPrice: unitPrice, disc: 0, tSales: 0, profit: 0, aPrice: 0
      };
      DB.stockRows.push(row);
    }
    const txn = {
      id: idStamp('ITX-'), type: 'STOCK_IN', subtype: 'PURCHASE_ORDER', status: 'ACTIVE',
      date: nowISO(), year: period.year, month: period.month, cashier: session.cashier,
      product: product.name, qty: qty, amount: round2(qty * unitCost), reference: order.poNo,
      purchaseOrderId: order.id,
      details: { stockRowId: row.id, createdRow: !beforeRow, beforeRow: beforeRow, year: period.year, month: period.month, uCost: unitCost, uPrice: unitPrice, purchaseOrderId: order.id }
    };
    DB.inventoryTxns.push(txn);
    DB.undoLog.push({
      row: row.id, product: product.name, productId: product.id, type: 'STOCK_IN', qty: qty,
      disc: 0, at: nowISO(), batchId: txn.id, inventoryTxnId: txn.id,
      stockRowId: row.id, cashier: session.cashier, purchaseOrderId: order.id
    });
    return txn.id;
  }

  window.commitPurchaseOrder = function (id, skipConfirmation) {
    if (!requirePurchaseOrderAccess(true)) return;
    const order = findPurchaseOrder(id);
    if (!order) { toast('Purchase order not found.', 'err'); return; }
    if (order.status !== OPEN) { toast('Only an open purchase order can be committed to stock.', 'warn'); return; }
    if (!skipConfirmation && !confirm('Commit ' + order.poNo + ' to stock? This will add every ordered quantity to the current open stock period.')) return;
    const stockBefore = deepClone(DB.stockRows);
    const inventoryBefore = deepClone(DB.inventoryTxns);
    const undoBefore = deepClone(DB.undoLog);
    const orderBefore = deepClone(order);
    try {
      order.committedTransactionIds = order.lines.map(function (line) { return postPurchaseLineToStock(order, line); });
      order.status = COMMITTED;
      order.committedAt = nowISO();
      order.committedBy = session.cashier;
      saveDB();
      toast(order.poNo + ' committed to stock.');
      showPurchaseOrder(order.id);
    } catch (error) {
      DB.stockRows = stockBefore;
      DB.inventoryTxns = inventoryBefore;
      DB.undoLog = undoBefore;
      Object.keys(order).forEach(function (key) { delete order[key]; });
      Object.assign(order, orderBefore);
      console.error(error);
      toast(error.message || String(error), 'err');
    }
  };

  window.cancelPurchaseOrder = function (id) {
    if (!requirePurchaseOrderAccess(false)) return;
    const order = findPurchaseOrder(id);
    if (!order) { toast('Purchase order not found.', 'err'); return; }
    if (order.status !== OPEN) { toast('Only an open purchase order can be cancelled.', 'warn'); return; }
    const message = 'Cancel ' + order.poNo + '?\n\nThis reverses the creditor balance of ' + fmt(order.outstanding)
      + (Number(order.amountPaid) > 0 ? ' and returns ' + fmt(order.amountPaid) + ' to ' + order.paymentWallet + '.' : '.');
    if (!confirm(message)) return;
    const supplier = DB.creditors.find(function (item) { return text(item.id) === text(order.supplierId); });
    if (!supplier) { toast('The linked supplier account is missing. Cancellation was stopped.', 'err'); return; }
    const before = Number(supplier.balance) || 0;
    supplier.balance = round2(before - (Number(order.outstanding) || 0));
    supplier.date = nowISO();
    const reversalTxn = Number(order.outstanding) > 0 ? logAccountTxn(
      supplier.id, 'CREDITOR', supplier.name, 'PURCHASE ORDER CANCEL', -Math.abs(Number(order.outstanding) || 0), supplier.balance, order.poNo,
      { kind: 'creditors', source: 'PURCHASE_ORDER_CANCEL', purchaseOrderId: order.id, beforeBalance: before, afterBalance: supplier.balance }
    ) : null;
    let refundEntry = null;
    if (Number(order.amountPaid) > 0 && order.paymentWallet) {
      refundEntry = adjustCash(order.paymentWallet, 'Add', Number(order.amountPaid), 'Cancelled purchase order refund ' + order.poNo, {
        source: 'PURCHASE_ORDER_CANCEL', purchaseOrderId: order.id
      });
    }
    order.status = CANCELLED;
    order.cancelledAt = nowISO();
    order.cancelledBy = session.cashier;
    order.cancellationAccountTxnId = reversalTxn ? reversalTxn.id : '';
    order.cancellationCashLogId = refundEntry ? refundEntry.id : '';
    saveDB();
    toast(order.poNo + ' cancelled and financial entries reversed.');
    render();
  };

  /* ---------------- Purchase order document and printing ---------------- */
  function purchaseOrderPaperHTML(order) {
    const biz = DB.business || BUSINESS;
    const rows = (order.lines || []).map(function (line, index) {
      return '<tr><td style="text-align:center">' + (index + 1) + '</td><td class="mono">' + esc(line.productId || '-') + '</td>'
        + '<td>' + esc(line.product) + '</td><td style="text-align:right">' + fmtN(line.qty) + '</td>'
        + '<td style="text-align:right">' + fmtN(line.unitCost) + '</td><td style="text-align:right">' + fmtN(line.unitPrice) + '</td>'
        + '<td style="text-align:right">' + fmtN(line.total) + '</td></tr>';
    }).join('');
    return '<div class="document-paper purchase-order-paper"><div class="doc-head"><div><div style="font-size:20px;font-weight:900">' + esc(biz.name) + '</div>'
      + '<div>' + esc(biz.address || '') + '</div><div>Tel: ' + esc(biz.tel || '') + '</div></div>'
      + '<div><div class="doc-title">PURCHASE ORDER</div><div>PO No: <b>' + esc(order.poNo) + '</b></div><div>Date: ' + safeDate(order.date, false) + '</div><div>Status: ' + esc(order.status) + '</div></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div><b>SUPPLIER</b><br><strong>' + esc(order.supplierName) + '</strong><br>' + esc(order.supplierContact || '') + '</div>'
      + '<div><b>Supplier reference:</b> ' + esc(order.supplierReference || '-') + '<br><b>Expected delivery:</b> ' + safeDate(order.expectedDate, false) + '<br><b>Prepared by:</b> ' + esc(order.cashier || '') + '</div></div>'
      + '<table><thead><tr><th>#</th><th>Product ID</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit cost</th><th style="text-align:right">Selling price</th><th style="text-align:right">Total</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div class="doc-total"><div><span>Order total</span><b>GH₵ ' + fmtN(order.total) + '</b></div><div><span>Amount paid</span><b>GH₵ ' + fmtN(order.amountPaid) + '</b></div>'
      + '<div class="grand"><span>SUPPLIER BALANCE</span><b>GH₵ ' + fmtN(order.outstanding) + '</b></div></div>'
      + (order.notes ? '<div style="margin-top:18px"><b>Notes:</b> ' + esc(order.notes) + '</div>' : '')
      + '<div class="signature-grid"><div class="signature-line">Authorised by</div><div class="signature-line">Supplier acknowledgement</div></div></div>';
  }

  window.showPurchaseOrder = function (id) {
    const order = findPurchaseOrder(id);
    if (!order) { toast('Purchase order not found.', 'err'); return; }
    activePurchaseOrder = { id: order.id };
    openModal(purchaseOrderPaperHTML(order) + '<div class="row" style="margin-top:12px">'
      + '<button class="btn" onclick="printPurchaseOrder(\'' + escAttr(order.id) + '\')">Print</button>'
      + '<button class="btn ghost" onclick="downloadPurchaseOrderPDF(\'' + escAttr(order.id) + '\')">Download PDF</button>'
      + (order.status === OPEN && canCommitPurchaseOrders() ? '<button class="btn ok" onclick="closeModal();commitPurchaseOrder(\'' + escAttr(order.id) + '\')">Commit to stock</button>' : '')
      + (order.status === OPEN ? '<button class="btn danger" onclick="closeModal();cancelPurchaseOrder(\'' + escAttr(order.id) + '\')">Cancel order</button>' : '')
      + '<button class="btn ghost" onclick="closeModal();render()">Close</button></div>');
  };

  function cleanupPrintFrame(frame) {
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    purchaseOrderPrintBusy = false;
  }

  window.printPurchaseOrder = function (id) {
    const order = findPurchaseOrder(id || (activePurchaseOrder && activePurchaseOrder.id));
    if (!order) { toast('Purchase order not found.', 'err'); return; }
    if (purchaseOrderPrintBusy) { toast('A purchase order print window is already opening.', 'warn'); return; }
    purchaseOrderPrintBusy = true;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0';
    frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(order.poNo) + '</title><style>'
      + '@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}'
      + '.document-paper{background:#fff;color:#111;padding:0;font-size:12px;line-height:1.45}.doc-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}'
      + '.doc-title{font-size:25px;font-weight:900;letter-spacing:2px;text-align:right}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:6px;vertical-align:top}th{background:#eee;text-align:left}'
      + '.doc-total{width:330px;max-width:100%;margin-left:auto;margin-top:12px}.doc-total div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ddd}.doc-total .grand{font-size:15px;font-weight:900;border-top:2px solid #111;border-bottom:2px solid #111}'
      + '.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}.signature-line{border-top:1px solid #111;padding-top:5px;text-align:center}'
      + '</style></head><body>' + purchaseOrderPaperHTML(order) + '</body></html>');
    doc.close();
    setTimeout(function () {
      try {
        const printWindow = frame.contentWindow;
        printWindow.onafterprint = function () { cleanupPrintFrame(frame); };
        printWindow.focus(); printWindow.print();
        setTimeout(function () { cleanupPrintFrame(frame); }, 15000);
      } catch (error) {
        console.error(error);
        cleanupPrintFrame(frame);
        toast('Purchase order printing could not start.', 'err');
      }
    }, 250);
  };

  function installNavigation() {
    TITLES.purchaseorders = 'Purchase Orders';
    const stockIn = document.querySelector('#mainNav button[data-view="stockin"]');
    if (stockIn && !document.getElementById('navPurchaseOrders')) {
      stockIn.insertAdjacentHTML('afterend', '<button id="navPurchaseOrders" data-view="purchaseorders" data-admin-only onclick="nav(\'purchaseorders\')">Purchase Orders</button>');
    }
  }

  function syncNavigationAccess() {
    const button = document.getElementById('navPurchaseOrders');
    if (button) button.style.display = canManagePurchaseOrders() ? '' : 'none';
  }

  const previousRender = render;
  render = function () {
    ensureModel();
    if (currentView === 'purchaseorders') {
      updatePeriodUI();
      applyRoleUI();
      syncNavigationAccess();
      if (!canManagePurchaseOrders()) {
        currentView = 'pos';
        $('viewTitle').textContent = TITLES.pos;
        return previousRender();
      }
      $('viewRoot').innerHTML = viewPurchaseOrders();
      if (ZEZMS.staffAuth && ZEZMS.staffAuth.isActive && ZEZMS.staffAuth.isActive()) ZEZMS.staffAuth.afterRender();
      return;
    }
    const result = previousRender();
    syncNavigationAccess();
    return result;
  };

  ensureModel();
  installNavigation();
  syncNavigationAccess();
  ZEZMS.ownerMaintenance = {
    version: '3.7.1', build: BUILD, ensureModel: ensureModel,
    findPurchaseOrder: findPurchaseOrder, purchaseOrderPaperHTML: purchaseOrderPaperHTML,
    accountFilters: accountFilters, viewPurchaseOrders: viewPurchaseOrders
  };
}());

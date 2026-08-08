/* ZEZMS Owner Edition v3.7.2 - account filters and purchase orders */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BUILD = '20260808-owner-maintenance-r31';
  const OPEN = 'OPEN';
  const COMMITTED = 'COMMITTED';
  const CANCELLED = 'CANCELLED';
  const accountFilters = { debtors: '', creditors: '', depositors: '' };
  let activePurchaseOrder = null;
  let purchaseOrderPrintBusy = false;
  let editingPurchaseOrderId = '';
  let purchaseOrderProductSelection = '';
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

  function canManageProducts() {
    return staffCan('MANAGE_PRODUCTS');
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
      return '<option value="' + escAttr(product.id) + '" ' + (text(product.id) === text(purchaseOrderProductSelection) ? 'selected' : '') + '>'
        + esc(product.id || 'No ID') + ' - ' + esc(product.name) + '</option>';
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
        + (open ? '<button class="btn sm ghost" onclick="editPurchaseOrder(\'' + escAttr(order.id) + '\')">Edit</button>' : '')
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
    const editingOrder = editingPurchaseOrderId ? findPurchaseOrder(editingPurchaseOrderId) : null;
    const editBanner = editingOrder
      ? '<div class="card" style="margin-bottom:12px;border-color:var(--amber)"><b>Editing ' + esc(editingOrder.poNo) + '</b>'
        + '<p class="muted" style="margin:6px 0 0">Update this open order before committing it to stock. The supplier and payment postings will be recalculated.</p></div>'
      : '';
    return editBanner + '<div class="grid g2"><div>'
      + '<div class="card" style="margin-bottom:12px"><h3>Supplier and order details</h3>'
      + '<div class="field"><label>Existing creditor / supplier *</label><select id="poSupplier" onchange="purchaseOrderDraftField(\'supplierId\',this.value)">'
      + '<option value="">- select supplier -</option>' + supplierOptions() + '</select></div>'
      + '<button class="btn sm ghost" onclick="openNewPurchaseOrderSupplier()">Add new supplier / creditor</button>'
      + '<div class="field" style="margin-top:10px"><label>Supplier reference / invoice</label><input id="poSupplierReference" value="' + escAttr(purchaseOrderDraft.supplierReference) + '" oninput="purchaseOrderDraftField(\'supplierReference\',this.value)"></div>'
      + '<div class="field"><label>Expected delivery date</label><input id="poExpectedDate" type="date" value="' + escAttr(purchaseOrderDraft.expectedDate) + '" oninput="purchaseOrderDraftField(\'expectedDate\',this.value)"></div>'
      + '<div class="field"><label>Notes</label><textarea id="poNotes" rows="2" oninput="purchaseOrderDraftField(\'notes\',this.value)">' + esc(purchaseOrderDraft.notes) + '</textarea></div></div>'
      + '<div class="card"><h3>Product entry</h3>'
      + '<div class="row mobile-search-row"><div class="field" style="position:relative;flex:1"><label>Search by product name</label>'
      + '<input id="poSearchName" placeholder="Type product name..." autocomplete="off" oninput="purchaseOrderSearch(\'name\')" onkeydown="purchaseOrderSearchKey(event,\'name\')"><div id="poSuggestName" class="suggest"></div></div>'
      + '<div class="field" style="position:relative;flex:1"><label>Search by product ID</label>'
      + '<input id="poSearchId" placeholder="Type product ID..." autocomplete="off" oninput="purchaseOrderSearch(\'id\')" onkeydown="purchaseOrderSearchKey(event,\'id\')"><div id="poSuggestId" class="suggest"></div></div></div>'
      + '<div class="field"><label>Product *</label><select id="poProduct" onchange="purchaseOrderProductChanged()"><option value="">- select existing product -</option>' + productOptions() + '</select></div>'
      + '<div class="row mobile-number-row"><div class="field" style="flex:1"><label>Quantity</label><input id="poQty" type="number" min="0.01" step="1" value="1"></div>'
      + '<div class="field" style="flex:1"><label>Unit cost</label><input id="poUnitCost" type="number" min="0" step="0.01" value="0"></div>'
      + '<div class="field" style="flex:1"><label>Selling price</label><input id="poUnitPrice" type="number" min="0" step="0.01" value="0"></div></div>'
      + '<div class="row"><button class="btn" onclick="addPurchaseOrderLine()">Add product</button>'
      + (canManageProducts() ? '<button class="btn ghost" onclick="openNewPurchaseOrderProduct()">Add new product</button>' : '')
      + '<button class="btn ghost" onclick="clearPurchaseOrderProductEntry()">Clear entry</button></div></div></div>'
      + '<div><div class="card" style="margin-bottom:12px"><h3>Order items</h3><div class="table-wrap"><table>'
      + '<thead><tr><th>Product ID</th><th>Product</th><th class="right">Qty</th><th class="right">Unit cost</th><th class="right">Selling price</th><th class="right">Line total</th><th></th></tr></thead>'
      + '<tbody>' + orderLinesHTML() + '</tbody></table></div></div>'
      + '<div class="card pos-totals"><h3>Payment and creditor posting</h3>'
      + '<div class="statline"><span>Order total</span><b class="mono" id="poOrderTotal">' + fmt(total) + '</b></div>'
      + '<div class="field" style="margin-top:10px"><label>Amount already paid to supplier (GH₵)</label><input id="poAmountPaid" type="number" min="0" step="0.01" value="' + paid + '" oninput="purchaseOrderPaymentChanged(this.value)"></div>'
      + '<div class="field"><label>Payment wallet (required when amount paid is above zero)</label><select id="poWallet" onchange="purchaseOrderDraftField(\'wallet\',this.value)"><option value="">- select wallet -</option>' + walletOptions() + '</select></div>'
      + '<div class="statline"><span>Balance added to supplier creditor account</span><b class="mono" id="poOutstanding">' + fmt(outstanding) + '</b></div>'
      + '<div class="row" style="margin-top:12px"><button class="btn" onclick="savePurchaseOrder(false)">' + (editingOrder ? 'Update purchase order' : 'Save purchase order') + '</button>'
      + '<button class="btn ok" onclick="savePurchaseOrder(true)">' + (editingOrder ? 'Update & commit to stock' : 'Save & commit to stock') + '</button>'
      + '<button class="btn danger" onclick="cancelPurchaseOrderDraft()">' + (editingOrder ? 'Cancel edit' : 'Cancel draft') + '</button></div>'
      + '<p class="muted" style="font-size:11px;margin:10px 0 0">Saving posts the unpaid balance to the supplier creditor account. Stock changes only when Commit to stock is used.</p>'
      + '</div></div></div>' + orderRegisterHTML();
  }

  window.purchaseOrderDraftField = function (field, value) {
    if (Object.prototype.hasOwnProperty.call(purchaseOrderDraft, field)) purchaseOrderDraft[field] = value;
  };

  function purchaseOrderSearchResults(mode, query) {
    const field = mode === 'id' ? 'id' : 'name';
    const normalized = text(query).trim().toLowerCase();
    if (!normalized) return [];
    return (DB.products || []).map(function (product) {
      const candidate = text(product[field]);
      const score = typeof rankProductMatch === 'function'
        ? rankProductMatch(candidate, normalized)
        : (candidate.toLowerCase().includes(normalized) ? 1 : 0);
      return { product: product, score: score };
    }).filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) { return a.score - b.score || text(a.product.name).localeCompare(text(b.product.name)); })
      .slice(0, 12);
  }

  window.purchaseOrderSearch = function (mode) {
    const isId = mode === 'id';
    const input = document.getElementById(isId ? 'poSearchId' : 'poSearchName');
    const box = document.getElementById(isId ? 'poSuggestId' : 'poSuggestName');
    if (!input || !box) return;
    const query = text(input.value).trim();
    if (!query) { box.classList.remove('show'); box.innerHTML = ''; return; }
    const results = purchaseOrderSearchResults(mode, query);
    if (!results.length) {
      box.innerHTML = '<div class="none">No catalog product matches</div>';
      box.classList.add('show');
      return;
    }
    box.innerHTML = results.map(function (entry) {
      const encoded = encodeURIComponent(entry.product.id).replace(/'/g, '%27');
      return '<div onclick="pickPurchaseOrderProduct(\'' + encoded + '\')"><b>' + esc(entry.product.name) + '</b><br>'
        + '<span class="muted mono">' + esc(entry.product.id || 'No ID') + ' - ' + esc(entry.product.category || 'Uncategorised') + '</span></div>';
    }).join('');
    box.classList.add('show');
  };

  window.purchaseOrderSearchKey = function (event, mode) {
    const box = document.getElementById(mode === 'id' ? 'poSuggestId' : 'poSuggestName');
    if (event.key === 'Escape' && box) box.classList.remove('show');
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = box && box.querySelector('div:not(.none)');
      if (first) first.click();
    }
  };

  window.pickPurchaseOrderProduct = function (encodedId) {
    const product = findProductById(decodeURIComponent(encodedId || ''));
    if (!product) { toast('Product is no longer in the catalog.', 'warn'); return; }
    purchaseOrderProductSelection = product.id;
    const select = document.getElementById('poProduct');
    if (select) select.value = product.id;
    ['poSuggestName', 'poSuggestId'].forEach(function (id) {
      const box = document.getElementById(id);
      if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    });
    purchaseOrderProductChanged();
  };

  window.purchaseOrderProductChanged = function () {
    const productId = text((document.getElementById('poProduct') || {}).value);
    const product = findProductById(productId);
    purchaseOrderProductSelection = product ? product.id : '';
    const nameSearch = document.getElementById('poSearchName');
    const idSearch = document.getElementById('poSearchId');
    if (!product) {
      if (nameSearch) nameSearch.value = '';
      if (idSearch) idSearch.value = '';
      return;
    }
    if (nameSearch) nameSearch.value = product.name;
    if (idSearch) idSearch.value = product.id || '';
    const price = document.getElementById('poUnitPrice');
    if (price) price.value = Number(product.uPrice) || 0;
    const latest = (DB.stockRows || []).filter(function (row) { return text(row.productName) === text(product.name); }).slice(-1)[0];
    const cost = document.getElementById('poUnitCost');
    if (cost && latest) cost.value = Number(latest.uCost) || 0;
  };

  window.clearPurchaseOrderProductEntry = function () {
    purchaseOrderProductSelection = '';
    ['poSearchName', 'poSearchId'].forEach(function (id) {
      const field = document.getElementById(id);
      if (field) field.value = '';
    });
    ['poSuggestName', 'poSuggestId'].forEach(function (id) {
      const box = document.getElementById(id);
      if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    });
    const select = document.getElementById('poProduct');
    if (select) select.value = '';
    const qty = document.getElementById('poQty');
    const cost = document.getElementById('poUnitCost');
    const price = document.getElementById('poUnitPrice');
    if (qty) qty.value = '1';
    if (cost) cost.value = '0';
    if (price) price.value = '0';
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
    purchaseOrderProductSelection = '';
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
    const prompt = editingPurchaseOrderId ? 'Discard the unsaved changes to this purchase order?' : 'Clear this unsaved purchase order draft?';
    if ((purchaseOrderDraft.lines.length || purchaseOrderDraft.supplierId) && !confirm(prompt)) return;
    resetDraft();
    editingPurchaseOrderId = '';
    purchaseOrderProductSelection = '';
    render();
  };

  window.openNewPurchaseOrderProduct = function () {
    if (!canManageProducts()) { toast('Product-management permission is required.', 'err'); return; }
    openModal('<h3>Add product to catalog</h3>'
      + '<div class="field"><label>Product name *</label><input id="poNewProductName"></div>'
      + '<div class="field"><label>Product ID (optional)</label><input id="poNewProductId" placeholder="Automatic short ID when blank"></div>'
      + '<div class="field"><label>Category</label><input id="poNewProductCategory"></div>'
      + '<div class="field"><label>Selling price</label><input id="poNewProductPrice" type="number" min="0" step="0.01" value="0"></div>'
      + '<div class="row"><button class="btn" onclick="saveNewPurchaseOrderProduct()">Save product</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>');
  };

  window.saveNewPurchaseOrderProduct = function () {
    if (!canManageProducts()) { toast('Product-management permission is required.', 'err'); return; }
    const name = text((document.getElementById('poNewProductName') || {}).value).trim();
    const requestedId = normalizeProductId(text((document.getElementById('poNewProductId') || {}).value));
    const category = text((document.getElementById('poNewProductCategory') || {}).value).trim();
    const unitPrice = Math.max(0, Number((document.getElementById('poNewProductPrice') || {}).value) || 0);
    if (!name) { toast('Product name is required.', 'err'); return; }
    if ((DB.products || []).some(function (item) { return text(item.name).trim().toLowerCase() === name.toLowerCase(); })) {
      toast('Product already exists.', 'warn'); return;
    }
    if (requestedId && findProductById(requestedId)) { toast('Product ID already exists.', 'err'); return; }
    const productId = requestedId || generateCompactProductId(name);
    DB.products.push({ id: productId, name: name, category: category, uPrice: unitPrice });
    purchaseOrderProductSelection = productId;
    saveDB();
    closeModal();
    render();
    setTimeout(function () { purchaseOrderProductChanged(); }, 0);
    toast('Product saved and selected - ' + productId + '.');
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

  function restoreDatabase(snapshot) {
    Object.keys(DB).forEach(function (key) { delete DB[key]; });
    Object.assign(DB, snapshot);
  }

  function postPurchaseOrderFinances(record, supplier, source) {
    const outstanding = Number(record.outstanding) || 0;
    const paid = Number(record.amountPaid) || 0;
    const before = Number(supplier.balance) || 0;
    supplier.balance = round2(before + outstanding);
    supplier.date = nowISO();
    const accountTxn = outstanding > 0 ? logAccountTxn(
      supplier.id, 'CREDITOR', supplier.name, source === 'PURCHASE_ORDER_EDIT' ? 'PURCHASE ORDER EDIT' : 'PURCHASE ORDER',
      outstanding, supplier.balance, record.poNo,
      { kind: 'creditors', source: source, purchaseOrderId: record.id, beforeBalance: before, afterBalance: supplier.balance }
    ) : null;
    let cashEntry = null;
    if (paid > 0) {
      cashEntry = adjustCash(record.paymentWallet, 'Deduct', paid, 'Purchase order payment ' + record.poNo, {
        source: source, purchaseOrderId: record.id
      });
    }
    record.accountTxnId = accountTxn ? accountTxn.id : '';
    record.cashLogId = cashEntry ? cashEntry.id : '';
    if (cashEntry) cashEntry.meta = Object.assign({}, cashEntry.meta || {}, { source: source, purchaseOrderId: record.id });
  }

  function reversePurchaseOrderFinances(order) {
    const supplier = DB.creditors.find(function (item) { return text(item.id) === text(order.supplierId); });
    if (!supplier) throw new Error('The supplier on the saved order no longer exists.');
    const outstanding = Number(order.outstanding) || 0;
    const paid = Number(order.amountPaid) || 0;
    const before = Number(supplier.balance) || 0;
    supplier.balance = round2(before - outstanding);
    supplier.date = nowISO();
    if (outstanding > 0) {
      logAccountTxn(
        supplier.id, 'CREDITOR', supplier.name, 'PURCHASE ORDER EDIT REVERSAL', -Math.abs(outstanding), supplier.balance, order.poNo,
        { kind: 'creditors', source: 'PURCHASE_ORDER_EDIT_REVERSAL', purchaseOrderId: order.id, beforeBalance: before, afterBalance: supplier.balance }
      );
    }
    if (paid > 0 && order.paymentWallet) {
      adjustCash(order.paymentWallet, 'Add', paid, 'Purchase order edit refund ' + order.poNo, {
        source: 'PURCHASE_ORDER_EDIT_REVERSAL', purchaseOrderId: order.id
      });
    }
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
    const editingOrder = editingPurchaseOrderId ? findPurchaseOrder(editingPurchaseOrderId) : null;
    if (editingPurchaseOrderId && (!editingOrder || editingOrder.status !== OPEN)) {
      toast('Only an open purchase order can be edited.', 'err'); return;
    }
    const refundable = editingOrder && editingOrder.paymentWallet === purchaseOrderDraft.wallet
      ? Number(editingOrder.amountPaid) || 0 : 0;
    if (paid > (Number(DB.cashBalances[purchaseOrderDraft.wallet]) || 0) + refundable + 1e-9) {
      toast('The selected wallet has insufficient balance after recalculating the saved payment.', 'err'); return;
    }

    const period = getLatestMonth();
    const id = editingOrder ? editingOrder.id : idStamp('PO-');
    const draftRecord = {
      id: id, poNo: editingOrder ? editingOrder.poNo : id, date: editingOrder ? editingOrder.date : nowISO(), expectedDate: purchaseOrderDraft.expectedDate,
      supplierId: supplier.id, supplierName: supplier.name, supplierContact: supplier.contact || '',
      supplierReference: purchaseOrderDraft.supplierReference, notes: purchaseOrderDraft.notes,
      total: total, amountPaid: paid, outstanding: outstanding, paymentWallet: purchaseOrderDraft.wallet,
      status: OPEN, cashier: editingOrder ? editingOrder.cashier : session.cashier, cashierTel: editingOrder ? editingOrder.cashierTel : session.tel,
      year: period.year, month: period.month, lines: deepClone(purchaseOrderDraft.lines),
      accountTxnId: '', cashLogId: '', committedTransactionIds: []
    };

    const snapshot = deepClone(DB);
    let record = draftRecord;
    try {
      if (editingOrder) {
        const history = Array.isArray(editingOrder.editHistory) ? editingOrder.editHistory : [];
        history.push({
          editedAt: nowISO(), editedBy: session.cashier,
          supplierId: editingOrder.supplierId, supplierName: editingOrder.supplierName,
          total: editingOrder.total, amountPaid: editingOrder.amountPaid,
          outstanding: editingOrder.outstanding, paymentWallet: editingOrder.paymentWallet,
          supplierReference: editingOrder.supplierReference, expectedDate: editingOrder.expectedDate,
          notes: editingOrder.notes, lines: deepClone(editingOrder.lines)
        });
        reversePurchaseOrderFinances(editingOrder);
        Object.assign(editingOrder, draftRecord, {
          editHistory: history.slice(-20), editRevision: (Number(editingOrder.editRevision) || 0) + 1,
          updatedAt: nowISO(), updatedBy: session.cashier
        });
        record = editingOrder;
        postPurchaseOrderFinances(record, supplier, 'PURCHASE_ORDER_EDIT');
      } else {
        postPurchaseOrderFinances(record, supplier, 'PURCHASE_ORDER');
        DB.purchaseOrders.push(record);
      }
      saveDB();
    } catch (error) {
      restoreDatabase(snapshot);
      console.error(error);
      toast(error.message || String(error), 'err');
      return;
    }
    const wasEditing = !!editingOrder;
    resetDraft();
    editingPurchaseOrderId = '';
    purchaseOrderProductSelection = '';
    toast((wasEditing ? 'Purchase order updated - ' : 'Purchase order saved - ') + record.poNo + '. Supplier balance posted: ' + fmt(outstanding) + '.');
    if (commitAfterSave) commitPurchaseOrder(record.id, true);
    else showPurchaseOrder(record.id);
  };

  function findPurchaseOrder(id) {
    return (DB.purchaseOrders || []).find(function (order) {
      return text(order.id) === text(id) || text(order.poNo) === text(id);
    }) || null;
  }

  window.editPurchaseOrder = function (id) {
    if (!requirePurchaseOrderAccess(false)) return;
    const order = findPurchaseOrder(id);
    if (!order) { toast('Purchase order not found.', 'err'); return; }
    if (order.status !== OPEN) { toast('Only an open purchase order can be edited.', 'warn'); return; }
    if ((purchaseOrderDraft.lines.length || purchaseOrderDraft.supplierId) && !editingPurchaseOrderId
      && !confirm('Replace the current unsaved purchase-order draft with ' + order.poNo + '?')) return;
    Object.assign(purchaseOrderDraft, {
      lines: deepClone(order.lines || []), supplierId: order.supplierId || '',
      supplierReference: order.supplierReference || '', expectedDate: order.expectedDate || '',
      notes: order.notes || '', amountPaid: Number(order.amountPaid) || 0,
      wallet: order.paymentWallet || ''
    });
    editingPurchaseOrderId = order.id;
    purchaseOrderProductSelection = '';
    closeModal();
    nav('purchaseorders');
    setTimeout(function () {
      const root = document.getElementById('viewRoot');
      if (root) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    toast('Editing ' + order.poNo + '.');
  };

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

  /* ---------------- Safe receipt editing ---------------- */
  let receiptEditDraft = null;

  function canEditReceipts() {
    return staffCan('MANAGE_DOCUMENTS');
  }

  function receiptEditTotals() {
    const subtotal = round2((receiptEditDraft && receiptEditDraft.lines || []).reduce(function (sum, line) {
      return sum + round2((Number(line.qty) || 0) * (Number(line.uPrice) || 0) - (Number(line.disc) || 0));
    }, 0));
    const vatRate = normalizeVatPercent(receiptEditDraft ? receiptEditDraft.vatRate : 0);
    const vatAmount = round2(subtotal * vatRate / 100);
    return { subtotal: subtotal, vatRate: vatRate, vatAmount: vatAmount, total: round2(subtotal + vatAmount) };
  }

  function receiptProductOptions(selected) {
    const options = (DB.products || []).slice().sort(function (a, b) {
      return text(a.name).localeCompare(text(b.name));
    }).map(function (product) {
      return '<option value="' + escAttr(product.name) + '" ' + (text(product.name) === text(selected) ? 'selected' : '') + '>'
        + esc(product.id || 'No ID') + ' - ' + esc(product.name) + '</option>';
    }).join('');
    const missing = selected && !(DB.products || []).some(function (product) { return text(product.name) === text(selected); })
      ? '<option value="' + escAttr(selected) + '" selected>' + esc(selected) + ' (historical product)</option>' : '';
    return missing + options;
  }

  function receiptEditModalHTML() {
    const totals = receiptEditTotals();
    const rows = receiptEditDraft.lines.map(function (line, index) {
      return '<tr><td><select onchange="receiptEditLineChanged(' + index + ',\'product\',this.value)">' + receiptProductOptions(line.product) + '</select></td>'
        + '<td><input type="number" min="0.01" step="1" value="' + (Number(line.qty) || 0) + '" oninput="receiptEditLineChanged(' + index + ',\'qty\',this.value)"></td>'
        + '<td><input type="number" min="0" step="0.01" value="' + (Number(line.uPrice) || 0) + '" oninput="receiptEditLineChanged(' + index + ',\'uPrice\',this.value)"></td>'
        + '<td><input type="number" min="0" step="0.01" value="' + (Number(line.disc) || 0) + '" oninput="receiptEditLineChanged(' + index + ',\'disc\',this.value)"></td>'
        + '<td class="right mono" id="receiptEditLineTotal' + index + '">' + fmt(round2((Number(line.qty) || 0) * (Number(line.uPrice) || 0) - (Number(line.disc) || 0))) + '</td>'
        + '<td><button class="btn sm danger" onclick="removeReceiptEditLine(' + index + ')">Remove</button></td></tr>';
    }).join();
    return '<h3>Edit receipt ' + esc(receiptEditDraft.receiptNo) + '</h3>'
      + '<p class="muted">Saving recalculates this current-period sale, its FIFO stock allocation and any debtor balance. The receipt number remains unchanged.</p>'
      + '<div class="grid g2"><div class="field"><label>Customer *</label><input id="receiptEditCustomer" value="' + escAttr(receiptEditDraft.customerName) + '" oninput="receiptEditField(\'customerName\',this.value)"></div>'
      + '<div class="field"><label>Telephone *</label><input id="receiptEditContact" value="' + escAttr(receiptEditDraft.contact) + '" oninput="receiptEditField(\'contact\',this.value)"></div>'
      + '<div class="field"><label>Location</label><input id="receiptEditLocation" value="' + escAttr(receiptEditDraft.location) + '" oninput="receiptEditField(\'location\',this.value)"></div>'
      + '<div class="field"><label>Amount paid</label><input id="receiptEditPaid" type="number" min="0" step="0.01" value="' + (Number(receiptEditDraft.amountPaid) || 0) + '" oninput="receiptEditField(\'amountPaid\',this.value);refreshReceiptEditTotals()"></div>'
      + '<div class="field"><label>VAT percentage</label><input id="receiptEditVat" type="number" min="0" max="100" step="0.01" value="' + totals.vatRate + '" oninput="receiptEditField(\'vatRate\',this.value);refreshReceiptEditTotals()"></div></div>'
      + '<div class="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Discount</th><th class="right">Total</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="row" style="margin-top:10px"><select id="receiptEditNewProduct" style="flex:1"><option value="">- add another product -</option>' + receiptProductOptions('') + '</select>'
      + '<button class="btn ghost" onclick="addReceiptEditLine()">Add item</button></div>'
      + '<div class="card" style="margin-top:12px"><div class="statline"><span>Subtotal</span><b id="receiptEditSubtotal">' + fmt(totals.subtotal) + '</b></div>'
      + '<div class="statline"><span>VAT</span><b id="receiptEditVatAmount">' + fmt(totals.vatAmount) + '</b></div>'
      + '<div class="statline"><span>Grand total</span><b id="receiptEditGrandTotal">' + fmt(totals.total) + '</b></div>'
      + '<div class="statline"><span>Debtor balance</span><b id="receiptEditOutstanding">' + fmt(Math.max(0, round2(totals.total - (Number(receiptEditDraft.amountPaid) || 0)))) + '</b></div></div>'
      + '<div class="row" style="margin-top:12px"><button class="btn ok" onclick="saveReceiptEdit()">Save corrected receipt</button>'
      + '<button class="btn ghost" onclick="cancelReceiptEdit()">Cancel</button></div>';
  }

  function openReceiptEditModal() {
    openModal(receiptEditModalHTML());
  }

  window.editStoredReceipt = function (receiptNo) {
    if (!canEditReceipts()) { toast('Document-management permission is required.', 'err'); return; }
    const receipt = (DB.receipts || []).find(function (item) { return text(item.receiptNo) === text(receiptNo); });
    const sale = (DB.sales || []).find(function (item) { return text(item.receiptNo) === text(receiptNo); });
    if (!receipt || !sale) { toast('This receipt has no linked FIFO sale and cannot be edited safely.', 'err'); return; }
    if (receipt.voided || receipt.status === 'VOID' || sale.status === 'UNDONE' || sale.status === 'VOID') {
      toast('A void or undone receipt cannot be edited.', 'warn'); return;
    }
    const period = getLatestMonth();
    if (Number(sale.year) !== Number(period.year) || Number(sale.month) !== Number(period.month)) {
      toast('Only receipts in the current open stock period can be edited safely.', 'warn'); return;
    }
    receiptEditDraft = {
      receiptNo: receipt.receiptNo, customerName: receipt.customerName || sale.customer || '',
      contact: receipt.contact || sale.contact || '', location: receipt.location || sale.location || '',
      amountPaid: Number(receipt.amountPaid != null ? receipt.amountPaid : sale.paid) || 0,
      vatRate: normalizeVatPercent(receipt.vatRate != null ? receipt.vatRate : sale.vatRate),
      lines: deepClone((receipt.lines || []).map(function (line) {
        return { product: line.product || line.name || '', qty: Number(line.qty) || 0, uPrice: Number(line.uPrice != null ? line.uPrice : line.price) || 0, disc: Number(line.disc) || 0 };
      }))
    };
    openReceiptEditModal();
  };

  window.receiptEditField = function (field, value) {
    if (!receiptEditDraft || !Object.prototype.hasOwnProperty.call(receiptEditDraft, field)) return;
    receiptEditDraft[field] = field === 'amountPaid' || field === 'vatRate' ? Math.max(0, Number(value) || 0) : value;
  };

  window.receiptEditLineChanged = function (index, field, value) {
    if (!receiptEditDraft || !receiptEditDraft.lines[index]) return;
    receiptEditDraft.lines[index][field] = field === 'product' ? value : Math.max(0, Number(value) || 0);
    const line = receiptEditDraft.lines[index];
    const node = document.getElementById('receiptEditLineTotal' + index);
    if (node) node.textContent = fmt(round2((Number(line.qty) || 0) * (Number(line.uPrice) || 0) - (Number(line.disc) || 0)));
    refreshReceiptEditTotals();
  };

  window.refreshReceiptEditTotals = function () {
    if (!receiptEditDraft) return;
    const totals = receiptEditTotals();
    const values = {
      receiptEditSubtotal: totals.subtotal, receiptEditVatAmount: totals.vatAmount,
      receiptEditGrandTotal: totals.total,
      receiptEditOutstanding: Math.max(0, round2(totals.total - (Number(receiptEditDraft.amountPaid) || 0)))
    };
    Object.keys(values).forEach(function (id) {
      const node = document.getElementById(id);
      if (node) node.textContent = fmt(values[id]);
    });
  };

  window.addReceiptEditLine = function () {
    if (!receiptEditDraft) return;
    const name = text((document.getElementById('receiptEditNewProduct') || {}).value);
    const product = findProductByName(name);
    if (!product) { toast('Select a product to add.', 'err'); return; }
    receiptEditDraft.lines.push({ product: product.name, qty: 1, uPrice: getBaseUnitPrice(product.name), disc: 0 });
    openReceiptEditModal();
  };

  window.removeReceiptEditLine = function (index) {
    if (!receiptEditDraft) return;
    receiptEditDraft.lines.splice(Number(index), 1);
    openReceiptEditModal();
  };

  window.cancelReceiptEdit = function () {
    receiptEditDraft = null;
    closeModal();
  };

  function restoreReceiptFIFO(lines) {
    (lines || []).forEach(function (line) {
      if (!Array.isArray(line.fifo) || !line.fifo.length) throw new Error('The saved sale lacks FIFO reversal details.');
      line.fifo.forEach(function (allocation) {
        const row = DB.stockRows.find(function (item) { return text(item.id) === text(allocation.stockRowId); });
        if (!row) throw new Error('A stock row required for recalculation is missing.');
        const qty = Number(allocation.qty) || 0;
        const sales = Number(allocation.sales) || 0;
        const discount = Number(allocation.disc) || 0;
        const unitCost = Number(allocation.uCost != null ? allocation.uCost : row.uCost) || 0;
        const adjustment = Number(allocation.aPrice) || 0;
        row.qtyOut = Math.max(0, round2((Number(row.qtyOut) || 0) - qty));
        row.rStock = round2((Number(row.rStock) || 0) + qty);
        row.disc = Math.max(0, round2((Number(row.disc) || 0) - discount));
        row.tSales = round2((Number(row.tSales) || 0) - sales);
        row.profit = round2((Number(row.profit) || 0) - (sales - qty * unitCost));
        row.aPrice = round2((Number(row.aPrice) || 0) - adjustment);
      });
    });
  }

  function reverseReceiptDebtor(receiptNo) {
    (DB.accountTxns || []).forEach(function (txn) {
      if (txn.status === 'UNDONE' || text(txn.receiptNo) !== text(receiptNo)) return;
      if (!text(txn.txnType).toLowerCase().includes('credit sale')) return;
      const account = (DB.debtors || []).find(function (item) { return text(item.id) === text(txn.accountID); });
      if (account) {
        account.balance = round2((Number(account.balance) || 0) - (Number(txn.amount) || 0));
        if (Math.abs(account.balance) < 0.005) account.balance = 0;
        account.date = nowISO();
      }
      txn.status = 'UNDONE'; txn.undoneAt = nowISO(); txn.undoneBy = session.cashier; txn.undoReason = 'RECEIPT_EDIT';
    });
  }

  window.saveReceiptEdit = function () {
    if (!canEditReceipts() || !receiptEditDraft) { toast('Receipt edit is unavailable.', 'err'); return; }
    const receipt = DB.receipts.find(function (item) { return text(item.receiptNo) === text(receiptEditDraft.receiptNo); });
    const sale = DB.sales.find(function (item) { return text(item.receiptNo) === text(receiptEditDraft.receiptNo); });
    if (!receipt || !sale || receipt.voided || receipt.status === 'VOID' || sale.status === 'UNDONE') { toast('The receipt is no longer editable.', 'err'); return; }
    receiptEditDraft.customerName = text((document.getElementById('receiptEditCustomer') || {}).value).trim();
    receiptEditDraft.contact = text((document.getElementById('receiptEditContact') || {}).value).trim();
    receiptEditDraft.location = text((document.getElementById('receiptEditLocation') || {}).value).trim();
    receiptEditDraft.amountPaid = Math.max(0, Number((document.getElementById('receiptEditPaid') || {}).value) || 0);
    receiptEditDraft.vatRate = normalizeVatPercent((document.getElementById('receiptEditVat') || {}).value);
    const totals = receiptEditTotals();
    if (!receiptEditDraft.customerName || !receiptEditDraft.contact) { toast('Customer name and telephone are required.', 'err'); return; }
    if (!receiptEditDraft.lines.length) { toast('At least one receipt line is required.', 'err'); return; }
    for (const line of receiptEditDraft.lines) {
      if (!line.product || Number(line.qty) <= 0 || Number(line.uPrice) < 0 || Number(line.disc) < 0) { toast('Every line needs a product, positive quantity and valid amounts.', 'err'); return; }
      if (round2(Number(line.qty) * Number(line.uPrice) - Number(line.disc)) < 0) { toast('A discount cannot exceed its line value.', 'err'); return; }
    }
    if (!confirm('Save this corrected receipt? Stock allocation and debtor balances will be recalculated.')) return;
    const snapshot = deepClone(DB);
    try {
      restoreReceiptFIFO(sale.lines || []);
      reverseReceiptDebtor(receipt.receiptNo);
      const saleLines = receiptEditDraft.lines.map(function (line) {
        const allocations = recordSaleOutFIFO(line.product, Number(line.qty), Number(line.uPrice), Number(line.disc) || 0);
        return {
          product: line.product, qty: Number(line.qty), price: Number(line.uPrice), disc: Number(line.disc) || 0,
          amount: round2(Number(line.qty) * Number(line.uPrice) - (Number(line.disc) || 0)), fifo: allocations
        };
      });
      const outstanding = Math.max(0, round2(totals.total - receiptEditDraft.amountPaid));
      if (outstanding > 0) {
        const debtorId = getOrCreateDebtorID(receiptEditDraft.customerName, receiptEditDraft.contact);
        const debtor = DB.debtors.find(function (item) { return text(item.id) === text(debtorId); });
        debtor.balance = round2((Number(debtor.balance) || 0) + outstanding);
        debtor.date = nowISO();
        logAccountTxn(debtorId, 'DEBTOR', receiptEditDraft.customerName, 'Credit Sale - Receipt Edit', outstanding, debtor.balance, receipt.receiptNo, {
          kind: 'debtors', source: 'RECEIPT_EDIT', receiptNo: receipt.receiptNo
        });
      }
      const receiptLines = receiptEditDraft.lines.map(function (line) {
        return { product: line.product, qty: Number(line.qty), uPrice: Number(line.uPrice), disc: Number(line.disc) || 0, total: round2(Number(line.qty) * Number(line.uPrice) - (Number(line.disc) || 0)) };
      });
      Object.assign(receipt, {
        customerName: receiptEditDraft.customerName, contact: receiptEditDraft.contact, location: receiptEditDraft.location,
        subtotal: totals.subtotal, vatRate: totals.vatRate, vatAmount: totals.vatAmount, totalAmount: totals.total,
        amountPaid: receiptEditDraft.amountPaid, balance: outstanding, credit: outstanding > 0,
        lines: receiptLines, editRevision: (Number(receipt.editRevision) || 0) + 1, updatedAt: nowISO(), updatedBy: session.cashier
      });
      Object.assign(sale, {
        customer: receiptEditDraft.customerName, contact: receiptEditDraft.contact, location: receiptEditDraft.location,
        subtotal: totals.subtotal, vatRate: totals.vatRate, vatAmount: totals.vatAmount, total: totals.total,
        paid: receiptEditDraft.amountPaid, balance: outstanding,
        pay: outstanding > 0 ? (receiptEditDraft.amountPaid > 0 ? 'PARTIAL' : 'CREDIT') : 'PAID',
        lines: saleLines, editRevision: (Number(sale.editRevision) || 0) + 1, updatedAt: nowISO(), updatedBy: session.cashier
      });
      const linkedInvoice = (DB.invoices || []).find(function (invoice) {
        return text(invoice.convertedReceiptNo) === text(receipt.receiptNo) && invoice.status === 'CONVERTED';
      });
      if (linkedInvoice) {
        linkedInvoice.customer = receiptEditDraft.customerName;
        linkedInvoice.contact = receiptEditDraft.contact;
        linkedInvoice.location = receiptEditDraft.location;
        linkedInvoice.subtotal = totals.subtotal;
        linkedInvoice.vatRate = totals.vatRate;
        linkedInvoice.vatAmount = totals.vatAmount;
        linkedInvoice.vat = totals.vatAmount;
        linkedInvoice.total = totals.total;
        linkedInvoice.lines = receiptEditDraft.lines.map(function (line) {
          const product = findProductByName(line.product);
          const basePrice = product ? getBaseUnitPrice(product.name) : Number(line.uPrice) || 0;
          return {
            id: idStamp('INVL-'), productId: product ? product.id : '', product: line.product,
            qty: Number(line.qty), unitPrice: Number(line.uPrice), basePrice: basePrice,
            priceAdjustment: round2((Number(line.uPrice) || 0) - basePrice), discount: Number(line.disc) || 0,
            total: round2(Number(line.qty) * Number(line.uPrice) - (Number(line.disc) || 0))
          };
        });
        linkedInvoice.editRevision = (Number(linkedInvoice.editRevision) || 0) + 1;
        linkedInvoice.updatedAt = nowISO();
        linkedInvoice.updatedBy = session.cashier;
        linkedInvoice.updateSource = 'RECEIPT_EDIT';
      }
      saveDB();
    } catch (error) {
      restoreDatabase(snapshot);
      console.error(error);
      toast(error.message || String(error), 'err');
      return;
    }
    const receiptNo = receipt.receiptNo;
    receiptEditDraft = null;
    closeModal();
    render();
    toast('Receipt updated - ' + receiptNo + '.');
  };

  function installReceiptEditButtons() {
    if (!canEditReceipts()) return;
    document.querySelectorAll('button[onclick^="printStoredReceipt("]').forEach(function (printButton) {
      const match = text(printButton.getAttribute('onclick')).match(/printStoredReceipt\('([^']+)'\)/);
      const parent = printButton.parentElement;
      if (!match || !parent || parent.querySelector('[data-receipt-edit]')) return;
      const receipt = (DB.receipts || []).find(function (item) { return text(item.receiptNo) === text(match[1]); });
      const sale = (DB.sales || []).find(function (item) { return text(item.receiptNo) === text(match[1]); });
      const period = getLatestMonth();
      const active = receipt && sale && !receipt.voided && receipt.status !== 'VOID' && sale.status !== 'UNDONE'
        && Number(sale.year) === Number(period.year) && Number(sale.month) === Number(period.month);
      if (!active) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn sm ghost'; button.textContent = 'Edit';
      button.dataset.receiptEdit = match[1];
      button.addEventListener('click', function () { editStoredReceipt(match[1]); });
      printButton.insertAdjacentElement('beforebegin', button);
    });
  }

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
      + (order.status === OPEN ? '<button class="btn ghost" onclick="editPurchaseOrder(\'' + escAttr(order.id) + '\')">Edit order</button>' : '')
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
      stockIn.insertAdjacentHTML('afterend', '<button id="navPurchaseOrders" data-view="purchaseorders" data-admin-only onclick="nav(\'purchaseorders\')">📝 Purchase Orders</button>');
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
    installReceiptEditButtons();
    return result;
  };

  ensureModel();
  installNavigation();
  syncNavigationAccess();
  installReceiptEditButtons();
  ZEZMS.ownerMaintenance = {
    version: '3.7.2', build: BUILD, ensureModel: ensureModel,
    findPurchaseOrder: findPurchaseOrder, purchaseOrderPaperHTML: purchaseOrderPaperHTML,
    accountFilters: accountFilters, viewPurchaseOrders: viewPurchaseOrders
  };
}());

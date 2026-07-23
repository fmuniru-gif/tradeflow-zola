/* ZEZMS TradeFlow — M3 Operations Update
   Receipt printing/reprinting, transaction reversal, account deletion,
   and KPI bar-chart dashboard. */
(function () {
  'use strict';

  const BUILD = '20260723-m3-operations-r1';
  const ACTIVE = 'ACTIVE';
  const UNDONE = 'UNDONE';
  let activeReceiptPayload = null;
  let receiptPrintBusy = false;

  function uid(prefix) {
    return idStamp(prefix) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  function ensureOperationsModel() {
    let changed = false;
    if (!Array.isArray(DB.inventoryTxns)) {
      DB.inventoryTxns = [];
      changed = true;
    }
    DB.inventoryTxns.forEach((txn) => {
      if (!txn.status) { txn.status = ACTIVE; changed = true; }
      if (!txn.details || typeof txn.details !== 'object') { txn.details = {}; changed = true; }
    });
    DB.accountTxns.forEach((txn) => {
      if (!txn.status) { txn.status = ACTIVE; changed = true; }
      if (!txn.meta || typeof txn.meta !== 'object') { txn.meta = {}; changed = true; }
    });
    DB.sales.forEach((sale) => {
      if (!sale.status) { sale.status = ACTIVE; changed = true; }
    });
    DB.receipts.forEach((receipt) => {
      if (!receipt.status) { receipt.status = receipt.voided ? 'VOID' : ACTIVE; changed = true; }
    });
    if (changed && window.ZEZMS && ZEZMS.db && typeof ZEZMS.db.save === 'function') {
      ZEZMS.db.save(DB_KEY, DB);
    }
  }

  function injectStyles() {
    if (document.getElementById('m3OperationsStyles')) return;
    const style = document.createElement('style');
    style.id = 'm3OperationsStyles';
    style.textContent = `
      .chart-card{min-height:360px}
      .bar-chart{display:flex;flex-direction:column;gap:14px;margin-top:14px}
      .bar-row{display:grid;grid-template-columns:minmax(120px,180px) minmax(160px,1fr) minmax(110px,150px);gap:10px;align-items:center}
      .bar-label{font-size:12px;font-weight:700;color:var(--text)}
      .bar-track{height:28px;border-radius:8px;background:#0b1220;border:1px solid #334155;overflow:hidden;position:relative}
      .bar-fill{height:100%;min-width:0;border-radius:7px;background:linear-gradient(90deg,var(--teal),var(--teal2));transition:width .35s ease}
      .bar-fill.money-alt{background:linear-gradient(90deg,#2563eb,#60a5fa)}
      .bar-fill.profit{background:linear-gradient(90deg,#15803d,#4ade80)}
      .bar-fill.negative{background:linear-gradient(90deg,#991b1b,#ef4444)}
      .bar-fill.qty{background:linear-gradient(90deg,#b45309,#f59e0b)}
      .bar-value{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:700}
      .chart-legend{font-size:11px;color:var(--muted);margin-top:12px}
      .void-row td{opacity:.72;text-decoration:none;background:rgba(100,116,139,.12)!important}
      .receipt-actions{display:flex;gap:5px;flex-wrap:wrap}
      .undo-note{border-left:4px solid var(--amber);padding:10px 12px;background:rgba(245,158,11,.08);border-radius:8px;font-size:12px;color:var(--muted)}
      .status-undone{opacity:.6;text-decoration:line-through}
      @media(max-width:720px){
        .bar-row{grid-template-columns:1fr}
        .bar-value{text-align:left}
        .chart-card{min-height:0}
      }
    `;
    document.head.appendChild(style);
  }

  function installNavigation() {
    TITLES.kpiCharts = 'KPI Bar Charts';
    TITLES.undo = 'Undo Transactions';

    const dashboardButton = document.querySelector('#mainNav button[data-view="dashboard"]');
    if (dashboardButton && !document.getElementById('navKPICharts')) {
      dashboardButton.insertAdjacentHTML(
        'afterend',
        '<button id="navKPICharts" data-view="kpiCharts" data-admin-only onclick="nav(\'kpiCharts\')">📉 KPI Bar Charts</button>'
      );
    }

    const accountButton = document.querySelector('#mainNav button[data-view="accounts"]');
    if (accountButton && !document.getElementById('navUndoTransactions')) {
      accountButton.insertAdjacentHTML(
        'afterend',
        '<button id="navUndoTransactions" data-view="undo" data-admin-only onclick="nav(\'undo\')">↩️ Undo Transactions</button>'
      );
    }
  }

  function barChartHTML(title, items, valueFormatter) {
    const max = Math.max(1, ...items.map((item) => Math.abs(Number(item.value) || 0)));
    const rows = items.map((item) => {
      const raw = Number(item.value) || 0;
      const width = raw === 0 ? 0 : Math.max(2, Math.min(100, (Math.abs(raw) / max) * 100));
      const classes = ['bar-fill', item.className || '', raw < 0 ? 'negative' : ''].filter(Boolean).join(' ');
      return `<div class="bar-row">
        <div class="bar-label">${esc(item.label)}</div>
        <div class="bar-track" title="${escAttr(item.label + ': ' + valueFormatter(raw))}">
          <div class="${classes}" style="width:${width.toFixed(2)}%"></div>
        </div>
        <div class="bar-value">${esc(valueFormatter(raw))}</div>
      </div>`;
    }).join('');

    return `<div class="card chart-card">
      <h3>${esc(title)}</h3>
      <div class="bar-chart">${rows}</div>
      <div class="chart-legend">Bars are scaled within this chart for the selected month and year.</div>
    </div>`;
  }

  function viewKPICharts() {
    const moneyItems = [
      { label: 'TOTAL SALES', value: KPI_TotalSales(), className: 'money-alt' },
      { label: 'CR STOCK (VALUE)', value: KPI_CRStock(), className: 'money-alt' },
      { label: 'GROSS PROFIT', value: GetGrossProfit_CurrentMonth(), className: 'profit' },
      { label: 'NET PROFIT', value: KPI_NetProfit(), className: 'profit' }
    ];
    const qtyItems = [
      { label: 'QTY IN', value: KPI_QtyIn(), className: 'qty' },
      { label: 'QTY OUT', value: KPI_QtyOut(), className: 'qty' },
      { label: 'REM QTY', value: KPI_QtyRem(), className: 'qty' }
    ];

    return periodSelectorHTML() + `
      <div class="grid g2 g1m">
        ${barChartHTML('Financial KPI Bar Chart', moneyItems, (value) => fmt(value))}
        ${barChartHTML('Stock Quantity Bar Chart', qtyItems, (value) => fmtN(value))}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 style="margin-bottom:4px">Shared KPI source</h3>
            <div class="muted" style="font-size:12px">This dashboard uses the same KPI formulas and Year/Month selection as the original KPI dashboard.</div>
          </div>
          <button class="btn ghost" onclick="nav('dashboard')">Open original KPI dashboard</button>
        </div>
      </div>`;
  }

  const baseRender = render;
  render = function () {
    if (currentView !== 'kpiCharts' && currentView !== 'undo') {
      return baseRender();
    }

    updatePeriodUI();
    applyRoleUI();
    if (!isElevated()) {
      currentView = 'pos';
      $('viewTitle').textContent = TITLES.pos;
      return baseRender();
    }

    const root = $('viewRoot');
    if (currentView === 'kpiCharts') root.innerHTML = viewKPICharts();
    if (currentView === 'undo') root.innerHTML = viewUndoTransactions();
  };

  /* ---------------- Receipt printing and reprinting ---------------- */
  function normalizeReceiptPayload(sale) {
    const lines = (sale.lines || []).map((line) => ({
      product: line.product || line.name || '',
      qty: Number(line.qty) || 0,
      uPrice: Number(line.uPrice != null ? line.uPrice : line.price) || 0,
      disc: Number(line.disc) || 0,
      total: Number(line.total != null ? line.total : line.amount) || 0
    }));
    const total = Number(sale.total != null ? sale.total : sale.totalAmount) || 0;
    const paid = Number(sale.paid != null ? sale.paid : sale.amountPaid) || 0;
    return {
      receiptNo: sale.receiptNo || sale.id || '',
      customer: sale.customer || sale.customerName || '',
      location: sale.location || '',
      contact: sale.contact || '',
      total,
      paid,
      balance: sale.balance != null && sale.total != null
        ? Number(sale.balance) || 0
        : round2(paid - total),
      outstanding: Math.max(0, round2(total - paid)),
      cashier: sale.cashier || '',
      cashierTel: sale.cashierTel || '',
      date: sale.date || nowISO(),
      lines,
      voided: !!sale.voided || sale.status === 'VOID' || sale.status === UNDONE,
      voidedAt: sale.voidedAt || sale.undoneAt || '',
      voidedBy: sale.voidedBy || sale.undoneBy || ''
    };
  }

  function receiptPaperHTML(source) {
    const sale = normalizeReceiptPayload(source);
    const biz = DB.business || BUSINESS;
    const lineRows = sale.lines.map((line) => `
      <tr>
        <td>${esc(line.product)}</td>
        <td style="text-align:center">${fmtN(line.qty)}</td>
        <td style="text-align:right">${fmtN(line.uPrice)}</td>
        <td style="text-align:right">${fmtN(line.disc)}</td>
        <td style="text-align:right">${fmtN(line.total)}</td>
      </tr>`).join('');
    const subtotal = sale.lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
    const vat = round2(sale.total - subtotal);

    return `<div class="receipt-paper" id="receiptPrint" style="position:relative">
      ${sale.voided ? '<div style="position:absolute;inset:42% 0 auto;text-align:center;font-size:52px;font-weight:900;color:rgba(185,28,28,.23);transform:rotate(-20deg);letter-spacing:8px">VOID</div>' : ''}
      <div class="center" style="color:#00f;font-weight:800;font-size:18px;letter-spacing:1px">SALES RECEIPT</div>
      <div style="margin-top:8px"><b>${esc(biz.name)}</b><br>${esc(biz.address)}<br>Tel: ${esc(biz.tel)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:8px">
        <div>${sale.voided ? '<b style="color:#b91c1c">VOID RECEIPT</b>' : ''}</div>
        <div>Receipt No: <b>${esc(sale.receiptNo)}</b><br>Date: ${formatOrdinalDate(sale.date)}</div>
      </div>
      <div style="margin-top:10px">
        Customer: <b>${esc(sale.customer)}</b><br>
        Location: ${esc(sale.location)}<br>
        Telephone: ${esc(sale.contact)}
      </div>
      <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#e6e6e6;color:#111">
          <th style="text-align:left;padding:4px">Product</th>
          <th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th>
        </tr></thead>
        <tbody style="color:#111">${lineRows}</tbody>
      </table>
      <div style="margin-top:10px;text-align:right;color:#111">
        <div>Subtotal: ${fmtN(subtotal)}</div>
        <div>VAT: ${fmtN(vat)}</div>
        <div><b>Grand Total: ${fmtN(sale.total)}</b></div>
        <div style="margin-top:6px">Amount Paid: ${fmtN(sale.paid)}</div>
        <div>Balance: ${fmtN(sale.balance)}</div>
      </div>
      <div style="margin-top:14px;color:#111">
        Cashier Signature: ........................<br>
        <i>${esc(sale.cashier)} (${esc(sale.cashierTel)})</i>
      </div>
      ${sale.voided ? `<div style="margin-top:10px;color:#b91c1c;font-size:10px">Voided ${sale.voidedAt ? new Date(sale.voidedAt).toLocaleString() : ''}${sale.voidedBy ? ' by ' + esc(sale.voidedBy) : ''}</div>` : ''}
      <div class="center" style="margin-top:14px;font-size:16px;font-weight:800;color:#111">Thank you for your business!</div>
    </div>`;
  }

  showReceiptModal = function (source) {
    activeReceiptPayload = normalizeReceiptPayload(source);
    openModal(`
      ${receiptPaperHTML(activeReceiptPayload)}
      <div class="row" style="margin-top:12px">
        <button class="btn" onclick="printActiveReceipt()">Print one copy</button>
        <button class="btn ghost" onclick="closeModal();render()">Close</button>
        ${isElevated() ? '<button class="btn ghost" onclick="closeModal();nav(\'receipts\')">Receipts</button>' : ''}
      </div>`);
  };

  function cleanupPrintFrame(frame) {
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    receiptPrintBusy = false;
  }

  function printReceiptDocument(source) {
    if (receiptPrintBusy) {
      toast('The receipt print window is already opening.', 'warn');
      return;
    }
    receiptPrintBusy = true;
    const payload = normalizeReceiptPayload(source);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(payload.receiptNo)}</title>
      <style>
        @page{margin:8mm;size:auto}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:#fff;color:#111;font-family:ui-monospace,Menlo,Consolas,monospace}
        body{display:flex;justify-content:center}
        .receipt-paper{width:82mm;max-width:100%;padding:8mm;font-size:11px;line-height:1.45;background:#fff;color:#111}
        .receipt-paper .center{text-align:center}
        table{width:100%;border-collapse:collapse}
        th,td{padding:4px 2px;border-bottom:1px solid #ddd}
      </style></head><body>${receiptPaperHTML(payload)}</body></html>`);
    doc.close();

    setTimeout(() => {
      try {
        const printWindow = frame.contentWindow;
        printWindow.onafterprint = () => cleanupPrintFrame(frame);
        printWindow.focus();
        printWindow.print();
        setTimeout(() => cleanupPrintFrame(frame), 15000);
      } catch (error) {
        console.error('Receipt print failed', error);
        cleanupPrintFrame(frame);
        toast('Receipt printing could not start.', 'err');
      }
    }, 250);
  }

  window.printActiveReceipt = function () {
    if (!activeReceiptPayload) {
      toast('No receipt is open.', 'err');
      return;
    }
    printReceiptDocument(activeReceiptPayload);
  };

  window.showStoredReceipt = function (receiptNo) {
    const receipt = DB.receipts.find((item) => item.receiptNo === receiptNo);
    if (!receipt) {
      toast('Receipt not found.', 'err');
      return;
    }
    showReceiptModal(receipt);
  };

  window.printStoredReceipt = function (receiptNo) {
    const receipt = DB.receipts.find((item) => item.receiptNo === receiptNo);
    if (!receipt) {
      toast('Receipt not found.', 'err');
      return;
    }
    printReceiptDocument(receipt);
  };

  viewReceipts = function () {
    const today = new Date();
    const isToday = (iso) => {
      const date = new Date(iso);
      return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    };
    let list = DB.receipts.slice().reverse();
    let note = 'All receipts · credit sales red · voided receipts retained for audit';
    if (session.isCashier2 && !isElevated()) {
      list = list.filter((receipt) => receipt.cashier === session.cashier && isToday(receipt.date));
      note = 'Your receipts today only · credit sales red';
    }

    const rows = list.map((receipt) => {
      const isVoid = receipt.voided || receipt.status === 'VOID' || receipt.status === UNDONE;
      const isCredit = !isVoid && (receipt.credit || Number(receipt.balance) > 0);
      return `<tr class="${isVoid ? 'void-row' : (isCredit ? 'credit-row' : '')}">
        <td class="mono" style="font-size:11px">${esc(receipt.receiptNo)}</td>
        <td>${esc(receipt.customerName)}</td>
        <td>${esc(receipt.contact || '')}</td>
        <td class="mono right">${fmt(receipt.totalAmount)}</td>
        <td class="mono right">${receipt.balance ? fmt(receipt.balance) : '—'}</td>
        <td style="font-size:11px">${new Date(receipt.date).toLocaleString()}</td>
        <td>${esc(receipt.cashier || '')}</td>
        <td>${isVoid ? '<span class="badge bad">VOID</span>' : (isCredit ? '<span class="badge bad">CREDIT</span>' : '<span class="badge ok">PAID</span>')}</td>
        <td><div class="receipt-actions">
          <button class="btn sm ghost" onclick="showStoredReceipt('${escAttr(receipt.receiptNo)}')">View</button>
          <button class="btn sm" onclick="printStoredReceipt('${escAttr(receipt.receiptNo)}')">🖨 Reprint</button>
        </div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="empty">${session.isCashier2 && !isElevated() ? 'No receipts for you today yet.' : 'No receipts yet.'}</td></tr>`;

    return `<div class="card">
      <h3>Receipt register <span class="muted" style="font-weight:400">(${esc(note)})</span></h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Receipt #</th><th>Customer</th><th>Contact</th><th class="right">Total</th><th class="right">Balance (owed)</th><th>Date</th><th>Cashier</th><th>Flag</th><th>Receipt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  };

  /* ---------------- Inventory transaction logging ---------------- */
  const baseDoStockIn = doStockIn;
  doStockIn = function () {
    ensureOperationsModel();
    const productSelection = (($('siProduct') && $('siProduct').value) || '').trim();
    const newName = (($('siNewName') && $('siNewName').value) || '').trim();
    const productName = productSelection || newName;
    const qty = Number($('siQty') && $('siQty').value) || 0;
    const uCost = Number($('siCost') && $('siCost').value) || 0;
    const uPrice = Number($('siPrice') && $('siPrice').value) || 0;
    const year = Number($('siYear') && $('siYear').value) || DB.selectedYear;
    const month = Number($('siMonth') && $('siMonth').value) || DB.selectedMonth;
    const beforeRows = deepClone(DB.stockRows);
    const undoLength = DB.undoLog.length;

    baseDoStockIn();

    if (DB.undoLog.length <= undoLength || !productName || qty <= 0) return;
    const product = DB.products.find((item) => item.name.toLowerCase() === productName.toLowerCase());
    const canonicalName = product ? product.name : productName;
    const row = DB.stockRows.find((item) => item.productName === canonicalName
      && item.year === year && item.month === month && Number(item.uCost) === uCost);
    if (!row) return;

    const beforeRow = beforeRows.find((item) => item.id === row.id) || null;
    const txn = {
      id: uid('ITX-'),
      type: 'STOCK_IN',
      status: ACTIVE,
      date: nowISO(),
      cashier: session.cashier,
      product: canonicalName,
      qty,
      amount: round2(qty * uCost),
      reference: row.id,
      details: {
        stockRowId: row.id,
        createdRow: !beforeRow,
        beforeRow,
        year,
        month,
        uCost,
        uPrice
      }
    };
    DB.inventoryTxns.push(txn);
    const undoEntry = DB.undoLog[DB.undoLog.length - 1];
    if (undoEntry) {
      undoEntry.inventoryTxnId = txn.id;
      undoEntry.stockRowId = row.id;
      undoEntry.batchId = txn.id;
      undoEntry.type = 'STOCK_IN';
    }
    saveDB();
  };

  quickSaleOut = function () {
    ensureOperationsModel();
    if (!session.cashier) { toast('No active cashier detected. Please login first.', 'err'); return; }
    if (!cart.length) { toast('Please add at least one item for quick sale.', 'err'); return; }

    const transactionId = uid('QSALE-');
    const cartSnapshot = cart.map((line) => deepClone(line));
    const undoStart = DB.undoLog.length;
    const lines = [];
    try {
      cartSnapshot.forEach((line) => {
        const allocations = recordSaleOutFIFO(line.name, line.qty, line.uPrice, line.disc || 0);
        lines.push({
          product: line.name,
          qty: line.qty,
          price: line.uPrice,
          disc: line.disc || 0,
          amount: round2(line.qty * line.uPrice - (line.disc || 0)),
          fifo: allocations
        });
      });
    } catch (error) {
      loadDB();
      toast(error.message || String(error), 'err');
      return;
    }

    DB.undoLog.slice(undoStart).forEach((entry) => {
      entry.batchId = transactionId;
      entry.inventoryTxnId = transactionId;
      entry.type = 'SALE_OUT_ALLOC';
    });
    DB.inventoryTxns.push({
      id: transactionId,
      type: 'SALE_OUT',
      subtype: 'QUICK',
      status: ACTIVE,
      date: nowISO(),
      cashier: session.cashier,
      product: lines.map((line) => line.product).join(', '),
      qty: lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
      amount: lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
      reference: transactionId,
      details: { lines }
    });
    saveDB();
    resetSaleOutForm();
    toast('Quick Sale Out recorded');
    render();
  };

  function activeInventoryTransactions() {
    ensureOperationsModel();
    const transactions = [];

    DB.sales.forEach((sale) => {
      if (sale.status === UNDONE || sale.status === 'VOID') return;
      transactions.push({
        id: 'SALE:' + sale.receiptNo,
        type: 'SALE_OUT',
        subtype: 'RECEIPT',
        date: sale.date,
        cashier: sale.cashier,
        product: (sale.lines || []).map((line) => line.product).join(', '),
        qty: (sale.lines || []).reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
        amount: Number(sale.total) || 0,
        reference: sale.receiptNo,
        legacy: true
      });
    });

    DB.inventoryTxns.forEach((txn) => {
      if (txn.status === UNDONE) return;
      if (txn.type === 'SALE_OUT' && txn.subtype !== 'QUICK') return;
      transactions.push(txn);
    });

    DB.undoLog.forEach((entry, index) => {
      const type = String(entry.type || '').toUpperCase().replace(/\s+/g, '_');
      if (type !== 'STOCK_IN' || entry.inventoryTxnId || entry.status === UNDONE) return;
      transactions.push({
        id: 'LEGACY_STOCK:' + index,
        type: 'STOCK_IN',
        subtype: 'LEGACY',
        date: entry.at,
        cashier: entry.cashier,
        product: entry.product,
        qty: Number(entry.qty) || 0,
        amount: 0,
        reference: entry.batchId || entry.row || '',
        legacy: true
      });
    });

    return transactions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function restoreFIFOAllocations(lines) {
    (lines || []).forEach((line) => {
      if (!Array.isArray(line.fifo) || !line.fifo.length) {
        throw new Error('This sale does not contain FIFO reversal details and cannot be reversed safely.');
      }
      line.fifo.forEach((allocation) => {
        const row = DB.stockRows.find((item) => item.id === allocation.stockRowId);
        if (!row) throw new Error('A stock row required for reversal is missing: ' + allocation.stockRowId);
        const qty = Number(allocation.qty) || 0;
        const sales = Number(allocation.sales) || 0;
        const disc = Number(allocation.disc) || 0;
        const unitCost = Number(allocation.uCost != null ? allocation.uCost : row.uCost) || 0;
        const priceAdjustment = Number(allocation.aPrice) || 0;
        row.qtyOut = Math.max(0, round2((Number(row.qtyOut) || 0) - qty));
        row.rStock = round2((Number(row.rStock) || 0) + qty);
        row.disc = Math.max(0, round2((Number(row.disc) || 0) - disc));
        row.tSales = round2((Number(row.tSales) || 0) - sales);
        row.profit = round2((Number(row.profit) || 0) - (sales - qty * unitCost));
        row.aPrice = round2((Number(row.aPrice) || 0) - priceAdjustment);
      });
    });
  }

  function normalizeAccountKind(accountType) {
    const value = String(accountType || '').toLowerCase();
    if (value.includes('debtor')) return 'debtors';
    if (value.includes('creditor')) return 'creditors';
    if (value.includes('depositor')) return 'depositors';
    return '';
  }

  function markAccountTransactionsForSaleUndone(receiptNo) {
    DB.accountTxns.forEach((txn) => {
      if (txn.status === UNDONE || txn.receiptNo !== receiptNo) return;
      if (!String(txn.txnType || '').toLowerCase().includes('credit sale')) return;
      const kind = normalizeAccountKind(txn.accountType) || 'debtors';
      const account = DB[kind].find((item) => item.id === txn.accountID);
      if (account) {
        account.balance = round2((Number(account.balance) || 0) - (Number(txn.amount) || 0));
        if (Math.abs(account.balance) < 0.005) account.balance = 0;
        account.date = nowISO();
      }
      txn.status = UNDONE;
      txn.undoneAt = nowISO();
      txn.undoneBy = session.cashier;
    });
  }

  function reverseReceiptSale(receiptNo) {
    const sale = DB.sales.find((item) => item.receiptNo === receiptNo);
    if (!sale) throw new Error('The sale record was not found.');
    if (sale.status === UNDONE) throw new Error('This sale has already been undone.');

    restoreFIFOAllocations(sale.lines || []);
    markAccountTransactionsForSaleUndone(receiptNo);

    sale.status = UNDONE;
    sale.undoneAt = nowISO();
    sale.undoneBy = session.cashier;
    const receipt = DB.receipts.find((item) => item.receiptNo === receiptNo);
    if (receipt) {
      receipt.status = 'VOID';
      receipt.voided = true;
      receipt.voidedAt = nowISO();
      receipt.voidedBy = session.cashier;
    }
    DB.undoLog.forEach((entry) => {
      if (entry.batchId === receiptNo) entry.status = UNDONE;
    });
    return 'Sale ' + receiptNo + ' reversed and receipt marked VOID.';
  }

  function reverseQuickSale(txn) {
    restoreFIFOAllocations(txn.details && txn.details.lines);
    txn.status = UNDONE;
    txn.undoneAt = nowISO();
    txn.undoneBy = session.cashier;
    DB.undoLog.forEach((entry) => {
      if (entry.inventoryTxnId === txn.id || entry.batchId === txn.id) entry.status = UNDONE;
    });
    return 'Quick sale reversed.';
  }

  function reverseStockInTransaction(txn) {
    const row = DB.stockRows.find((item) => item.id === txn.details.stockRowId);
    if (!row) throw new Error('The stock row for this Stock In transaction no longer exists.');
    const qty = Number(txn.qty) || 0;
    if ((Number(row.rStock) || 0) + 1e-9 < qty) {
      throw new Error('This Stock In cannot be undone because some of its units have already been sold. Undo the related sale first.');
    }
    row.qtyIn = Math.max(0, round2((Number(row.qtyIn) || 0) - qty));
    row.rStock = Math.max(0, round2((Number(row.rStock) || 0) - qty));
    if (row.qtyIn <= 0 && (Number(row.qtyOut) || 0) <= 0) {
      DB.stockRows = DB.stockRows.filter((item) => item.id !== row.id);
    }
    txn.status = UNDONE;
    txn.undoneAt = nowISO();
    txn.undoneBy = session.cashier;
    DB.undoLog.forEach((entry) => {
      if (entry.inventoryTxnId === txn.id || entry.batchId === txn.id) entry.status = UNDONE;
    });
    return 'Stock In reversed.';
  }

  function reverseLegacyStock(index) {
    const entry = DB.undoLog[index];
    if (!entry || entry.status === UNDONE) throw new Error('The legacy Stock In record is unavailable.');
    const qty = Number(entry.qty) || 0;
    const candidates = DB.stockRows.slice().reverse().filter((row) => row.productName === entry.product && (Number(row.rStock) || 0) >= qty);
    const row = candidates[0];
    if (!row) throw new Error('No stock row has enough remaining quantity to reverse this legacy Stock In safely.');
    row.qtyIn = Math.max(0, round2((Number(row.qtyIn) || 0) - qty));
    row.rStock = Math.max(0, round2((Number(row.rStock) || 0) - qty));
    if (row.qtyIn <= 0 && (Number(row.qtyOut) || 0) <= 0) {
      DB.stockRows = DB.stockRows.filter((item) => item.id !== row.id);
    }
    entry.status = UNDONE;
    entry.undoneAt = nowISO();
    entry.undoneBy = session.cashier;
    return 'Legacy Stock In reversed.';
  }

  function performInventoryUndo(transactionId) {
    let message = '';
    if (transactionId.startsWith('SALE:')) {
      message = reverseReceiptSale(transactionId.slice(5));
    } else if (transactionId.startsWith('LEGACY_STOCK:')) {
      message = reverseLegacyStock(Number(transactionId.split(':')[1]));
    } else {
      const txn = DB.inventoryTxns.find((item) => item.id === transactionId);
      if (!txn) throw new Error('Inventory transaction not found.');
      if (txn.status === UNDONE) throw new Error('This transaction has already been undone.');
      if (txn.type === 'STOCK_IN') message = reverseStockInTransaction(txn);
      else if (txn.type === 'SALE_OUT' && txn.subtype === 'QUICK') message = reverseQuickSale(txn);
      else throw new Error('This transaction type cannot be undone automatically.');
    }
    saveDB();
    toast(message);
    render();
  }

  window.undoInventoryTransaction = function (transactionId) {
    if (!isElevated()) { toast('Only admin can undo transactions.', 'err'); return; }
    const txn = activeInventoryTransactions().find((item) => item.id === transactionId);
    if (!txn) { toast('Transaction not found or already undone.', 'err'); return; }
    promptPIN('Admin PIN to undo transaction', getAdminPIN(), () => {
      const warning = txn.legacy ? '\n\nThis is a legacy record; reversal uses the safest available historical details.' : '';
      if (!confirm('Undo ' + txn.type.replace('_', ' ') + ' · ' + (txn.reference || txn.product || txn.id) + '?' + warning)) return;
      try { performInventoryUndo(transactionId); }
      catch (error) { console.error(error); toast(error.message || String(error), 'err'); }
    });
  };

  window.undoLastInventoryTransaction = function () {
    const last = activeInventoryTransactions()[0];
    if (!last) { toast('No active Sale Out or Stock In transaction is available to undo.', 'warn'); return; }
    undoInventoryTransaction(last.id);
  };

  undoLast = function () {
    undoLastInventoryTransaction();
  };

  /* ---------------- Account transaction undo and deletion ---------------- */
  adjustCash = (function (baseAdjustCash) {
    return function (type, action, amount, note) {
      const beforeLength = DB.cashLog.length;
      baseAdjustCash(type, action, amount, note);
      return DB.cashLog.length > beforeLength ? DB.cashLog[DB.cashLog.length - 1] : null;
    };
  }(adjustCash));

  logAccountTxn = function (accountID, accountType, name, txnType, amount, balanceAfter, receiptNo, meta) {
    const inferredKind = normalizeAccountKind(accountType);
    const normalizedMeta = Object.assign({}, meta || {});
    if (!normalizedMeta.kind && inferredKind) normalizedMeta.kind = inferredKind;
    if (String(txnType || '').toLowerCase().includes('credit sale')) {
      normalizedMeta.kind = 'debtors';
      normalizedMeta.source = 'SALE';
      normalizedMeta.saleReceiptNo = receiptNo || '';
      normalizedMeta.beforeBalance = round2((Number(balanceAfter) || 0) - (Number(amount) || 0));
    }
    const txn = {
      id: uid('ATX-'),
      accountID,
      accountType,
      name,
      txnType,
      amount: Number(amount) || 0,
      balanceAfter: Number(balanceAfter) || 0,
      date: nowISO(),
      receiptNo: receiptNo || '',
      cashier: session.cashier,
      status: ACTIVE,
      meta: normalizedMeta
    };
    DB.accountTxns.push(txn);
    return txn;
  };

  addAccount = function () {
    const name = ($('acName').value || '').trim();
    const contact = ($('acContact').value || '').trim();
    const description = ($('acDesc').value || '').trim();
    const balance = Number($('acBal').value) || 0;
    if (!name) { toast('Name required', 'err'); return; }
    const id = getOrCreateAccount(accTab, name, contact, description);
    const account = DB[accTab].find((item) => item.id === id);
    const before = Number(account.balance) || 0;
    if (balance) {
      account.balance = round2(before + balance);
      account.description = description || account.description;
      account.contact = contact || account.contact;
      logAccountTxn(id, accTab.slice(0, -1).toUpperCase(), name, 'OPENING', balance, account.balance, '', {
        kind: accTab,
        source: 'OPENING',
        beforeBalance: before,
        afterBalance: account.balance
      });
    }
    saveDB();
    toast('Account saved');
    render();
  };

  applySettle = function (kind, id) {
    const account = DB[kind].find((item) => item.id === id);
    if (!account) return;
    const amount = Number(document.getElementById('stAmt').value) || 0;
    const direction = document.getElementById('stDir').value;
    const wallet = document.getElementById('stWallet').value;
    const note = document.getElementById('stNote').value || '';
    if (amount <= 0) { toast('Amount required', 'err'); return; }

    const signed = direction === 'REDUCE' ? -amount : amount;
    const before = Number(account.balance) || 0;
    let cashEntry = null;

    if (wallet) {
      if (kind === 'debtors' && direction === 'REDUCE') {
        cashEntry = adjustCash(wallet, 'Add', amount, 'Debtor settle ' + account.name);
      } else if (kind === 'creditors' && direction === 'REDUCE') {
        if (amount > (Number(DB.cashBalances[wallet]) || 0) + 1e-9) { toast('Insufficient wallet', 'err'); return; }
        cashEntry = adjustCash(wallet, 'Deduct', amount, 'Creditor pay ' + account.name);
      } else if (kind === 'depositors' && direction === 'REDUCE') {
        if (amount > (Number(DB.cashBalances[wallet]) || 0) + 1e-9) { toast('Insufficient wallet', 'err'); return; }
        cashEntry = adjustCash(wallet, 'Deduct', amount, 'Deposit return ' + account.name);
      } else if (kind === 'depositors' && direction === 'INCREASE') {
        cashEntry = adjustCash(wallet, 'Add', amount, 'Deposit in ' + account.name);
      }
    }

    account.balance = round2(before + signed);
    account.date = nowISO();
    logAccountTxn(id, kind.slice(0, -1).toUpperCase(), account.name, direction === 'REDUCE' ? 'SETTLE' : 'INCREASE', signed, account.balance, '', {
      kind,
      source: 'ACCOUNT_ADJUSTMENT',
      beforeBalance: before,
      afterBalance: account.balance,
      wallet,
      cashAction: cashEntry ? cashEntry.action : '',
      cashAmount: cashEntry ? cashEntry.amount : 0,
      cashLogId: cashEntry ? cashEntry.id : '',
      note
    });
    saveDB();
    closeModal();
    toast('Settlement posted');
    render();
  };

  window.deleteAccountHolder = function (kind, id) {
    if (!isElevated()) { toast('Only admin can delete account holders.', 'err'); return; }
    const list = DB[kind];
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) { toast('Account holder not found.', 'err'); return; }
    const account = list[index];
    promptPIN('Admin PIN to delete account holder', getAdminPIN(), () => {
      const balanceWarning = Math.abs(Number(account.balance) || 0) > 0.005
        ? '\n\nWARNING: Current balance is ' + fmt(account.balance) + '. Deleting the holder will remove this balance from the live KPI totals.'
        : '';
      if (!confirm('Delete ' + account.name + ' from ' + kind + '?' + balanceWarning + '\n\nTransaction history will be retained for audit.')) return;
      const snapshot = deepClone(account);
      list.splice(index, 1);
      logAccountTxn(account.id, kind.slice(0, -1).toUpperCase(), account.name, 'ACCOUNT_DELETE', 0, 0, '', {
        kind,
        source: 'ACCOUNT_DELETE',
        deletedSnapshot: snapshot,
        deletedIndex: index
      });
      saveDB();
      toast('Account holder deleted.');
      render();
    });
  };

  function activeAccountTransactions() {
    ensureOperationsModel();
    return DB.accountTxns
      .filter((txn) => txn.status !== UNDONE)
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function reverseCashForAccountTxn(txn) {
    const meta = txn.meta || {};
    if (!meta.wallet || !meta.cashAction || !meta.cashAmount) return;
    const amount = Number(meta.cashAmount) || 0;
    const current = Number(DB.cashBalances[meta.wallet]) || 0;
    if (meta.cashAction === 'Add') {
      if (current + 1e-9 < amount) {
        throw new Error('The linked cash receipt cannot be reversed because ' + meta.wallet + ' no longer has enough balance.');
      }
      DB.cashBalances[meta.wallet] = round2(current - amount);
    } else if (meta.cashAction === 'Deduct') {
      DB.cashBalances[meta.wallet] = round2(current + amount);
    }
    const cashLog = DB.cashLog.find((entry) => entry.id === meta.cashLogId);
    if (cashLog) {
      cashLog.status = UNDONE;
      cashLog.undoneAt = nowISO();
      cashLog.undoneBy = session.cashier;
    }
  }

  function performAccountUndo(transactionId) {
    const txn = DB.accountTxns.find((item) => item.id === transactionId);
    if (!txn) throw new Error('Account transaction not found.');
    if (txn.status === UNDONE) throw new Error('This account transaction has already been undone.');

    if (String(txn.txnType || '').toLowerCase().includes('credit sale') && txn.receiptNo) {
      const message = reverseReceiptSale(txn.receiptNo);
      saveDB();
      toast(message);
      render();
      return;
    }

    const meta = txn.meta || {};
    const kind = meta.kind || normalizeAccountKind(txn.accountType);
    if (txn.txnType === 'ACCOUNT_DELETE') {
      if (!kind || !meta.deletedSnapshot) throw new Error('The deleted account snapshot is unavailable.');
      if (DB[kind].some((item) => item.id === meta.deletedSnapshot.id)) {
        throw new Error('The account holder has already been restored.');
      }
      const position = Math.max(0, Math.min(DB[kind].length, Number(meta.deletedIndex) || 0));
      DB[kind].splice(position, 0, deepClone(meta.deletedSnapshot));
    } else {
      if (!kind) throw new Error('The account type could not be identified.');
      const account = DB[kind].find((item) => item.id === txn.accountID);
      if (!account) throw new Error('The account holder no longer exists. Restore the holder first if it was deleted.');
      reverseCashForAccountTxn(txn);
      account.balance = round2((Number(account.balance) || 0) - (Number(txn.amount) || 0));
      if (Math.abs(account.balance) < 0.005) account.balance = 0;
      account.date = nowISO();
    }

    txn.status = UNDONE;
    txn.undoneAt = nowISO();
    txn.undoneBy = session.cashier;
    saveDB();
    toast('Account transaction undone.');
    render();
  }

  window.undoAccountTransaction = function (transactionId) {
    if (!isElevated()) { toast('Only admin can undo account transactions.', 'err'); return; }
    const txn = activeAccountTransactions().find((item) => item.id === transactionId);
    if (!txn) { toast('Transaction not found or already undone.', 'err'); return; }
    promptPIN('Admin PIN to undo account transaction', getAdminPIN(), () => {
      const legacy = !txn.meta || !Object.keys(txn.meta).length;
      const warning = legacy ? '\n\nThis legacy entry has no stored wallet link; only the account balance can be reversed.' : '';
      if (!confirm('Undo ' + txn.txnType + ' for ' + txn.name + ' (' + fmtN(txn.amount) + ')?' + warning)) return;
      try { performAccountUndo(transactionId); }
      catch (error) { console.error(error); toast(error.message || String(error), 'err'); }
    });
  };

  window.undoLastAccountTransaction = function () {
    const last = activeAccountTransactions()[0];
    if (!last) { toast('No active account transaction is available to undo.', 'warn'); return; }
    undoAccountTransaction(last.id);
  };

  viewAccounts = function () {
    const tabs = [['debtors', 'Debtors'], ['creditors', 'Creditors'], ['depositors', 'Depositors']];
    const list = DB[accTab] || [];
    const accountRows = list.map((account) => `<tr>
      <td class="mono" style="font-size:11px">${esc(account.id)}</td>
      <td>${esc(account.name)}</td><td>${esc(account.contact || '')}</td>
      <td>${esc(account.description || '')}</td>
      <td class="mono right">${fmt(account.balance)}</td>
      <td style="font-size:11px">${account.date ? new Date(account.date).toLocaleDateString() : ''}</td>
      <td><div class="row">
        <button class="btn sm" onclick="openSettle('${escAttr(accTab)}','${escAttr(account.id)}')">Settle</button>
        <button class="btn sm danger" onclick="deleteAccountHolder('${escAttr(accTab)}','${escAttr(account.id)}')">Delete</button>
      </div></td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty">No ${esc(accTab)}</td></tr>`;

    const transactionRows = DB.accountTxns.slice().reverse().slice(0, 40).map((txn) => {
      const undone = txn.status === UNDONE;
      return `<tr class="${undone ? 'status-undone' : ''}">
        <td class="mono" style="font-size:11px">${esc(txn.id)}</td>
        <td>${esc(txn.accountType)}</td><td>${esc(txn.name)}</td><td>${esc(txn.txnType)}</td>
        <td class="mono right">${fmtN(txn.amount)}</td>
        <td class="mono right">${fmtN(txn.balanceAfter)}</td>
        <td>${esc(txn.receiptNo || '')}</td>
        <td>${undone ? '<span class="badge warn">UNDONE</span>' : `<button class="btn sm ghost" onclick="undoAccountTransaction('${escAttr(txn.id)}')">Undo</button>`}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">None</td></tr>';

    return `<div class="tabs">${tabs.map(([key, label]) => `<button class="${accTab === key ? 'active' : ''}" onclick="accTab='${key}';render()">${label}</button>`).join('')}</div>
      <div class="grid g2">
        <div class="card">
          <h3>Add ${esc(accTab.slice(0, -1))}</h3>
          <div class="field"><label>Name</label><input id="acName" /></div>
          <div class="field"><label>Contact / Phone</label><input id="acContact" /></div>
          <div class="field"><label>Description</label><input id="acDesc" /></div>
          <div class="field"><label>Opening balance (GH₵)</label><input id="acBal" type="number" step="0.01" value="0" /></div>
          <button class="btn" onclick="addAccount()">Save</button>
        </div>
        <div class="card">
          <h3>Register · total ${fmt(accTab === 'debtors' ? KPI_TotalOutstandingDebt() : accTab === 'creditors' ? KPI_TotalCreditors() : KPI_TotalDeposits())}</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Desc</th><th class="right">Balance</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>${accountRows}</tbody>
          </table></div>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h3 style="margin:0">Recent account transactions</h3>
          <div class="row">
            <button class="btn sm ghost" onclick="undoLastAccountTransaction()">Undo last account transaction</button>
            <button class="btn sm ghost" onclick="nav('undo')">Open full Undo tab</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Txn</th><th class="right">Amount</th><th class="right">Bal after</th><th>Receipt</th><th>Action</th></tr></thead>
          <tbody>${transactionRows}</tbody>
        </table></div>
      </div>`;
  };

  function viewUndoTransactions() {
    const inventory = activeInventoryTransactions().slice(0, 60);
    const accounts = activeAccountTransactions().slice(0, 60);
    const inventoryRows = inventory.map((txn) => `<tr>
      <td style="font-size:11px">${txn.date ? new Date(txn.date).toLocaleString() : ''}</td>
      <td>${esc(txn.type === 'STOCK_IN' ? 'Stock In' : (txn.subtype === 'QUICK' ? 'Quick Sale Out' : 'Sale Out'))}${txn.legacy ? ' <span class="badge warn">LEGACY</span>' : ''}</td>
      <td>${esc(txn.reference || txn.product || '')}</td>
      <td>${esc(txn.product || '')}</td>
      <td class="mono right">${fmtN(txn.qty)}</td>
      <td class="mono right">${txn.amount ? fmt(txn.amount) : '—'}</td>
      <td>${esc(txn.cashier || '')}</td>
      <td><button class="btn sm danger" onclick="undoInventoryTransaction('${escAttr(txn.id)}')">Undo selected</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty">No active Sale Out or Stock In transaction is available.</td></tr>';

    const accountRows = accounts.map((txn) => `<tr>
      <td style="font-size:11px">${txn.date ? new Date(txn.date).toLocaleString() : ''}</td>
      <td>${esc(txn.accountType)}</td>
      <td>${esc(txn.name)}</td>
      <td>${esc(txn.txnType)}</td>
      <td class="mono right">${fmtN(txn.amount)}</td>
      <td class="mono right">${fmtN(txn.balanceAfter)}</td>
      <td>${esc(txn.receiptNo || '')}</td>
      <td><button class="btn sm danger" onclick="undoAccountTransaction('${escAttr(txn.id)}')">Undo selected</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty">No active account transaction is available.</td></tr>';

    return `<div class="undo-note">
      Reversal is restricted to administrators and requires the Admin PIN. Sale reversal restores FIFO stock, adjusts sales/profit values, reverses linked debtor credit, and marks the receipt VOID. Stock In reversal is blocked if the units have already been sold.
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Sale Out and Stock In</h3>
        <button class="btn warn" onclick="undoLastInventoryTransaction()">Undo last inventory transaction</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Type</th><th>Reference</th><th>Product(s)</th><th class="right">Qty</th><th class="right">Value</th><th>Cashier</th><th>Action</th></tr></thead>
        <tbody>${inventoryRows}</tbody>
      </table></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Debtors, Creditors and Depositors</h3>
        <button class="btn warn" onclick="undoLastAccountTransaction()">Undo last account transaction</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Account type</th><th>Holder</th><th>Transaction</th><th class="right">Amount</th><th class="right">Balance after</th><th>Receipt</th><th>Action</th></tr></thead>
        <tbody>${accountRows}</tbody>
      </table></div>
    </div>`;
  }

  window.viewKPICharts = viewKPICharts;
  window.viewUndoTransactions = viewUndoTransactions;
  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.operationsUpdate = {
    build: BUILD,
    version: 'M3.1',
    printReceiptDocument,
    activeInventoryTransactions,
    activeAccountTransactions
  };

  ensureOperationsModel();
  injectStyles();
  installNavigation();
}());

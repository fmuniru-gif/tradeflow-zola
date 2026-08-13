/* ZEZMS TradeFlow — Operations Update retained in M4
   Receipt print matching, Sales Records, transaction reversal, account deletion,
   and KPI bar-chart dashboard. */
(function () {
  'use strict';

  const BUILD = '20260813-document-branding-r42';
  const DOCUMENT_WATERMARK_URL = new URL('assets/zez-document-watermark.jpg', document.baseURI).href;
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
    if (!Array.isArray(DB.cashLog)) { DB.cashLog = []; changed = true; }
    DB.cashLog.forEach((entry) => {
      if (!entry.status) { entry.status = ACTIVE; changed = true; }
      if (!entry.meta || typeof entry.meta !== 'object') { entry.meta = {}; changed = true; }
    });
    if (!Array.isArray(DB.expenses)) { DB.expenses = []; changed = true; }
    DB.expenses.forEach((expense) => {
      if (!expense.status) { expense.status = ACTIVE; changed = true; }
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
      .chart-card{min-height:390px}
      .vertical-bar-chart{
        display:grid;
        grid-template-columns:repeat(var(--bar-count,4),minmax(0,1fr));
        gap:12px;
        align-items:end;
        margin-top:16px;
        min-height:292px;
        padding:12px 8px 0;
        border-bottom:1px solid #475569;
        background:
          repeating-linear-gradient(
            to top,
            transparent 0,
            transparent 57px,
            rgba(71,85,105,.24) 58px
          );
      }
      .vertical-bar-item{
        min-width:0;
        height:278px;
        display:grid;
        grid-template-rows:minmax(0,1fr) auto;
        gap:8px;
        align-items:end;
      }
      .vertical-bar-stage{
        height:228px;
        min-width:0;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        align-items:center;
      }
      .vertical-bar-value{
        width:100%;
        min-height:34px;
        margin-bottom:6px;
        text-align:center;
        color:var(--text);
        font-variant-numeric:tabular-nums;
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        font-size:11px;
        font-weight:800;
        line-height:1.2;
        overflow-wrap:anywhere;
      }
      .vertical-bar-column{
        width:min(66px,76%);
        min-height:0;
        height:var(--bar-height,0%);
        border-radius:9px 9px 3px 3px;
        background:linear-gradient(180deg,var(--teal2),var(--teal));
        box-shadow:0 0 0 1px rgba(255,255,255,.06) inset;
        transition:height .35s ease;
      }
      .vertical-bar-column.money-alt{background:linear-gradient(180deg,#60a5fa,#2563eb)}
      .vertical-bar-column.profit{background:linear-gradient(180deg,#4ade80,#15803d)}
      .vertical-bar-column.negative{background:linear-gradient(180deg,#ef4444,#991b1b)}
      .vertical-bar-column.qty{background:linear-gradient(180deg,#fbbf24,#b45309)}
      .vertical-bar-label{
        min-height:36px;
        text-align:center;
        color:var(--text);
        font-size:11px;
        font-weight:750;
        line-height:1.2;
        overflow-wrap:anywhere;
      }
      .chart-legend{font-size:11px;color:var(--muted);margin-top:14px}
      .void-row td{opacity:.72;text-decoration:none;background:rgba(100,116,139,.12)!important}
      .receipt-actions{display:flex;gap:5px;flex-wrap:wrap}
      .receipt-paper{position:relative;isolation:isolate;overflow:hidden;width:min(100%,148mm);min-height:210mm;margin:0 auto}
      .receipt-paper .document-branding-watermark{position:absolute;inset:0;z-index:0;background-image:url("${DOCUMENT_WATERMARK_URL}");background-position:center;background-repeat:no-repeat;background-size:100% 100%;opacity:.10;pointer-events:none}
      .receipt-paper .receipt-document-content{position:relative;z-index:1}
      .receipt-title{text-align:center;color:#00f;font-weight:800;font-size:18px;letter-spacing:1px}
      .receipt-business{margin-top:8px}
      .receipt-meta{display:flex;justify-content:space-between;gap:16px;margin-top:8px}
      .receipt-customer{margin-top:10px}
      .receipt-items{width:100%;margin-top:10px;border-collapse:collapse;font-size:11px}
      .receipt-items th,.receipt-items td{padding:6px 4px;border-bottom:1px solid #64748b;position:static}
      .receipt-items th:first-child,.receipt-items td:first-child{text-align:left}
      .receipt-items th:not(:first-child){text-align:right}
      .receipt-table-head th{background:#1e293b!important;color:#fff!important;font-weight:700}
      .receipt-num{text-align:right;font-variant-numeric:tabular-nums}
      .receipt-center{text-align:center}
      .receipt-summary{margin-top:10px;text-align:right;color:#111;font-variant-numeric:tabular-nums}
      .receipt-paid{margin-top:6px}
      .receipt-signature{margin-top:14px;color:#111}
      .approved-stamp{display:inline-flex;align-items:center;justify-content:center;margin:0 0 8px 12mm;padding:4px 12px;border:2px solid #0f6f4b;border-radius:5px;color:#0f6f4b;background:rgba(255,255,255,.42);font:900 11px/1 Arial,Helvetica,sans-serif;letter-spacing:1.4px;transform:rotate(-2deg)}
      .receipt-thanks{text-align:center;margin-top:14px;font-size:16px;font-weight:800;color:#111}
      .receipt-void-watermark{position:absolute;inset:42% 0 auto;text-align:center;font-size:52px;font-weight:900;color:rgba(185,28,28,.23);transform:rotate(-20deg);letter-spacing:8px}
      .receipt-void-label,.receipt-void-note{color:#b91c1c}
      .receipt-void-note{margin-top:10px;font-size:10px}
      .undo-note{border-left:4px solid var(--amber);padding:10px 12px;background:rgba(245,158,11,.08);border-radius:8px;font-size:12px;color:var(--muted)}
      .status-undone{opacity:.6;text-decoration:line-through}
      .sales-record-search{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;align-items:end;margin:12px 0}
      .sales-record-search .field{margin:0}
      .account-undo-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .account-select-cell{text-align:center;width:52px}
      .account-select-cell input{width:20px;height:20px;accent-color:var(--teal);cursor:pointer}
      .account-txn-selected td{background:rgba(20,184,166,.12)!important}
      .cash-undo-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .cash-select-cell{text-align:center;width:52px}
      .cash-select-cell input{width:20px;height:20px;accent-color:var(--teal);cursor:pointer}
      .cash-txn-selected td{background:rgba(20,184,166,.12)!important}
      .cash-link-note{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.25}
      @media(max-width:720px){
        .sales-record-search{grid-template-columns:minmax(0,1fr) auto}
        .sales-record-search .search-count{grid-column:1/-1;justify-self:start}
        .account-undo-toolbar,.cash-undo-toolbar{width:100%}
        .account-undo-toolbar .btn,.cash-undo-toolbar .btn{flex:1 1 150px}
        .chart-card{min-height:0}
        .vertical-bar-chart{
          gap:7px;
          min-height:272px;
          padding-left:2px;
          padding-right:2px;
        }
        .vertical-bar-item{height:258px;gap:7px}
        .vertical-bar-stage{height:208px}
        .vertical-bar-value{font-size:9.5px;min-height:32px}
        .vertical-bar-column{width:min(52px,78%)}
        .vertical-bar-label{font-size:10px;min-height:38px}
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

  function barChartHTML(title, items, valueFormatter, legendText) {
    const safeItems = Array.isArray(items) ? items : [];
    const max = Math.max(1, ...safeItems.map((item) => Math.abs(Number(item.value) || 0)));

    const columns = safeItems.length
      ? safeItems.map((item) => {
          const raw = Number(item.value) || 0;
          const height = raw === 0 ? 0 : Math.max(3, Math.min(100, (Math.abs(raw) / max) * 100));
          const classes = ['vertical-bar-column', item.className || '', raw < 0 ? 'negative' : '']
            .filter(Boolean)
            .join(' ');

          return `<div class="vertical-bar-item" title="${escAttr(item.label + ': ' + valueFormatter(raw))}">
            <div class="vertical-bar-stage">
              <div class="vertical-bar-value">${esc(valueFormatter(raw))}</div>
              <div class="${classes}" style="--bar-height:${height.toFixed(2)}%"></div>
            </div>
            <div class="vertical-bar-label">${esc(item.label)}</div>
          </div>`;
        }).join('')
      : '<div class="empty" style="grid-column:1/-1;padding:90px 8px">No quantity-sold data is available for this selection.</div>';

    return `<div class="card chart-card">
      <h3>${esc(title)}</h3>
      <div class="vertical-bar-chart" style="--bar-count:${Math.max(1, safeItems.length)}">${columns}</div>
      <div class="chart-legend">${esc(legendText || 'Columns are scaled within this chart for the selected month and year.')}</div>
    </div>`;
  }

  function monthQtySold(year, month) {
    const rows = DB.stockRows.filter((row) => Number(row.year) === Number(year) && Number(row.month) === Number(month));
    if (rows.length) {
      return rows.reduce((sum, row) => sum + (Number(row.qtyOut) || 0), 0);
    }
    const archived = DB.kpiHistory.find((item) => Number(item.year) === Number(year) && Number(item.month) === Number(month));
    return archived ? (Number(archived.qtyOut) || 0) : 0;
  }

  function topFiveMonthsByQtySold(year) {
    return Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: monthName(index + 1),
      value: monthQtySold(year, index + 1),
      className: 'qty'
    }))
      .filter((item) => item.value > 0)
      .sort((a, b) => (b.value - a.value) || (a.month - b.month))
      .slice(0, 5)
      .map((item, index) => Object.assign({}, item, { label: (index + 1) + '. ' + item.label }));
  }

  function stockRowCategory(row) {
    const direct = String(row.category || '').trim();
    if (direct) return direct;
    const product = DB.products.find((item) =>
      (row.productId && item.id === row.productId)
      || String(item.name || '').trim().toLowerCase() === String(row.productName || '').trim().toLowerCase()
    );
    return product && String(product.category || '').trim()
      ? String(product.category).trim()
      : 'Uncategorised';
  }

  function topFiveCategoriesByQtySold(year, month) {
    const totals = Object.create(null);
    DB.stockRows
      .filter((row) => Number(row.year) === Number(year) && Number(row.month) === Number(month))
      .forEach((row) => {
        const qty = Number(row.qtyOut) || 0;
        if (qty <= 0) return;
        const category = stockRowCategory(row);
        totals[category] = (totals[category] || 0) + qty;
      });

    return Object.entries(totals)
      .map(([label, value]) => ({ label, value, className: 'qty' }))
      .sort((a, b) => (b.value - a.value) || a.label.localeCompare(b.label))
      .slice(0, 5)
      .map((item, index) => Object.assign({}, item, { label: (index + 1) + '. ' + item.label }));
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
    const topMonths = topFiveMonthsByQtySold(DB.selectedYear);
    const topCategories = topFiveCategoriesByQtySold(DB.selectedYear, DB.selectedMonth);
    const selectedPeriod = monthName(DB.selectedMonth) + ' ' + DB.selectedYear;

    return periodSelectorHTML(true) + `
      <div class="grid kpi-chart-stack">
        ${barChartHTML('Financial KPI Bar Chart', moneyItems, (value) => fmt(value), 'Values use the selected month and year.')}
        ${barChartHTML('Stock Quantity Bar Chart', qtyItems, (value) => fmtN(value), 'Quantities use the selected month and year.')}
        ${barChartHTML('Top 5 Months by Quantity Sold — ' + DB.selectedYear, topMonths, (value) => fmtN(value), 'Ranks months within the selected year using QTY OUT. Closed-month KPI history is used when detailed stock rows are unavailable.')}
        ${barChartHTML('Top 5 Product Categories — ' + selectedPeriod, topCategories, (value) => fmtN(value), 'Ranks product categories in the selected month and year using QTY OUT.')}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 style="margin-bottom:4px">Shared KPI source</h3>
            <div class="muted" style="font-size:12px">All four charts use the same stock records, KPI formulas and Year/Month selections as the original KPI dashboard.</div>
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
    const lineSubtotal = round2(lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
    const subtotal = Number(sale.subtotal != null ? sale.subtotal : lineSubtotal) || 0;
    const vatAmount = round2(Number(sale.vatAmount != null ? sale.vatAmount : total - subtotal) || 0);
    const derivedRate = subtotal > 0 ? round2((vatAmount / subtotal) * 100) : 0;
    const vatRate = normalizeVatPercent(sale.vatRate != null ? sale.vatRate : derivedRate);
    const paid = Number(sale.paid != null ? sale.paid : sale.amountPaid) || 0;
    return {
      receiptNo: sale.receiptNo || sale.id || '',
      customer: sale.customer || sale.customerName || '',
      location: sale.location || '',
      contact: sale.contact || '',
      subtotal,
      vatRate,
      vatAmount,
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
        <td class="receipt-num receipt-center">${fmtN(line.qty)}</td>
        <td class="receipt-num">${fmtN(line.uPrice)}</td>
        <td class="receipt-num">${fmtN(line.disc)}</td>
        <td class="receipt-num">${fmtN(line.total)}</td>
      </tr>`).join('');
    const subtotal = sale.subtotal != null
      ? round2(sale.subtotal)
      : round2(sale.lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
    const vat = sale.vatAmount != null ? round2(sale.vatAmount) : round2(sale.total - subtotal);
    const vatRate = sale.vatRate != null
      ? normalizeVatPercent(sale.vatRate)
      : (subtotal > 0 ? round2((vat / subtotal) * 100) : 0);

    return `<div class="receipt-paper" id="receiptPrint" style="position:relative">
      <div class="document-branding-watermark" aria-hidden="true"></div><div class="receipt-document-content">
      ${sale.voided ? '<div class="receipt-void-watermark">VOID</div>' : ''}
      <div class="receipt-title">SALES RECEIPT</div>
      <div class="receipt-business"><b>${esc(biz.name)}</b><br>${esc(biz.address)}<br>Tel: ${esc(biz.tel)}</div>
      <div class="receipt-meta">
        <div>${sale.voided ? '<b class="receipt-void-label">VOID RECEIPT</b>' : ''}</div>
        <div>Receipt No: <b>${esc(sale.receiptNo)}</b><br>Date: ${formatOrdinalDate(sale.date)}</div>
      </div>
      <div class="receipt-customer">
        Customer: <b>${esc(sale.customer)}</b><br>
        Location: ${esc(sale.location)}<br>
        Telephone: ${esc(sale.contact)}
      </div>
      <table class="receipt-items">
        <thead><tr class="receipt-table-head">
          <th>Product</th>
          <th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th>
        </tr></thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div class="receipt-summary">
        <div>Subtotal: ${fmtN(subtotal)}</div>
        <div>VAT (${fmtN(vatRate)}%): ${fmtN(vat)}</div>
        <div><b>Grand Total: ${fmtN(sale.total)}</b></div>
        <div class="receipt-paid">Amount Paid: ${fmtN(sale.paid)}</div>
        <div>Balance: ${fmtN(sale.balance)}</div>
      </div>
      <div class="receipt-signature">
        <span class="approved-stamp">APPROVED</span><br>
        Cashier Signature: ........................<br>
        <i>${esc(sale.cashier)} (${esc(sale.cashierTel)})</i>
      </div>
      ${sale.voided ? `<div class="receipt-void-note">Voided ${sale.voidedAt ? new Date(sale.voidedAt).toLocaleString() : ''}${sale.voidedBy ? ' by ' + esc(sale.voidedBy) : ''}</div>` : ''}
      <div class="receipt-thanks">Thank you for your business!</div></div>
    </div>`;
  }

  showReceiptModal = function (source) {
    activeReceiptPayload = normalizeReceiptPayload(source);
    openModal(`
      ${receiptPaperHTML(activeReceiptPayload)}
      <div class="row" style="margin-top:12px">
        <button class="btn" onclick="printActiveReceipt()">Print one copy</button>
        <button class="btn ghost" onclick="closeModal();render()">Close</button>
        ${isElevated() ? '<button class="btn ghost" onclick="closeModal();nav(\'receipts\')">Sales Records</button>' : ''}
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
        @page{size:A5 portrait;margin:7mm}
        *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        html,body{margin:0;padding:0;width:100%;background:#fff;color:#111;font-family:"Courier New",ui-monospace,Menlo,Consolas,monospace}
        body{display:block;position:relative}
        body::before{content:"";position:fixed;z-index:0;top:-7mm;left:-7mm;width:148mm;height:210mm;background-image:url("${esc(DOCUMENT_WATERMARK_URL)}");background-position:center;background-repeat:no-repeat;background-size:100% 100%;opacity:.10;pointer-events:none}
        .receipt-paper{position:relative;z-index:1;width:100%;max-width:none;margin:0;padding:5.5mm 6mm;background:transparent;color:#111;border:1px solid #cbd5e1;border-radius:2mm;font-size:9.6pt;line-height:1.42;overflow:hidden}
        .document-branding-watermark{display:none}.receipt-document-content{position:relative;z-index:1}
        .receipt-title{text-align:center;color:#0000ff;font-weight:800;font-size:15pt;letter-spacing:1.1px}
        .receipt-business{margin-top:4.5mm}
        .receipt-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(58mm,auto);gap:5mm;margin-top:3mm;align-items:start}
        .receipt-meta>div:last-child{overflow-wrap:anywhere;word-break:break-word}
        .receipt-customer{margin-top:3.5mm}
        .receipt-items{width:100%;margin-top:4mm;border-collapse:collapse;table-layout:fixed;font-size:8.8pt}
        .receipt-items th,.receipt-items td{padding:2.2mm 1.25mm;border-bottom:1px solid #64748b;vertical-align:top;overflow-wrap:anywhere}
        .receipt-items th:nth-child(1),.receipt-items td:nth-child(1){width:38%;text-align:left}
        .receipt-items th:nth-child(2),.receipt-items td:nth-child(2){width:10%}
        .receipt-items th:nth-child(3),.receipt-items td:nth-child(3){width:18%}
        .receipt-items th:nth-child(4),.receipt-items td:nth-child(4){width:16%}
        .receipt-items th:nth-child(5),.receipt-items td:nth-child(5){width:18%}
        .receipt-items th:not(:first-child){text-align:right}
        .receipt-table-head th{background:#1e293b!important;color:#fff!important;font-weight:700;white-space:normal}
        .receipt-num{text-align:right;font-variant-numeric:tabular-nums}
        .receipt-center{text-align:center}
        .receipt-summary{margin-top:4mm;text-align:right;font-variant-numeric:tabular-nums}
        .receipt-paid{margin-top:2.5mm}
        .receipt-signature{margin-top:5mm}
        .approved-stamp{display:inline-flex;align-items:center;justify-content:center;margin:0 0 2.5mm 12mm;padding:1.2mm 3.5mm;border:0.55mm solid #0f6f4b;border-radius:1.4mm;color:#0f6f4b;background:rgba(255,255,255,.42);font:900 8.5pt/1 Arial,Helvetica,sans-serif;letter-spacing:1pt;transform:rotate(-2deg)}
        .receipt-thanks{text-align:center;margin-top:5mm;font-size:12pt;font-weight:800}
        .receipt-void-watermark{position:absolute;inset:42% 0 auto;text-align:center;font-size:36pt;font-weight:900;color:rgba(185,28,28,.22);transform:rotate(-20deg);letter-spacing:7px}
        .receipt-void-label,.receipt-void-note{color:#b91c1c}
        .receipt-void-note{margin-top:3mm;font-size:8.5pt}
        @media print{
          html,body{width:100%;height:auto}
          .receipt-paper{break-inside:avoid;page-break-inside:avoid}
        }
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
    }, 300);
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

  function quickSaleDetailsHTML(transaction) {
    const lines = transaction && transaction.details && Array.isArray(transaction.details.lines)
      ? transaction.details.lines
      : [];
    const rows = lines.map((line) => `<tr>
      <td>${esc(line.product || '')}</td>
      <td class="mono right">${fmtN(line.qty)}</td>
      <td class="mono right">${fmtN(line.price)}</td>
      <td class="mono right">${fmtN(line.disc || 0)}</td>
      <td class="mono right">${fmtN(line.amount)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">No item details were stored for this quick sale.</td></tr>';

    return `<h3>Quick Sale Out</h3>
      <div class="statline"><span>Transaction number</span><b class="mono">${esc(transaction.id || '')}</b></div>
      <div class="statline"><span>Date</span><b>${transaction.date ? new Date(transaction.date).toLocaleString() : '—'}</b></div>
      <div class="statline"><span>Cashier</span><b>${esc(transaction.cashier || '')}</b></div>
      <div class="statline"><span>Total quantity</span><b class="mono">${fmtN(transaction.qty)}</b></div>
      <div class="statline"><span>Sale amount</span><b class="mono">${fmt(transaction.amount)}</b></div>
      <div class="statline"><span>Status</span><b>${transaction.status === UNDONE ? 'UNDONE' : 'COMPLETED'}</b></div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Discount</th><th class="right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">Close</button></div>`;
  }

  window.showQuickSaleRecord = function (transactionId) {
    ensureOperationsModel();
    const transaction = DB.inventoryTxns.find((item) => item.id === transactionId && item.type === 'SALE_OUT' && item.subtype === 'QUICK');
    if (!transaction) {
      toast('Quick sale record not found.', 'err');
      return;
    }
    openModal(quickSaleDetailsHTML(transaction));
  };

  window.filterSalesRecordsByName = function () {
    const input = document.getElementById('receiptNameSearch');
    const query = String(input && input.value || '').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('#salesRecordsBody tr.sales-record-row'));
    let visible = 0;

    rows.forEach((row) => {
      const customer = String(row.dataset.customerName || '').toLowerCase();
      const show = !query || customer.includes(query);
      row.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    const noMatch = document.getElementById('salesRecordsNoMatch');
    if (noMatch) noMatch.style.display = rows.length && !visible ? '' : 'none';
    const count = document.getElementById('salesRecordsSearchCount');
    if (count) {
      count.textContent = query
        ? visible + (visible === 1 ? ' matching receipt' : ' matching receipts')
        : rows.length + (rows.length === 1 ? ' sales record' : ' sales records');
    }
  };

  window.clearSalesRecordsNameSearch = function () {
    const input = document.getElementById('receiptNameSearch');
    if (input) {
      input.value = '';
      input.focus();
    }
    filterSalesRecordsByName();
  };

  viewReceipts = function () {
    ensureOperationsModel();
    const today = new Date();
    const isToday = (iso) => {
      const date = new Date(iso);
      return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    };

    const receiptRecords = DB.receipts.map((receipt) => ({
      kind: 'RECEIPT',
      id: receipt.receiptNo,
      date: receipt.date,
      cashier: receipt.cashier || '',
      customer: receipt.customerName || '',
      contact: receipt.contact || '',
      total: Number(receipt.totalAmount) || 0,
      balance: Number(receipt.balance) || 0,
      status: receipt.voided || receipt.status === 'VOID' || receipt.status === UNDONE
        ? 'VOID'
        : ((receipt.credit || Number(receipt.balance) > 0) ? 'CREDIT' : 'PAID'),
      source: receipt
    }));

    const quickRecords = DB.inventoryTxns
      .filter((transaction) => transaction.type === 'SALE_OUT' && transaction.subtype === 'QUICK')
      .map((transaction) => ({
        kind: 'QUICK',
        id: transaction.id,
        date: transaction.date,
        cashier: transaction.cashier || '',
        customer: 'Walk-in / not captured',
        contact: '',
        total: Number(transaction.amount) || 0,
        balance: 0,
        status: transaction.status === UNDONE ? 'UNDONE' : 'COMPLETED',
        source: transaction
      }));

    let list = receiptRecords.concat(quickRecords)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    let note = 'All Sale Out transactions · printed receipts and quick sales';

    if (session.isCashier2 && !isElevated()) {
      list = list.filter((record) => record.cashier === session.cashier && isToday(record.date));
      note = 'Your Sale Out transactions today only';
    }

    const rows = list.map((record) => {
      const isVoid = record.status === 'VOID' || record.status === 'UNDONE';
      const isCredit = record.status === 'CREDIT';
      const typeBadge = record.kind === 'QUICK'
        ? '<span class="badge warn">QUICK SALE</span>'
        : '<span class="badge ok">RECEIPT SALE</span>';
      const statusBadge = isVoid
        ? `<span class="badge bad">${esc(record.status)}</span>`
        : (isCredit ? '<span class="badge bad">CREDIT</span>' : `<span class="badge ok">${esc(record.status)}</span>`);
      const actions = record.kind === 'RECEIPT'
        ? `<div class="receipt-actions">
            <button class="btn sm ghost" onclick="showStoredReceipt('${escAttr(record.id)}')">View</button>
            <button class="btn sm" onclick="printStoredReceipt('${escAttr(record.id)}')">🖨 Reprint</button>
          </div>`
        : `<div class="receipt-actions">
            <button class="btn sm ghost" onclick="showQuickSaleRecord('${escAttr(record.id)}')">View details</button>
          </div>`;

      return `<tr class="sales-record-row ${isVoid ? 'void-row' : (isCredit ? 'credit-row' : '')}" data-customer-name="${escAttr(record.customer)}">
        <td>${typeBadge}</td>
        <td class="mono" style="font-size:11px">${esc(record.id)}</td>
        <td>${esc(record.customer)}</td>
        <td>${esc(record.contact || '—')}</td>
        <td class="mono right">${fmt(record.total)}</td>
        <td class="mono right">${record.balance > 0 ? fmt(record.balance) : '—'}</td>
        <td style="font-size:11px">${record.date ? new Date(record.date).toLocaleString() : '—'}</td>
        <td>${esc(record.cashier)}</td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    const emptyRow = list.length
      ? ''
      : `<tr><td colspan="10" class="empty">${session.isCashier2 && !isElevated() ? 'No sales records for you today yet.' : 'No Sale Out records yet.'}</td></tr>`;

    return `<div class="card">
      <h3>Sales records <span class="muted" style="font-weight:400">(${esc(note)})</span></h3>
      <div class="sales-record-search">
        <div class="field">
          <label>Search receipt by customer name</label>
          <input id="receiptNameSearch" type="search" placeholder="Type all or part of the customer name" autocomplete="off" oninput="filterSalesRecordsByName()" />
        </div>
        <button class="btn ghost" type="button" onclick="clearSalesRecordsNameSearch()">Clear</button>
        <span id="salesRecordsSearchCount" class="pill search-count">${list.length} ${list.length === 1 ? 'sales record' : 'sales records'}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Sale type</th><th>Record #</th><th>Customer</th><th>Contact</th><th class="right">Total</th><th class="right">Balance owed</th><th>Date</th><th>Cashier</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="salesRecordsBody">${rows}${emptyRow}<tr id="salesRecordsNoMatch" style="display:none"><td colspan="10" class="empty">No receipt matches that customer name.</td></tr></tbody>
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
    const saleDate = nowISO();
    const currentPeriod = getLatestMonth();
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
      date: saleDate,
      year: currentPeriod.year,
      month: currentPeriod.month,
      cashier: session.cashier,
      cashierTel: session.tel,
      product: lines.map((line) => line.product).join(', '),
      qty: lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
      amount: lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
      reference: transactionId,
      details: { lines, saleMode: 'QUICK' }
    });
    saveDB();
    resetSaleOutForm();
    toast('Quick Sale Out recorded · ' + transactionId);
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
    return function (type, action, amount, note, meta) {
      const beforeLength = DB.cashLog.length;
      baseAdjustCash(type, action, amount, note);
      const entry = DB.cashLog.length > beforeLength ? DB.cashLog[DB.cashLog.length - 1] : null;
      if (entry) {
        entry.status = ACTIVE;
        entry.meta = Object.assign(
          { source: 'DIRECT_CASH' },
          entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
          meta && typeof meta === 'object' ? meta : {}
        );
      }
      return entry;
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
    const accountTxn = logAccountTxn(id, kind.slice(0, -1).toUpperCase(), account.name, direction === 'REDUCE' ? 'SETTLE' : 'INCREASE', signed, account.balance, '', {
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
    if (cashEntry) {
      cashEntry.meta = Object.assign({}, cashEntry.meta || {}, {
        source: 'ACCOUNT_TRANSACTION',
        accountTxnId: accountTxn.id,
        accountKind: kind,
        accountId: id
      });
    }
    saveDB();
    closeModal();
    toast('Settlement posted');
    render();
  };


  addExpense = function () {
    const description = ($('exDesc').value || '').trim();
    const category = $('exCat').value;
    const amount = Number($('exAmt').value) || 0;
    const date = $('exDate').value || new Date().toISOString().slice(0, 10);
    const wallet = $('exWallet').value;
    if (!description) { toast('Description required', 'err'); return; }
    if (amount <= 0) { toast('Amount must be > 0', 'err'); return; }

    const expenseId = idStamp('EXP-');
    let cashEntry = null;
    if (wallet) {
      if (amount > (Number(DB.cashBalances[wallet]) || 0) + 1e-9) {
        toast('Insufficient wallet balance', 'err');
        return;
      }
      cashEntry = adjustCash(wallet, 'Deduct', amount, 'Expense: ' + description, {
        source: 'EXPENSE',
        expenseId
      });
    }

    DB.expenses.push({
      id: expenseId,
      description,
      category,
      amount,
      date: new Date(date).toISOString(),
      cashier: session.cashier,
      status: ACTIVE,
      wallet: wallet || '',
      cashLogId: cashEntry ? cashEntry.id : ''
    });

    if (cashEntry) {
      cashEntry.meta = Object.assign({}, cashEntry.meta || {}, {
        source: 'EXPENSE',
        expenseId
      });
    }

    saveDB();
    toast('Expense saved');
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


  function accountTransactionKind(txn) {
    return (txn && txn.meta && txn.meta.kind) || normalizeAccountKind(txn && txn.accountType);
  }

  function activeAccountTransactionsForTab(kind) {
    return activeAccountTransactions().filter((txn) => accountTransactionKind(txn) === kind);
  }

  window.highlightSelectedAccountEntry = function (radio) {
    document.querySelectorAll('#accountTransactionBody tr.account-transaction-row').forEach((row) => {
      row.classList.remove('account-txn-selected');
    });
    if (radio && radio.closest('tr')) radio.closest('tr').classList.add('account-txn-selected');
  };

  function reverseCashForAccountTxn(txn, reason) {
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
      cashLog.undoReason = String(reason || '').trim();
      cashLog.undoSource = 'ACCOUNT_TRANSACTION';
      cashLog.linkedUndoId = txn.id;
      cashLog.balanceAfterUndo = Number(DB.cashBalances[meta.wallet]) || 0;
    }
  }

  function performAccountUndo(transactionId, reason) {
    const txn = DB.accountTxns.find((item) => item.id === transactionId);
    if (!txn) throw new Error('Account transaction not found.');
    if (txn.status === UNDONE) throw new Error('This account transaction has already been undone.');

    if (String(txn.txnType || '').toLowerCase().includes('credit sale') && txn.receiptNo) {
      const message = reverseReceiptSale(txn.receiptNo);
      txn.undoReason = String(reason || '').trim();
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
      reverseCashForAccountTxn(txn, reason);
      account.balance = round2((Number(account.balance) || 0) - (Number(txn.amount) || 0));
      if (Math.abs(account.balance) < 0.005) account.balance = 0;
      account.date = nowISO();
    }

    txn.status = UNDONE;
    txn.undoneAt = nowISO();
    txn.undoneBy = session.cashier;
    txn.undoReason = String(reason || '').trim();
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
      const saleWarning = String(txn.txnType || '').toLowerCase().includes('credit sale')
        ? '\n\nThis entry is linked to a credit sale. Undoing it will reverse the whole sale, restore stock and mark the receipt VOID.'
        : '';
      if (!confirm('Undo ' + txn.txnType + ' for ' + txn.name + ' (' + fmtN(txn.amount) + ')?' + warning + saleWarning)) return;
      const reason = String(prompt('Reason for undo (optional)', 'Incorrect entry') || '').trim();
      try { performAccountUndo(transactionId, reason); }
      catch (error) { console.error(error); toast(error.message || String(error), 'err'); }
    });
  };

  window.undoLastAccountTransaction = function () {
    const last = activeAccountTransactionsForTab(accTab)[0];
    if (!last) { toast('No active ' + accTab.slice(0, -1) + ' entry is available to undo.', 'warn'); return; }
    undoAccountTransaction(last.id);
  };

  window.undoSelectedAccountTransaction = function () {
    const selected = document.querySelector('input[name="accountTxnSelection"]:checked');
    if (!selected) { toast('Select an active account entry first.', 'warn'); return; }
    undoAccountTransaction(selected.value);
  };


  /* ---------------- Cash balance transaction undo ---------------- */
  function activeCashTransactions() {
    ensureOperationsModel();
    return DB.cashLog
      .filter((entry) => entry && entry.status !== UNDONE)
      .slice()
      .sort((a, b) => new Date(b.at || b.date || 0) - new Date(a.at || a.date || 0));
  }

  function accountTransactionForCash(cashLogId, activeOnly) {
    return DB.accountTxns.find((txn) => {
      if (!txn || !txn.meta || String(txn.meta.cashLogId || '') !== String(cashLogId || '')) return false;
      return !activeOnly || txn.status !== UNDONE;
    }) || null;
  }

  function expenseForCash(cashLogId, activeOnly) {
    return DB.expenses.find((expense) => {
      if (!expense) return false;
      const linked = String(expense.cashLogId || '') === String(cashLogId || '')
        || String(expense.meta && expense.meta.cashLogId || '') === String(cashLogId || '');
      return linked && (!activeOnly || expense.status !== UNDONE);
    }) || null;
  }

  function reverseStandaloneCashBalance(entry) {
    const wallet = String(entry.cashType || '');
    if (!wallet || !Object.prototype.hasOwnProperty.call(DB.cashBalances, wallet)) {
      throw new Error('The cash wallet for this entry could not be identified.');
    }

    const amount = Math.abs(Number(entry.amount) || 0);
    if (amount <= 0) throw new Error('The cash amount is invalid.');

    const action = String(entry.action || '').trim().toLowerCase();
    const current = Number(DB.cashBalances[wallet]) || 0;

    if (action === 'add') {
      if (current + 1e-9 < amount) {
        throw new Error(
          'This cash addition cannot be undone because ' + wallet
          + ' currently contains less than ' + fmt(amount) + '.'
        );
      }
      DB.cashBalances[wallet] = round2(current - amount);
    } else if (action === 'deduct') {
      DB.cashBalances[wallet] = round2(current + amount);
    } else {
      throw new Error('Only Add and Deduct cash entries can be undone.');
    }

    return Number(DB.cashBalances[wallet]) || 0;
  }

  function markCashEntryUndone(entry, reason, source, linkedId) {
    entry.status = UNDONE;
    entry.undoneAt = nowISO();
    entry.undoneBy = session.cashier;
    entry.undoReason = String(reason || '').trim();
    entry.undoSource = source || 'CASH_BALANCE';
    entry.linkedUndoId = linkedId || '';
    entry.balanceAfterUndo = Number(DB.cashBalances[entry.cashType]) || 0;
  }

  function performCashUndo(cashLogId, reason) {
    const entry = DB.cashLog.find((item) => item && item.id === cashLogId);
    if (!entry) throw new Error('Cash entry not found.');
    if (entry.status === UNDONE) throw new Error('This cash entry has already been undone.');

    const linkedAccount = accountTransactionForCash(cashLogId, true);
    if (linkedAccount) {
      performAccountUndo(linkedAccount.id, reason);
      const updated = DB.cashLog.find((item) => item && item.id === cashLogId);
      if (updated) {
        updated.undoReason = String(reason || '').trim();
        updated.undoSource = 'ACCOUNT_TRANSACTION';
        updated.linkedUndoId = linkedAccount.id;
      }
      saveDB();
      return;
    }

    const linkedExpense = expenseForCash(cashLogId, true);
    if (linkedExpense) {
      reverseStandaloneCashBalance(entry);
      linkedExpense.status = UNDONE;
      linkedExpense.undoneAt = nowISO();
      linkedExpense.undoneBy = session.cashier;
      linkedExpense.undoReason = String(reason || '').trim();
      markCashEntryUndone(entry, reason, 'EXPENSE', linkedExpense.id);
      saveDB();
      toast('Cash movement and linked expense undone.');
      render();
      return;
    }

    reverseStandaloneCashBalance(entry);
    markCashEntryUndone(entry, reason, 'CASH_BALANCE', '');
    saveDB();
    toast('Cash entry undone.');
    render();
  }

  window.highlightSelectedCashEntry = function (radio) {
    document.querySelectorAll('#cashTransactionBody tr.cash-transaction-row').forEach((row) => {
      row.classList.remove('cash-txn-selected');
    });
    if (radio && radio.closest('tr')) radio.closest('tr').classList.add('cash-txn-selected');
  };

  window.undoCashTransaction = function (cashLogId) {
    if (!isElevated()) { toast('Only admin can undo cash entries.', 'err'); return; }
    const entry = activeCashTransactions().find((item) => item.id === cashLogId);
    if (!entry) { toast('Cash entry not found or already undone.', 'err'); return; }

    const linkedAccount = accountTransactionForCash(cashLogId, true);
    const linkedExpense = expenseForCash(cashLogId, true);
    let linkedWarning = '';

    if (linkedAccount) {
      linkedWarning = '\n\nThis movement belongs to an account entry. The account entry and its cash effect will be reversed together.';
    } else if (linkedExpense) {
      linkedWarning = '\n\nThis movement belongs to an expense. The cash movement and the linked expense will both be marked UNDONE.';
    } else if (!entry.meta || !Object.keys(entry.meta).length) {
      linkedWarning = '\n\nThis is a legacy cash entry without a stored source link. Only the wallet balance will be reversed.';
    }

    promptPIN('Admin PIN to undo cash entry', getAdminPIN(), () => {
      const label = String(entry.action || '') + ' ' + fmt(entry.amount)
        + ' in ' + String(entry.cashType || 'cash wallet');
      if (!confirm('Undo ' + label + '?' + linkedWarning)) return;
      const reason = String(prompt('Reason for undo (optional)', 'Incorrect cash entry') || '').trim();
      try {
        performCashUndo(cashLogId, reason);
      } catch (error) {
        console.error(error);
        toast(error.message || String(error), 'err');
      }
    });
  };

  window.undoLastCashTransaction = function () {
    const last = activeCashTransactions()[0];
    if (!last) { toast('No active cash entry is available to undo.', 'warn'); return; }
    undoCashTransaction(last.id);
  };

  window.undoSelectedCashTransaction = function () {
    const selected = document.querySelector('input[name="cashTxnSelection"]:checked');
    if (!selected) { toast('Select an active cash entry first.', 'warn'); return; }
    undoCashTransaction(selected.value);
  };

  viewCash = function () {
    const wallets = CASH_TYPES.map((type) => `<div class="card kpi teal">
      <h3>${esc(type)}</h3>
      <div class="val mono">${fmt(DB.cashBalances[type])}</div>
    </div>`).join('');

    const entries = DB.cashLog
      .slice()
      .sort((a, b) => new Date(b.at || b.date || 0) - new Date(a.at || a.date || 0))
      .slice(0, 100);

    const rows = entries.map((entry) => {
      const undone = entry.status === UNDONE;
      const accountTxn = accountTransactionForCash(entry.id, false);
      const expense = expenseForCash(entry.id, false);
      let source = 'Direct cash entry';
      if (accountTxn) source = 'Account: ' + accountTxn.name + ' · ' + accountTxn.txnType;
      else if (expense) source = 'Expense: ' + expense.description;
      else if (entry.note) source = entry.note;

      const status = undone
        ? `<span class="badge warn">UNDONE</span>${entry.undoReason ? `<div class="cash-link-note">${esc(entry.undoReason)}</div>` : ''}`
        : '<span class="badge ok">ACTIVE</span>';

      return `<tr class="cash-transaction-row ${undone ? 'status-undone' : ''}">
        <td class="cash-select-cell"><input type="radio" name="cashTxnSelection" value="${escAttr(entry.id)}" ${undone ? 'disabled' : ''} onchange="highlightSelectedCashEntry(this)" aria-label="Select cash entry ${escAttr(entry.id)}" /></td>
        <td class="mono" style="font-size:11px">${esc(entry.id)}</td>
        <td>${esc(entry.cashType || '')}</td>
        <td>${esc(entry.action || '')}</td>
        <td class="mono right">${fmtN(entry.amount)}</td>
        <td class="mono right">${entry.before != null ? fmtN(entry.before) : '—'}</td>
        <td class="mono right">${entry.after != null ? fmtN(entry.after) : '—'}</td>
        <td>${esc(source)}${entry.note && source !== entry.note ? `<div class="cash-link-note">${esc(entry.note)}</div>` : ''}</td>
        <td style="font-size:11px">${entry.at ? new Date(entry.at).toLocaleString() : '—'}</td>
        <td>${esc(entry.cashier || '')}</td>
        <td>${status}</td>
        <td>${undone ? '—' : `<button class="btn sm ghost" onclick="undoCashTransaction('${escAttr(entry.id)}')">Undo</button>`}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="12" class="empty">No cash movements yet.</td></tr>';

    return `<div class="grid g4" style="margin-bottom:12px">${wallets}</div>
      <div class="grid g2">
        <div class="card">
          <h3>Add / Deduct</h3>
          <div class="field"><label>Wallet</label>
            <select id="cbType">${CASH_TYPES.map((type) => `<option>${esc(type)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Action</label>
            <select id="cbAction"><option>Add</option><option>Deduct</option></select>
          </div>
          <div class="field"><label>Amount (GH₵)</label><input id="cbAmt" type="number" min="0" step="0.01" value="0" /></div>
          <div class="field"><label>Note</label><input id="cbNote" placeholder="optional" /></div>
          <button class="btn" onclick="doCashMove()">Post</button>
          <div class="statline" style="margin-top:12px"><span>Total buckets</span><b class="mono">${fmt(KPI_CashBuckets_Total())}</b></div>
        </div>
        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <div>
              <h3 style="margin:0">Cash entry history</h3>
              <div class="muted" style="font-size:11px;margin-top:4px">Select an active movement or undo the latest movement. Reversed entries remain visible for audit.</div>
            </div>
            <div class="cash-undo-toolbar">
              <button class="btn sm warn" onclick="undoLastCashTransaction()">Undo last entry</button>
              <button class="btn sm danger" onclick="undoSelectedCashTransaction()">Undo selected entry</button>
            </div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Select</th><th>ID</th><th>Wallet</th><th>Action</th><th class="right">Amount</th><th class="right">Before</th><th class="right">After</th><th>Source / Note</th><th>When</th><th>Who</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="cashTransactionBody">${rows}</tbody>
          </table></div>
        </div>
      </div>`;
  };

  viewAccounts = function () {
    const tabs = [['debtors', 'Debtors'], ['creditors', 'Creditors'], ['depositors', 'Depositors']];
    const list = DB[accTab] || [];
    const singular = accTab.slice(0, -1);
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

    const tabTransactions = DB.accountTxns
      .filter((txn) => accountTransactionKind(txn) === accTab)
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 100);

    const transactionRows = tabTransactions.map((txn) => {
      const undone = txn.status === UNDONE;
      const status = undone
        ? `<span class="badge warn">UNDONE</span>${txn.undoReason ? `<div class="muted" style="font-size:10px;margin-top:3px">${esc(txn.undoReason)}</div>` : ''}`
        : '<span class="badge ok">ACTIVE</span>';
      return `<tr class="account-transaction-row ${undone ? 'status-undone' : ''}">
        <td class="account-select-cell"><input type="radio" name="accountTxnSelection" value="${escAttr(txn.id)}" ${undone ? 'disabled' : ''} onchange="highlightSelectedAccountEntry(this)" aria-label="Select ${escAttr(txn.txnType)} entry for ${escAttr(txn.name)}" /></td>
        <td style="font-size:11px">${txn.date ? new Date(txn.date).toLocaleString() : '—'}</td>
        <td class="mono" style="font-size:11px">${esc(txn.id)}</td>
        <td>${esc(txn.name)}</td><td>${esc(txn.txnType)}</td>
        <td class="mono right">${fmtN(txn.amount)}</td>
        <td class="mono right">${fmtN(txn.balanceAfter)}</td>
        <td>${esc(txn.receiptNo || '')}</td>
        <td>${esc(txn.cashier || '')}</td>
        <td>${status}</td>
        <td>${undone ? '—' : `<button class="btn sm ghost" onclick="undoAccountTransaction('${escAttr(txn.id)}')">Undo</button>`}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="11" class="empty">No account entries for this register.</td></tr>';

    return `<div class="tabs">${tabs.map(([key, label]) => `<button class="${accTab === key ? 'active' : ''}" onclick="accTab='${key}';render()">${label}</button>`).join('')}</div>
      <div class="grid g2">
        <div class="card">
          <h3>Add ${esc(singular)}</h3>
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
          <div>
            <h3 style="margin:0">${esc(singular.charAt(0).toUpperCase() + singular.slice(1))} entry history</h3>
            <div class="muted" style="font-size:11px;margin-top:4px">Select any active entry below, or undo the most recent active entry in this register. Reversed entries remain visible for audit.</div>
          </div>
          <div class="account-undo-toolbar">
            <button class="btn sm warn" onclick="undoLastAccountTransaction()">Undo last entry</button>
            <button class="btn sm danger" onclick="undoSelectedAccountTransaction()">Undo selected entry</button>
            <button class="btn sm ghost" onclick="nav('undo')">Open full Undo tab</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Select</th><th>When</th><th>ID</th><th>Name</th><th>Entry</th><th class="right">Amount</th><th class="right">Balance after</th><th>Receipt/Note</th><th>Cashier</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="accountTransactionBody">${transactionRows}</tbody>
        </table></div>
      </div>`;
  };

  function viewUndoTransactions() {
    const inventory = activeInventoryTransactions().slice(0, 60);
    const accounts = activeAccountTransactions().slice(0, 60);
    const cash = activeCashTransactions().slice(0, 60);
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

    const cashRows = cash.map((entry) => `<tr>
      <td style="font-size:11px">${entry.at ? new Date(entry.at).toLocaleString() : ''}</td>
      <td>${esc(entry.cashType || '')}</td>
      <td>${esc(entry.action || '')}</td>
      <td class="mono right">${fmtN(entry.amount)}</td>
      <td>${esc(entry.note || '')}</td>
      <td>${esc(entry.cashier || '')}</td>
      <td><button class="btn sm danger" onclick="undoCashTransaction('${escAttr(entry.id)}')">Undo selected</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">No active cash entry is available.</td></tr>';

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
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Cash Balances</h3>
        <button class="btn warn" onclick="undoLastCashTransaction()">Undo last cash entry</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Wallet</th><th>Action</th><th class="right">Amount</th><th>Note</th><th>Cashier</th><th>Action</th></tr></thead>
        <tbody>${cashRows}</tbody>
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
    activeAccountTransactions,
    activeCashTransactions
  };

  ensureOperationsModel();
  injectStyles();
  installNavigation();
}());

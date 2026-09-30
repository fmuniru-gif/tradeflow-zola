/* ZEZMS TradeFlow Owner Edition v3.29.5 / r68E.
   Read-only account statements and Cash Balances report.  This module only
   reads the established account, cash, wallet and PDF structures. */
(function () {
  'use strict';

  var VERSION = '3.29.5';
  var BUILD = '20260930-r68e-account-cash-pdf-compact-kpi-charts';
  var A4 = { width:595, height:842 };
  var EPSILON = 0.005;
  var ACCOUNT_KINDS = Object.freeze({
    debtors:{ singular:'Debtor', heading:'DEBTOR ACCOUNT STATEMENT' },
    creditors:{ singular:'Creditor', heading:'CREDITOR ACCOUNT STATEMENT' },
    depositors:{ singular:'Depositor', heading:'DEPOSITOR ACCOUNT STATEMENT' }
  });
  var PREFERRED_WALLET_NAMES = ['Cash in Hand','Personal Wallet','Momo Personal','Momo Merchant','GCB Bank','Cal Bank'];

  function list(value) { return Array.isArray(value) ? value : []; }
  function database() { try { return typeof DB !== 'undefined' && DB ? DB : (window.DB || {}); } catch (_) { return window.DB || {}; } }
  function number(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function finite(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]; }); }
  function attr(value) { return esc(value).replace(/[\r\n]/g, ''); }
  function text(value, fallback) { var result = String(value == null ? '' : value).trim(); return result || String(fallback == null ? '—' : fallback); }
  function money(value) { return 'GHS ' + number(value).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function dateText(value, withTime) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return withTime
      ? date.toLocaleString('en-GB', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' })
      : date.toLocaleDateString('en-GB', { year:'numeric', month:'short', day:'2-digit' });
  }
  function dateKey(value) { var date = new Date(value); return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime(); }
  function currentDate() { return new Date().toISOString().slice(0, 10); }
  function safeFilename(value) {
    var cleaned = String(value == null ? '' : value).normalize ? String(value == null ? '' : value).normalize('NFKD') : String(value == null ? '' : value);
    cleaned = cleaned.replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || 'ZEZMS_Report';
  }
  function notify(message, tone) { try { if (typeof window.toast === 'function') window.toast(message, tone); } catch (_) {} }
  function pdfEngine() { try { return window.ZEZMS && ZEZMS.pdfExport && typeof ZEZMS.pdfExport.SimplePDF === 'function' ? ZEZMS.pdfExport : null; } catch (_) { return null; } }
  function requirePdfEngine() { var engine = pdfEngine(); if (!engine) throw new Error('The established local PDF engine is unavailable. Reload the application and try again.'); return engine; }
  function currentRoute() { try { return String(typeof currentView !== 'undefined' ? currentView : (window.currentView || '')); } catch (_) { return String(window.currentView || ''); } }
  function canAccess(view) {
    var auth = window.ZEZMS && ZEZMS.staffAuth;
    if (auth && typeof auth.canView === 'function') return !!auth.canView(view);
    return currentRoute() === view;
  }
  function requireAccess(view) { if (!canAccess(view)) throw new Error('Your staff role cannot download this report.'); }
  function activeStatus(value) { return !/^(REVERSED|UNDONE|VOID|VOIDED|CANCELLED|CANCELED)$/i.test(String(value || 'ACTIVE')); }
  function status(value) { return text(value || 'ACTIVE').toUpperCase(); }
  function accountKind(kind) { var key = String(kind || ''); if (!ACCOUNT_KINDS[key]) throw new Error('Unknown account type.'); return ACCOUNT_KINDS[key]; }
  function accountFor(kind, accountId) {
    accountKind(kind);
    var account = list(database()[kind]).find(function (item) { return item && String(item.id) === String(accountId); });
    if (!account) throw new Error('The requested account holder was not found.');
    return account;
  }
  function receiptReference(entry) {
    var meta = entry && entry.meta || {};
    return text(entry && (entry.receiptRef || entry.publicReceiptRef) || meta.receiptRef || meta.publicReceiptRef || entry && (entry.receiptNo || entry.reference || entry.note) || meta.receiptNo || meta.reference || '—');
  }
  function accountTransactions(accountId) {
    return list(database().accountTxns).filter(function (entry) {
      return entry && (String(entry.accountID || '') === String(accountId) || String(entry.accountId || '') === String(accountId));
    }).slice().sort(function (left, right) {
      return dateKey(left.date || left.at || left.createdAt) - dateKey(right.date || right.at || right.createdAt)
        || String(left.id || '').localeCompare(String(right.id || ''));
    });
  }
  function accountStatementModel(kind, accountId) {
    var descriptor = accountKind(kind), account = accountFor(kind, accountId), transactions = accountTransactions(account.id);
    var active = transactions.filter(function (entry) { return activeStatus(entry.status || entry.state); });
    var latestWithBalance = active.filter(function (entry) { return finite(entry.balanceAfter) != null; }).slice(-1)[0] || null;
    var accountBalance = number(account.balance);
    var ledgerBalance = latestWithBalance ? finite(latestWithBalance.balanceAfter) : null;
    var reconciled = ledgerBalance != null && Math.abs(ledgerBalance - accountBalance) <= EPSILON;
    var rows = transactions.map(function (entry) {
      return {
        date: entry.date || entry.at || entry.createdAt || '',
        transaction: text(entry.txnType || entry.transactionType || entry.action || 'ACCOUNT ENTRY'),
        amount: number(entry.amount),
        balanceAfter: finite(entry.balanceAfter),
        reference: receiptReference(entry),
        who: text(entry.cashier || entry.who || (entry.meta || {}).cashier || '—'),
        status: status(entry.status || entry.state),
        id: text(entry.id || '—')
      };
    });
    return {
      kind:String(kind), descriptor:descriptor, account:account, accountBalance:accountBalance,
      transactions:rows, activeLedgerBalance:ledgerBalance, reconciled:reconciled,
      reconciliation: reconciled ? 'Reconciled to the current stored account balance.'
        : (ledgerBalance == null ? 'No complete active ledger balance is available; the current stored account balance is shown without inventing a reconstruction.'
          : 'Historical ledger evidence does not exactly reconstruct the stored balance; the current stored account balance remains authoritative.')
    };
  }
  function accountFilename(model) { return safeFilename('ZEZ_' + model.descriptor.singular + '_' + text(model.account.name, 'Account') + '_' + currentDate()) + '.pdf'; }
  function tableAccountRows(model) {
    return model.transactions.length ? model.transactions.map(function (entry) {
      return [dateText(entry.date, true), entry.transaction, money(entry.amount), entry.balanceAfter == null ? '—' : money(entry.balanceAfter), entry.reference, entry.who, entry.status];
    }) : [['—','No account transactions','—','—','—','—','—']];
  }
  async function buildAccountStatement(kind, accountId) {
    requireAccess('accounts');
    var model = accountStatementModel(kind, accountId), engine = requirePdfEngine();
    var watermark = engine.loadDocumentWatermark ? await engine.loadDocumentWatermark() : null;
    var pdf = new engine.SimplePDF(A4, { margin:36, watermark:watermark });
    var business = database().business || window.BUSINESS || {};
    pdf.heading(text(business.name, 'ZOLA ELECTRONICS ZONE'), 16);
    pdf.heading(model.descriptor.heading, 14);
    pdf.keyValue('Account Name', text(model.account.name));
    pdf.keyValue('Telephone / Contact', text(model.account.contact || model.account.phone || model.account.tel));
    pdf.keyValue('Description', text(model.account.description));
    pdf.keyValue('Account ID', text(model.account.id));
    pdf.keyValue('Current Balance', money(model.accountBalance));
    pdf.keyValue('Generated', dateText(new Date().toISOString(), true));
    pdf.paragraph('Transaction history is filtered only by this stable Account ID. Active and retained reversal evidence are included. Rows are ordered oldest to newest so Balance After can be read naturally.', { size:8.6, after:7 });
    pdf.table(['Date / Time','Transaction','Amount','Balance After','Receipt / Note','Cashier / Who','Status'], tableAccountRows(model), [62,68,63,68,140,70,52], ['left','left','right','right','left','left','center']);
    pdf.summary([
      { label:'Final active ledger balance', value:model.activeLedgerBalance == null ? 'Stored balance used' : money(model.activeLedgerBalance) },
      { label:'Current account-holder balance', value:money(model.accountBalance), strong:true }
    ]);
    pdf.paragraph(model.reconciliation, { size:8.5, bold:!model.reconciled });
    pdf.paragraph('Read-only account statement. Downloading this document does not settle an account, change cash, save data, create a sync operation, or alter M4/3 evidence.', { size:8.5, bold:true });
    return { model:model, bytes:pdf.finish(), filename:accountFilename(model) };
  }
  function rawWalletRegistry() {
    var settings = database().settings || {}, stored = settings.cashWallets;
    return Array.isArray(stored) ? stored : (stored && Array.isArray(stored.wallets) ? stored.wallets : []);
  }
  function walletReportRows() {
    var balances = database().cashBalances && typeof database().cashBalances === 'object' ? database().cashBalances : {};
    var used = Object.create(null), rows = [];
    rawWalletRegistry().forEach(function (wallet, index) {
      if (!wallet || !String(wallet.balanceKey || '').trim() || used[String(wallet.balanceKey)]) return;
      var key = String(wallet.balanceKey); used[key] = true;
      rows.push({ key:key, label:text(wallet.displayName, key), status:status(wallet.status || 'ACTIVE'), balance:number(balances[key]), sortOrder:Number(wallet.sortOrder) || (1000 + index) });
    });
    Object.keys(balances).forEach(function (key, index) {
      if (used[key]) return;
      used[key] = true;
      rows.push({ key:key, label:key, status:'UNREGISTERED LEGACY', balance:number(balances[key]), sortOrder:2000 + index });
    });
    function preferred(row) {
      var normalized = String(row.label || '').toLowerCase(), key = String(row.key || '').toLowerCase();
      var position = PREFERRED_WALLET_NAMES.findIndex(function (name) { var match = name.toLowerCase(); return normalized === match || key === match; });
      return position < 0 ? 999 : position;
    }
    return rows.sort(function (left, right) {
      return preferred(left) - preferred(right) || left.sortOrder - right.sortOrder || left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
    });
  }
  function selectedPeriod() {
    var data = database(), year = Number(data.selectedYear), month = Number(data.selectedMonth);
    var now = new Date();
    if (!Number.isInteger(year) || year < 2000) year = now.getFullYear();
    if (!Number.isInteger(month) || month < 1 || month > 12) month = now.getMonth() + 1;
    return { year:year, month:month, label:new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month:'long', year:'numeric' }) };
  }
  function movementWallet(entry) {
    var meta = entry && entry.meta || {};
    return String(entry && (entry.walletKey || entry.cashType) || meta.walletKey || meta.cashType || '');
  }
  function movementDate(entry) { return entry && (entry.at || entry.date || entry.createdAt || entry.updatedAt) || ''; }
  function cashMovementRows(period, wallets) {
    var labels = Object.create(null); wallets.forEach(function (wallet) { labels[wallet.key] = wallet.label; });
    return list(database().cashLog).filter(function (entry) {
      if (!entry) return false;
      var date = new Date(movementDate(entry));
      return !Number.isNaN(date.getTime()) && date.getFullYear() === period.year && date.getMonth() + 1 === period.month;
    }).slice().sort(function (left, right) {
      return dateKey(movementDate(left)) - dateKey(movementDate(right)) || String(left.id || '').localeCompare(String(right.id || ''));
    }).map(function (entry) {
      var key = movementWallet(entry), meta = entry.meta || {};
      return {
        date:movementDate(entry), wallet:labels[key] || key || '—', action:text(entry.action || entry.type || 'MOVEMENT'), amount:number(entry.amount),
        balanceAfter:finite(entry.after != null ? entry.after : entry.balanceAfter), source:text(meta.source || entry.source || entry.note || meta.note || '—'),
        who:text(entry.cashier || entry.who || meta.cashier || '—'), status:status(entry.status || entry.state), id:text(entry.id || '—')
      };
    });
  }
  function cashReportModel() {
    var wallets = walletReportRows(), period = selectedPeriod();
    var total = wallets.reduce(function (sum, wallet) { return sum + number(wallet.balance); }, 0);
    return { wallets:wallets, total:total, period:period, movements:cashMovementRows(period, wallets) };
  }
  function cashFilename() { return 'ZEZ_Cash_Balances_' + currentDate() + '.pdf'; }
  function tableCashRows(model) {
    return model.movements.length ? model.movements.map(function (entry) {
      return [dateText(entry.date, true), entry.wallet, entry.action, money(entry.amount), entry.balanceAfter == null ? '—' : money(entry.balanceAfter), entry.source, entry.who, entry.status];
    }) : [['—','No cash movements for this operational month','—','—','—','—','—','—']];
  }
  async function buildCashBalancesReport() {
    requireAccess('cash');
    var model = cashReportModel(), engine = requirePdfEngine();
    var watermark = engine.loadDocumentWatermark ? await engine.loadDocumentWatermark() : null;
    var pdf = new engine.SimplePDF(A4, { margin:36, watermark:watermark });
    var business = database().business || window.BUSINESS || {};
    pdf.heading(text(business.name, 'ZOLA ELECTRONICS ZONE'), 16);
    pdf.heading('CASH BALANCES REPORT', 14);
    pdf.keyValue('Generated', dateText(new Date().toISOString(), true));
    pdf.keyValue('Current operational month', model.period.label);
    pdf.keyValue('Total cash buckets', money(model.total));
    pdf.paragraph('Wallet names are current display metadata. Amounts come only from immutable cash balance keys in DB.cashBalances. Registered archived wallets and legacy balance keys are retained in this read-only report.', { size:8.6, after:7 });
    pdf.heading('Wallet Summary', 12);
    pdf.table(['Wallet','Current Balance','Status','Immutable Balance Key'], model.wallets.length ? model.wallets.map(function (wallet) { return [wallet.label, money(wallet.balance), wallet.status, wallet.key]; }) : [['No registered wallets','GHS 0.00','—','—']], [150,105,92,176], ['left','right','center','left']);
    pdf.summary([{ label:'Total cash buckets', value:money(model.total), strong:true }]);
    pdf.heading('Cash Movement History — ' + model.period.label, 12);
    pdf.table(['Date / Time','Wallet','Action','Amount','Balance After','Source / Note','Who','Status'], tableCashRows(model), [68,63,50,57,65,112,50,58], ['left','left','left','right','right','left','left','center']);
    pdf.paragraph('Read-only Cash Balances report. Downloading this document does not move funds, save data, run Live Sync, create an M4/3 operation, or change the device-local cash bucket arrangement.', { size:8.5, bold:true });
    return { model:model, bytes:pdf.finish(), filename:cashFilename() };
  }
  function download(created) {
    var blob = new Blob([created.bytes], { type:'application/pdf' }), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = created.filename; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
    return created;
  }
  async function downloadAccountStatement(kind, accountId) {
    try { var created = await buildAccountStatement(kind, accountId); download(created); notify('Account Statement PDF downloaded. No business data was changed.', 'ok'); return created; }
    catch (error) { notify(error && error.message ? error.message : String(error), 'err'); return null; }
  }
  async function downloadCashBalancesReport() {
    try { var created = await buildCashBalancesReport(); download(created); notify('Cash Balances PDF downloaded. No business data was changed.', 'ok'); return created; }
    catch (error) { notify(error && error.message ? error.message : String(error), 'err'); return null; }
  }
  function decorateAccounts(html) {
    if (!canAccess('accounts')) return String(html || '');
    return String(html || '').replace(/(<button\b[^>]*onclick="openSettle\('([^']+)'\s*,\s*'([^']+)'\)"[^>]*>Settle<\/button>)/g, function (whole, button, kind, id) {
      var args = attr(JSON.stringify(String(kind))) + ',' + attr(JSON.stringify(String(id)));
      return button + ' <button class="btn sm ghost" type="button" data-zezms-account-pdf-r68e="' + attr(kind + ':' + id) + '" onclick=\'r68eDownloadAccountPdf(' + args + ')\'>PDF</button>';
    });
  }
  function decorateCash(html) {
    var source = String(html || '');
    if (!canAccess('cash') || source.indexOf('data-zezms-cash-pdf-r68e') >= 0) return source;
    return '<div class="row" data-zezms-cash-pdf-r68e style="justify-content:flex-end;align-items:center;margin:0 0 10px"><button class="btn sm ghost" type="button" onclick="r68eDownloadCashBalancesPdf()">Download Cash Report PDF</button></div>' + source;
  }
  function install() {
    if (window.__zezmsAccountCashPdfR68E) return true;
    window.__zezmsAccountCashPdfR68E = true;
    var accounts = window.viewAccounts;
    if (typeof accounts === 'function' && !accounts.__zezmsAccountCashPdfR68E) {
      window.viewAccounts = function () { return decorateAccounts(accounts.apply(this, arguments)); };
      window.viewAccounts.__zezmsAccountCashPdfR68E = true;
    }
    var cash = window.viewCash;
    if (typeof cash === 'function' && !cash.__zezmsAccountCashPdfR68E) {
      window.viewCash = function () { return decorateCash(cash.apply(this, arguments)); };
      window.viewCash.__zezmsAccountCashPdfR68E = true;
    }
    return true;
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.accountCashPdfR68E = Object.freeze({
    version:VERSION, build:BUILD, accountStatementModel:accountStatementModel, cashReportModel:cashReportModel,
    buildAccountStatement:buildAccountStatement, buildCashBalancesReport:buildCashBalancesReport,
    downloadAccountStatement:downloadAccountStatement, downloadCashBalancesReport:downloadCashBalancesReport,
    accountFilename:accountFilename, cashFilename:cashFilename, install:install,
    _test:Object.freeze({ accountTransactions:accountTransactions, walletReportRows:walletReportRows, cashMovementRows:cashMovementRows, canAccess:canAccess })
  });
  window.r68eDownloadAccountPdf = downloadAccountStatement;
  window.r68eDownloadCashBalancesPdf = downloadCashBalancesReport;
  install();
}());

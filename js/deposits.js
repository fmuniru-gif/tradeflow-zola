/* TradeFlow Deposits. Account history is the receipt register. */
(function () {
  'use strict';

  const SOURCE = 'SALES_DEPOSIT';
  const COLLECTION = 'depositors';
  let query = '';
  let draftActor = '';
  let draftOrder = '';
  let saving = false;

  function can(permission) {
    return !!(ZEZMS.staffAuth?.isActive() && ZEZMS.staffAuth.can(permission));
  }

  function requirePermission(permission) {
    if (!can(permission)) throw Error('Your staff role does not allow this deposit action.');
  }

  function isDeposit(transaction) {
    return transaction?.meta?.source === SOURCE && transaction.meta.kind === COLLECTION;
  }

  function byId(id) {
    const transaction = DB.accountTxns.find(row => row.id === id && isDeposit(row));
    if (!transaction) throw Error('Deposit receipt not found.');
    return transaction;
  }

  function accountById(id) {
    return DB.depositors.find(account => account.id === id);
  }

  function field(value) {
    return String(value ?? '').trim();
  }

  function contactKey(value) {
    return field(value).replace(/\D/g, '').replace(/^(?:00)?233(\d{9})$/, '0$1');
  }

  function selectedAccount(id, name, contact) {
    if (id) {
      const account = accountById(id);
      if (!account) throw Error('The selected depositor is unavailable. Choose an account again.');
      return account;
    }
    const matches = DB.depositors.filter(account => field(account.name).toLowerCase() === name.toLowerCase());
    if (matches.length > 1 || (matches.length && matches[0].contact && contactKey(matches[0].contact) !== contactKey(contact))) {
      throw Error('This name matches an existing depositor. Select the correct account by name and telephone.');
    }
    return matches[0];
  }

  function amountInCedis(value) {
    const amount = Number(value);
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || !(cents > 0) || Math.abs(amount - cents / 100) > 1e-8) {
      throw Error('Enter a positive amount in cedis and pesewas.');
    }
    return cents / 100;
  }

  function nextBalance(before, amount) {
    const balance = Number(before) + amount;
    if (!Number.isSafeInteger(Math.round(balance * 100))) throw Error('The resulting balance is outside the supported range.');
    return round2(balance);
  }

  function record(input) {
    requirePermission('MANAGE_DEPOSITS');
    const cloud = ZEZMS.cloudSync;
    const state = cloud.getState();
    if (!ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions() || !cloud.isReadyForLocalOperations()
      || cloud.isApplyingRemote() || state.configurationVerificationRequired) {
      throw Error('This device is not ready to write deposit transactions. Check Sync / Backup.');
    }
    const wallet = ZEZMS.cashWallets.keyFromSelection(input.wallet);
    if (!wallet || !ZEZMS.cashWallets.isActive(wallet) || !Object.hasOwn(DB.cashBalances, wallet)) {
      throw Error('Choose the active cash wallet that received the money.');
    }
    const amount = amountInCedis(input.amount);
    const name = field(input.name).slice(0, 120);
    const contact = field(input.contact).slice(0, 60);
    const purpose = field(input.purpose).slice(0, 180);
    if (!input.accountId && (!name || contactKey(contact).length < 7)) throw Error('Enter the new depositor’s name and telephone.');
    const existing = selectedAccount(input.accountId, name, contact);
    const terms = ZEZMS.depositCheckout.paymentTerms(input, amount, existing);
    const beforeBalance = Number(existing?.balance ?? 0);
    const afterBalance = nextBalance(beforeBalance, amount);
    const cashBefore = Number(DB.cashBalances[wallet]);
    const cashAfter = nextBalance(cashBefore, amount);
    const walletLabel = ZEZMS.cashWallets.label(wallet);
    const reference = idStamp('DR-');
    const before = DB;
    let transaction;
    let saveStarted = false;
    DB = structuredClone(before);
    try {
      const id = existing?.id || getOrCreateAccount(COLLECTION, name, contact, '');
      const account = accountById(id);
      account.balance = afterBalance;
      account.date = nowISO();
      delete account.depositArchivedAt;
      if (!account.contact && contact) account.contact = contact;
      transaction = logAccountTxn(id, 'DEPOSITOR', account.name, 'INCREASE', amount, afterBalance, reference, {
        kind:COLLECTION, source:SOURCE, beforeBalance, afterBalance,
        wallet, walletKey:wallet, walletLabelSnapshot:walletLabel, cashAction:'Add', cashAmount:amount,
        cashLogId:'', depositContact:account.contact || '', depositPurpose:purpose
      });
      if (terms) Object.assign(transaction.meta,{
        depositOrderId:terms.orderId || reference, depositProduct:terms.product,
        orderReceivedAfter:terms.received, orderBalanceAfter:terms.balance
      });
      const cash = adjustCash(wallet, 'Add', amount, 'Deposit ' + reference + ' · ' + account.name, {
        source:'ACCOUNT_TRANSACTION', accountTxnId:transaction.id, accountKind:COLLECTION, accountId:id,
        walletKey:wallet, walletLabelSnapshot:walletLabel
      });
      if (!cash?.id) throw Error('TradeFlow could not record the linked wallet movement.');
      cash.before = cashBefore;
      cash.after = cashAfter;
      DB.cashBalances[wallet] = cashAfter;
      transaction.meta.cashLogId = cash.id;
      // The existing journal writes the wallet, account, register and outbox together.
      saveStarted = true;
      if (!cloud.saveLocalDatabaseDurably()) throw Error('The deposit could not use the durable transaction save.');
      return transaction.id;
    } catch (error) {
      if (!saveStarted) {
        DB = before;
      } else {
        const raw = ZEZMS.db.load(DB_KEY);
        DB = (typeof raw === 'string' ? JSON.parse(raw) : raw) || before;
        if (DB.accountTxns.some(row => row.id === transaction?.id)) {
          toast('Deposit saved locally. Reopen TradeFlow to finish verifying its sync record.', 'warn');
          return transaction.id;
        }
      }
      throw error;
    }
  }

  function validateUndo(transaction, account) {
    if (!isDeposit(transaction)) return;
    ZEZMS.depositCheckout.validateDepositUndo(transaction);
    const meta = transaction.meta;
    const cash = DB.cashLog.find(row => row.id === meta.cashLogId);
    if (!cash || cash.status === 'UNDONE' || cash.meta?.accountTxnId !== transaction.id
      || cash.action !== 'Add' || cash.amount !== transaction.amount || (cash.walletKey || cash.cashType) !== meta.wallet) {
      throw Error('This deposit cannot be reversed because its linked wallet entry is unavailable or differs.');
    }
    if (round2(Number(account.balance) - transaction.amount) < 0) {
      throw Error('The deposit cannot be reversed because part of the balance has already been used or returned.');
    }
  }

  function openAccounts() {
    requirePermission('VIEW_ACCOUNTS');
    accTab = COLLECTION;
    closeModal();
    nav('accounts');
  }

  function settle(id) {
    requirePermission('MANAGE_ACCOUNTS');
    const transaction = byId(id);
    const account = accountById(transaction.accountID);
    if (!account || !ZEZMS.depositCheckout.visibleAccount(account)) throw Error('The linked depositor account is closed.');
    accTab = COLLECTION;
    openSettle(COLLECTION, account.id);
  }

  function safeAction(action) {
    try { action(); } catch (error) { toast(error.message, 'err'); }
  }

  function openForm(orderId = '') {
    requirePermission('MANAGE_DEPOSITS');
    const checkout = ZEZMS.depositCheckout;
    const current = orderId ? checkout.order(orderId) : null;
    if (orderId && (!current?.account || current.sale || voided(current.initial) || current.balance <= 0)) {
      throw Error('This product has no remaining deposit payment to record.');
    }
    draftActor = session.sharedUserId || session.cashier;
    draftOrder = orderId;
    const accounts = DB.depositors.filter(checkout.visibleAccount).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    openModal(`<form onsubmit="event.preventDefault();ZEZMS.deposits.submit()">
      <h3>${current ? 'Record installment' : 'Record deposit'}</h3>
      ${current ? `<p><b>${esc(current.initial.name)}</b> · ${esc(current.product.name)}<br>Balance due ${fmt(current.balance)}</p>` : ''}
      <div class="field"><label for="depositAccount">Depositor account</label>
        <select id="depositAccount" onchange="ZEZMS.deposits.accountChanged()" ${current ? 'disabled' : ''}>
          <option value="">New depositor</option>
          ${accounts.map(account => `<option value="${escAttr(account.id)}" ${current?.account.id === account.id ? 'selected' : ''}>${esc(account.name)}${account.contact ? ' · ' + esc(account.contact) : ''} · ${esc(fmt(account.balance))}</option>`).join('')}
        </select>
      </div>
      <div id="depositNewAccount" class="grid g2">
        <div class="field"><label for="depositName">Full name</label><input id="depositName" maxlength="120" autocomplete="name" required></div>
        <div class="field"><label for="depositContact">Telephone</label><input id="depositContact" type="tel" maxlength="60" autocomplete="tel" required></div>
      </div>
      ${current ? '' : `<div class="field"><label for="depositProduct">Product</label>
        <select id="depositProduct" onchange="ZEZMS.deposits.productChanged()"><option value="">General deposit</option>${checkout.productOptions().map(p =>
          `<option value="${escAttr(p.id)}">${esc(p.name)} · ${esc(p.id)} · ${fmtN(p.qty)} in stock</option>`).join('')}</select>
      </div>
      <div id="depositProductTerms" class="grid g2" style="display:none">
        <div class="field"><label for="depositQuantity">Quantity</label><input id="depositQuantity" type="number" min="1" step="1" value="1" inputmode="numeric" oninput="ZEZMS.deposits.updateOrderTotal()"></div>
        <div class="field"><label for="depositPrice">Agreed unit price (GH₵)</label><input id="depositPrice" type="number" min="0.01" step="0.01" inputmode="decimal" oninput="ZEZMS.deposits.updateOrderTotal()"></div>
      </div>`}
      <p id="depositOrderTotal" class="muted"></p>
      <div class="grid g2">
        <div class="field"><label for="depositAmount">Amount received (GH₵)</label><input id="depositAmount" type="number" min="0.01" step="0.01" inputmode="decimal" oninput="ZEZMS.deposits.updateOrderTotal()" required></div>
        <div class="field"><label for="depositWallet">Received into</label><select id="depositWallet" required>${ZEZMS.cashWallets.selectorOptions({placeholder:'Choose cash wallet'})}</select></div>
      </div>
      <div class="field"><label for="depositPurpose">Purpose or reference (optional)</label><input id="depositPurpose" maxlength="180"></div>
      <p id="depositStatus" role="status" style="color:#fca5a5"></p>
      <div class="row"><button id="recordDepositButton" class="btn" type="submit">Save deposit</button>
        <button class="btn ghost" type="button" onclick="closeModal()">Cancel</button></div>
    </form>`);
    if (current) accountChanged();
  }

  function productChanged() {
    const id = $('depositProduct').value;
    $('depositProductTerms').style.display = id ? '' : 'none';
    $('depositPrice').required = !!id;
    $('depositPrice').value = id ? ZEZMS.depositCheckout.quote(id).price.toFixed(2) : '';
    updateOrderTotal();
  }

  function updateOrderTotal() {
    const current = draftOrder && ZEZMS.depositCheckout.order(draftOrder);
    const total = current ? current.balance : ($('depositProduct')?.value
      ? round2(Number($('depositPrice').value) * Number($('depositQuantity').value)) : 0);
    $('depositOrderTotal').textContent = total
      ? 'Amount due ' + fmt(total) + ' · Balance after this payment ' + fmt(Math.max(0,round2(total - Number($('depositAmount').value))))
      : '';
  }

  function submit() {
    const button = $('recordDepositButton');
    if (!button || saving) return;
    saving = true;
    button.disabled = true;
    let id;
    try {
      if (!draftActor || draftActor !== (session.sharedUserId || session.cashier)) throw Error('Reopen the form under your current staff account.');
      id = record({
        accountId:$('depositAccount').value, name:$('depositName').value, contact:$('depositContact').value,
        amount:$('depositAmount').value, wallet:$('depositWallet').value, purpose:$('depositPurpose').value,
        orderId:draftOrder, productId:$('depositProduct')?.value, quantity:$('depositQuantity')?.value, price:$('depositPrice')?.value
      });
    } catch (error) {
      $('depositStatus').textContent = error.message;
      button.disabled = false;
    } finally {
      saving = false;
    }
    if (id) {
      draftActor = '';
      draftOrder = '';
      query = '';
      ZEZMS.tablePages.reset('deposits');
      closeModal();
      render();
      safeAction(() => preview(id, false));
    }
  }

  function accountChanged() {
    const existing = !!$('depositAccount').value;
    $('depositNewAccount').hidden = existing;
    $('depositNewAccount').style.display = existing ? 'none' : '';
    $('depositName').required = !existing;
    $('depositContact').required = !existing;
  }

  function timestamp(value) {
    return new Date(value).toLocaleString('en-GH', {dateStyle:'medium', timeStyle:'short'});
  }

  function voided(transaction) {
    return transaction.status === 'UNDONE' || transaction.status === 'VOID';
  }

  function receiptHTML(transaction, logo) {
    const biz = DB.business || BUSINESS;
    const meta = transaction.meta;
    const product = meta.depositProduct;
    const fields = [
      ['Receipt number', transaction.receiptNo], ['Date received', timestamp(transaction.date)],
      ['Depositor', transaction.name], ['Telephone', meta.depositContact],
      ['Received into', meta.walletLabelSnapshot || meta.wallet], ['Purpose or reference', meta.depositPurpose],
      ...(product ? [
        ['Product', product.qty + ' × ' + product.name + ' · ' + product.id],
        ['Agreed unit price', fmt(product.price)], ['Agreed total', fmt(product.total)],
        ['Total paid to date', fmt(meta.orderReceivedAfter)], ['Balance left to pay', fmt(meta.orderBalanceAfter)]
      ] : [])
    ].filter(([,value]) => value);
    return `<main class="deposit-receipt">
      <div class="deposit-paper">
        ${ZEZMS.documentBranding.headerHTML(logo)}
        <div class="deposit-business"><b>${esc(biz.name)}</b><br>${esc(biz.address)}<br>${esc(biz.tel)}</div>
        <h2>${voided(transaction) ? 'VOID DEPOSIT RECEIPT' : 'DEPOSIT RECEIPT'}</h2>
        <dl>${fields.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
        <div class="deposit-total"><span>Amount received</span><b>${esc(fmt(transaction.amount))}</b></div>
        <p>${voided(transaction)
          ? esc('Reversed' + (transaction.undoneAt ? ' on ' + timestamp(transaction.undoneAt) : '') + (transaction.undoneBy ? ' by ' + transaction.undoneBy : ''))
          : 'Please keep this receipt as proof of your deposit.'}</p>
        <div class="deposit-approval"><span class="deposit-stamp${voided(transaction) ? ' deposit-void' : ''}">${voided(transaction) ? 'VOID' : 'APPROVED'}</span>
          <div class="deposit-signature"><b>${esc(transaction.cashier)}</b><br>Cashier signature ____________________</div>
        </div>
      </div>
    </main>`;
  }

  function receiptStyles(logo) {
    const brand = ZEZMS.documentBranding;
    return `
      .deposit-receipt{color:#16191d;background:#fff;font:14px/1.38 Arial,Helvetica,sans-serif;position:relative}
      .deposit-receipt::before{content:"";position:absolute;inset:0;background:url("${escAttr(logo || brand.url)}") center/100% 100% no-repeat;opacity:.10;pointer-events:none}
      .deposit-paper{position:relative;padding:4mm;overflow-wrap:anywhere}.deposit-business{margin-bottom:5mm}
      .deposit-paper h2{color:#12495d;text-align:center;font-size:17pt;margin:4mm 0}
      .deposit-paper dl{margin:3mm 0}.deposit-paper dl div{display:grid;grid-template-columns:35% minmax(0,1fr);gap:2mm;padding:1.35mm 0;border-bottom:1px solid #cbd5e1}
      .deposit-paper dt{color:#475569}.deposit-paper dd{margin:0;font-weight:600}
      .deposit-total{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5mm 0;padding:3mm;border:1px solid #12495d;color:#12495d;font-size:14pt}
      .deposit-stamp{display:inline-block;font:bold 12pt Arial;color:#166534;border:3px double currentColor;border-radius:4px;padding:2mm 3mm}
      .deposit-stamp.deposit-void{color:#991b1b}
      .deposit-approval{display:grid;justify-items:start;gap:1mm;width:fit-content;max-width:100%;margin-inline-start:auto}
      @page{size:A5 portrait;margin:7mm}
      @media print{html,body{margin:0;padding:0;background:white}.deposit-receipt{width:100%;font-size:9.5pt;line-height:1.27}
        .deposit-paper{padding:2mm}.deposit-business{margin-bottom:2mm}.deposit-paper h2{margin:2mm 0}
        .deposit-paper dl div{padding:1mm 0}.deposit-total{margin:3mm 0;padding:2mm;font-size:12pt}
        .deposit-paper p{margin:2mm 0}.deposit-approval{break-inside:avoid}
        .deposit-stamp{padding:1mm 2.5mm;font-size:11pt}
        .deposit-receipt,.deposit-receipt *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .deposit-receipt::before{position:fixed;inset:-7mm auto auto -7mm;width:148mm;height:210mm}}
    `;
  }

  function buildPrintDocument(transaction, logo) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(transaction.receiptNo)}</title><style>${receiptStyles(logo)}</style></head><body>${receiptHTML(transaction, logo)}</body></html>`;
  }

  async function print(id, isReprint = true) {
    try {
      requirePermission('VIEW_DEPOSITS');
      const transaction = byId(id);
      return await ZEZPrint.printDocument({
        documentType:'receipt', documentId:transaction.receiptNo, copies:1, isReprint,
        createHtml:logo => buildPrintDocument(transaction, logo),
        systemPrint:() => ZEZPrint.printWithTransport('system-dialog', receiptHTML(transaction), {
          title:transaction.receiptNo, styles:receiptStyles()
        })
      });
    } catch (error) { toast(error.message, 'err'); }
  }

  function preview(id, isReprint = true) {
    requirePermission('VIEW_DEPOSITS');
    const transaction = byId(id);
    const current = ZEZMS.depositCheckout.order(transaction.meta.depositOrderId);
    openModal(`<style>${receiptStyles()}</style>${receiptHTML(transaction)}
      ${current ? `<p class="muted">${current.sale ? 'Sale Out completed · ' + esc(current.sale.receiptRef || current.sale.receiptNo)
        : 'Current order balance ' + fmt(current.balance)}</p>` : ''}
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" data-deposit-id="${escAttr(id)}" data-reprint="${isReprint}" onclick="ZEZMS.deposits.print(this.dataset.depositId,this.dataset.reprint==='true')">Print receipt</button>
        ${orderButtons(transaction,current)}
        ${can('MANAGE_ACCOUNTS') && ZEZMS.depositCheckout.visibleAccount(accountById(transaction.accountID) || {}) && accountById(transaction.accountID)
          ? `<button class="btn ghost" type="button" data-deposit-id="${escAttr(id)}" onclick="ZEZMS.deposits.settle(this.dataset.depositId)">Settle depositor account</button>` : ''}
        <button class="btn ghost" type="button" onclick="closeModal()">Close</button>
      </div>`);
  }

  function orderButtons(transaction, current) {
    if (!current?.account || current.sale || voided(current.initial) || voided(transaction) || !can('MANAGE_DEPOSITS')) return '';
    const attr = ' data-deposit-order="' + escAttr(current.id) + '"';
    return (current.balance > 0 ? '<button class="btn sm ghost" type="button"' + attr + ' onclick="ZEZMS.deposits.openForm(this.dataset.depositOrder)">Record installment</button>' : '')
      + (ZEZMS.depositCheckout.canRelease() ? '<button class="btn sm" type="button"' + attr + ' onclick="ZEZMS.depositCheckout.open(this.dataset.depositOrder)">Sale Out</button>' : '');
  }

  function historyHTML() {
    const key = query.toLowerCase().trim();
    const rows = DB.accountTxns.filter(transaction => isDeposit(transaction) &&
      [transaction.receiptNo, transaction.name, transaction.meta.depositContact, transaction.meta.depositPurpose, transaction.meta.depositProduct?.name]
        .some(value => field(value).toLowerCase().includes(key)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    const pending = new Set(ZEZMS.cloudSync.getOutbox().flatMap(operation =>
      operation.patches.filter(patch => patch.collection === 'accountTxns').map(patch => patch.key)));
    const visible = ZEZMS.tablePages.slice('deposits', rows, key);
    return `<div class="table-wrap"><table>
      <thead><tr><th>Receipt</th><th>Depositor</th><th>Received</th><th class="right">Amount</th><th>Wallet</th><th>Status</th><th></th></tr></thead>
      <tbody>${visible.map(row => {
        const current = ZEZMS.depositCheckout.order(row.meta.depositOrderId);
        return `<tr>
        <td class="mono" style="max-width:19ch;overflow-wrap:anywhere">${esc(row.receiptNo)}</td>
        <td><b>${esc(row.name)}</b><br><small>${esc(row.meta.depositContact || '')}</small>
          ${current ? `<br><small>${esc(current.product.name)} · ${current.sale ? 'Sale Out complete' : fmt(current.balance) + ' due'}</small>` : ''}</td>
        <td>${esc(timestamp(row.date))}</td><td class="mono right">${esc(fmt(row.amount))}</td>
        <td>${esc(row.meta.walletLabelSnapshot || row.meta.wallet)}</td>
        <td>${voided(row) ? 'Void' : 'Recorded'}${pending.has(row.id) ? '<br><small class="muted">Awaiting sync</small>' : ''}</td>
        <td><div class="row"><button type="button" class="btn sm ghost" data-deposit-id="${escAttr(row.id)}" onclick="ZEZMS.deposits.preview(this.dataset.depositId)">View</button>
          <button type="button" class="btn sm" data-deposit-id="${escAttr(row.id)}" onclick="ZEZMS.deposits.print(this.dataset.depositId)">Print receipt</button>
          ${row.receiptNo === current?.id ? orderButtons(row,current) : ''}</div></td>
      </tr>`; }).join('') || '<tr><td colspan="7" class="empty">No matching deposit receipts.</td></tr>'}</tbody>
    </table></div>${ZEZMS.tablePages.controls('deposits')}`;
  }

  function viewHTML() {
    requirePermission('VIEW_DEPOSITS');
    return `<section class="card" id="depositsView">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h3 style="margin:0">Deposit receipts</h3><p class="muted">Depositor balances total <b>${esc(fmt(DB.depositors.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)))}</b></p></div>
        <div class="row">
          ${can('MANAGE_DEPOSITS') ? '<button type="button" class="btn" onclick="ZEZMS.deposits.openForm()">Record deposit</button>' : ''}
          ${can('VIEW_ACCOUNTS') ? '<button type="button" class="btn ghost" onclick="ZEZMS.deposits.openAccounts()">Depositor accounts</button>' : ''}
        </div>
      </div>
      <div class="field"><label for="depositSearch">Find a deposit receipt</label><input id="depositSearch" type="search" placeholder="Name, telephone, receipt number or purpose" value="${escAttr(query)}" oninput="ZEZMS.deposits.search(this.value)"></div>
      <div id="depositHistory">${historyHTML()}</div>
    </section>`;
  }

  ZEZMS.deposits = Object.freeze({
    viewHTML, isDeposit, validateUndo, buildPrintDocument, submit, accountChanged, print, contactKey,
    productChanged:() => safeAction(productChanged), updateOrderTotal,
    openForm:id => safeAction(() => openForm(id)),
    openAccounts:() => safeAction(openAccounts),
    settle:id => safeAction(() => settle(id)),
    preview:id => safeAction(() => preview(id)),
    search(value) {
      requirePermission('VIEW_DEPOSITS');
      query = String(value || '');
      $('depositHistory').innerHTML = historyHTML();
    }
  });
}());

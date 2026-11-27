/* Product deposits hand over stock through a linked Sale Out. */
(function () {
  'use strict';

  const APPLY = 'DEPOSIT_APPLIED_TO_SALE';
  let selection = null;
  let submitting = false;
  let releaseMessage = '';
  let draft = { amount:'', wallet:'', credit:false };

  function active(row) {
    return row && row.status !== 'UNDONE' && row.status !== 'VOID';
  }

  function requireThat(condition, message) {
    if (!condition) throw Error(message);
  }

  function amount(value, allowZero = false) {
    const number = Number(value);
    const cents = Math.round(number * 100);
    requireThat(Number.isSafeInteger(cents) && (allowZero ? cents >= 0 : cents > 0)
      && Math.abs(number - cents / 100) < 1e-8, 'Enter an amount in cedis and pesewas.');
    return cents / 100;
  }

  function quantity(value) {
    const qty = Number(value);
    requireThat(Number.isSafeInteger(qty) && qty > 0, 'Enter a whole number of units.');
    return qty;
  }

  function productOptions() {
    return availableProductsForOpenMonth().filter(item => item.id);
  }

  function quote(id) {
    const product = productOptions().find(item => item.id === id);
    requireThat(product, 'Select a product with stock in the open month.');
    return { ...product, price:Number(getBaseUnitPrice(product.name)) || 0 };
  }

  function order(id) {
    if (!id) return null;
    const initial = DB.accountTxns.find(t => t.receiptNo === id && ZEZMS.deposits.isDeposit(t)
      && t.meta.depositOrderId === id && t.meta.depositProduct);
    if (!initial) return null;
    const product = initial.meta.depositProduct;
    const payments = DB.accountTxns.filter(t => active(t) && ZEZMS.deposits.isDeposit(t)
      && t.accountID === initial.accountID && t.meta.depositOrderId === id);
    const sales = DB.sales.filter(sale => sale.depositOrderId === id);
    const sale = sales.find(active);
    const received = round2(payments.reduce((sum, txn) => sum + Number(txn.amount), 0));
    return {
      id, initial, product, payments, received, sale, nextSale:sales.length + 1,
      account:DB.depositors.find(a => a.id === initial.accountID),
      balance:round2(product.total - received)
    };
  }

  function paymentTerms(input, received, depositor) {
    if (!input.orderId && !input.productId) return null;
    if (input.orderId) {
      const current = order(input.orderId);
      requireThat(current && active(current.initial) && !current.sale && depositor?.id === current.account?.id,
        'This deposit order is no longer open for another payment.');
      requireThat(received <= current.balance, 'The payment exceeds the remaining balance for this product.');
      return { orderId:current.id, product:current.product, received:round2(current.received + received), balance:round2(current.balance - received) };
    }
    const stock = quote(input.productId);
    const qty = quantity(input.quantity);
    requireThat(qty <= stock.qty, 'The selected quantity exceeds current stock.');
    const price = amount(input.price);
    const total = amount(round2(price * qty));
    requireThat(received <= total, 'The payment cannot exceed the agreed product total.');
    const product = { id:stock.id, name:stock.name, qty, price, total };
    return { orderId:'', product, received, balance:round2(total - received) };
  }

  function visibleAccount(account) {
    return !account.depositArchivedAt || Number(account.balance) !== 0;
  }

  function canRelease() {
    const staff = ZEZMS.staffAuth;
    return staff.isActive() && staff.can('SALE_OUT') && staff.can('MANAGE_ACCOUNTS');
  }

  function open(id) {
    const current = order(id);
    if (!canRelease() || !current || current.sale || !active(current.initial) || !current.account
      || current.received <= 0) {
      toast('This deposit order is unavailable for Sale Out.', 'err');
      return;
    }
    selection = { id, actor:session.sharedUserId };
    draft = { amount:'', wallet:'', credit:false };
    releaseMessage = '';
    closeModal();
    nav('pos');
  }

  function leaving(view) {
    if (view !== 'pos' && !submitting) selection = null;
  }

  function captureForm() {
    if (!$('depositReleaseAmount')) return;
    draft = {
      amount:$('depositReleaseAmount').value,
      wallet:$('depositReleaseWallet').value,
      credit:$('depositReleaseCredit').checked
    };
    const current = order(selection?.id);
    if (current) $('depositReleaseDue').textContent = fmt(Math.max(0, round2(current.balance - (Number(draft.amount) || 0))));
  }

  function cancel() {
    if (submitting) return;
    selection = null;
    nav('deposits');
  }

  function viewHTML() {
    if (!selection) return '';
    const current = order(selection.id);
    if (!current || current.sale || !canRelease() || selection.actor !== session.sharedUserId) {
      return `<section class="card"><h3>Deposit Sale Out</h3><p id="depositReleaseStatus" role="status">${esc(releaseMessage || 'This order is unavailable or has already been posted.')}</p><button class="btn" onclick="ZEZMS.depositCheckout.cancel()">Back to Deposits</button></section>`;
    }
    const { product, received, balance, initial } = current;
    return `<section class="card">
      <h3>Deposit Sale Out</h3>
      <div class="statline"><span>Customer</span><b>${esc(initial.name)} · ${esc(initial.meta.depositContact || current.account?.contact || '')}</b></div>
      <div class="statline"><span>Product</span><b>${esc(product.qty + ' × ' + product.name)}</b></div>
      <div class="statline"><span>Agreed total</span><b>${fmt(product.total)}</b></div>
      <div class="statline"><span>Deposit already received</span><b>${fmt(received)}</b></div>
      <div class="statline"><span>Balance before handover</span><b>${fmt(balance)}</b></div>
      <form style="margin-top:12px" onsubmit="event.preventDefault();ZEZMS.depositCheckout.submit()">
        <div class="grid g2">
          <div class="field"><label for="depositReleaseAmount">Additional payment received now (GH₵)</label><input id="depositReleaseAmount" type="number" min="0" max="${Math.max(0,balance)}" step="0.01" inputmode="decimal" placeholder="0.00" value="${escAttr(draft.amount)}" oninput="ZEZMS.depositCheckout.captureForm()"></div>
          <div class="field"><label for="depositReleaseWallet">Wallet for additional payment</label><select id="depositReleaseWallet" onchange="ZEZMS.depositCheckout.captureForm()">${ZEZMS.cashWallets.selectorOptions({placeholder:'Choose wallet if receiving money now',selected:draft.wallet})}</select></div>
        </div>
        <div class="statline"><span>Balance to record in Debtors</span><b id="depositReleaseDue">${fmt(Math.max(0,round2(balance-(Number(draft.amount)||0))))}</b></div>
        <label class="row" style="margin:12px 0"><input id="depositReleaseCredit" type="checkbox" style="width:auto" ${draft.credit ? 'checked' : ''} onchange="ZEZMS.depositCheckout.captureForm()"> Authorize handover if a balance remains unpaid</label>
        <p id="depositReleaseStatus" role="status" class="muted">${esc(releaseMessage)}</p>
        <div class="row"><button id="depositReleaseSave" class="btn" type="submit" ${submitting ? 'disabled' : ''}>Complete Sale Out</button>
          <button class="btn ghost" type="button" onclick="ZEZMS.depositCheckout.cancel()">Back to Deposits</button></div>
      </form>
    </section>`;
  }

  function ready() {
    const cloud = ZEZMS.cloudSync;
    const state = cloud.getState();
    requireThat(canRelease() && selection?.actor === session.sharedUserId, 'Reopen Sale Out under your current staff account.');
    requireThat(state.initialized && navigator.onLine && cloud.getClient() && cloud.getSession()?.user
      && ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions() && cloud.isReadyForLocalOperations()
      && !cloud.isApplyingRemote() && !state.configurationVerificationRequired && !state.integrityWarning
      && !state.oldClientDetected && !cloud.getOutbox().length && !cloud.getFailedOperations().length,
    'Connect to Cloud and finish any pending sync before releasing this deposit order.');
    return cloud;
  }

  function heldForOrders(accountId) {
    const linkedIds = new Set(DB.accountTxns.filter(t => t.accountID === accountId && active(t)
      && ZEZMS.deposits.isDeposit(t) && t.meta.depositOrderId).map(t => t.meta.depositOrderId));
    return round2([...linkedIds].reduce((sum, id) => {
      const linked = order(id);
      return sum + (linked && !linked.sale && active(linked.initial) ? linked.received : 0);
    },0));
  }

  function paymentPlan(current, input) {
    requireThat(current && !current.sale && active(current.initial) && current.account,
      'This deposit order is no longer open.');
    const { account, product, received, balance } = current;
    requireThat(received > 0 && balance >= 0 && round2(account.balance) >= received,
      'The deposits available on this account do not match the order. Review Accounts before releasing stock.');
    requireThat(round2(account.balance) >= heldForOrders(account.id),
      'This depositor has other product payments that must be reconciled first.');
    const stock = quote(product.id);
    requireThat(stock.qty >= product.qty, 'There is insufficient current stock to hand over this order.');
    const contact = current.initial.meta.depositContact || account.contact;
    requireThat(current.initial.name && contact, 'A depositor name and telephone are required for handover.');
    const additional = amount(input.amount, true);
    requireThat(additional <= balance, 'The additional payment exceeds the order balance.');
    const remaining = round2(balance - additional);
    requireThat(!remaining || input.credit, 'Authorise handover on credit before releasing a partially paid item.');
    const wallet = additional ? ZEZMS.cashWallets.keyFromSelection(input.wallet) : '';
    requireThat(!additional || (wallet && ZEZMS.cashWallets.isActive(wallet) && Object.hasOwn(DB.cashBalances,wallet)),
      'Choose the active wallet that received the additional payment.');
    return { current, name:stock.name, contact, additional, wallet, remaining };
  }

  function debtorFor(name, contact) {
    const sameName = DB.debtors.filter(entry => String(entry.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    const phone = ZEZMS.deposits.contactKey(contact);
    const matching = sameName.filter(entry => ZEZMS.deposits.contactKey(entry.contact) === phone);
    requireThat(matching.length <= 1, 'More than one debtor has this name and telephone. Review Debtors before releasing on credit.');
    if (matching.length) return matching[0];
    if (sameName.length === 1 && !sameName[0].contact) {
      sameName[0].contact = contact;
      return sameName[0];
    }
    if (!sameName.length) {
      const id = getOrCreateDebtorID(name,contact);
      return DB.debtors.find(entry => entry.id === id);
    }
    const debtor = {id:idStamp('DEB-'),name,contact,description:'Auto-created from credit sale',balance:0,date:nowISO()};
    DB.debtors.push(debtor);
    return debtor;
  }

  function post(plan, cloud) {
    const before = DB;
    const { current, name, contact, additional, wallet, remaining } = plan;
    const { product, initial, received, payments } = current;
    const receiptNo = 'SR-DCO-' + current.id.slice(3) + '-' + current.nextSale;
    const attempt = idStamp('DCA-');
    const at = nowISO();
    const customer = initial.name;
    const period = getLatestMonth();
    const customerId = ZEZMS.customerMaster.resolveCustomerId({phone:contact});
    let saveStarted = false;
    DB = structuredClone(before);
    try {
      const account = DB.depositors.find(a => a.id === current.account.id);
      const undoStart = DB.undoLog.length;
      const fifo = recordSaleOutFIFO(name,product.qty,product.price,0);
      DB.undoLog.slice(undoStart).forEach(entry => {
        entry.batchId = receiptNo;
        entry.inventoryTxnId = receiptNo;
        entry.type = 'SALE_OUT_ALLOC';
      });
      const beforeBalance = round2(account.balance);
      account.balance = round2(beforeBalance - received);
      account.date = at;
      account.depositArchivedAt = at;
      logAccountTxn(account.id,'DEPOSITOR',customer,'Deposit applied',-received,account.balance,receiptNo,{
        source:APPLY, kind:'depositors', cashAction:'', beforeBalance, afterBalance:account.balance,
        depositOrderId:current.id, depositPaymentIds:payments.map(t => t.id)
      });
      if (remaining) {
        const debtor = debtorFor(customer,contact);
        debtor.balance = round2(Number(debtor.balance) + remaining);
        debtor.date = at;
        logAccountTxn(debtor.id,'DEBTOR',customer,'Credit Sale',remaining,debtor.balance,receiptNo,{
          source:'SALE', kind:'debtors', saleReceiptNo:receiptNo
        });
      }
      const cash = additional ? adjustCash(wallet,'Add',additional,'Receipt payment ' + receiptNo,{
        source:'SALE_RECEIPT',saleReceiptNo:receiptNo,receiptNo,cashBucket:wallet,cashAmount:additional
      }) : null;
      requireThat(!additional || cash?.id,'The additional payment could not be recorded.');
      const paid = round2(received + additional);
      const common = {
        receiptNo, customerId, contact, location:'', subtotal:product.total, vatRate:0, vatAmount:0,
        withholdingTaxRate:0, withholdingTax:0, withholdingTaxAmount:0, grossTotal:product.total,
        netAmountCollectible:product.total, balance:remaining, cashier:session.cashier, cashierTel:session.tel,
        date:at, status:'ACTIVE', saleType:'RECEIPT', salesChannel:'Walk-in',
        cashBucket:wallet, walletKey:wallet, paymentWallet:wallet, cashReceived:additional, cashLogId:cash?.id || '',
        depositOrderId:current.id, depositAccountId:account.id, depositApplied:received,
        depositHandoverCash:additional, depositCheckoutAttempt:attempt
      };
      const line = { product:name, productId:product.id, qty:product.qty, disc:0 };
      const receipt = { ...common, customerName:customer, totalAmount:product.total, amountPaid:paid, credit:remaining>0,
        lines:[{...line,uPrice:product.price,total:product.total}] };
      DB.receipts.push(receipt);
      DB.sales.push({ ...common, id:receiptNo, customer, total:product.total, paid, pay:remaining ? 'PARTIAL' : 'PAID',
        year:period.year, month:period.month, lines:[{...line,price:product.price,amount:product.total,fifo}] });
      ZEZMS.receiptReferencesR67X.attachReceiptReference(receipt);
      saveStarted = true;
      requireThat(cloud.saveLocalDatabaseDurably(),'TradeFlow could not save this linked sale.');
      return { receiptNo, attempt };
    } catch (error) {
      // The native journal restores the durable image after a partial commit.
      const stored = saveStarted ? ZEZMS.db.load(DB_KEY) : null;
      DB = (typeof stored === 'string' ? JSON.parse(stored) : stored) || before;
      if (DB.sales.some(sale => sale.depositCheckoutAttempt === attempt)) {
        throw Error('This Sale Out is saved locally. Reopen TradeFlow and check Sync before handing over the item.');
      }
      throw error;
    }
  }

  function status(message) {
    releaseMessage = message;
    const node = $('depositReleaseStatus');
    if (node) node.textContent = message;
    else toast(message,'warn');
  }

  async function submit() {
    if (!selection || submitting) return;
    captureForm();
    submitting = true;
    $('depositReleaseSave').disabled = true;
    const id = selection.id;
    const original = order(id);
    const input = {...draft};
    try {
      const cloud = ready();
      paymentPlan(original,input);
      status('Checking the latest stock and deposit payments…');
      const scope = ZEZMS.syncResilience.captureContext(()=>({
        client:cloud.getClient(),session:cloud.getSession(),state:cloud.getState(),ownerId:cloud.currentSyncOwnerId()
      }));
      await cloud.pullNow(false);
      ready();
      requireThat(scope.valid() && selection?.id === id && currentView === 'pos',
        'The device, staff member or page changed. Open the deposit order again.');
      const current = order(id);
      requireThat(current?.received === original.received && current.nextSale === original.nextSale,
        'Deposit payments changed. Review the new balance before releasing stock.');
      const result = post(paymentPlan(current,input),cloud);
      status('Saving Sale Out and confirming sync…');
      try { await cloud.pushNow(false); } catch (error) {
        if (cloud.getOutbox().some(op => op.opId === 'DCO-' + result.receiptNo)) {
          throw Error('This Sale Out is saved locally and awaiting sync. Check Sync before handing over the item.');
        }
        throw error;
      }
      const saved = DB.receipts.find(r => r.receiptNo === result.receiptNo && active(r));
      requireThat(saved && saved.depositCheckoutAttempt === result.attempt,
        saved ? 'Another device posted this Sale Out first. Review its receipt before handing over stock.'
          : 'Cloud did not accept this Sale Out. Check the order and Sync before handing over stock.');
      requireThat(!cloud.getOutbox().some(op => op.opId === 'DCO-' + result.receiptNo),
        'This Sale Out is awaiting sync. Check Sync before handing over the item.');
      // Post-sale integrations receive the same committed-sale event as regular Sale Out.
      try {
        ZEZMS.customerMaster.upsertAfterCommittedSale({ customerId:saved.customerId, name:saved.customerName,
          phone:saved.contact, source:'receipt', updatedAt:saved.date });
        window.dispatchEvent(new CustomEvent('zezms-sale-committed',{detail:{
          transactionId:saved.receiptNo, saleType:'RECEIPT', customerId:saved.customerId,
          customerName:saved.customerName, customerPhone:saved.contact, date:saved.date,
          lines:structuredClone(saved.lines), saleRecord:structuredClone(saved)
        }}));
      } catch (error) { console.error('Deposit Sale Out post-sale integration needs review',error); }
      selection = null;
      nav('receipts');
      showReceiptModal(saved);
    } catch (error) {
      status(error.message);
      if (!order(id)?.sale && $('depositReleaseSave')) $('depositReleaseSave').disabled = false;
    } finally { submitting = false; }
  }

  function validateDepositUndo(transaction) {
    const id = transaction.meta?.depositOrderId;
    if (!id) return;
    const current = order(id);
    requireThat(!current?.sale,'Undo the linked Sale Out before reversing this deposit payment.');
    requireThat(transaction.receiptNo !== id || current?.payments.length <= 1,
      'Undo the other payments for this product before voiding its first deposit.');
  }

  function applied(transaction) {
    return transaction?.meta?.source === APPLY && transaction?.meta?.kind === 'depositors';
  }

  function planUndo(sale) {
    if (!sale.depositOrderId) return null;
    const audit = DB.accountTxns.find(t => applied(t) && active(t) && t.receiptNo === sale.receiptNo);
    const account = DB.depositors.find(a => a.id === sale.depositAccountId);
    requireThat(account && audit?.accountID === account.id && -audit.amount === sale.depositApplied
      && audit.meta.depositOrderId === sale.depositOrderId,'The linked deposit application cannot be verified for reversal.');
    return { account, audit, balance:round2(Number(account.balance) + sale.depositApplied) };
  }

  function undo(plan, reason) {
    if (!plan) return;
    plan.account.balance = plan.balance;
    plan.account.date = nowISO();
    delete plan.account.depositArchivedAt;
    Object.assign(plan.audit,{status:'UNDONE',undoneAt:nowISO(),undoneBy:session.cashier,undoReason:reason || ''});
  }

  function operationId(patches) {
    const sale = patches.find(patch => patch.collection === 'sales' && (patch.value || patch.fallback)?.depositOrderId);
    if (sale?.action === 'insert') return 'DCO-' + sale.value.receiptNo;
    if (sale?.action === 'update' && sale.changes.some(c => c.field === 'status' && c.value === 'UNDONE')) {
      return 'DCU-' + sale.fallback.receiptNo;
    }
    return '';
  }

  function linkedOperation(op) {
    return /^DC[OU]-SR-DCO-/.test(String(op.opId || ''));
  }

  function collision(row, local, hash) {
    if (!local || !linkedOperation(local) || row.op_id !== local.opId) return false;
    const incoming = row.payload;
    requireThat(incoming?.opId === local.opId && incoming.deviceId === row.device_id
      && incoming.payloadHash && incoming.payloadHash === hash(incoming)
      && operationId(local.patches) === local.opId && operationId(incoming.patches) === local.opId,
    'Cloud returned a different transaction for the linked deposit sale.');
    const link = op => op.patches.find(p => p.collection === 'sales' && (p.value || p.fallback)?.depositOrderId);
    const a = link(local), b = link(incoming);
    requireThat(a.key === b.key && (a.value || a.fallback).depositOrderId === (b.value || b.fallback).depositOrderId,
      'The linked deposit sale identities differ.');
    return true;
  }

  ZEZMS.depositCheckout = Object.freeze({
    order, quote, productOptions, paymentTerms, visibleAccount, heldForOrders, canRelease, open, leaving, viewHTML,
    captureForm, submit, cancel, selected:() => !!selection, validateDepositUndo, applied, planUndo, undo,
    operationId, linkedOperation, collision
  });
}());

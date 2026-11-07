/* Controlled television upgrades. All postings use the established M4/3 save path. */
(function () {
  'use strict';
  window.ZEZMS = window.ZEZMS || {};
  const BUILD = '20261107-tv-trade-in-r2', SUBTYPE = 'TV_TRADE_IN';
  const CHECKS = ['picture', 'sound', 'inputs', 'controls', 'screen', 'power'];
  let preview = null, busy = false, searchRows = [], selectedSource = null, forcePaint = false, mountedIdentity = '';
  const list = value => Array.isArray(value) ? value : [];
  const copy = value => JSON.parse(JSON.stringify(value));
  const clean = value => String(value == null ? '' : value).trim();
  const upper = value => clean(value).toUpperCase();
  const serialKey = value => upper(value).replace(/[^A-Z0-9]/g, '');
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const active = item => item && !['UNDONE', 'VOID', 'CANCELLED', 'REJECTED'].includes(upper(item.status)) && !item.voided;
  const esc = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => 'GH₵ ' + Number(value).toLocaleString('en-GH', {minimumFractionDigits:2,maximumFractionDigits:2});
  function assert(value, message) { if (!value) throw Error(message); }
  function db() { assert(typeof DB !== 'undefined' && DB, 'The local database is unavailable.'); return DB; }
  function actor() {
    const context = ZEZMS.staffAuth && ZEZMS.staffAuth.getContext();
    assert(context && context.user && context.user.id && ['OWNER','ADMIN'].includes(upper(context.role)), 'Sign in as Owner or Admin to manage TV trade-ins.');
    return {id:clean(context.user.id), name:clean(context.user.name), role:upper(context.role)};
  }
  function records() { return list(db().inventoryTxns).filter(item => item.subtype === SUBTYPE); }
  function state() { return ZEZMS.cloudSync && ZEZMS.cloudSync.getState() || {}; }
  function requireReady() {
    actor(); const sync = ZEZMS.cloudSync, s = state();
    assert(sync && s.initialized && upper(s.deviceAccessStatus) === 'ACTIVE', 'Trade-ins require an active registered Cloud device.');
    assert(navigator.onLine && s.signedInEmail, 'Connect to Cloud before approving a trade-in.');
    assert(sync.isReadyForLocalOperations() && !sync.isApplyingRemote(), 'Resolve device recovery or Sync readiness before approving a trade-in.');
    assert(!s.integrityWarning && !s.oldClientDetected && !list(sync.getFailedOperations()).length && !list(sync.getOutbox()).length,
      'Resolve pending, failed or integrity-blocked Sync operations before approving a trade-in.');
    return s;
  }
  function positive(value, label, allowZero) {
    const text = clean(value);
    assert(/^\d+(?:\.\d{1,2})?$/.test(text), label + ' must be a valid amount with at most two decimal places.');
    const n = Number(text);
    assert(Number.isFinite(n) && n <= 100000000 && (allowZero ? n >= 0 : n > 0), label + ' is outside the permitted range.');
    return n;
  }
  function integer(value, label, min, max) {
    assert(/^\d+$/.test(clean(value)), label + ' must be a whole number.');
    const n = Number(value); assert(Number.isSafeInteger(n) && n >= min && n <= max, label + ' is outside the permitted range.'); return n;
  }
  function television(product) { return !!product && /\b(TVS?|TELEVISIONS?)\b/i.test([product.category,product.name].join(' ')); }
  function productFor(line) {
    const products = list(db().products), id = clean(line.productId || line.id), name = clean(line.product || line.productName || line.name);
    return products.find(p => id && clean(p.id) === id) || products.find(p => clean(p.name) === name) || null;
  }
  function customerFor(sale) {
    const customers = list(db().customers), id = clean(sale.customerId), phone = serialKey(sale.contact || sale.customerPhone);
    const exact = customers.find(c => id && clean(c.customerId || c.id) === id);
    if (exact) return exact;
    const candidates = customers.filter(c => phone && serialKey(c.phone) === phone);
    return candidates.length === 1 ? candidates[0] : null;
  }
  function sourceRows(query) {
    actor(); const needle = upper(query); if (needle.length < 2) return [];
    const result = [];
    function add(kind, sale, lines) {
      if (!active(sale)) return;
      const customer = customerFor(sale), id = clean(sale.receiptNo || sale.id);
      if (!id) return;
      list(lines).forEach((line, lineIndex) => {
        const product = productFor(line), qty = Number(line.qty != null ? line.qty : line.quantity);
        if (!television(product) || !Number.isSafeInteger(qty) || qty <= 0) return;
        const name = clean(sale.customer || sale.customerName || customer && customer.name);
        const haystack = upper([id,sale.receiptRef,name,sale.contact,sale.customerPhone,product.name,product.id].join(' '));
        if (haystack.includes(needle)) result.push({kind,id,lineIndex,productId:product.id,productName:product.name,quantity:qty,customerId:clean(customer && (customer.customerId || customer.id)),customerName:name,date:sale.date,receiptRef:sale.receiptRef || id});
      });
    }
    list(db().sales).forEach(s => add('RECEIPT',s,s.lines));
    list(db().inventoryTxns).filter(t => t.type === 'SALE_OUT' && t.subtype === 'QUICK').forEach(t => add('QUICK',t,t.details && t.details.lines));
    return result.slice(0,50);
  }
  function resolveSource(input) {
    const kind = upper(input.sourceKind), id = clean(input.sourceSaleId);
    assert(['RECEIPT','QUICK'].includes(kind) && id, 'Select an original Zola sale.');
    const candidates = (kind === 'RECEIPT' ? list(db().sales) : list(db().inventoryTxns).filter(t => t.type === 'SALE_OUT' && t.subtype === 'QUICK'))
      .filter(s => clean(s.receiptNo || s.id) === id);
    assert(candidates.length === 1 && active(candidates[0]), 'The original sale is missing, duplicated, void or reversed.');
    const sale = candidates[0], lines = kind === 'RECEIPT' ? sale.lines : sale.details && sale.details.lines;
    const index = integer(input.sourceLineIndex,'Original sale line',0,list(lines).length - 1), line = lines[index], product = productFor(line);
    assert(television(product), 'The original sale line must identify a television in the Product Catalog.');
    const qty = Number(line.qty != null ? line.qty : line.quantity);
    assert(Number.isSafeInteger(qty) && qty > 0, 'The original sale quantity cannot identify individual televisions.');
    const unit = integer(input.sourceUnit,'Original unit number',1,qty), customer = customerFor(sale);
    assert(customer && clean(customer.name) && clean(customer.phone), 'The original sale needs an identifiable Customer Master record with name and telephone.');
    const claim = [kind,id,index,unit].join('|');
    assert(!records().some(t => t.details && t.details.tradeIn && t.details.tradeIn.sourceClaim === claim), 'This original sale unit already has a trade-in record, including any reversed record.');
    return {kind,id,index,unit,claim,sale,line,product,customer};
  }
  async function digest(text) {
    assert(window.crypto && crypto.subtle, 'Secure hashing is unavailable. Use the normal HTTPS app.');
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  }
  function evidence(source, product, wallet) {
    const period = getLatestMonth();
    return JSON.stringify({source:source.sale, customer:source.customer, originalProduct:source.product, product,
      rows:list(db().stockRows).filter(r => r.productName === product.name && r.year === period.year && r.month === period.month),
      period, wallet:ZEZMS.cashWallets.getByKey(wallet), device:state().deviceId, owner:state().syncOwnerId, actor:actor()});
  }
  async function prepare(input) {
    actor(); input = copy(input); const source = resolveSource(input), serial = clean(input.serial).slice(0,120), key = serialKey(serial);
    assert(key.length >= 4 && clean(input.serial).length <= 120, 'Record the inspected TV serial number (4–120 characters).');
    assert(!records().some(t => t.details && t.details.tradeIn && t.details.tradeIn.serialKey === key), 'This serial number already has a trade-in record.');
    const originalSerials = list(db().warranties).filter(w => active(w) && clean(w.saleTransactionId) === source.id && Number(w.sourceLineIndex) === source.index && clean(w.serialNumber)).map(w => serialKey(w.serialNumber));
    if (originalSerials.length) assert(originalSerials.includes(key), 'The inspected serial number does not match the original warranty record.');
    assert(input.purchaseConfirmed === true, 'Confirm the original Zola sale belongs to this inspected television.');
    const verificationNote = clean(input.verificationNote);
    assert(verificationNote.length >= 10 && verificationNote.length <= 600, 'Record how the original purchase and this physical television were verified (10–600 characters).');
    CHECKS.forEach(check => assert(input.checks && input.checks[check] === true, 'All working-condition inspection checks must pass: ' + check + '.'));
    const condition = clean(input.condition);
    assert(condition.length >= 5 && condition.length <= 1000, 'Record the inspected condition and any cosmetic wear (5–1,000 characters).');
    const originalScreen = integer(input.originalScreen,'Original screen size',10,150), newScreen = integer(input.newScreen,'Upgrade screen size',10,150);
    assert(newScreen > originalScreen, 'The new television must have a larger screen than the accepted television.');
    const product = list(db().products).find(p => clean(p.id) === clean(input.newProductId));
    assert(television(product) && upper(product.condition) !== 'USED' && product.source !== SUBTYPE, 'Select a new television for the upgrade.');
    assert(stockOnHand(product.name) >= 1, 'The upgrade television has no available stock in the open month.');
    const price = positive(input.newPrice,'New television selling price'), credit = positive(input.credit,'Agreed trade-in value'), resalePrice = positive(input.resalePrice,'Used television resale price');
    const vatPercent = positive(input.vatPercent,'VAT percentage',true), withholdingPercent = positive(input.withholdingPercent,'Withholding percentage',true);
    assert(vatPercent <= 100 && withholdingPercent <= 100, 'Tax percentages cannot exceed 100.');
    const taxes = calculateSaleOutTaxSummary(price,vatPercent,withholdingPercent);
    assert(credit < taxes.netAmountCollectible, 'Trade-in credit must be less than the upgrade total; no cash payout is permitted.');
    const cash = positive(input.cash,'Actual additional payment',true), due = round(taxes.netAmountCollectible - credit);
    assert(Math.abs(cash - due) < 0.005, 'Actual additional payment must equal ' + money(due) + '. This workflow requires full settlement.');
    const wallet = ZEZMS.cashWallets.keyFromSelection(input.wallet);
    assert(wallet && ZEZMS.cashWallets.isActive(wallet), 'Select an active wallet for the actual additional payment.');
    const hash = await digest('ZEZMS-TV-TRADE-IN/1|' + source.claim), serialHash = await digest('ZEZMS-TV-SERIAL/1|' + key);
    return {version:1,input,sourceClaim:source.claim,sourceKind:source.kind,sourceSaleId:source.id,sourceLineIndex:source.index,sourceUnit:source.unit,
      sourceProductId:source.product.id,sourceProductName:source.product.name,customerId:source.customer.customerId || source.customer.id,customerName:source.customer.name,contact:source.customer.phone,location:source.customer.location || '',
      serial,serialKey:key,serialEvidence:originalSerials.length ? 'MATCHED_WARRANTY_SERIAL' : 'MANUAL_PHYSICAL_PURCHASE_CHECK',verificationNote,condition,checks:copy(input.checks),originalScreen,newScreen,
      newProductId:product.id,newProductName:product.name,price,credit,resalePrice,cash,wallet,taxes,
      operationId:'TVTI-' + hash,tradeInId:'TVTI-' + hash,usedProductId:'UTV-' + serialHash,usedRowId:'UTVROW-' + serialHash,
      evidence:evidence(source,product,wallet)};
  }
  function requireSame(current, prepared) {
    assert(current.evidence === prepared.evidence && JSON.stringify(current) === JSON.stringify(prepared), 'The sale, stock, price, device, staff or inspection changed after preview. Preview the trade-in again.');
  }
  function restoreInMemory(before) { DB = before; }
  function saveAtomic(before, recordId) {
    try { saveDB(); }
    catch (error) {
      // Never erase a durable posting merely because later queue/bookkeeping failed.
      let durable = null; try { durable = ZEZMS.db.load(DB_KEY); if (typeof durable === 'string') durable = JSON.parse(durable); } catch (_) {}
      const committed = durable && list(durable.inventoryTxns).some(t => t.id === recordId);
      if (committed) { DB = durable; const savedError=Error('The transaction is saved locally, but Sync needs review. Do not submit it again. ' + error.message); savedError.tradeInSaved=true; throw savedError; }
      restoreInMemory(before); throw error;
    }
  }
  async function accept(prepared) {
    assert(!busy, 'A trade-in action is already running.'); busy = true;
    try {
      requireReady(); const staff = actor(), sync = ZEZMS.cloudSync;
      const scope=ZEZMS.syncResilience.captureContext(()=>({client:sync.getClient(),session:sync.getSession(),state:sync.getState(),ownerId:sync.currentSyncOwnerId()}));
      await sync.pullNow(false); requireReady();
      const current = await prepare(prepared.input); requireReady(); assert(scope.valid(),'Cloud account or device context changed. Preview the trade-in again.'); requireSame(current,prepared);
      const before = copy(db()), period = getLatestMonth(), at = new Date().toISOString(), receiptNo = 'SR-TVTI-' + crypto.randomUUID();
      const usedName = 'USED · ' + current.sourceProductName + ' · SN ' + current.serial;
      const tradeIn = Object.assign({},current,{evidence:undefined,input:undefined,approvedAt:at,approvedBy:staff,inspectionBy:staff,inspectionAt:at,newSaleId:receiptNo,usedProductName:usedName});
      try {
        const start = DB.undoLog.length, allocations = recordSaleOutFIFO(current.newProductName,1,current.price,0);
        DB.undoLog.slice(start).forEach(entry => { entry.batchId=receiptNo;entry.inventoryTxnId=receiptNo;entry.type='SALE_OUT_ALLOC'; });
        assert(!list(DB.products).some(p => p.id === current.usedProductId || p.name === usedName) && !list(DB.stockRows).some(r => r.id === current.usedRowId), 'The accepted TV already exists in used stock.');
        DB.products.push({id:current.usedProductId,name:usedName,category:resolveSource(current.input).product.category,uPrice:current.resalePrice,condition:'USED',source:SUBTYPE,serialNumber:current.serial,tradeInId:current.tradeInId,createdAt:at});
        DB.stockRows.push({id:current.usedRowId,productId:current.usedProductId,productName:usedName,category:resolveSource(current.input).product.category,year:period.year,month:period.month,qtyIn:1,qtyOut:0,rStock:1,uCost:current.credit,uPrice:current.resalePrice,disc:0,tSales:0,profit:0,aPrice:0,condition:'USED',source:SUBTYPE,tradeInId:current.tradeInId,serialNumber:current.serial,date:at});
        const cash = adjustCash(current.wallet,'Add',current.cash,'TV upgrade payment ' + receiptNo,{source:'SALE_RECEIPT',saleReceiptNo:receiptNo,receiptNo,tradeInId:current.tradeInId,cashAmount:current.cash});
        const cashEntry = cash || DB.cashLog[DB.cashLog.length-1]; assert(cashEntry && cashEntry.meta && cashEntry.meta.tradeInId === current.tradeInId, 'The linked actual payment was not recorded.');
        cashEntry.status='ACTIVE';
        const tax=current.taxes, common={receiptNo,customerId:current.customerId,contact:current.contact,location:current.location,subtotal:tax.subtotal,vatRate:tax.vatRate,vatAmount:tax.vatAmount,withholdingTaxRate:tax.withholdingTaxRate,withholdingTax:tax.withholdingTax,withholdingTaxAmount:tax.withholdingTaxAmount,grossTotal:tax.grossAmountDue,netAmountCollectible:tax.netAmountCollectible,balance:0,status:'ACTIVE',saleType:'RECEIPT',date:at,cashier:staff.name,cashierTel:session.tel || '',salesChannel:'Walk-in',salesChannelOther:'',cashBucket:current.wallet,paymentWallet:current.wallet,cashReceived:current.cash,cashLogId:cashEntry.id,tradeInId:current.tradeInId,tradeInCredit:current.credit,tradeInSerial:current.serial,tradeInOriginalReceipt:current.sourceSaleId,usedProductId:current.usedProductId};
        DB.receipts.push(Object.assign({},common,{customerName:current.customerName,totalAmount:tax.grossAmountDue,amountPaid:tax.netAmountCollectible,credit:false,lines:[{product:current.newProductName,productId:current.newProductId,qty:1,uPrice:current.price,disc:0,total:current.price}]}));
        DB.sales.push(Object.assign({},common,{id:receiptNo,customer:current.customerName,total:tax.grossAmountDue,paid:tax.netAmountCollectible,pay:'PAID',year:period.year,month:period.month,lines:[{product:current.newProductName,productId:current.newProductId,qty:1,price:current.price,disc:0,amount:current.price,fifo:allocations}]}));
        DB.inventoryTxns.push({id:current.tradeInId,type:'STOCK_IN',subtype:SUBTYPE,status:'ACTIVE',date:at,year:period.year,month:period.month,cashier:staff.name,product:usedName,qty:1,amount:current.credit,reference:current.usedRowId,details:{stockRowId:current.usedRowId,createdRow:true,beforeRow:null,year:period.year,month:period.month,uCost:current.credit,uPrice:current.resalePrice,tradeIn}});
        DB.undoLog.push({id:'TIUNDO-'+crypto.randomUUID(),type:'STOCK_IN',row:current.usedRowId,stockRowId:current.usedRowId,product:usedName,qty:1,disc:0,at,batchId:current.tradeInId,inventoryTxnId:current.tradeInId,cashier:staff.name});
        if(ZEZMS.receiptReferencesR67X)ZEZMS.receiptReferencesR67X.attachReceiptReference(DB.receipts[DB.receipts.length-1]);
        assert(ZEZMS.warrantyManagement && typeof ZEZMS.warrantyManagement.createForCompletedSale==='function','The established warranty service is unavailable.');
        ZEZMS.warrantyManagement.createForCompletedSale({transactionId:receiptNo,saleType:'RECEIPT',customerId:current.customerId,customerName:current.customerName,customerPhone:current.contact,date:at,lines:[{product:current.newProductName,productId:current.newProductId,qty:1,uPrice:current.price,disc:0,total:current.price}]},{noSave:true});
        saveAtomic(before,current.tradeInId);
      } catch(error) { if (!error.tradeInSaved) restoreInMemory(before); throw error; }
      preview=null;
      // Match normal completed-sale integrations; failures cannot undo a durable sale.
      try { window.dispatchEvent(new CustomEvent('zezms-sale-committed',{detail:{transactionId:receiptNo,saleType:'RECEIPT',customerId:current.customerId,customerName:current.customerName,customerPhone:current.contact,date:at,lines:[{product:current.newProductName,productId:current.newProductId,qty:1,uPrice:current.price,disc:0,total:current.price}]}})); } catch(error) { console.error('TV trade-in post-sale integration needs review',error); }
      let syncError=''; try { await sync.pushNow(false); } catch(error) { syncError=clean(error.message); }
      assert(records().some(t=>t.id===current.tradeInId && active(t)), 'Cloud rejected this trade-in and its local posting was rolled back. Review Sync before continuing.');
      return {tradeInId:current.tradeInId,receiptNo,pending:list(sync.getOutbox()).length>0,syncError};
    } finally { busy=false; }
  }
  function linked(identifier) {
    const id=clean(identifier).replace(/^SALE:/,'');
    return records().find(t => {const d=t.details && t.details.tradeIn;return d && (t.id===id || d.newSaleId===id || (active(t) && d.sourceSaleId===id));});
  }
  function blockPartial(identifier) {
    if (linked(identifier)) throw Error('This transaction belongs to a TV trade-in. Its linked stock, sale and payment must stay together; use the TV Trade-ins register.');
  }
  function blockCash(id) { const entry=list(db().cashLog).find(e=>e.id===id);if(entry && entry.meta)blockPartial(entry.meta.tradeInId || entry.meta.saleReceiptNo || entry.meta.receiptNo || entry.meta.quickSaleId); }
  function assertResalable(name) {
    const product=list(db().products).find(p=>p.name===name);if(!product || product.source!==SUBTYPE)return;
    const t=records().find(t=>t.id===product.tradeInId);assert(t && active(t),'The used TV acquisition is not an active trade-in.');
    const id=t.details.tradeIn.operationId,sync=ZEZMS.cloudSync;
    assert(!list(sync.getOutbox()).some(op=>op.opId===id) && !list(sync.getFailedOperations()).some(op=>op.opId===id),'Wait for the trade-in Cloud acknowledgement before reselling this used television.');
  }
  function receiptInfo(source) {
    const id=clean(source && (source.receiptNo || source.id));
    return list(db().receipts).find(r => clean(r.receiptNo)===id || clean(r.receiptRef)===id) || source || {};
  }
  function receiptHTML(source) {
    const r=receiptInfo(source); if(!r.tradeInId)return '';
    return '<div class="trade-in-receipt"><b>TV TRADE-IN PAYMENT</b><br>Trade-in credit: '+esc(money(r.tradeInCredit))+'<br>Additional payment received: '+esc(money(r.cashReceived))+'<br>Accepted TV serial: '+esc(r.tradeInSerial)+'<br>Original purchase: '+esc(r.tradeInOriginalReceipt)+'</div>';
  }
  function receiptPDFRows(source) {
    const r=receiptInfo(source);return r.tradeInId ? [{label:'Trade-in credit',value:money(r.tradeInCredit).replace('GH₵','GHS')},{label:'Additional payment received',value:money(r.cashReceived).replace('GH₵','GHS')},{label:'Accepted TV serial',value:r.tradeInSerial}] : [];
  }
  function detailHTML(t) {
    const d=t.details.tradeIn,sync=ZEZMS.cloudSync,op=list(sync && sync.getOutbox()).find(op => op.opId===d.operationId);
    return '<div class="card"><h3>'+esc(d.usedProductName)+'</h3><p>'+esc(t.status)+' · '+(op?'Cloud confirmation pending — do not repeat this transaction.':'Saved trade-in; check Sync for current device convergence.')+'</p><div class="statline"><span>Original sale</span><b>'+esc(d.sourceSaleId)+' · line '+(d.sourceLineIndex+1)+' · unit '+d.sourceUnit+'</b></div><div class="statline"><span>Upgrade receipt</span><b>'+esc(d.newSaleId)+'</b></div><div class="statline"><span>Customer</span><b>'+esc(d.customerName)+'</b></div><div class="statline"><span>Credit / stock acquisition cost</span><b>'+esc(money(d.credit))+'</b></div><div class="statline"><span>Additional payment</span><b>'+esc(money(d.cash))+'</b></div><div class="statline"><span>Used-stock selling price</span><b>'+esc(money(d.resalePrice))+'</b></div><p>Inspection: '+esc(d.condition)+'<br>Purchase verification: '+esc(d.verificationNote)+'<br>Serial evidence: '+esc(d.serialEvidence)+'<br>Approved by '+esc(d.approvedBy.name)+' · '+esc(d.approvedAt)+'</p><button class="btn ghost" onclick="ZEZMS.tvTradeIns.showReceipt(\''+esc(d.newSaleId)+'\')">View upgrade receipt</button></div>';
  }
  function viewHTML() {
    actor();return '<section id="tvTradeIns"><style>#tvTradeIns .grid{align-items:start}#tvTradeIns label{display:block;margin-top:10px}#tvTradeIns .ti-check{display:flex;gap:8px;align-items:center}#tvTradeIns .ti-check input{width:auto}#tvTradeIns input,#tvTradeIns select,#tvTradeIns textarea{box-sizing:border-box;max-width:100%;width:100%;font:inherit;color:#f8fafc;background:#081221;border:1px solid #475569;border-radius:6px;padding:10px;caret-color:#f8fafc;color-scheme:dark}#tvTradeIns input::placeholder,#tvTradeIns textarea::placeholder{color:#94a3b8;opacity:1}#tvTradeIns select option{background:#081221;color:#f8fafc}#tvTradeIns input:focus,#tvTradeIns select:focus,#tvTradeIns textarea:focus{border-color:#2dd4bf;outline:2px solid rgba(45,212,191,.35);outline-offset:1px}#tvTradeIns input[readonly],#tvTradeIns input:disabled,#tvTradeIns select:disabled,#tvTradeIns textarea:disabled{background:#111c2f;color:#cbd5e1;opacity:1}#tvTradeIns input:-webkit-autofill{-webkit-text-fill-color:#f8fafc;box-shadow:0 0 0 1000px #081221 inset;caret-color:#f8fafc}#tvTradeIns input[type=checkbox]{accent-color:#14b8a6;padding:0}#tvTradeIns .ti-check input{width:auto}#tiResults button{text-align:left;white-space:normal}#tvTradeIns .statline{gap:12px;overflow-wrap:anywhere}@media(max-width:700px){#tvTradeIns .grid{grid-template-columns:1fr}}</style><div class="card"><h2>TV Trade-ins</h2><p>Working televisions originally bought from Zola, toward a larger new television. Owner/Admin inspection and approval are required. On completion, the accepted TV immediately becomes a separate used-stock item for resale.</p><p class="muted">The additional payment must settle the upgrade in full. Credit is recorded as stock value, never as cash received. Saved trade-ins cannot be edited or undone one side at a time.</p><label for="tiSearch">Find original purchase by receipt, customer, telephone or TV</label><div class="row"><input id="tiSearch" type="search" maxlength="120" placeholder="Enter at least two characters"><button class="btn" onclick="ZEZMS.tvTradeIns.search()">Find purchase</button></div><div id="tiResults" class="grid"></div><div id="tiForm"></div><div id="tiStatus" role="status" aria-live="polite"></div></div><h3>Accepted televisions</h3>'+records().slice().reverse().slice(0,50).map(detailHTML).join('')+'</section>';
  }
  function search() {
    try {searchRows=sourceRows(document.getElementById('tiSearch').value);const el=document.getElementById('tiResults');el.innerHTML=searchRows.map((r,i)=>'<button class="btn ghost" onclick="ZEZMS.tvTradeIns.select('+i+')">'+esc(r.receiptRef)+' · '+esc(r.customerName)+'<br>'+esc(r.productName)+' · '+esc(r.date)+'</button>').join('') || '<p>No matching active television sale found.</p>';} catch(error){status(error.message,true);}
  }
  function field(id,label,type,value) {return '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value == null ? '' : value)+'"'+(type==='number'?' step="0.01" min="0"':'')+'>';}
  function select(index) {
    try {actor();selectedSource=searchRows[index];assert(selectedSource,'Select a purchase from the current results.');preview=null;const r=selectedSource;
      const products=list(db().products).filter(p=>television(p)&&upper(p.condition)!=='USED'&&p.source!==SUBTYPE&&stockOnHand(p.name)>=1);
      document.getElementById('tiForm').innerHTML='<h3>Inspect and value the television</h3><p>'+esc(r.receiptRef)+' · '+esc(r.customerName)+' · '+esc(r.productName)+'</p><div class="grid g2"><div>'+field('tiUnit','Unit number from original sale (1–'+r.quantity+')','number',1)+field('tiSerial','Inspected TV serial number','text','')+field('tiOriginalScreen','Accepted TV screen size (inches)','number','')+'<label for="tiVerification">How the original purchase and physical TV were verified</label><textarea id="tiVerification" maxlength="600"></textarea><label class="ti-check"><input id="tiPurchase" type="checkbox">I verified this TV was originally bought from Zola.</label>'+CHECKS.map(c=>'<label class="ti-check"><input id="tiCheck-'+c+'" type="checkbox">'+esc({picture:'Picture works correctly',sound:'Sound works correctly',inputs:'Inputs/ports tested',controls:'Controls tested',screen:'Screen has no functional defects',power:'Power and stable operation tested'}[c])+'</label>').join('')+'<label for="tiCondition">Inspected condition, cosmetic wear and accessories</label><textarea id="tiCondition" maxlength="1000"></textarea>'+field('tiCredit','Agreed trade-in credit / used-stock cost (GH₵)','number','')+field('tiResale','Used television resale price (GH₵)','number','')+'</div><div><label for="tiNewProduct">New television for upgrade</label><select id="tiNewProduct" onchange="ZEZMS.tvTradeIns.productChanged()"><option value="">Select an available new TV</option>'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select>'+field('tiNewScreen','New TV screen size (inches)','number','')+field('tiPrice','Agreed new TV selling price before VAT (GH₵)','number','')+field('tiVat','Approved VAT percentage','number',typeof currentSaleVatPercent==='function'?currentSaleVatPercent():'0')+field('tiWithholding','Approved withholding percentage','number',typeof currentSaleWithholdingTaxPercent==='function'?currentSaleWithholdingTaxPercent():'0')+'<label for="tiWallet">Wallet receiving additional payment</label><select id="tiWallet">'+ZEZMS.cashWallets.selectorOptions({selected:'Cash in Hand'})+'</select>'+field('tiCash','Actual additional payment received (GH₵)','number','')+'<p class="muted">Additional payment = new TV net amount collectible − agreed trade-in credit. No cash payout, credit balance or change is created here.</p><button class="btn" onclick="ZEZMS.tvTradeIns.previewFromUI()">Preview trade-in</button></div></div><div id="tiPreview"></div>';
    }catch(error){status(error.message,true);}
  }
  function productChanged() {const p=list(db().products).find(p=>p.id===document.getElementById('tiNewProduct').value);if(p)document.getElementById('tiPrice').value=p.uPrice || '';preview=null;document.getElementById('tiPreview').innerHTML='';}
  function formInput() {const value=id=>document.getElementById(id).value;assert(selectedSource,'Select an original purchase.');return {sourceKind:selectedSource.kind,sourceSaleId:selectedSource.id,sourceLineIndex:String(selectedSource.lineIndex),sourceUnit:value('tiUnit'),serial:value('tiSerial'),originalScreen:value('tiOriginalScreen'),newScreen:value('tiNewScreen'),verificationNote:value('tiVerification'),condition:value('tiCondition'),purchaseConfirmed:document.getElementById('tiPurchase').checked,checks:Object.fromEntries(CHECKS.map(c=>[c,document.getElementById('tiCheck-'+c).checked])),credit:value('tiCredit'),resalePrice:value('tiResale'),newProductId:value('tiNewProduct'),newPrice:value('tiPrice'),vatPercent:value('tiVat'),withholdingPercent:value('tiWithholding'),wallet:value('tiWallet'),cash:value('tiCash')};}
  function status(message,error) {const el=document.getElementById('tiStatus');if(el){el.textContent=message;el.className=error?'notice bad':'notice';}else if(typeof toast==='function')toast(message,error?'err':'ok');}
  async function previewFromUI() {
    try {preview=await prepare(formInput());const p=preview;document.getElementById('tiPreview').innerHTML='<div class="card"><h3>Review before approval</h3><p>'+esc(p.customerName)+' · '+esc(p.sourceProductName)+' ('+p.originalScreen+'″) → '+esc(p.newProductName)+' ('+p.newScreen+'″)</p><p>New TV net amount collectible: <b>'+esc(money(p.taxes.netAmountCollectible))+'</b><br>Trade-in credit and used-stock cost: <b>'+esc(money(p.credit))+'</b><br>Actual additional payment to '+esc(ZEZMS.cashWallets.label(p.wallet))+': <b>'+esc(money(p.cash))+'</b><br>Purchase identity evidence: <b>'+esc(p.serialEvidence)+'</b><br>Used-stock resale price: <b>'+esc(money(p.resalePrice))+'</b></p><label class="ti-check"><input id="tiApprove" type="checkbox">I approve this valuation and confirm the customer accepted it and paid the additional amount.</label><button id="tiAccept" class="btn warn" onclick="ZEZMS.tvTradeIns.acceptFromUI()">Approve and complete trade-in</button></div>';status('Preview only. No business data has changed.');}
    catch(error){preview=null;status(error.message,true);}
  }
  async function acceptFromUI() {
    const button=document.getElementById('tiAccept');
    try {assert(preview,'Preview the trade-in first.');assert(document.getElementById('tiApprove').checked,'Confirm approval, customer agreement and actual payment.');assert(JSON.stringify(formInput())===JSON.stringify(preview.input),'The form changed after preview. Preview it again.');if(button)button.disabled=true;status('Checking current Cloud state and completing the linked transaction…');const result=await accept(preview);forcePaint=true;render();status(result.pending || result.syncError ? 'Saved locally. Await Cloud confirmation before handover or resale; do not repeat this trade-in. '+result.syncError : 'Trade-in completed and uploaded. The accepted television is now separate used stock.');}
    catch(error){status(error.message,true);}finally{if(button)button.disabled=false;}
  }
  function open() {actor();preview=null;selectedSource=null;forcePaint=true;currentView='tv-trade-ins';render();}
  function install() {
    for(const name of ['undoInventoryTransaction','editStoredReceipt']) { const base=window[name]; if(typeof base==='function')window[name]=function(id){try{blockPartial(id);}catch(error){status(error.message,true);return false;}return base.apply(this,arguments);}; }
    const cashUndo=window.undoCashTransaction;if(typeof cashUndo==='function')window.undoCashTransaction=function(id){try{blockCash(id);}catch(error){status(error.message,true);return false;}return cashUndo.apply(this,arguments);};
    if(typeof render!=='function')return;
    const inherited=render;
    render=function(){
      if(currentView!=='tv-trade-ins')return inherited.apply(this,arguments);
      try{
        const staff=actor(),identity=staff.id+'|'+staff.role,root=document.getElementById('viewRoot');
        if(typeof updatePeriodUI==='function')updatePeriodUI();if(typeof applyRoleUI==='function')applyRoleUI();
        const title=document.getElementById('viewTitle');if(title)title.textContent='TV Trade-ins';
        // Background clock/Sync renders must not replace a form being inspected.
        // A fresh preview and Cloud receive still validate every value at commit.
        if(!forcePaint && mountedIdentity===identity && root.querySelector('#tvTradeIns'))return true;
        if(mountedIdentity!==identity){preview=null;selectedSource=null;searchRows=[];}
        forcePaint=false;mountedIdentity=identity;root.innerHTML=viewHTML();return true;
      }catch(error){preview=null;selectedSource=null;forcePaint=false;mountedIdentity='';currentView='pos';inherited();status(error.message,true);}
    };
    // Existing role rules still decide who can open Sales Records. Add a scoped entry there.
    const originalReceipts=window.viewReceipts;
    if(typeof originalReceipts==='function')window.viewReceipts=function(){const html=originalReceipts.apply(this,arguments);try{actor();return '<div class="row" style="margin-bottom:12px"><button class="btn" onclick="ZEZMS.tvTradeIns.open()">TV Trade-ins</button></div>'+html;}catch(_){return html;}};
  }
  ZEZMS.tvTradeIns=Object.freeze({build:BUILD,open,viewHTML,search,select,productChanged,previewFromUI,acceptFromUI,prepare,accept,records,blockPartial,blockCash,assertResalable,receiptHTML,receiptPDFRows,showReceipt:id=>showStoredReceipt(id),_test:{resolveSource,television,sourceRows,positive,serialKey,requireReady,receiptInfo}});
  install();
}());

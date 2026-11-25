// Actual payment UI, native durable commit, native push/read-back and ordered receive.
// Only staff identity and the network client are synthetic. No external access.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),d=require('../tools/build-pr11-delivery.cjs'),F=require('./receipt-payment-fixture.cjs');
const root=path.resolve(__dirname,'..');let browser;
const marker='    _test: {\n      buildOperation:';
const hook=`    _test: {
      configureReceiptPaymentTest(device,preserve,override={}) {
        if(!preserve){queue=[];failedOperations=[];appliedOperations={};}
        Object.assign(state,{deviceId:device,initialized:true,syncOwnerId:'OWNER-1',businessId:'BUSINESS-1',branchId:'BRANCH-1',deviceAccessMode:device==='MAIN'?'OWNER':'PAIRED',deviceAccessStatus:device==='MAIN'?'':'ACTIVE',lifecycleState:'',deviceLifecycleState:'',lifecycle_state:'',configurationVerificationRequired:false,liveSyncEnabled:false,liveSyncDesired:false,integrityWarning:false,oldClientDetected:false,r70CapabilityBlocked:false,supabaseUrl:'https://synthetic.invalid',publishableKey:'synthetic-public-key',signedInEmail:device==='MAIN'?'synthetic@example.invalid':''},override.state||{});
        session=Object.hasOwn(override,'session')?override.session:device==='MAIN'?{user:{id:'OWNER-1',email:'synthetic@example.invalid'}}:{user:{id:'ANONYMOUS-'+device,is_anonymous:true,app_metadata:{provider:'anonymous'}}};
        function query(){const q={filters:{},single:false,select(){return q;},eq(k,v){q.filters[k]=v;return q;},gt(k,v){q.filters['gt_'+k]=v;return q;},order(){return q;},limit(){return q;},maybeSingle(){q.single=true;return q;},abortSignal(){return window.syntheticPaymentRead({filters:q.filters,single:q.single});}};return q;}
        client={from(){return query();},rpc(name,args){return {then(resolve,reject){return window.syntheticPaymentPush({name,args}).then(resolve,reject);},abortSignal(){return window.syntheticPaymentPush({name,args});}};}};
        window.ZEZMS_M43_CAPABILITY_GUARD=async function(){};
        window.ZEZMS_M43_LAST_CAPABILITY={activationCursor:0};
        observedSnapshot=cleanSnapshot(getDatabase());persistState();persistQueue();persistFailedOperations();persistAppliedOperations();
        return true;
      },
      buildOperation:`;
let source=d.assembledShell(d.assetBytes('index.html').toString());assert.equal(source.split(marker).length,2);source=source.replace(marker,hook);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'payment-test.html';if(name==='payment-test.html'){res.setHeader('Content-Type','text/html');return res.end(source);}const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
function backend({race=false,loseAck=false,offline=false,reject=false}={}){
 const rows=[],calls=[];let waiting=[],mode={race,loseAck,offline,reject,deviceStatus:'ACTIVE'};
 return {rows,calls,mode,async read(input){if(mode.offline)return {error:{message:'Failed to fetch'}};let found=rows.filter(r=>!input.filters.op_id||r.op_id===input.filters.op_id);if(input.filters.gt_seq!=null)found=found.filter(r=>r.seq>input.filters.gt_seq);return {data:input.single?found[0]||null:structuredClone(found),error:null};},async push(input){if(mode.offline)return {error:{message:'Failed to fetch'}};if(input.name==='zezms_m5a3_device_context')return {data:[Object.assign(mode.sparseContext?{device_status:mode.deviceStatus}:{device_id:input.args.p_device_id,owner_id:'OWNER-1',business_id:'BUSINESS-1',branch_id:'BRANCH-1',device_status:mode.deviceStatus},mode.contextOverride||{})],error:null};assert.equal(input.name,'zezms_ops_push');const op=input.args.p_operations[0];calls.push(structuredClone(op));if(mode.reject)return {error:{message:'ZEZMS_CASH_CONFLICT: synthetic server rejection'}};if(mode.race){await new Promise(resolve=>{waiting.push({op,resolve});if(waiting.length===2){const first=waiting[0];rows.push({seq:21+rows.length,op_id:first.op.opId,device_id:first.op.deviceId,payload:structuredClone(first.op),created_at:new Date().toISOString()});const pending=waiting;waiting=[];mode.race=false;pending.forEach(x=>x.resolve());}});}let row=rows.find(r=>r.op_id===op.opId);if(!row){row={seq:21+rows.length,op_id:op.opId,device_id:op.deviceId,payload:structuredClone(op),created_at:new Date().toISOString()};rows.push(row);}if(mode.loseAck){mode.loseAck=false;return {error:{message:'Failed to fetch'}};}return {data:[{op_id:row.op_id,server_seq:row.seq}],error:null};}};
}
async function fixture(backend,device='MAIN',role='OWNER'){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();context.setDefaultTimeout(15000);await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.exposeFunction('syntheticPaymentRead',x=>backend.read(x));await page.exposeFunction('syntheticPaymentPush',x=>backend.push(x));
 const url='http://127.0.0.1:'+server.address().port+'/payment-test.html';await page.goto(url);await page.waitForFunction(()=>window.ZEZMS?.receiptPayments);await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 await page.evaluate(({data,device})=>{
  for(const [key,value]of Object.entries(data))DB[key]=value;
  ZEZMS.cloudSync._test.configureReceiptPaymentTest(device,false);
  // An established device already has the confirmed historical KPI at its sync baseline.
  // Materialize that startup record before testing the contents of the financial outbox.
  window.ZEZMSConfirmedJulySnapshot.apply();
  ZEZMS.cloudSync._test.ensureSyncIds(DB);
  ZEZMS.db.save(DB_KEY,DB);
  ZEZMS.cloudSync._test.configureReceiptPaymentTest(device,false);
 },{data:F.fixture(),device});
 async function configure(preserve=true){await page.evaluate(({device,role,preserve})=>{window.__paymentRole=role;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});DB.sharedDeviceAuth={version:1,enabled:true,businessId:'BUSINESS-1',users:[{id:'STAFF-'+device,name:'Synthetic '+device,role,active:true,tel:''}],audit:[]};Object.assign(session,{sharedUserId:'STAFF-'+device,cashier:'Synthetic '+device,commercialRole:role,role:'ADMIN',isCashier2:false,businessId:'BUSINESS-1'});document.getElementById('loginScreen').style.display='none';document.getElementById('appShell').style.display='flex';ZEZMS.db.save(DB_KEY,DB);const a=ZEZMS.staffAuth;ZEZMS.staffAuth={...a,isActive:()=>true,can:action=>['OWNER','ADMIN','MANAGER'].includes(__paymentRole)||action==='VIEW_RECEIPTS',getContext:()=>({role:__paymentRole,user:{id:'STAFF-'+device,name:'Synthetic '+device,active:true}})};ZEZMS.cloudSync._test.configureReceiptPaymentTest(device,preserve);}, {device,role,preserve});}
 await configure();return {page,context,url,configure};
}
async function snapshot(page){return page.evaluate(()=>({receipt:DB.receipts[0],sale:DB.sales[0],debtor:DB.debtors[0],cash:DB.cashBalances,txns:DB.accountTxns,log:DB.cashLog,outbox:ZEZMS.cloudSync.getOutbox(),failed:ZEZMS.cloudSync.getFailedOperations(),journal:ZEZMS.syncDurability.pending()}));}
async function prepare(page){return page.evaluate(()=>ZEZMS.receiptPayments.prepare('SR-SYNTHETIC'));}
async function accept(page,p,wallet='Cash in Hand'){return page.evaluate(({p,wallet})=>ZEZMS.receiptPayments.accept(p,{wallet,confirmed:true}),{p,wallet});}
test('an explicit Products selling price is used by new sales and documents after native sync', async () => {
 const cloud = backend(), main = await fixture(cloud,'MAIN'), shop = await fixture(cloud,'SHOP');
 const name = 'Synthetic cooler';
 const legacy = 'Legacy cooler';
 const salePrice = (page, product) => page.evaluate(product => {
  nav('pos');
  pickProduct(product);
  return Number($('posUPrice').value);
 },product);
 const business = page => page.evaluate(() => structuredClone({
  stock:DB.stockRows, sales:DB.sales, receipts:DB.receipts, cash:DB.cashBalances, inventory:DB.inventoryTxns
 }));
 const openProduct = async (page, product) => {
  await page.evaluate(() => nav('products'));
  await page.locator('#productCatalogBody tr').filter({hasText:product}).getByRole('button',{name:'Edit',exact:true}).click();
 };
 const saveProduct = page => page.locator('#modalBody').getByRole('button',{name:'Save',exact:true}).click();
 const receive = async () => {
  await main.page.evaluate(() => ZEZMS.cloudSync.pushNow(false));
  await shop.page.evaluate(() => ZEZMS.cloudSync.pullNow(false));
 };
 try {
  for (const [page,device] of [[main.page,'MAIN'],[shop.page,'SHOP']]) {
   await page.evaluate(({device,name,legacy}) => {
    const p = getLatestMonth();
    DB.products.push({id:'COOLER',name,category:'Cooling',uPrice:4400},{id:'LEGACY-COOLER',name:legacy,category:'Cooling',uPrice:120});
    DB.stockRows = [
     {id:'COOLER-BATCH',productId:'COOLER',productName:name,year:p.year,month:p.month,qtyIn:3,qtyOut:1,rStock:2,uCost:3950,uPrice:4950,tSales:4950,profit:1000},
     {id:'LEGACY-BATCH',productId:'LEGACY-COOLER',productName:legacy,year:p.year,month:p.month,qtyIn:2,qtyOut:0,rStock:2,uCost:100,uPrice:160}
    ];
    DB.cashBalances['Bank Savings'] = 0;
    DB.cashBalances.Others = 0;
    ZEZMS.cloudSync._test.ensureSyncIds(DB);
    ZEZMS.db.save(DB_KEY,DB);
    ZEZMS.cloudSync._test.configureReceiptPaymentTest(device,false);
   },{device,name,legacy});
  }
  const mainBefore = await business(main.page), shopBefore = await business(shop.page);
  assert.equal(await salePrice(main.page,name),4950);
  await openProduct(main.page,name);
  await main.page.locator('#epPrice').fill('4300.25');
  await saveProduct(main.page);
  assert.equal(await salePrice(main.page,name),4300.25);
  assert.equal(await salePrice(shop.page,name),4950);
  await receive();
  assert.equal(await salePrice(shop.page,name),4300.25);
  assert.equal(cloud.calls.length,1);
  assert.deepEqual(cloud.calls[0].patches.map(p => [p.action,p.collection,p.key]),[['update','products','COOLER']]);
  assert.deepEqual(await business(main.page),mainBefore);
  assert.deepEqual(await business(shop.page),shopBefore);

  const documentPrices = await shop.page.evaluate(name => {
   nav('invoices');
   pickCommercialProduct('inv',encodeURIComponent(name));
   const invoice = Number($('invUPrice').value);
   ZEZMS.salesPipeline.openQuotationForm();
   $('quoteProductSearch').value = 'COOLER';
   ZEZMS.salesPipeline.addDraftProduct();
   const quotation = Number($('quoteDraftLines').querySelector('input[aria-label="Unit price"]').value);
   closeModal();
   nav('proforma-invoices');
   ZEZMS.proformaInvoiceR67W.newDraft();
   $('pfiProductId').value = 'COOLER';
   ZEZMS.proformaInvoiceR67W.productFromId();
   return {invoice, quotation, proforma:Number($('pfiBaseUnitPrice').value)};
  },name);
  assert.deepEqual(documentPrices,{invoice:4300.25,quotation:4300.25,proforma:4300.25});
  assert.equal(await shop.page.evaluate(name => ZEZMS.cashBucketPriceListR67R.priceListModel().rows.find(p => p.name === name).unitPrice,name),4300.25);

  await openProduct(main.page,legacy);
  await main.page.locator('#epCat').fill('Appliances');
  await saveProduct(main.page);
  assert.equal(await salePrice(main.page,legacy),160);
  await openProduct(main.page,legacy);
  await main.page.getByRole('checkbox',{name:'Use this price for new sales and documents'}).check();
  await saveProduct(main.page);
  await receive();
  assert.equal(await salePrice(shop.page,legacy),120);
  assert.equal(await shop.page.evaluate(() => ZEZMS.cloudSync.getState().cursor),23);
  assert.equal(await main.page.evaluate(() => ZEZMS.cloudSync.getOutbox().length),0);
  assert.deepEqual(await business(shop.page),shopBefore);
 } finally { await main.context.close(); await shop.context.close(); }
});
test('unit cost corrections replay with reordered cloud JSON and converge across concurrent stock changes', async () => {
 const cloud = backend(), read = cloud.read;
 cloud.read = async input => {
  const response = await read(input);
  if (!response.data) return response;
  const rows = Array.isArray(response.data) ? response.data : [structuredClone(response.data)];
  for (const row of rows) {
   const audit = row.payload.patches.find(p => p.collection === 'stockCorrections' && p.value?.costAdjustment);
   if (audit) {
    // PostgreSQL JSONB can return keys in a different order from the local audit.
    audit.value = JSON.parse(JSON.stringify(audit.value), (_, value) =>
     value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key,value[key]]))
      : value);
   }
  }
  return {...response,data:input.single ? rows[0] : rows};
 };
 const a = await fixture(cloud,'MAIN'), b = await fixture(cloud,'SHOP');
 const sync = (page, method) => page.evaluate(name => ZEZMS.cloudSync[name](false),method);
 const costs = page => page.evaluate(() => ({row:DB.stockRows[0], audit:DB.stockCorrections.length, queue:ZEZMS.cloudSync.getOutbox().length}));
 const adjust = (page, next) => page.evaluate(unitCost => {
  const api = ZEZMS.stockCorrections;
  return api.commitCorrection(api.prepareCorrection({productId:'PC',stockRowId:'RC',correctionType:'Adjust Unit Cost',unitCost}));
 },next);
 try {
  for (const [device,page] of [['MAIN',a.page],['SHOP',b.page]]) {
   await page.evaluate(device => {
    const p = getLatestMonth();
    DB.products.push({id:'PC',name:'Synthetic cost item',uPrice:25});
    DB.stockRows = [{id:'RC',productId:'PC',productName:'Synthetic cost item',year:p.year,month:p.month,qtyIn:12,qtyOut:0,rStock:12,uCost:5,uPrice:25}];
    DB.stockCorrections = [];
    ZEZMS.cloudSync._test.ensureSyncIds(DB);
    ZEZMS.db.save(DB_KEY,DB);
    ZEZMS.cloudSync._test.configureReceiptPaymentTest(device,false);
   },device);
  }
  await adjust(a.page,8);
  await adjust(b.page,11);
  await sync(a.page,'pushNow');
  await sync(b.page,'pushNow');
  await sync(a.page,'pullNow');
  for (const page of [a.page,b.page]) {
   const value = await costs(page);
   assert.equal(value.row.uCost,11);
   assert.equal(value.row.rStock,12);
   assert.equal(value.audit,2);
   assert.equal(value.queue,0);
   assert.equal(await page.evaluate(() => ZEZMS.cloudSync.getState().cursor),22);
  }
  assert.equal(cloud.calls.length,2);

  await adjust(a.page,7);
  await b.page.evaluate(() => {
   DB.stockRows[0].rStock = 9;
   DB.stockRows[0].qtyOut = 3;
   saveDB();
  });
  await sync(b.page,'pushNow');
  await sync(a.page,'pullNow');
  const pending = await costs(a.page);
  assert.equal(pending.row.uCost,7);
  assert.equal(pending.row.rStock,9);
  assert.equal(pending.queue,1);
  await sync(a.page,'pushNow');
  await sync(b.page,'pullNow');
  assert.deepEqual(await costs(a.page),await costs(b.page));
  const final = await costs(a.page);
  assert.equal(final.row.uCost,7);
  assert.equal(final.row.qtyOut,3);
  assert.equal(final.row.uPrice,25);
  assert.equal(final.audit,3);

  await adjust(a.page,14);
  await adjust(b.page,9);
  await sync(b.page,'pushNow');
  await sync(a.page,'pullNow');
  assert.equal((await costs(a.page)).row.uCost,14);
  cloud.mode.reject = true;
  await sync(a.page,'pushNow');
  const rejected = await costs(a.page);
  assert.equal(rejected.row.uCost,9);
  assert.equal(rejected.row.rStock,9);
  assert.equal(rejected.audit,4);
  assert.equal(rejected.queue,0);
 } finally { await a.context.close(); await b.context.close(); }
});
test('Settle reverses a legacy creditor increase and reposts with a linked Cash in Hand receipt', async () => {
 const cloud=backend(),f=await fixture(cloud);
 try {
  await f.page.evaluate(()=>{
   DB.creditors=[{id:'C-CREDITOR',name:'Synthetic creditor',balance:4135}];
   DB.cashBalances['Cash in Hand']=16240;
   DB.accountTxns.push({id:'ATX-LEGACY-INCREASE',accountID:'C-CREDITOR',accountType:'CREDITOR',name:'Synthetic creditor',txnType:'INCREASE',amount:5000,balanceAfter:4135,status:'ACTIVE',meta:{kind:'creditors',source:'ACCOUNT_ADJUSTMENT',beforeBalance:-865,afterBalance:4135,wallet:'Cash in Hand',cashAction:'',cashAmount:0,cashLogId:''}});
   ZEZMS.cloudSync._test.ensureSyncIds(DB);ZEZMS.db.save(DB_KEY,DB);
   ZEZMS.cloudSync._test.configureReceiptPaymentTest('MAIN',false);
   window.promptPIN=(_label,_pin,complete)=>complete();
   window.confirm=()=>true;
   window.prompt=()=> 'Synthetic correction';
   window.undoAccountTransaction('ATX-LEGACY-INCREASE');
  });
  const read=()=>f.page.evaluate(()=>({balance:DB.creditors[0].balance,cash:DB.cashBalances['Cash in Hand'],txns:DB.accountTxns.filter(txn=>txn.accountID==='C-CREDITOR'),log:DB.cashLog,sale:DB.sales[0],receipt:DB.receipts[0]}));
  const reset=await read();
  assert.equal(reset.balance,-865);
  assert.equal(reset.cash,16240);
  assert.equal(reset.txns[0].status,'UNDONE');
  assert.equal(reset.log.length,0);

  await f.page.evaluate(()=>window.openSettle('creditors','C-CREDITOR'));
  await f.page.locator('#stAmt').fill('5000');
  await f.page.locator('#stDir').selectOption('INCREASE');
  await f.page.locator('#stWallet').selectOption('Cash in Hand');
  await f.page.getByRole('button',{name:'Apply',exact:true}).click();
  const posted=await read(),txn=posted.txns[1],cash=posted.log[0];
  assert.equal(posted.balance,4135);
  assert.equal(posted.cash,21240);
  assert.equal(posted.log.length,1);
  assert.equal(txn.meta.cashAction,'Add');
  assert.equal(txn.meta.cashAmount,5000);
  assert.equal(txn.meta.cashLogId,cash.id);
  assert.equal(cash.meta.accountTxnId,txn.id);
  assert.equal(cash.cashType,'Cash in Hand');
  assert.deepEqual(posted.sale,reset.sale);
  assert.deepEqual(posted.receipt,reset.receipt);

  await f.page.evaluate(id=>window.undoAccountTransaction(id),txn.id);
  const undone=await read();
  assert.equal(undone.balance,-865);
  assert.equal(undone.cash,16240);
  assert.equal(undone.txns[1].status,'UNDONE');
  assert.equal(undone.log[0].status,'UNDONE');
 } finally { await f.context.close(); }
});
test('Paid button records one actual native linked payment and updates reprint/PDF amounts without changing FIFO or sales totals',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{
  await f.page.evaluate(()=>{currentView='receipts';document.getElementById('viewRoot').innerHTML=viewReceipts();ZEZMS.pdfExport.installRegisterButtons();});assert.equal(await f.page.locator('.receipt-actions button').first().textContent(),'View');assert.equal(await f.page.evaluate(()=>{const pages=ZEZMS.tablePages,row=document.querySelector('tr.sales-record-row').outerHTML;pages.setSalesQuery('PAID');const count=pages.filterSales([{id:'R-SYNTHETIC'}],()=>row,DB.receipts).length;pages.setSalesQuery('');return count;}),0);await f.page.locator('[data-receipt-paid]').click();await f.page.waitForSelector('#receiptPaymentWallet');
  await f.page.locator('#receiptPaymentWallet').selectOption('Cash in Hand');await f.page.locator('#receiptPaymentConfirmed').check();await f.page.locator('#receiptPaymentSave').click();await f.page.waitForFunction(()=>DB.receipts[0].credit===false&&ZEZMS.cloudSync.getOutbox().length===0);
  const v=await snapshot(f.page);assert.equal(v.receipt.amountPaid,950);assert.equal(v.receipt.balance,0);assert.equal(v.sale.total,950);assert.equal(v.sale.profit,150);assert.equal(v.debtor.balance,1050);assert.equal(v.cash['Cash in Hand'],975);assert.equal(v.log.length,1);assert.equal(v.txns.length,2);assert.equal(v.outbox.length,0);assert.equal(v.failed.length,0);assert.equal(cloud.rows.length,1);assert.equal(cloud.rows[0].payload.patches.length,6);assert.equal(await f.page.locator('[data-receipt-paid]').count(),0);
  const printed=await f.page.evaluate(()=>{const r=ZEZMS.receiptReferencesR67X.displaySource(DB.receipts[0]),html=ZEZMS.operationsUpdate.buildReceiptPrintDocument(r,'');const bytes=ZEZMS.pdfExport.buildReceiptPDF(r,null);return {html,pdf:Array.from(bytes)};});assert.match(printed.html,/950\.00/);assert.ok(Buffer.from(printed.pdf).includes(Buffer.from('PAID')));
  const beforeRepeat=await snapshot(f.page),pushesBeforeRepeat=cloud.calls.length;
  // Reprint decorators can leave unrelated metadata pending. Both the existing
  // Sync hold and the already-paid check must block a second financial posting.
  await assert.rejects(prepare(f.page),/outstanding|already|pending transactions/);
  const afterRepeat=await snapshot(f.page);assert.deepEqual(afterRepeat.txns,beforeRepeat.txns);assert.deepEqual(afterRepeat.log,beforeRepeat.log);assert.deepEqual(afterRepeat.cash,beforeRepeat.cash);assert.deepEqual(afterRepeat.debtor,beforeRepeat.debtor);assert.deepEqual(afterRepeat.outbox,beforeRepeat.outbox);assert.equal(cloud.calls.length,pushesBeforeRepeat);
 }finally{await f.context.close();}
});
test('two device race uses one immutable payment claim; a different wallet/actor on the losing device does not duplicate cash or debt reduction',async()=>{
 const cloud=backend({race:true}),a=await fixture(cloud,'MAIN'),b=await fixture(cloud,'SHOP');try{
  const shapes=await Promise.all([a.page.evaluate(()=>({state:ZEZMS.cloudSync.getState(),user:ZEZMS.cloudSync.getSession().user})),b.page.evaluate(()=>({state:ZEZMS.cloudSync.getState(),user:ZEZMS.cloudSync.getSession().user}))]);assert.equal(shapes[0].state.deviceAccessStatus,'');assert.equal(shapes[1].state.signedInEmail,'');assert.equal(shapes[1].user.is_anonymous,true);const [pa,pb]=await Promise.all([prepare(a.page),prepare(b.page)]);assert.equal(pa.operationId,pb.operationId);const results=await Promise.all([accept(a.page,pa),accept(b.page,pb,'MOMO')]);assert.ok(results.every(r=>!r.pending&&!r.syncError),JSON.stringify(results));
  assert.equal(cloud.rows.length,1);const canonical=cloud.rows[0].payload.patches.find(p=>p.root==='cashBalances').key;assert.ok(['Cash in Hand','MOMO'].includes(canonical));
  for(const f of [a,b]){const v=await snapshot(f.page);assert.equal(v.receipt.balance,0);assert.equal(v.debtor.balance,1050);assert.equal(v.cash['Cash in Hand'],25+(canonical==='Cash in Hand'?950:0));assert.equal(v.cash.MOMO,40+(canonical==='MOMO'?950:0));assert.equal(v.receipt.settlementWallet,canonical);assert.equal(v.log[0].cashType,canonical);assert.equal(v.log.length,1);assert.equal(v.txns.length,2);assert.equal(v.outbox.length,0);assert.equal(v.failed.length,0);assert.equal(v.journal,false);}
  assert.equal(cloud.rows.length,1);assert.equal(cloud.calls.length,2);
 }finally{await a.context.close();await b.context.close();}
});
test('lost acknowledgement reads back the original payment and repeated/reopened delivery never adds a second payment',async()=>{
 const cloud=backend({loseAck:true}),f=await fixture(cloud);try{await accept(f.page,await prepare(f.page));assert.equal(cloud.rows.length,1);assert.equal(cloud.calls.length,1);await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.receiptPayments);await f.page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));await f.configure();await f.page.evaluate(()=>ZEZMS.cloudSync.pullNow(false));const v=await snapshot(f.page);assert.equal(v.debtor.balance,1050);assert.equal(v.cash['Cash in Hand'],975);assert.equal(v.log.length,1);assert.equal(v.outbox.length,0);}finally{await f.context.close();}
});
test('failure after saving the payment retains its durable journal and reopens with the exact original queued payment',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{const p=await prepare(f.page);await f.page.evaluate(()=>{const set=Storage.prototype.setItem;window.__paymentFault=true;Storage.prototype.setItem=function(k,v){if(k==='zezms_cloud_sync_m4_queue'&&__paymentFault){__paymentFault=false;throw Error('synthetic payment outbox failure');}return set.call(this,k,v);};});await assert.rejects(accept(f.page,p),/saved locally.*Do not enter/);const saved=await snapshot(f.page);assert.equal(saved.receipt.balance,0);assert.equal(saved.debtor.balance,1050);assert.equal(saved.cash['Cash in Hand'],975);assert.equal(saved.journal,true);await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.receiptPayments);await f.page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));await f.configure();const reopened=await snapshot(f.page);assert.equal(reopened.journal,false);assert.equal(reopened.outbox.length,1);assert.equal(reopened.outbox[0].opId,p.operationId);await f.page.evaluate(()=>ZEZMS.cloudSync.pushNow(false));const v=await snapshot(f.page);assert.equal(v.log.length,1);assert.equal(v.cash['Cash in Hand'],975);assert.equal(v.outbox.length,0);assert.equal(cloud.rows.length,1);}finally{await f.context.close();}
});
test('linked payment undo reopens credit and restores debtor/cash together; role and independent-edit guards protect the chain',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{const result=await accept(f.page,await prepare(f.page));await f.page.evaluate(id=>ZEZMS.receiptPayments.undo(id,'Synthetic incorrect payment'),result.paymentId);const v=await snapshot(f.page);assert.equal(v.receipt.balance,950);assert.equal(v.receipt.credit,true);assert.equal(v.debtor.balance,2000);assert.equal(v.cash['Cash in Hand'],25);assert.equal(v.log[0].status,'UNDONE');assert.equal(v.txns[1].status,'UNDONE');assert.equal(cloud.rows.length,2);const newPayment=await prepare(f.page);assert.notEqual(newPayment.operationId,cloud.rows[0].op_id);await accept(f.page,newPayment);const guards=await f.page.evaluate(()=>{let receipt='',cash='';try{ZEZMS.tvTradeIns.blockPartial('SR-SYNTHETIC');}catch(e){receipt=e.message;}try{ZEZMS.tvTradeIns.blockCash(DB.cashLog.at(-1).id);}catch(e){cash=e.message;}return {receipt,cash};});assert.match(guards.receipt,/Accounts/);assert.match(guards.cash,/Accounts/);await f.page.evaluate(()=>{__paymentRole='CASHIER';});await assert.rejects(prepare(f.page),/permission/);}finally{await f.context.close();}
});
test('a definite server rejection rolls back the linked reversal atomically and records the original failure',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{const paid=await accept(f.page,await prepare(f.page));cloud.mode.reject=true;await assert.rejects(f.page.evaluate(id=>ZEZMS.receiptPayments.undo(id,'Synthetic rejection'),paid.paymentId),/Cloud did not accept/);const v=await snapshot(f.page);assert.equal(v.receipt.balance,0);assert.equal(v.debtor.balance,1050);assert.equal(v.cash['Cash in Hand'],975);assert.equal(v.txns[1].status,'ACTIVE');assert.equal(v.log[0].status,'ACTIVE');assert.equal(v.outbox.length,0);assert.equal(v.failed.length,1);assert.equal(v.journal,false);assert.equal(cloud.rows.length,1);}finally{await f.context.close();}
});
test('simultaneous reversals on two devices restore the debtor and wallet exactly once',async()=>{
 const cloud=backend(),a=await fixture(cloud,'MAIN'),b=await fixture(cloud,'SHOP');try{const paid=await accept(a.page,await prepare(a.page));await b.page.evaluate(()=>ZEZMS.cloudSync.pullNow(false));cloud.mode.race=true;await Promise.all([a.page.evaluate(id=>ZEZMS.receiptPayments.undo(id,'Synthetic Main reversal'),paid.paymentId),b.page.evaluate(id=>ZEZMS.receiptPayments.undo(id,'Synthetic Shop reversal'),paid.paymentId)]);assert.equal(cloud.rows.length,2);for(const f of [a,b]){const v=await snapshot(f.page);assert.equal(v.receipt.balance,950);assert.equal(v.debtor.balance,2000);assert.equal(v.cash['Cash in Hand'],25);assert.equal(v.txns[1].status,'UNDONE');assert.equal(v.log[0].status,'UNDONE');assert.equal(v.log.length,1);assert.equal(v.txns.length,2);assert.equal(v.outbox.length,0);assert.equal(v.failed.length,0);assert.equal(v.journal,false);}}finally{await a.context.close();await b.context.close();}
});
test('confirmation panel is clear on laptop and phone and rejects an unconfirmed or stale payment without writes',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{await f.page.evaluate(()=>ZEZMS.receiptPayments.open('SR-SYNTHETIC'));await f.page.waitForSelector('#receiptPaymentWallet');await f.page.locator('#receiptPaymentWallet').selectOption('MOMO');await f.page.locator('#receiptPaymentSave').click();await f.page.waitForFunction(()=>document.getElementById('receiptPaymentStatus').textContent.includes('confirm'));assert.equal(cloud.rows.length,0);assert.equal((await snapshot(f.page)).log.length,0);for(const width of [1280,390]){await f.page.setViewportSize({width,height:900});assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const image=await f.page.screenshot({fullPage:false,type:'jpeg',quality:35});console.log('RECEIPT_PAYMENT_PREVIEW_'+width+'='+image.toString('base64'));}const p=await prepare(f.page);await f.page.evaluate(()=>{DB.debtors[0].balance=1900;});await assert.rejects(accept(f.page,p),/changed/);assert.equal(cloud.rows.length,0);}finally{await f.context.close();}
});

test('Main Owner without a cached ACTIVE label and email-less paired Shop/Camon devices all open the real Paid panel',async()=>{
 for(const device of ['MAIN','SHOP','CAMON50']){const cloud=backend(),f=await fixture(cloud,device);try{await f.page.evaluate(()=>ZEZMS.receiptPayments.open('SR-SYNTHETIC'));await f.page.waitForSelector('#receiptPaymentWallet');assert.equal((await snapshot(f.page)).log.length,0);await f.page.locator('#receiptPaymentWallet').selectOption('MOMO');await f.page.locator('#receiptPaymentConfirmed').check();await f.page.locator('#receiptPaymentSave').click();await f.page.waitForFunction(()=>DB.receipts[0].credit===false&&ZEZMS.cloudSync.getOutbox().length===0);const v=await snapshot(f.page);assert.equal(v.debtor.balance,1050);assert.equal(v.cash.MOMO,990);assert.equal(v.log.length,1);assert.equal(cloud.rows.length,1);await f.page.evaluate(id=>ZEZMS.receiptPayments.undo(id,'Synthetic device-mode verification'),v.receipt.settlementId);const reversed=await snapshot(f.page);assert.equal(reversed.receipt.balance,950);assert.equal(reversed.debtor.balance,2000);assert.equal(reversed.cash.MOMO,40);assert.equal(reversed.outbox.length,0);}finally{await f.context.close();}}
});
test('the corrected identity check still rejects signed-out, wrong-owner, anonymous-Owner, inactive and revoked device contexts without financial writes',async()=>{
 const cloud=backend(),f=await fixture(cloud);try{
  const bad=[{session:null},{session:{user:{id:'WRONG'}}},{session:{user:{id:'OWNER-1',is_anonymous:true}}},{state:{initialized:false}},{state:{deviceAccessMode:'UNKNOWN'}},{state:{deviceAccessMode:'PAIRED',deviceAccessStatus:''}}];
  for(const key of ['deviceAccessStatus','deviceLifecycleState','lifecycleState','lifecycle_state'])for(const value of ['REVOKED','RETIRED','DISABLED','REPLACED','BOOTSTRAPPING','VERIFYING','ENROLLING','UNKNOWN'])bad.push({state:{[key]:value}});
  for(const override of bad){await f.page.evaluate(override=>ZEZMS.cloudSync._test.configureReceiptPaymentTest('MAIN',true,override),override);await assert.rejects(prepare(f.page),/Cloud|active|initialization|identity/);const v=await snapshot(f.page);assert.equal(v.receipt.balance,950);assert.equal(v.debtor.balance,2000);assert.equal(v.log.length,0);assert.equal(v.outbox.length,0);}
  await f.page.evaluate(()=>ZEZMS.cloudSync._test.configureReceiptPaymentTest('SHOP',true));await assert.doesNotReject(prepare(f.page));cloud.mode.deviceStatus='REVOKED';await f.page.evaluate(()=>ZEZMS.receiptPayments.open('SR-SYNTHETIC'));await f.page.waitForFunction(()=>document.getElementById('receiptPaymentStatus').textContent.includes('REVOKED'));assert.equal(await f.page.locator('#receiptPaymentWallet').count(),0);assert.equal(cloud.rows.length,0);assert.equal(cloud.calls.length,0);assert.equal((await snapshot(f.page)).log.length,0);
 }finally{await f.context.close();}
});

test('native paired context may omit repeated scope fields, while changed scope or a different returned device is blocked',async()=>{
 const cloud=backend();cloud.mode.sparseContext=true;const f=await fixture(cloud,'SHOP');try{await f.page.evaluate(()=>ZEZMS.receiptPayments.open('SR-SYNTHETIC'));await f.page.waitForSelector('#receiptPaymentWallet');await accept(f.page,await prepare(f.page));assert.equal((await snapshot(f.page)).debtor.balance,1050);assert.equal(cloud.rows.length,1);}finally{await f.context.close();}
 for(const contextOverride of [{owner_id:'OTHER'},{business_id:'OTHER'},{branch_id:'OTHER'},{device_id:'OTHER'}]){const cloud=backend();cloud.mode.contextOverride=contextOverride;const f=await fixture(cloud,'SHOP');try{await f.page.evaluate(()=>ZEZMS.receiptPayments.open('SR-SYNTHETIC'));await f.page.waitForFunction(()=>document.getElementById('receiptPaymentStatus').textContent.includes('identity changed'));const v=await snapshot(f.page);assert.equal(v.receipt.balance,950);assert.equal(v.debtor.balance,2000);assert.equal(v.log.length,0);assert.equal(v.outbox.length,0);assert.equal(cloud.rows.length,0);}finally{await f.context.close();}}
});

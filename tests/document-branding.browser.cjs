// The real assembled application with synthetic documents. External access is blocked.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..'),output=process.env.BRANDING_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'zez-branding-'));
fs.mkdirSync(output,{recursive:true});let browser;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));
});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function fixture(){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[];
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.waitForFunction(()=>window.ZEZMS?.documentBranding&&window.ZEZMS?.pdfExport&&window.ZEZMS?.accountCashPdfR68E&&window.ZEZMS?.proformaInvoiceR67W&&window.ZEZMS?.salesPipeline);
 await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 return {page,context,errors};
}
async function seed(page){
 await page.evaluate(()=>{
  DB.business={name:'ZOLA ELECTRONICS ZONE',address:'Aliu Mahama Road, Tamale',tel:'0553486788'};
  DB.cashBalances={'Cash in Hand':2500};DB.cashLog=[];DB.expenses=[];
  DB.debtors=[{id:'D1',name:'Synthetic Customer',contact:'0550000000',balance:125}];DB.creditors=[];DB.depositors=[];
  DB.accountTxns=[{id:'A1',accountID:'D1',accountType:'DEBTOR',txnType:'OPENING',amount:125,balanceAfter:125,date:'2026-11-03T12:00:00Z',status:'ACTIVE'}];
  DB.customers=[{id:'C1',name:'Synthetic Customer',phone:'0550000000',location:'Tamale'}];
  DB.settings=DB.settings||{};
  const receipt={receiptNo:'RCP-SYNTHETIC',date:'2026-11-03T12:00:00Z',customer:'Synthetic Customer',contact:'0550000000',location:'Tamale',cashier:'Synthetic Owner',lines:[{product:'Synthetic appliance',qty:2,uPrice:100,disc:5,total:195}],subtotal:195,vatRate:5,vatAmount:9.75,grossTotal:204.75,total:204.75,paid:100,netAmountCollectible:204.75};
  const invoice={id:'I1',invoiceNo:'INV-SYNTHETIC',date:'2026-11-03',customer:'Synthetic Customer',contact:'0550000000',location:'Tamale',cashier:'Synthetic Owner',lines:[{productId:'P1',product:'Synthetic appliance',qty:2,unitPrice:100,discount:5,total:195}],subtotal:195,vatRate:5,vatAmount:9.75,total:204.75,status:'ISSUED'};
  const waybill={...invoice,id:'W1',waybillNo:'WB-SYNTHETIC',driver:'Synthetic Driver',vehicleNo:'SYN-001'};
  const order={id:'PO1',poNo:'PO-SYNTHETIC',date:'2026-11-03',supplierName:'Synthetic Supplier',supplierContact:'0550000000',cashier:'Synthetic Owner',lines:[{productId:'P1',product:'Synthetic appliance',qty:2,unitCost:60,total:120}],total:120,amountPaid:20,outstanding:100,status:'OPEN'};
  const quote={quotationId:'Q-SYNTHETIC',customerId:'C1',quotationDate:'2026-11-03',validUntil:'2026-12-03',status:'DRAFT',vatRate:5,lineItems:[{productId:'P1',productName:'Synthetic appliance',quantity:2,unitPrice:100,discount:5,lineTotal:195}]};
  const proforma={id:'PF1',proformaNo:'PF-SYNTHETIC',date:'2026-11-03',customerName:'Synthetic Customer',telephone:'0550000000',location:'Tamale',vatRate:5,lines:[{productId:'P1',productName:'Synthetic appliance',quantity:2,baseUnitPrice:100,priceAdjustment:0,effectiveUnitPrice:100}]};
  DB.purchaseOrders=[order];DB.invoices=[invoice];DB.waybills=[waybill];DB.quotations=[quote];
  window.__brandingFixtures={receipt,invoice,waybill,order,quote,proforma};
  // Only report authorization is synthetic; the production report builders run unchanged.
  ZEZMS.staffAuth.canView=()=>true;
 });
}
test('actual offline PDF builders carry the approved logo and slogan across every document type without changing business data',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});
  await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.documentBranding&&window.ZEZMS?.accountCashPdfR68E);
  await f.context.setOffline(true);await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.documentBranding&&window.ZEZMS?.accountCashPdfR68E);
  await seed(f.page);
  const result=await f.page.evaluate(async()=>{
   const before={db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())},p=ZEZMS.pdfExport,v=window.__brandingFixtures,wm=await p.loadDocumentWatermark();
   if(!wm)throw Error('Approved logo unavailable offline');
   const account=await ZEZMS.accountCashPdfR68E.buildAccountStatement('debtors','D1'),cash=await ZEZMS.accountCashPdfR68E.buildCashBalancesReport();
   const docs={receipt:p.buildReceiptPDF(v.receipt,wm),invoice:p.buildInvoicePDF(v.invoice,wm),waybill:p.buildWaybillPDF(v.waybill,wm),purchaseOrder:p.buildPurchaseOrderPDF(v.order,wm),proforma:await ZEZMS.proformaInvoiceR67W.buildPdf(v.proforma),account:account.bytes,cash:cash.bytes};
   const multipage={...v.invoice,lines:Array.from({length:85},(_,i)=>({...v.invoice.lines[0],product:'SYNTHETIC-LINE-'+String(i).padStart(3,'0')}))};docs.multiplePages=p.buildInvoicePDF(multipage,wm);
   return {docs:Object.fromEntries(Object.entries(docs).map(([name,bytes])=>[name,Array.from(bytes)])),before,after:{db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())},asset:p.documentWatermarkAsset};
  });
  assert.deepEqual(result.after,result.before);assert.equal(result.asset,'assets/zez-logo-approved-20261103.jpg');
  for(const [name,bytes]of Object.entries(result.docs)){
   const body=Buffer.from(bytes);assert.ok(body.toString('ascii').startsWith('%PDF-1.4'));assert.ok(body.includes(Buffer.from('Buy the right one.')));assert.ok(body.includes(Buffer.from('/Subtype /Image')));fs.writeFileSync(path.join(output,name+'.pdf'),body);
  }
  const downloadPromise=f.page.waitForEvent('download');await f.page.evaluate(()=>ZEZMS.salesPipeline.downloadQuotationPDF('Q-SYNTHETIC'));const download=await downloadPromise;await download.saveAs(path.join(output,'quotation.pdf'));
  const quotation=fs.readFileSync(path.join(output,'quotation.pdf'));assert.ok(quotation.includes(Buffer.from('Buy the right one.')));assert.ok(quotation.includes(Buffer.from('/Subtype /Image')));
  assert.equal(f.errors.length,0,JSON.stringify(f.errors));
 }finally{await f.context.close();}
});
test('system-print and direct-print HTML use the same undistorted artwork, embedded bridge image and readable slogan',async()=>{
 const f=await fixture();try{
  await seed(f.page);
  const result=await f.page.evaluate(async()=>{
   const v=__brandingFixtures,logo=await ZEZPrint.getEmbeddedWatermark(),before=JSON.stringify(DB);
   const docs={receipt:ZEZMS.operationsUpdate.buildReceiptPrintDocument(v.receipt,logo),invoice:ZEZMS.commercialDocuments.buildCommercialPrintDocument('invoice',v.invoice,logo),waybill:ZEZMS.commercialDocuments.buildCommercialPrintDocument('waybill',v.waybill,logo),purchaseOrder:ZEZMS.ownerMaintenance.purchaseOrderPaperHTML(v.order)};
   ZEZMS.salesPipeline.viewQuotation('Q-SYNTHETIC');docs.quotation=document.getElementById('quotationPaper').outerHTML;
   return {docs,before,after:JSON.stringify(DB)};
  });
  assert.equal(result.before,result.after);
  for(const [name,html]of Object.entries(result.docs)){
   assert.ok(html.includes('Buy the right one.'),name);assert.ok(html.includes('data-zezms-approved-logo'),name);assert.ok(!html.includes('zez-document-watermark.jpg'),name);
   if(['receipt','invoice','waybill'].includes(name))assert.ok(/data-zezms-approved-logo src="data:image\/jpeg;base64,/.test(html),name+' bridge image must be self-contained');
   fs.writeFileSync(path.join(output,name+'.html'),html);
   const preview=await f.context.newPage();await preview.setContent(html);await preview.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
   const image=await preview.locator('[data-zezms-approved-logo]').first().evaluate(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,loaded:i.naturalWidth>0}));
   assert.equal(image.loaded,true);assert.equal(image.width,image.height);await preview.screenshot({path:path.join(output,name+'.png'),fullPage:true});await preview.close();
  }
  assert.equal(f.errors.length,0,JSON.stringify(f.errors));
 }finally{await f.context.close();}
});

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
  const deposit={id:'DEPOSIT-FIXTURE',receiptNo:'DR-SYNTHETIC',date:receipt.date,name:'Synthetic Customer',cashier:receipt.cashier,amount:250.75,status:'ACTIVE',meta:{kind:'depositors',source:'SALES_DEPOSIT',depositContact:'0550000000',depositPurpose:'TV reservation',walletLabelSnapshot:'Cash in Hand',depositProduct:{id:'P1',name:'Synthetic television',qty:1,price:500,total:500},orderReceivedAfter:250.75,orderBalanceAfter:249.25}};
  DB.purchaseOrders=[order];DB.invoices=[invoice];DB.waybills=[waybill];DB.quotations=[quote];
  window.__brandingFixtures={receipt,invoice,waybill,order,quote,proforma,deposit};
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
   const multipage={...v.invoice,lines:Array.from({length:85},(_,i)=>({...v.invoice.lines[0],product:'SYNTHETIC-LINE-'+String(i).padStart(3,'0')}))};docs.multiplePages=p.buildInvoicePDF(multipage,wm);docs.proformaMultiplePages=await ZEZMS.proformaInvoiceR67W.buildPdf({...v.proforma,lines:Array.from({length:85},(_,i)=>({...v.proforma.lines[0],productName:'SYNTHETIC-PROFORMA-LINE-'+i}))});docs.purchaseOrderMultiplePages=p.buildPurchaseOrderPDF({...v.order,lines:Array.from({length:85},(_,i)=>({...v.order.lines[0],product:'SYNTHETIC-ORDER-LINE-'+i}))},wm);
   return {docs:Object.fromEntries(Object.entries(docs).map(([name,bytes])=>[name,Array.from(bytes)])),before,after:{db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())},asset:p.documentWatermarkAsset};
  });
  assert.deepEqual(result.after,result.before);assert.equal(result.asset,'assets/zez-logo-approved-20261103.jpg');
  for(const [name,bytes]of Object.entries(result.docs)){
   const body=Buffer.from(bytes);assert.ok(body.toString('ascii').startsWith('%PDF-1.4'));assert.ok(body.includes(Buffer.from('Buy the right one.')));assert.ok(body.includes(Buffer.from('/Subtype /Image')));const text=body.toString('latin1'),pages=[...text.matchAll(/\/Type \/Page\b/g)].length;assert.equal(text.split('(zolaelectronicszone.com)').length-1,pages,name+' website on every page');const media=text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);assert.ok(media,name+' page size');const command='q /GS1 gs '+Number(media[1]).toFixed(2)+' 0 0 '+Number(media[2]).toFixed(2)+' 0 0 cm /WM Do Q';assert.equal(text.split(command).length-1,pages,name+' every watermark fills the page');fs.writeFileSync(path.join(output,name+'.pdf'),body);
  }
  const downloadPromise=f.page.waitForEvent('download');await f.page.evaluate(()=>ZEZMS.salesPipeline.downloadQuotationPDF('Q-SYNTHETIC'));const download=await downloadPromise;await download.saveAs(path.join(output,'quotation.pdf'));
  const quotation=fs.readFileSync(path.join(output,'quotation.pdf'));assert.ok(quotation.includes(Buffer.from('Buy the right one.')));assert.ok(quotation.includes(Buffer.from('zolaelectronicszone.com')));assert.ok(quotation.includes(Buffer.from('/Subtype /Image')));assert.equal(quotation.toString('latin1').split('q /GS1 gs 419.53 0 0 595.28 0 0 cm /WM Do Q').length-1,[...quotation.toString('latin1').matchAll(/\/Type \/Page\b/g)].length);
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
   assert.ok(html.includes('Buy the right one.'),name);assert.ok(html.includes('data-zezms-website-qr'),name);assert.ok(html.includes('zolaelectronicszone.com'),name);assert.ok(html.includes('data-zezms-approved-logo'),name);assert.ok(!html.includes('zez-document-watermark.jpg'),name);
   if(['receipt','invoice','waybill'].includes(name))assert.ok(/data-zezms-approved-logo src="data:image\/jpeg;base64,/.test(html),name+' bridge image must be self-contained');
   fs.writeFileSync(path.join(output,name+'.html'),html);
   const preview=await f.context.newPage();await preview.setContent(html);await preview.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
   const image=await preview.locator('[data-zezms-approved-logo]').first().evaluate(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,loaded:i.naturalWidth>0}));
   assert.equal(image.loaded,true);assert.equal(image.width,image.height);await preview.screenshot({path:path.join(output,name+'.png'),fullPage:true});await preview.close();
  }
  assert.equal(f.errors.length,0,JSON.stringify(f.errors));
 }finally{await f.context.close();}
});

test('actual browser print pages and both A5 test documents place a scannable website QR above all document details',async()=>{
 const f=await fixture();try{
  await seed(f.page);
  const assembled=require('../tools/build-pr11-delivery.cjs').assembledShell(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  const directSource=assembled.slice(assembled.indexOf('  function directTestHtml(watermark) {'),assembled.indexOf('  function directPrintTest()'));
  const docs=await f.page.evaluate(async directSource=>{
   const v=__brandingFixtures,logo=await ZEZPrint.getEmbeddedWatermark(),b=ZEZMS.documentBranding;
   const docs={receipt:ZEZMS.operationsUpdate.buildReceiptPrintDocument(v.receipt,logo),invoice:ZEZMS.commercialDocuments.buildCommercialPrintDocument('invoice',v.invoice,logo),waybill:ZEZMS.commercialDocuments.buildCommercialPrintDocument('waybill',v.waybill,logo)};
   DB.accountTxns.push(v.deposit);
   ZEZMS.staffAuth={...ZEZMS.staffAuth,isActive:()=>true,can:permission=>permission==='VIEW_ACCOUNTS'};
   const originalOpen=window.open;
   try {
    window.open=()=>({document:{open(){},write(html){docs.deposit=html;},close(){}}});
    await ZEZMS.deposits.print(v.deposit.id);
   } finally { window.open=originalOpen; }
   for(const [name,run] of [['quotation',()=>ZEZMS.salesPipeline.printQuotation('Q-SYNTHETIC')],['purchaseOrder',()=>printPurchaseOrder('PO1')]]){
    const before=new Set(document.querySelectorAll('iframe'));run();const frame=[...document.querySelectorAll('iframe')].find(frame=>!before.has(frame));
    if(!frame)throw Error(name+' print frame missing');frame.contentWindow.print=()=>{};docs[name]='<!doctype html>'+frame.contentDocument.documentElement.outerHTML;
   }
   const original=window.open;try{window.open=()=>({document:{open(){},write(html){docs.systemTest=html;},close(){}}});ZEZPrint.openPrintTest();}finally{window.open=original;}
   docs.directTest=new Function('watermark',"const esc=String,VERSION='3.12.1',BUILD='20260816-direct-print-bridge-r46';"+directSource+';return directTestHtml(watermark);')(logo);
   return docs;
  },directSource);
  for(const [name,html]of Object.entries(docs)){
   const p=await f.context.newPage();
   // Test pages auto-open the system dialog; PDF capture supplies the print operation here.
   await p.evaluate(()=>{window.print=()=>{};window.close=()=>{};});console.log('WEBSITE_PRINT_CAPTURE '+name);await p.setViewportSize({width:name==='purchaseOrder'?704:468,height:780});await p.setContent(html.replace('<head>','<head><base href="http://127.0.0.1:'+server.address().port+'/">'));await p.emulateMedia({media:'print'});
   await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
   if(name==='deposit'){
    assert.match(await p.locator('.deposit-receipt').innerText(),/APPROVED/);
    assert.match(await p.locator('.deposit-total').innerText(),/250\.75/);
    assert.match(await p.locator('.deposit-paper').innerText(),/Balance left to pay\s+GH₵\s*249\.25/);
    assert.equal(await p.locator('.deposit-receipt').evaluate(el=>getComputedStyle(el,'::before').backgroundSize),'100% 100%');
   }
   const bounds=await p.evaluate(()=>{const h=document.querySelector('[data-zezms-website-header]'),q=document.querySelector('[data-zezms-website-qr]'),r=q.getBoundingClientRect(),a=h.getBoundingClientRect(),next=h.nextElementSibling?.getBoundingClientRect();return {right:r.right,headerRight:a.right,top:r.top,headerTop:a.top,bottom:r.bottom,nextTop:next?.top,width:r.width,height:r.height};});
   assert.ok(Math.abs(bounds.right-bounds.headerRight)<1,name+' QR at header right');assert.ok(Math.abs(bounds.top-bounds.headerTop)<1,name+' QR at header top');assert.equal(bounds.width,bounds.height);assert.ok(bounds.nextTop>=bounds.bottom,name+' details below QR');
   await p.addScriptTag({path:path.join(root,'vendor/zxing-browser-0.1.5.min.js')});const decoded=await p.evaluate(async()=>{const q=document.querySelector('[data-zezms-website-qr]');const decoder=new ZXingBrowser.BrowserQRCodeReader();return (await decoder.decodeFromImageElement(q)).getText();});
   assert.equal(decoded,'https://zolaelectronicszone.com/',name+' QR destination');
   if(name==='directTest'){const clear=await p.evaluate(()=>{const footer=document.querySelector('footer').getBoundingClientRect();return [...document.querySelectorAll('.content>p')].every(p=>p.getBoundingClientRect().bottom<footer.top);});assert.equal(clear,true,'direct test footer clears all sample text');}
   try{const pdf=await p.pdf({path:path.join(output,'browser-'+name+'.pdf'),preferCSSPageSize:true,printBackground:true});if(name==='deposit')assert.equal([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length,1,'deposit receipt page count');}catch(error){throw Error(name+' print capture: '+error.message);}await p.screenshot({path:path.join(output,'browser-'+name+'.png'),fullPage:true});await p.close();
  }
 }finally{await f.context.close();}
});

test('Direct Print submits self-contained sales and deposit receipts, invoices, waybills and the A5 test to the bridge', async () => {
 const f = await fixture();
 try {
  await seed(f.page);
  // Mirror the content checks in the Windows bridge v1.0.5 rc2 and rc4.
  // Reject the released header's remote link, even though its QR is embedded.
  const forbidden = [
   '<script', '<iframe', '<object', '<embed', '<applet', '<base', '<link',
   'javascript:', 'vbscript:', 'file:', 'ftp:', 'http://', 'https://',
   'window.chrome', 'webview.postmessage', 'ms-appx:', 'shell:'
  ];
  const result = await f.page.evaluate(async forbidden => {
   const bridge = 'http://127.0.0.1:43127';
   localStorage.setItem(ZEZPrint.storageKey, JSON.stringify({bridgeUrl:bridge,token:'synthetic-test-token',mode:'local-bridge'}));
   const previousFetch = window.fetch;
   const jobs = new Map();
   const requests = [];
   const ok = data => Response.json(data);
   const health = { protocolVersion:'ZEZPRINT/1', ready:true, printerConfigured:true, printerReady:true, printerName:'Synthetic printer' };
   window.fetch = async (url, options) => {
    if (!String(url).startsWith(bridge+'/')) return previousFetch(url, options);
    const pathname = new URL(url).pathname;
    if (pathname === '/health' || pathname === '/status') return ok(health);
    if (pathname === '/print') {
     const payload = JSON.parse(options.body);
     const html = payload.html;
     const css = [...html.matchAll(/url\(\s*([^\)]+)\s*\)/gi)];
     const blocked = forbidden.some(token => html.toLowerCase().includes(token)) ||
       /\son[a-z]+\s*=/i.test(html) || /<meta[^>]+http-equiv\s*=/i.test(html) ||
       css.some(([, value]) => !value.trim().replace(/^['"]|['"]$/g,'').toLowerCase().startsWith('data:image/'));
     requests.push({ documentType:payload.documentType, documentId:payload.documentId, blocked,
       hasPrintedAddress:html.includes('<span data-zezms-website ') && html.includes('zolaelectronicszone.com</span>'),
       hasEmbeddedQR:html.includes('data-zezms-website-qr src="data:image/png;base64,'),
       page:payload.page });
     if (blocked) return Response.json({code:'unsafe-html',message:'Printable HTML contains a forbidden active or remote-content construct.'},{status:400});
     jobs.set(payload.jobId, {status:'printed'});
     return ok({jobId:payload.jobId});
    }
    if (pathname.startsWith('/job/')) return ok(jobs.get(pathname.slice('/job/'.length)));
    throw Error('Unexpected synthetic bridge endpoint');
   };
   try {
    await ZEZPrint.testConnection();
    const fixture = window.__brandingFixtures;
    DB.accountTxns.push(fixture.deposit);
    ZEZMS.staffAuth={...ZEZMS.staffAuth,isActive:()=>true,can:permission=>permission==='VIEW_ACCOUNTS'};
    const before = {db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())};
    const statuses = [];
    statuses.push((await ZEZMS.operationsUpdate.printReceiptDocument(fixture.receipt, {isReprint:true})).status);
    statuses.push((await ZEZMS.commercialDocuments.printCommercialDocument('invoice', fixture.invoice)).status);
    statuses.push((await ZEZMS.commercialDocuments.printCommercialDocument('waybill', fixture.waybill)).status);
    statuses.push((await ZEZMS.deposits.print(fixture.deposit.id)).status);
    statuses.push((await ZEZPrint.directPrintTest()).status);

    const systemPreview = ZEZMS.documentBranding.headerHTML();
    const refused = await ZEZPrint.printDocument({
     documentType:'test', documentId:'synthetic-remote-link',
     html:'<main><a href="https://example.invalid/">External example</a></main>',
     systemPrint:() => { window.__usedSystemPrint = true; }
    });
    return {statuses,requests,refused,systemPreview,before,bridgeStatus:ZEZPrint.diagnostics(),
     after:{db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}};
   } finally { window.fetch = previousFetch; }
  }, forbidden);
  assert.deepEqual(result.statuses, ['printed','printed','printed','printed','printed']);
  assert.deepEqual(result.requests.slice(0,5).map(request => request.documentType), ['receipt','invoice','waybill','receipt','test']);
  assert.equal(result.requests[3].documentId, 'DR-SYNTHETIC');
  for (const request of result.requests.slice(0,5)) {
   assert.equal(request.blocked, false, request.documentType);
   assert.equal(request.hasPrintedAddress, true, request.documentType);
   assert.equal(request.hasEmbeddedQR, true, request.documentType);
   assert.deepEqual(request.page, { size:'A5', orientation:'portrait' });
  }
  assert.equal(result.requests.length, 6);
  assert.equal(result.requests[5].blocked, true);
  assert.equal(result.refused.status, 'failed');
  assert.match(result.systemPreview, /<a data-zezms-website href="https:\/\/zolaelectronicszone\.com\//);
  assert.equal(result.bridgeStatus.connection, 'Connected');
  assert.equal(result.bridgeStatus.printerReady, true);
  assert.deepEqual(result.after, result.before);
  assert.equal(await f.page.getByRole('heading', {name:'Print Bridge rejected this document.'}).count(), 1);
  assert.equal(await f.page.getByRole('button', {name:'Retry',exact:true}).count(), 0);
  await f.page.getByRole('button', {name:'Use System Print',exact:true}).click();
  assert.equal(await f.page.evaluate(() => window.__usedSystemPrint), true);
  assert.deepEqual(f.errors, []);
 } finally { await f.context.close(); }
});

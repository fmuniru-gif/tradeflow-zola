// Real local staff authentication and print frames; synthetic data, loopback only.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),root=path.resolve(__dirname,'..'),password='synthetic-idle-password',salt=Buffer.alloc(16,9);
let browser;
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':name.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function fixture(role='OWNER'){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForFunction(()=>window.ZEZMS?.idleSession&&window.ZEZMS?.staffAuth);await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 const user={id:'synthetic-idle-staff',name:'Synthetic '+role,role,active:true,signatureFile:'',passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'};
 await page.evaluate(user=>{const db=JSON.parse(JSON.stringify(DB));db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[user],audit:[]};db.sharedDeviceDirectory={version:1,enabled:true,businessId:'synthetic-business',users:[user]};db.receipts=[{receiptNo:'SYNTHETIC-SAVED',date:'2026-11-05',total:120,lines:[]}];localStorage.setItem(DB_KEY,JSON.stringify(db));},user);
 await page.reload();await page.waitForFunction(()=>window.ZEZMS?.idleSession&&document.getElementById('sharedLoginUser'));
 await page.clock.install();await login(page);
 return {page,context};
}
async function login(page){await page.locator('#sharedLoginUser').selectOption('synthetic-idle-staff');await page.locator('#sharedLoginPassword').fill(password);await page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());await page.waitForFunction(()=>!!ZEZMS.staffAuth.getContext().user);}
// fastForward coalesces timer callbacks. Run the final second chronologically so
// a boundary recheck scheduled by the real elapsed-time guard also executes.
async function signedIn(page){return page.evaluate(()=>!!ZEZMS.staffAuth.getContext().user);}
test('Owner, Admin and Cashier are logged out after five minutes; saved transactions, device identity and queue survive',async()=>{
 for(const role of ['OWNER','ADMIN','CASHIER']){const f=await fixture(role);try{
  const before=await f.page.evaluate(()=>{DB.receipts[0].notes='Synthetic pending receipt update';saveDB();if(ZEZMS.cloudSync.getOutbox().length<1)throw Error('Synthetic pending queue missing');openModal('<button id="synthetic-sensitive-action">Privileged action</button>');session.adminMode=true;return {receipts:JSON.stringify(DB.receipts),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox()),device:ZEZMS.cloudSync.getState().deviceId};});
  await f.page.clock.fastForward(299000);assert.equal(await signedIn(f.page),true,role+' expired too soon');
  const checkpoint=await f.page.evaluate(()=>({receipts:JSON.stringify(DB.receipts),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox()),device:ZEZMS.cloudSync.getState().deviceId}));assert.equal(checkpoint.receipts,before.receipts);assert.equal(checkpoint.device,before.device);const initial=JSON.parse(before.queue),settled=JSON.parse(checkpoint.queue);assert.deepEqual(settled.slice(0,initial.length),initial);assert.ok(settled.slice(initial.length).every(op=>op.kind==='SHARED_DEVICE_DIRECTORY'),'only the existing delayed directory publication may be added before expiry');
  await f.page.clock.runFor(1100);await f.page.waitForFunction(()=>!ZEZMS.staffAuth.getContext().user);assert.equal(await f.page.locator('#loginScreen').isVisible(),true);assert.equal(await f.page.locator('#appShell').isVisible(),false);assert.equal(await f.page.locator('#modalBg').evaluate(e=>e.classList.contains('show')),false);assert.equal(await f.page.locator('#synthetic-sensitive-action').count(),0);
  assert.deepEqual(await f.page.evaluate(()=>({receipts:JSON.stringify(DB.receipts),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox()),device:ZEZMS.cloudSync.getState().deviceId})),checkpoint);assert.match(await f.page.locator('#sharedLoginStatus').textContent(),/5 minutes of inactivity/);
  await login(f.page);assert.equal(await signedIn(f.page),true);await f.page.clock.fastForward(299000);assert.equal(await signedIn(f.page),true);await f.page.clock.runFor(1100);await f.page.waitForFunction(()=>!ZEZMS.staffAuth.getContext().user);assert.equal(await signedIn(f.page),false);
 }finally{await f.context.close();}}
});
test('keyboard activity extends the deadline; synthetic events and background rendering do not',async()=>{
 const f=await fixture();try{
  await f.page.clock.fastForward(240000);await f.page.keyboard.press('Shift');await f.page.clock.fastForward(60000);assert.equal(await signedIn(f.page),true);
  await f.page.evaluate(()=>{for(let i=0;i<20;i++){document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));render();}window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await f.page.clock.fastForward(240000);assert.equal(await signedIn(f.page),false);
 }finally{await f.context.close();}
});
test('first interaction after suspension checks expiry before a stale privileged modal can act',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>{window.__staleActionCalls=0;openModal('<button id="staleAction" onclick="window.__staleActionCalls++">Do something</button>');});
  // Advance wall time without running timers, reproducing suspended/background throttling.
  const point=await f.page.locator('#staleAction').boundingBox();await f.page.clock.setSystemTime(new Date(Date.now()+301000));await f.page.mouse.click(point.x+point.width/2,point.y+point.height/2);
  assert.equal(await f.page.evaluate(()=>window.__staleActionCalls),0);assert.equal(await signedIn(f.page),false);
 }finally{await f.context.close();}
});
test('a failed staff audit write cannot retain authority or the temporary Cloud management session after expiry',async()=>{
 const f=await fixture();try{
  const before=await f.page.evaluate(()=>{window.__clearedOwnerSession=0;const original=ZEZMS.cloudSync.clearOwnerManagementSession;ZEZMS.cloudSync.clearOwnerManagementSession=function(){__clearedOwnerSession++;return original.apply(this,arguments);};window.saveDB=()=>{throw Error('Synthetic audit storage failure');};return {queue:JSON.stringify(ZEZMS.cloudSync.getOutbox()),receipts:JSON.stringify(DB.receipts)};});
  await f.page.clock.fastForward(300100);assert.equal(await signedIn(f.page),false);assert.equal(await f.page.locator('#loginScreen').isVisible(),true);
  const after=await f.page.evaluate(()=>({queue:JSON.stringify(ZEZMS.cloudSync.getOutbox()),receipts:JSON.stringify(DB.receipts),cleared:__clearedOwnerSession}));assert.equal(after.cleared,1);delete after.cleared;assert.deepEqual(after,before);
 }finally{await f.context.close();}
});
test('a failed password attempt does not reset an already signed-in staff deadline',async()=>{
 const f=await fixture();try{
  await f.page.clock.fastForward(240000);await f.page.evaluate(async()=>{document.getElementById('sharedLoginPassword').value='wrong-synthetic-password';await ZEZMS.staffAuth.signInFromLogin();});assert.equal(await signedIn(f.page),true);
  await f.page.clock.fastForward(59000);await f.page.clock.runFor(1100);assert.equal(await signedIn(f.page),false);
 }finally{await f.context.close();}
});
test('real quotation and purchase-order print frames stretch faint backgrounds to each sheet',async()=>{
 const f=await fixture();try{
  await f.page.emulateMedia({media:'print'});
  await f.page.evaluate(()=>{DB.business={name:'Synthetic Business'};DB.customers=[{id:'C1',name:'Synthetic Customer'}];DB.quotations=[{quotationId:'SYN-Q',customerId:'C1',quotationDate:'2026-11-05',status:'Draft',lineItems:[{productId:'P1',productName:'Synthetic appliance',quantity:1,unitPrice:100,discount:0,lineTotal:100}],vatRate:0}];DB.purchaseOrders=[{id:'SYN-PO',poNo:'PO-SYN',date:'2026-11-05',status:'OPEN',supplierName:'Synthetic Supplier',lines:[{productId:'P1',product:'Synthetic appliance',qty:1,unitCost:60,total:60}],total:60,amountPaid:0,outstanding:60}];
   window.__printResults=[];
   const append=Node.prototype.appendChild;Node.prototype.appendChild=function(node){const result=append.call(this,node);if(node.tagName==='IFRAME'){node.contentWindow.print=()=>{const doc=node.contentDocument,el=doc.querySelector('.quotation-watermark,.document-branding-watermark'),style=node.contentWindow.getComputedStyle(el);__printResults.push({html:doc.documentElement.outerHTML,backgroundSize:style.backgroundSize,position:style.position,opacity:style.opacity,top:style.top});};}return result;};
   ZEZMS.salesPipeline.printQuotation('SYN-Q');window.printPurchaseOrder('SYN-PO');
  });
  await f.page.clock.runFor(1000);for(let i=0;i<50;i++){if(await f.page.evaluate(()=>__printResults.length===2))break;await new Promise(r=>setTimeout(r,100));}const results=await f.page.evaluate(()=>__printResults);assert.equal(results.length,2);for(const r of results){assert.equal(r.backgroundSize,'100% 100%');assert.equal(r.position,'fixed');assert.equal(r.opacity,'0.1');assert.ok(parseFloat(r.top)<0);assert.ok(r.html.includes('zez-logo-approved-20261103.jpg'));}
 }finally{await f.context.close();}
});

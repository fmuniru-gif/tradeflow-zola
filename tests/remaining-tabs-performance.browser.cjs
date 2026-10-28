// Extends ui-responsiveness.browser.cjs's isolated fixture with CDP stage metrics,
// first/repeated visits and functional equivalence. No production data is used.
// BENCH_BASELINE serves ALL requested assets from that commit. BENCH_PROFILE is
// MAIN (4x CPU), SHOP (2x CPU) or MOBILE (viewport/touch only, 1x CPU).
// The two-rAF interval is a paint opportunity, not physical display telemetry.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const playwright = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const root = path.resolve(__dirname, '..');
const baseline=process.env.BENCH_BASELINE || '';
const profileName=process.env.BENCH_PROFILE || 'MAIN';
const profile={MAIN:{cpu:4,viewport:{width:1440,height:900}},SHOP:{cpu:2,viewport:{width:1366,height:768}},MOBILE:{cpu:1,viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2.625}}[profileName];
assert.ok(profile,'Unknown BENCH_PROFILE');
const device=profileName==='SHOP'?'SHOP':'MAIN';
const samples=Number(process.env.BENCH_SAMPLES || (process.env.NODE_TEST_CONTEXT ? 1 : 7));
const assets=new Map();
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html');
  if(baseline) {
    if(!assets.has(pathname))assets.set(pathname,execFileSync('git',['show',baseline+':'+pathname.slice(1)],{cwd:root,maxBuffer:32*1024*1024}));response.end(assets.get(pathname));return;
  }
  response.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  console.error('Local benchmark server ready');
  const browser = await playwright.chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    const context = await browser.newContext({...profile, serviceWorkers:"block"});
    const origin = 'http://127.0.0.1:' + server.address().port;
    const blocked=[];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (blocked.push(route.request().url()),route.abort()));
    const page = await context.newPage();
    await page.goto(origin + '/index.html');
    console.error('Shell loaded');
    await page.waitForFunction(() => !!window.ZEZMS?.navigationV3101 && typeof window.nav === 'function', null, {timeout:20000});
    const salt=Buffer.alloc(16,7), password='synthetic-owner-password';
    const owner={id:'synthetic-owner',name:'Synthetic Owner',tel:'',role:'OWNER',active:true,signatureFile:'',
      passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),
      passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),passwordChangedAt:'',
      createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
    const seed=await page.evaluate(({owner,device})=>{
      const db=JSON.parse(JSON.stringify(DB));
      const now=typeof getLatestMonth==='function'?getLatestMonth():{year:2026,month:10};
      db.products=Array.from({length:600},(_,i)=>({id:'P'+i,name:'Synthetic Product '+i,category:'Test',uPrice:25,uCost:15}));
      db.stockRows=Array.from({length:1800},(_,i)=>({id:'R'+i,productId:'P'+(i%600),productName:'Synthetic Product '+(i%600),category:'Test',year:now.year,month:now.month,qtyIn:20,qtyOut:4,rStock:16,uCost:15,uPrice:25,tSales:100,profit:40}));
      db.sales=Array.from({length:900},(_,i)=>({id:'S'+i,date:'2026-10-20',total:25,amount:25,items:[],cashier:'Synthetic'}));
      db.receipts=Array.from({length:900},(_,i)=>({receiptNo:'RCP-'+String(i).padStart(8,'0'),receiptRef:'ZEZ-2026-'+String(i).padStart(8,'0'),date:'2026-10-20T12:00:00Z',cashier:'Synthetic',
        customerName:'Synthetic Customer '+i,items:[{product:'Synthetic Product '+(i%600),qty:1,uPrice:25}],total:25,amountPaid:25,status:'PAID'}));
      db.inventoryTxns=Array.from({length:450},(_,i)=>({id:'Q'+i,type:'SALE_OUT',subtype:'QUICK',
        date:new Date(Date.UTC(2026,9,1+i%20,12,0,0)).toISOString(),cashier:'Synthetic',amount:25,status:'COMPLETED',details:{lines:[]}}));
      db.cashLog=Array.from({length:300},(_,i)=>({id:'C'+i,date:'2026-10-20',amount:5,type:'Expense'}));
      db.expenses=Array.from({length:300},(_,i)=>({id:'E'+i,date:'2026-10-20',amount:5,category:'Test'}));
      for(const kind of ['debtors','creditors','depositors'])db[kind]=Array.from({length:600},(_,i)=>({id:kind+'-'+i,name:'Synthetic '+kind+' '+i,contact:'055000'+String(i).padStart(4,'0'),description:'Synthetic account '+i,balance:100+i/10,date:'2026-10-20T12:00:00Z'}));
      db.accountTxns=['debtors','creditors','depositors'].flatMap(kind=>db[kind].map((a,i)=>({id:'ATX-'+kind+'-'+i,accountID:a.id,accountType:kind==='debtors'?'DEBTOR':kind==='creditors'?'CREDITOR':'DEPOSITOR',name:a.name,txnType:'OPENING',amount:a.balance,balanceAfter:a.balance,date:'2026-10-20T12:00:00Z',status:'ACTIVE',cashier:'Synthetic'})));
      for(const kind of ['debtors','creditors','depositors']){const a=db[kind][599];for(let i=1;i<150;i++)db.accountTxns.push({id:'NOTE-'+kind+'-'+i,accountID:a.id,accountType:kind==='debtors'?'DEBTOR':kind==='creditors'?'CREDITOR':'DEPOSITOR',name:a.name,txnType:'NOTE',amount:0,balanceAfter:a.balance,date:new Date(Date.UTC(2026,9,21,12,i,0)).toISOString(),status:'ACTIVE',cashier:'Synthetic'});}
      db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[owner],audit:[]};
      db.sharedDeviceDirectory={version:1,businessId:'synthetic-business',enabled:true,updatedAt:'2026-10-20T00:00:00Z',users:[owner]};
      db.monthRollovers=db.monthRollovers||[];
      db.monthRollovers.push({id:'synthetic-current-month',targetYear:new Date().getFullYear(),targetMonth:new Date().getMonth()+1});
      const state={...ZEZMS.cloudSync.getState(),deviceId:'9a5ab8eb-f67e-425c-866d-574b641295f0',deviceName:'Synthetic '+device,deviceAccessMode:device==='SHOP'?'PAIRED':'OWNER',syncOwnerId:owner.id,businessId:'synthetic-business',initialized:true,cursor:1,liveSyncEnabled:false,liveSyncDesired:false,supabaseUrl:'',publishableKey:''};
      return {db:JSON.stringify(db),state:JSON.stringify(state)};
    },{owner,device});
    await page.addInitScript(seed=>{
      if(localStorage.getItem('__benchmark_seeded'))return;
      localStorage.setItem('tradeflow_v321_zola',seed.db);
      localStorage.setItem('zezms_cloud_sync_m4_state',seed.state);
      localStorage.setItem('zezms_cloud_sync_m4_queue','[]');
      localStorage.setItem('__benchmark_seeded','1');
    },seed);
    await page.reload();
    console.error('Synthetic profile loaded');
    await page.waitForFunction(()=>!!window.ZEZMS?.staffAuth && !!window.ZEZMS?.navigationV3101,null,{timeout:20000});
    await page.locator('#sharedLoginUser').selectOption(owner.id);
    await page.locator('#sharedLoginPassword').fill(password);
    await page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());
    await page.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');
    // Let the existing asynchronous sign-in directory publication settle before
    // taking the immutable business-data snapshot. No auth code is changed.
    await page.waitForTimeout(1000);
    console.error('Synthetic Owner signed in');
    await page.waitForFunction(()=>!!ZEZMS.convergence?.getState().lastError);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});
    await page.evaluate(()=>{
      window.__longTasks=[];
      new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
      const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
      window.__domWork=[];
      Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(html){
        const start=performance.now();descriptor.set.call(this,html);
        window.__domWork.push({ms:performance.now()-start,bytes:String(html).length,tag:this.tagName,id:this.id});
      }});
      nav('cash');
    });
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    const routes=['receipts','products','stock','accounts','stockin','dashboard'];
    const result={baseline:baseline||'working-tree',profile:profileName,cpuRate:profile.cpu,samples,
      browser:browser.version(),blockedExternalRequests:blocked.length,measurements:{},snapshots:{}};
    const dbBefore=await page.evaluate(()=>JSON.stringify(DB));
    console.error('Navigation instrumentation ready');
    const queueBefore=await page.evaluate(()=>JSON.stringify(ZEZMS.cloudSync.getOutbox()));
    await cdp.send('HeapProfiler.collectGarbage');
    console.error('Initial collection complete');
    result.memoryBefore=await cdp.send('Memory.getDOMCounters');
    result.heapBefore=(await metrics()).JSHeapUsedSize;
    for(let round=0;round<=samples;round++){
      for(const route of routes){
        if(round===0)console.error('First visit: '+route);
        const before=await metrics();
        const measure=await page.evaluate(async route=>{
          const button=document.querySelector('#mainNav .nav-submenu-item[data-view="'+route+'"]');
          if(!button)throw new Error('Missing navigation button '+route);
          window.__domWork=[];
          const start=performance.now();button.click();const syncMs=performance.now()-start;
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const visibleMs=performance.now()-start;
          const root=document.getElementById('viewRoot');
          if(!root || !root.innerText.trim() || !root.getBoundingClientRect().height)throw new Error('Empty route '+route);
          // Allow already-scheduled report controls and Long Task delivery to settle.
          await new Promise(resolve=>setTimeout(resolve,60));
          return {syncMs,visibleMs,domMs:window.__domWork.reduce((sum,x)=>sum+x.ms,0),
            rootReplacements:window.__domWork.filter(x=>x.id==='viewRoot').length,
            templateChars:window.__domWork.filter(x=>x.tag==='TEMPLATE').reduce((sum,x)=>sum+x.bytes,0),
            liveNodes:root.querySelectorAll('*').length,
            longTasks:window.__longTasks.filter(x=>x.start+x.duration>start&&x.start<start+visibleMs),
            html:root.innerHTML};
        },route);
        const after=await metrics();
        const html=measure.html;delete measure.html;
        measure.scriptMs=(after.ScriptDuration-before.ScriptDuration)*1000;
        measure.layoutMs=(after.LayoutDuration-before.LayoutDuration)*1000;
        measure.styleMs=(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000;
        measure.taskMs=(after.TaskDuration-before.TaskDuration)*1000;
        const bucket=result.measurements[route] ||= {firstVisit:null,warm:[]};
        if(round===0)bucket.firstVisit=measure;else bucket.warm.push(measure);
        // Legacy extraction leaves empty dividers from discarded analytics.
        // Ignore only these decorative nodes; retain every value and control.
        const canonical=html.replace(/<div class="divider"><\/div>/g,'');
        const hash=crypto.createHash('sha256').update(canonical).digest('hex');
        if(!result.snapshots[route])result.snapshots[route]={hash,length:canonical.length};
        else assert.equal(hash,result.snapshots[route].hash,'Repeated route changed markup: '+route);
      }
      console.error(profileName+' '+(baseline?'baseline':'candidate')+' round '+round+'/'+samples);
      if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT+'.partial',JSON.stringify(result,null,2)+'\n');
    }
    await page.evaluate(()=>nav('cash'));
    await page.waitForTimeout(100);
    await cdp.send('HeapProfiler.collectGarbage');
    result.memoryAfter=await cdp.send('Memory.getDOMCounters');
    result.heapAfter=(await metrics()).JSHeapUsedSize;
    const dbAfter=await page.evaluate(()=>JSON.stringify(DB));
    const changedRoots=Object.keys(JSON.parse(dbBefore)).filter(key=>JSON.stringify(JSON.parse(dbBefore)[key])!==JSON.stringify(JSON.parse(dbAfter)[key]));
    if(changedRoots.length){
      result.databaseDifferences=Object.fromEntries(changedRoots.map(key=>[key,{before:JSON.parse(dbBefore)[key],after:JSON.parse(dbAfter)[key]}]));
      if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT+'.partial',JSON.stringify(result,null,2)+'\n');
    }
    assert.deepEqual(changedRoots,[],'Navigation changed database roots');
    assert.equal(await page.evaluate(()=>JSON.stringify(ZEZMS.cloudSync.getOutbox())),queueBefore,'Navigation changed the outbox');
    result.functional=await page.evaluate(async()=>{
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,100))));
      nav('receipts');await settle();
      const rows=()=>[...document.querySelectorAll('#salesRecordsBody .sales-record-row')];
      check(rows().length===1350,'Sales records omitted');
      const ids=rows().map(row=>row.children[1].innerText);check(new Set(ids).size===1350,'Sales records duplicated');
      const dates=rows().map(row=>new Date(row.children[7].innerText).getTime());check(dates.every((date,i)=>!i||date<=dates[i-1]),'Full sales date order changed');
      for(const query of ['Synthetic Customer 899','RCP-00000899','ZEZ-2026-00000899']){
        document.getElementById('receiptNameSearch').value=query;filterSalesRecordsByName();
        check(rows().filter(row=>row.style.display!=='none').some(row=>row.innerText.includes('ZEZ-2026-00000899')),'Last receipt search failed: '+query);
      }
      clearSalesRecordsNameSearch();check(rows().every(row=>row.style.display!=='none'),'Clear search omitted receipts');
      const receipt=rows().find(row=>row.innerText.includes('ZEZ-2026-00000899'));receipt.querySelector('button').click();check(document.getElementById('modalBody').innerText.includes('ZEZ-2026-00000899'),'Receipt view failed');closeModal();
      const originalPrint=window.printStoredReceipt;let printed=null;try{window.printStoredReceipt=id=>{printed=id;};receipt.querySelectorAll('button')[1].click();check(printed==='ZEZ-2026-00000899','Receipt reprint target changed');}finally{window.printStoredReceipt=originalPrint;}
      const quick=rows().find(row=>row.innerText.includes('Q449'));quick.querySelector('button').click();check(document.getElementById('modalBody').innerText.includes('Q449'),'Last quick sale missing');closeModal();
      nav('products');await settle();check(document.querySelectorAll('#productCatalogBody tr').length===600,'Products omitted');
      ZEZMS.productCatalogSearch.updateId('P599');ZEZMS.productCatalogSearch.refreshNow();await settle();check(document.getElementById('productCatalogBody').innerText.includes('Synthetic Product 599'),'Global product search failed');ZEZMS.productCatalogSearch.clear();await settle();check(document.querySelectorAll('#productCatalogBody tr').length===600,'Clear product search omitted records');
      nav('stock');await settle();const stockRows=document.querySelectorAll('#stockBalanceBody tr.stock-balance-row');check(stockRows.length===600,'Stock balance omitted products');
      const stockTotal=document.getElementById('stockBalanceValue').textContent;
      document.getElementById('stockSearchId').value='P599';filterStockBalanceRows();check([...stockRows].filter(row=>row.style.display!=='none').length===1,'Global stock search failed');clearStockBalanceSearch();check(document.getElementById('stockBalanceValue').textContent===stockTotal,'Stock total changed after search');
      nav('accounts');await settle();check(document.querySelectorAll('#viewRoot button[onclick^="openSettle"]').length===600,'Account holders omitted');
      const statements={};for(const kind of ['debtors','creditors','depositors']){accTab=kind;render();await settle();const buttons=[...document.querySelectorAll('#viewRoot button[onclick^="openSettle"]')];check(buttons.length===600,'Missing '+kind);check(document.querySelectorAll('#accountTransactionBody tr.account-transaction-row').length===100,'Latest-100 account history changed');const last=buttons[599];check(last.getAttribute('onclick').includes(kind+'-599'),'Last account action target changed');last.click();check(document.getElementById('modalBody').innerText.includes('Synthetic '+kind+' 599'),'Settlement dialog target changed');closeModal();const report=await ZEZMS.accountCashPdfR68E.buildAccountStatement(kind,kind+'-599');check(report.bytes.length>100,'Account statement missing');check(report.model.transactions.length===150,'Account statement lost full history');statements[kind]={balance:report.model.accountBalance,transactions:report.model.transactions.length};}
      accTab='debtors';nav('cash');await settle();
      return {salesRecords:ids.length,uniqueIds:new Set(ids).size,receiptSearch:'PASS',dateSort:'PASS',receiptView:'PASS',quickView:'PASS',reprint:'PASS',products:600,stockProducts:600,stockTotal,accountsPerKind:600,accountHistoryPerKind:100,statements};
    });
    assert.equal(await page.evaluate(()=>JSON.stringify(DB)),dbBefore,'Functional UI checks changed the database');
    assert.equal(await page.evaluate(()=>JSON.stringify(ZEZMS.cloudSync.getOutbox())),queueBefore,'Functional UI checks changed the outbox');
    for(const bucket of Object.values(result.measurements)){
      const percentile=(key,p)=>{const values=bucket.warm.map(x=>x[key]).sort((a,b)=>a-b);return values.length?values[Math.ceil(values.length*p)-1]:bucket.firstVisit[key];};
      bucket.summary=Object.fromEntries(['visibleMs','syncMs','scriptMs','domMs','layoutMs','styleMs','taskMs','liveNodes','templateChars','rootReplacements'].map(key=>[key,{median:percentile(key,.5),max:percentile(key,1),...(samples>=20?{p95:percentile(key,.95)}:{})}]));
      bucket.summary.longTasks=bucket.warm.reduce((sum,x)=>sum+x.longTasks.length,0);
      bucket.summary.maxLongTaskMs=Math.max(0,...bucket.warm.flatMap(x=>x.longTasks.map(t=>t.duration)));
      bucket.summary.blockingNavigations=bucket.warm.filter(x=>x.syncMs>50).length;
    }
    if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT,JSON.stringify(result,null,2)+'\n');
    if(process.env.BENCH_COMPARE){
      const previous=JSON.parse(fs.readFileSync(process.env.BENCH_COMPARE,'utf8'));
      assert.deepEqual(result.snapshots,previous.snapshots,'Rendered routes differ from production');
      if(previous.functional)assert.deepEqual(result.functional,previous.functional,'Functional results differ from production');
      console.error('Production route equivalence: PASS');
    }
    console.log(JSON.stringify({profile:profileName,baseline:baseline||'candidate',measurements:Object.fromEntries(Object.entries(result.measurements).map(([k,v])=>[k,v.summary])),snapshots:result.snapshots,memoryBefore:result.memoryBefore,memoryAfter:result.memoryAfter}));
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });

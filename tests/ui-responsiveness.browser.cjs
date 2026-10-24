// Local, synthetic-only navigation benchmark. No production profile or network is used.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const playwright = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const root = path.resolve(__dirname, '..');
const baseline=process.env.BENCH_BASELINE || '';
const device=process.env.BENCH_DEVICE==='SHOP' ? 'SHOP' : 'MAIN';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html');
  if(baseline && (pathname==='/index.html' || pathname==='/js/stock-corrections-v3150.js')) {
    response.end(execFileSync('git',['show',baseline+':'+pathname.slice(1)],{cwd:root,maxBuffer:16*1024*1024}));return;
  }
  response.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright.chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    const context = await browser.newContext();
    const origin = 'http://127.0.0.1:' + server.address().port;
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => !!window.ZEZMS?.navigationV3101 && typeof window.nav === 'function', null, {timeout:20000});
    const salt=Buffer.alloc(16,7), password='synthetic-owner-password';
    const owner={id:'synthetic-owner',name:'Synthetic Owner',role:'OWNER',active:true,
      passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),
      passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),
      createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
    const seed=await page.evaluate(({owner,device})=>{
      const db=JSON.parse(JSON.stringify(DB));
      const now=typeof getLatestMonth==='function'?getLatestMonth():{year:2026,month:10};
      db.products=Array.from({length:600},(_,i)=>({id:'P'+i,name:'Synthetic Product '+i,category:'Test',uPrice:25,uCost:15}));
      db.stockRows=Array.from({length:1800},(_,i)=>({id:'R'+i,productId:'P'+(i%600),productName:'Synthetic Product '+(i%600),category:'Test',year:now.year,month:now.month,qtyIn:20,qtyOut:4,rStock:16,uCost:15,uPrice:25,tSales:100,profit:40}));
      db.sales=Array.from({length:900},(_,i)=>({id:'S'+i,date:'2026-10-20',total:25,amount:25,items:[],cashier:'Synthetic'}));
      db.receipts=Array.from({length:900},(_,i)=>({receiptNo:'RC'+i,date:'2026-10-20T12:00:00Z',cashier:'Synthetic',
        customerName:'Synthetic Customer '+i,items:[{product:'Synthetic Product '+(i%600),qty:1,uPrice:25}],total:25,amountPaid:25,status:'PAID'}));
      db.inventoryTxns=Array.from({length:450},(_,i)=>({id:'Q'+i,type:'SALE_OUT',subtype:'QUICK',
        date:'2026-10-20T12:00:00Z',cashier:'Synthetic',amount:25,status:'COMPLETED',details:{lines:[]}}));
      db.cashLog=Array.from({length:300},(_,i)=>({id:'C'+i,date:'2026-10-20',amount:5,type:'Expense'}));
      db.expenses=Array.from({length:300},(_,i)=>({id:'E'+i,date:'2026-10-20',amount:5,category:'Test'}));
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
    await page.waitForFunction(()=>!!window.ZEZMS?.staffAuth && !!window.ZEZMS?.navigationV3101,null,{timeout:20000});
    await page.locator('#sharedLoginUser').selectOption(owner.id);
    await page.locator('#sharedLoginPassword').fill(password);
    await page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());
    await page.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');
    const result = await page.evaluate(() => {
      const median = values => { const sorted=values.slice().sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)]; };
      const hash = value => { let h=2166136261; for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619); return (h>>>0).toString(16); };
      // This profile is authenticated locally with synthetic records and has no cloud configuration.
      const click = view => document.querySelector('#mainNav .nav-submenu-item[data-view="'+view+'"]')?.click();
      const tasks = [
        ['salesClick', () => click('receipts')],
        ['stockClick', () => click('stock')],
        ['financeClick', () => click('cash')],
        ['dashboardClick', () => click('dashboard')],
        ['managementClick', () => click('management-intelligence')],
        ['stockHTML', () => viewStock()],
        ['dashboardHTML', () => viewDashboard()]
      ];
      const measures = {};
      for (const [name, fn] of tasks) {
        const values = []; let last = '';
        for (let n=0;n<7;n++) {
          const start = performance.now();
          try { const value = fn(); last = typeof value === 'string' ? value : document.getElementById('viewRoot')?.innerHTML || ''; }
          catch (error) { last = 'ERROR: '+error.message; }
          values.push(Math.round((performance.now()-start)*100)/100);
        }
        measures[name] = {medianMs:median(values), samplesMs:values, outputLength:last.length, outputHash:hash(last), outputStart:last.slice(0,40)};
      }
      return measures;
    });
    console.log(JSON.stringify(result,null,2));
    if(!baseline) {
      const before=await page.evaluate(()=>({sales:JSON.stringify(DB.sales),cash:JSON.stringify(DB.cashBalances),
        queue:ZEZMS.cloudSync.getOutbox().length,qty:ZEZMS.stockCorrections.currentQuantity(DB.products[1])}));
      await page.evaluate(()=>ZEZMS.stockCorrections.openCorrection('P1'));
      await page.locator('#scType').selectOption('Set Physical Count');
      await page.locator('#scQty').fill('0');
      await page.evaluate(()=>ZEZMS.stockCorrections.previewCorrection());
      assert.match(await page.locator('#modalBody').innerText(),/Inventory Value Before/);
      assert.match(await page.locator('#modalBody').innerText(),/Inventory Value After/);
      await page.evaluate(()=>ZEZMS.stockCorrections.confirmCorrection());
      const after=await page.evaluate(beforeCount=>({sales:JSON.stringify(DB.sales),cash:JSON.stringify(DB.cashBalances),
        queue:ZEZMS.cloudSync.getOutbox().length,qty:ZEZMS.stockCorrections.currentQuantity(DB.products[1]),
        correction:DB.stockCorrections.at(-1),rows:DB.stockRows.filter(r=>r.productId==='P1').map(r=>({qtyIn:r.qtyIn,qtyOut:r.qtyOut,rStock:r.rStock})),
        newKinds:ZEZMS.cloudSync.getOutbox().slice(beforeCount).map(op=>op.kind)}),before.queue);
      assert.equal(before.qty,48);assert.equal(after.qty,0);
      assert.equal(after.correction.quantity,48);assert.equal(after.correction.correctionType,'Quantity Decrease');
      assert.equal(after.correction.reason,'Physical Count Adjustment');
      assert.ok(after.rows.every(r=>r.qtyIn===20&&r.qtyOut===4&&r.rStock===0));
      assert.equal(after.sales,before.sales);assert.equal(after.cash,before.cash);
      assert.ok(after.newKinds.includes('STOCK_CORRECTION_UPSERT'),'M4/3 did not classify the audited stock correction');
      console.log(JSON.stringify({physicalCountBrowser:'PASS',device,queueBefore:before.queue,queueAfter:after.queue,newKinds:after.newKinds}));
    }
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });

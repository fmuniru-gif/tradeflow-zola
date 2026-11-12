// Actual assembled application and patch engine with synthetic receive inputs.
// The narrow receive hook substitutes only network/capability dependencies;
// the shipped save, inverse/rebase, acknowledgement and journal paths run intact.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),delivery=require('../tools/build-pr11-delivery.cjs'),root=path.resolve(__dirname,'..');let browser;
const hook=`    _test: {
      async receiveSyntheticRows(rows) {
        const oldFetch=fetchOperationsAfter,oldRequire=requireClient,oldGuard=window.ZEZMS_M43_CAPABILITY_GUARD;
        let read=false;fetchOperationsAfter=async function(){if(read)return [];read=true;return rows;};requireClient=function(){};window.ZEZMS_M43_CAPABILITY_GUARD=async function(){};
        try{return await pullNowCore(true);}finally{fetchOperationsAfter=oldFetch;requireClient=oldRequire;window.ZEZMS_M43_CAPABILITY_GUARD=oldGuard;}
      },
      buildOperation:`;
const source=delivery.assembledShell(delivery.assetBytes('index.html').toString()),marker='    _test: {\n      buildOperation:';assert.equal(source.split(marker).length,2);
const synthetic=source.replace(marker,hook);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);if(name==='native-receive.html'){res.setHeader('Content-Type','text/html');return res.end(synthetic);}if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function setup(){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),blocked=[];context.setDefaultTimeout(15000);
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(blocked.push(r.request().url()),r.abort()));
 const url='http://127.0.0.1:'+server.address().port+'/native-receive.html';await page.goto(url);await page.waitForFunction(()=>window.ZEZMS?.cloudSync);await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 await page.evaluate(()=>{DB.cashLog=[];DB.cashBalances={Cash:100};DB.stockRows=[];DB.sales=[];DB.accountTxns=[];ZEZMS.cloudSync._test.ensureSyncIds(DB);ZEZMS.db.save(DB_KEY,DB);const s=ZEZMS.cloudSync.getState();Object.assign(s,{initialized:true,syncOwnerId:'synthetic-owner',businessId:'synthetic-business',deviceAccessMode:'OWNER',configurationVerificationRequired:false,cursor:20,liveSyncEnabled:false,liveSyncDesired:false,supabaseUrl:'',publishableKey:''});localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(s));localStorage.setItem('zezms_cloud_sync_m4_queue','[]');localStorage.setItem('zezms_cloud_sync_m4_applied_v2','{}');localStorage.setItem('zezms_cloud_sync_m4_failed_v2','[]');});
 await page.reload();await page.waitForFunction(()=>window.ZEZMS?.cloudSync);await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 await page.evaluate(()=>{window.__online=true;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>__online});});return {context,page,url,blocked};
}
async function save(page){return page.evaluate(()=>{DB.cashLog.push({id:'synthetic-local-cash',amount:25,action:'Deduct',cashType:'Cash',before:100,after:75,at:'2026-11-11T00:00:00Z'});DB.cashBalances.Cash=75;saveDB();return ZEZMS.cloudSync.getOutbox();});}
test('native local save durably pairs a cash entry, wallet delta and immutable outbox operation',async()=>{
 const f=await setup();try{const queue=await save(f.page);assert.equal(queue.length,1);const value=await f.page.evaluate(()=>({db:JSON.parse(localStorage.getItem(DB_KEY)),queue:JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_queue')),pending:ZEZMS.syncDurability.pending()}));assert.equal(value.db.cashBalances.Cash,75);assert.equal(value.db.cashLog.length,1);assert.equal(value.pending,false);assert.equal(value.queue[0].opId,queue[0].opId);await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.cloudSync);await f.page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));assert.equal(await f.page.evaluate(()=>ZEZMS.cloudSync.getOutbox().length),1);}finally{await f.context.close();}
});
test('native receive rebases queued cash in memory and saves only the final complete projection',async()=>{
 const f=await setup();try{const queue=await save(f.page);const result=await f.page.evaluate(async queued=>{
  const n=ZEZMS.cloudSync._test,remote={opId:'synthetic-remote-cash',deviceId:'synthetic-shop',deviceSeq:1,protocolVersion:'M4/3',kind:'CASH',patches:[{action:'insert',collection:'cashLog',key:'remote-entry',value:{id:'remote-entry',amount:10}},{action:'root-object',root:'cashBalances',key:'Cash',mode:'delta',before:100,value:10}]};n.sealOperation(remote);
  const row={seq:21,op_id:remote.opId,device_id:remote.deviceId,payload:remote};const set=Storage.prototype.setItem;window.__dbWrites=[];Storage.prototype.setItem=function(k,v){if(k===DB_KEY)__dbWrites.push(JSON.parse(v).cashBalances.Cash);return set.call(this,k,v);};
  await n.receiveSyntheticRows([row]);return {wallet:DB.cashBalances.Cash,entries:DB.cashLog.map(x=>x.id).sort(),queue:ZEZMS.cloudSync.getOutbox().map(x=>x.opId),writes:__dbWrites,cursor:ZEZMS.cloudSync.getState().cursor,applied:ZEZMS.cloudSync.getAppliedOperations()};
 },queue[0]);assert.equal(result.wallet,85);assert.deepEqual(result.entries,['remote-entry','synthetic-local-cash']);assert.deepEqual(result.queue,[queue[0].opId]);assert.deepEqual(result.writes,[85]);assert.equal(result.cursor,21);assert.equal(result.applied['synthetic-remote-cash'],21);}finally{await f.context.close();}
});
test('a metadata failure after native receive completes exactly once on reopen without another cash deduction',async()=>{
 const f=await setup();try{await save(f.page);const result=await f.page.evaluate(async()=>{
  const n=ZEZMS.cloudSync._test,op={opId:'remote-op',deviceId:'synthetic-shop',deviceSeq:2,protocolVersion:'M4/3',kind:'CASH',patches:[{action:'insert',collection:'cashLog',key:'remote-entry',value:{id:'remote-entry',amount:10}},{action:'root-object',root:'cashBalances',key:'Cash',mode:'delta',before:100,value:10}]};n.sealOperation(op);const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='zezms_cloud_sync_m4_applied_v2')throw Error('synthetic register storage failure');return set.call(this,k,v);};let error='';try{await n.receiveSyntheticRows([{seq:21,op_id:op.opId,device_id:op.deviceId,payload:op}]);}catch(e){error=e.message;}return {error,pending:ZEZMS.syncDurability.pending(),wallet:JSON.parse(localStorage.getItem(DB_KEY)).cashBalances.Cash,allowed:ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions()};
 });assert.match(result.error,/synthetic register/);assert.equal(result.pending,true);assert.equal(result.allowed,false);assert.equal(result.wallet,85);const held=await f.page.evaluate(async()=>{let error='';try{await ZEZMS.cloudSync._test.receiveSyntheticRows([]);}catch(e){error=e.message;}return {error,ready:ZEZMS.cloudSync.isReadyForLocalOperations()};});assert.match(held.error,/DURABILITY_REVIEW_REQUIRED/);assert.equal(held.ready,false);
 await f.page.reload();await f.page.waitForFunction(()=>window.ZEZMS?.cloudSync);await f.page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));const after=await f.page.evaluate(()=>({pending:ZEZMS.syncDurability.pending(),wallet:DB.cashBalances.Cash,entries:DB.cashLog.length,cursor:ZEZMS.cloudSync.getState().cursor,queued:ZEZMS.cloudSync.getOutbox().length}));assert.deepEqual(after,{pending:false,wallet:85,entries:2,cursor:21,queued:1});}finally{await f.context.close();}
});
test('another window cannot overwrite a newer business save even after reading its stored copy',async()=>{
 const f=await setup();try{const b=await f.context.newPage();await b.goto(f.url);await b.waitForFunction(()=>window.ZEZMS?.cloudSync);await b.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));await save(f.page);const result=await b.evaluate(()=>{ZEZMS.db.load(DB_KEY);DB.cashBalances.Cash=12;let message='';try{saveDB();}catch(e){message=e.message;}return {message,wallet:JSON.parse(localStorage.getItem(DB_KEY)).cashBalances.Cash};});assert.match(result.message,/ANOTHER_WINDOW/);assert.equal(result.wallet,75);}finally{await f.context.close();}
});

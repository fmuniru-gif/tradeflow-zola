// Actual assembled application; disposable profiles and synthetic local state only.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');let browser;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 // Prove the shell does not depend on a separately cached recovery guard.
 if(/js\/(bootstrap-startup-guard|auto-month-rollover-bootstrap-guard)\.js/.test(name)){res.writeHead(503);return res.end('synthetic stale worker asset');}
 res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function fixture(){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext(),page=await context.newPage();
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.waitForFunction(()=>window.ZEZMS?.canonicalRestore?.build==='20261103-canonical-recovery-r1'&&window.ZEZMS?.bootstrapStartupGuard&&window.ZEZMS?.autoMonth);
 return {page,context};
}
async function seedHold(page,key,value){
 return page.evaluate(({key,value})=>{
  const state=Object.assign({},ZEZMS.cloudSync.getState(),{initialized:true,deviceAccessMode:'OWNER',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:false});
  localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify(state));
  localStorage.setItem(key,value==='pending'?JSON.stringify({version:1,deviceId:state.deviceId,expectedCursor:1,status:'VERIFY_REQUIRED'}):value);
  const q=JSON.stringify([{opId:'synthetic-unsent-sale',kind:'SALE_OUT',patches:[],outboxState:'Pending',attempts:0,_legacyPayload:true}]);localStorage.setItem('zezms_cloud_sync_m4_queue',q);
  return {queue:q,db:localStorage.getItem('tradeflow_v321_zola')};
 },{key,value});
}
test('actual shell loads the new recovery coordinator and both guards despite unavailable external guard assets',async()=>{
 const {page,context}=await fixture();try{
  const result=await page.evaluate(()=>({delivery:document.querySelector('meta[name="zezms-delivery"]')?.content,
   guards:[...document.querySelectorAll('script[data-zezms-recovery-module]')].map(x=>x.getAttribute('data-zezms-recovery-module')),
   bridge:['pauseForCanonicalRecovery','prepareCanonicalRecovery','inspectCanonicalRecoveryQueue'].every(k=>typeof ZEZMS.cloudSync[k]==='function')}));
  assert.equal(result.delivery,require('../tools/build-pr11-delivery.cjs').DELIVERY);assert.equal(result.bridge,true);
  assert.deepEqual(result.guards,['bootstrap-startup-guard.js','auto-month-rollover-bootstrap-guard.js']);
 }finally{await context.close();}
});
for(const [name,key,value] of [
 ['pending verification','zezms_canonical_restore_pending_v1','pending'],
 ['interrupted preparation','zezms_canonical_recovery_preparation_v1','malformed'],
 ['corrupt verification lock','zezms_canonical_restore_pending_v1','malformed']
])test(name+' survives reload and holds focus/online rollover callbacks without changing an unsent sale',async()=>{
 const {page,context}=await fixture();try{
  const before=await seedHold(page,key,value);await page.reload();
  await page.waitForFunction(()=>window.ZEZMS?.canonicalRestore&&window.ZEZMS?.autoMonth);
  const result=await page.evaluate(()=>{
   window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
   const ensure=ZEZMS.autoMonth.ensure({silent:true});
   return {automatic:ZEZMS.bootstrapStartupGuard.allowsAutomaticBusinessWrites(),trading:ZEZMS.bootstrapStartupGuard.allowsBusinessTransactions(),ensure,
    queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),db:localStorage.getItem('tradeflow_v321_zola'),held:!!(ZEZMS.canonicalRestore.getState().pending||ZEZMS.canonicalRestore.getState().preparation)};
  });
  assert.equal(result.held,true);assert.equal(result.automatic,false);assert.equal(result.trading,false);assert.equal(result.ensure.deferred,true);
  assert.equal(result.queue,before.queue);assert.equal(result.db,before.db);
 }finally{await context.close();}
});
test('actual private pause persists manual-off preference and preserves the entire outbox',async()=>{
 const {page,context}=await fixture();try{
  const result=await page.evaluate(async()=>{
   await ZEZMS.cloudSync.waitUntilReady(10000);
   const old=ZEZMS.staffAuth.getContext;ZEZMS.staffAuth.getContext=()=>({role:'OWNER',user:{id:'synthetic-owner-staff'}});
   const before=JSON.stringify(ZEZMS.cloudSync.getOutbox());
   try{await ZEZMS.cloudSync.pauseForCanonicalRecovery();return {before,after:JSON.stringify(ZEZMS.cloudSync.getOutbox()),state:ZEZMS.cloudSync.getState(),saved:JSON.parse(localStorage.getItem('zezms_cloud_sync_m4_state'))};}
   finally{ZEZMS.staffAuth.getContext=old;}
  });
  assert.equal(result.before,result.after);assert.equal(result.state.liveSyncEnabled,false);assert.equal(result.state.liveSyncDesired,false);
  assert.equal(result.saved.liveSyncEnabled,false);assert.equal(result.saved.liveSyncDesired,false);
 }finally{await context.close();}
});

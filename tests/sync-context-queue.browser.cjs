// Actual assembled helper and pinned SDK; no live Cloud account or business data.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),root=path.resolve(__dirname,'..');
let browser;
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
for(const changed of [true,false])test(changed?'a late SDK response from a replaced client cannot be accepted into the new context':'ordinary SDK completion survives token refresh for the same user',async()=>{
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 try{
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForFunction(()=>window.ZEZMS?.syncResilience?.captureContext&&window.ZEZMS?.cloudSync);
  await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
  await page.addScriptTag({path:path.join(root,'diagnostics/r70t-owner-check/supabase-js-2.112.1.js')});
  let resolveSeen,release,requests=0;const seen=new Promise(r=>resolveSeen=r),response=new Promise(r=>release=r);
  await context.route('**/rest/v1/**',async route=>{requests++;resolveSeen();await response;await route.fulfill({contentType:'application/json',body:JSON.stringify([{seq:21,op_id:'synthetic-op'}])});});
  const result=page.evaluate(async()=>{
   const saved={database:localStorage.getItem('tradeflow_v321_zola'),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())};
   const client=supabase.createClient(location.origin,'synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const current={client,ownerId:'synthetic-owner',session:{user:{id:'synthetic-user'}},state:{initialized:true,deviceId:'synthetic-device',businessId:'synthetic-business',supabaseUrl:location.origin,publishableKey:'synthetic-public-key'}};
   window.__syntheticSyncContext=current;
   const scope=ZEZMS.syncResilience.captureContext(()=>current);let error='',rows=null;
   try{const response=await ZEZMS.syncResilience.create({sleep:async()=>{}}).read(signal=>scope.client.from('synthetic_operations').select('seq,op_id').abortSignal(signal),{contextValid:scope.valid});rows=response.data;}
   catch(e){error=e.message;}
   return {error,rows,preserved:saved.database===localStorage.getItem('tradeflow_v321_zola')&&saved.queue===JSON.stringify(ZEZMS.cloudSync.getOutbox())};
  });
  await seen;await page.evaluate(changed=>{if(changed)window.__syntheticSyncContext.client={replacement:true};else window.__syntheticSyncContext.session={user:{id:'synthetic-user'},access_token:'synthetic-refreshed-token'};},changed);release();
  const actual=await result;assert.equal(requests,1);assert.equal(actual.preserved,true);
  if(changed){assert.match(actual.error,/SYNC_CONTEXT_CHANGED/);assert.equal(actual.rows,null);}else{assert.equal(actual.error,'');assert.deepEqual(actual.rows,[{seq:21,op_id:'synthetic-op'}]);}
 }finally{await context.close();}
});

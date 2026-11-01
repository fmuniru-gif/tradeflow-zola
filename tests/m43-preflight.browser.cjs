'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),{start}=require('./m43-preflight-demo.cjs');
const {packet,response,copy}=require('./m43-preflight-fixture.cjs'),core=require('../diagnostics/m43-correction-reconciliation/preflight-core.js');
async function browserCase(fn,options={}){const {server,url}=await start(0),origin=new URL(url).origin,browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-sandbox']});
 try{const context=await browser.newContext({viewport:{width:420,height:800}}),p=await packet(),requests=[];options.packet?.(p);await context.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url());requests.push({method:request.method(),origin:u.origin,path:u.pathname});
   if(u.origin===origin)return route.continue();
   if(u.origin!==p.origin)return route.abort();
   const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'authorization,apikey,accept,prefer','access-control-expose-headers':'content-range','content-type':'application/json'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   assert.equal(request.method(),'GET');const name=Object.entries(core.PATHS).find(([,v])=>v===u.pathname)?.[0];assert.ok(name,'unapproved endpoint');
   let r=response(p,name,Object.fromEntries(u.searchParams));if(options.modify)r=options.modify(name,r,p);
   if(r.count!==null)headers['content-range']=(r.data?.length?'0-'+(r.data.length-1):'*')+'/'+r.count;
   return route.fulfill({status:r.status,headers,body:JSON.stringify(r.data)});
  });
  await context.addInitScript(({raw,hold})=>{for(const [k,v]of Object.entries(raw))if(v!==null)localStorage.setItem(k,v);window.__preflightWrites=[];for(const method of ['setItem','removeItem','clear'])Storage.prototype[method]=function(){window.__preflightWrites.push(method);throw Error('SYNTHETIC_FORBIDDEN_STORAGE_WRITE');};for(const name of ['WebSocket','EventSource'])window[name]=function(){window.__preflightWrites.push(name);throw Error('SYNTHETIC_FORBIDDEN_NETWORK');};navigator.sendBeacon=()=>{window.__preflightWrites.push('beacon');return false;};indexedDB.open=()=>{window.__preflightWrites.push('indexedDB');throw Error('SYNTHETIC_FORBIDDEN_INDEXEDDB');};for(const name of ['register','getRegistration','getRegistrations'])navigator.serviceWorker[name]=()=>{window.__preflightWrites.push(name);throw Error('SYNTHETIC_FORBIDDEN_WORKER_API');};if(hold)Object.defineProperty(navigator.serviceWorker,'controller',{get:()=>({scriptURL:'synthetic-controller'})});}, {raw:p.raw,hold:!!options.hold});
  const page=await context.newPage();await page.goto(options.demo?url:origin+'/preflight.html');const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))));
  assert.equal(requests.filter(r=>r.origin===p.origin).length,0,'page queried cloud before Owner click');
  await fn({page,p,requests,origin});
  assert.deepEqual(await page.evaluate(()=>window.__preflightWrites),[]);assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))),before);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}}
test('simple page checks existing session with GET only, classifies an existing publication400 and exposes no records',async()=>browserCase(async({page,p,requests})=>{
 const trace={log:{entries:[{request:{url:p.origin+'/rest/v1/rpc/zezms_mb3_publish_protocol_readiness',method:'POST',headers:[{name:'Authorization',value:'PRIVATE_TEST_TOKEN'}],postData:{text:'PRIVATE_TEST_CUSTOMER'}},response:{status:400,content:{text:'PRIVATE_TEST_CUSTOMER'}}}]}};
 await page.locator('#trace').setInputFiles({name:'existing.har',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(trace))});await page.locator('#run').click();await page.locator('#decision[data-result="GO"]').waitFor();
 const body=await page.locator('main').innerText();for(const secret of ['PRIVATE_TEST_TOKEN','PRIVATE_TEST_CUSTOMER',p.data.evidence[0].correction_id,p.data.evidence[0].stock_before.id])assert.ok(!body.includes(secret));
 assert.match(body,/HTTP400 POST \/rest\/v1\/rpc\/zezms_mb3_publish_protocol_readiness/);assert.ok(requests.filter(r=>r.origin===p.origin).every(r=>['GET','OPTIONS'].includes(r.method)));assert.ok(!requests.some(r=>r.path.includes('deliver_preserved')||r.path.includes('publish_protocol_readiness')||r.path.includes('auth/v1/token')));
}));
test('volatile protocol GET rejection is NO-GO, not treated as proof of a failing upload POST',async()=>browserCase(async({page,requests})=>{
 await page.locator('#run').click();await page.locator('#decision[data-result="NO-GO"]').waitFor();const text=await page.locator('#blockers').innerText();assert.match(text,/not proof that POST delivery is broken/);assert.match(text,/does not identify.*HTTP400/);assert.ok(!requests.some(r=>r.method==='POST'));
},{modify:(name,r)=>name==='capability'?{ok:false,status:405,data:{message:'PRIVATE_TEST_MESSAGE'}}:r}));
test('service-worker-controlled page refuses before reading session or querying cloud',async()=>browserCase(async({page,p,requests})=>{
 await page.locator('#run').click();await page.locator('#decision[data-result="NO-GO"]').waitFor();assert.match(await page.locator('#blockers').innerText(),/controlled by a service worker/);assert.equal(requests.filter(r=>r.origin===p.origin).length,0);
},{hold:true}));
test('local demo uses only disposable virtual fixtures and never queries Supabase',async()=>browserCase(async({page,p,requests})=>{
 await page.locator('#run').click();await page.locator('#decision[data-result="GO"]').waitFor();assert.match(await page.locator('#decision').innerText(),/synthetic demo/);assert.match(await page.locator('#mode').innerText(),/no Main data/);assert.equal(requests.filter(r=>r.origin===p.origin).length,0);
},{demo:true}));
test('expired or wrong-project sessions stop before any cloud request and never refresh tokens',async()=>{
 for(const mode of ['expired','wrong-project'])await browserCase(async({page,requests,origin})=>{
  await page.locator('#run').click();await page.locator('#decision[data-result="NO-GO"]').waitFor();assert.ok(requests.every(r=>r.origin===origin));
 },{packet:p=>{if(mode==='expired'){const s=JSON.parse(p.raw['zezms-m3-supabase-auth']);s.expires_at=0;p.raw['zezms-m3-supabase-auth']=JSON.stringify(s);}else{const s=JSON.parse(p.raw.zezms_cloud_sync_m4_state);s.supabaseUrl='https://different-project.supabase.co';p.raw.zezms_cloud_sync_m4_state=JSON.stringify(s);}}});
});

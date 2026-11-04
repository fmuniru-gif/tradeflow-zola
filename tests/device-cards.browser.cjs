// Real assembled application, isolated synthetic device/account contexts only.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const crypto=require('node:crypto'),password='synthetic-owner-password',salt=Buffer.alloc(16,7),owner={id:'synthetic-owner-staff',name:'Synthetic Owner',role:'OWNER',active:true,signatureFile:'',passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64'),createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'};
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core'),root=path.resolve(__dirname,'..'),baseline='9286f24d472dff253b4b69cd1a13ea7a9e950fb9',oldFiles=new Map();let browser;
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';const prior=name.startsWith('baseline/');if(prior)name=name.slice(9);const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream');if(prior){try{if(!oldFiles.has(name))oldFiles.set(name,execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:32*1024*1024}));res.end(oldFiles.get(name));}catch(_){res.writeHead(404);res.end();}}else res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function fixture({prior=false,mode='OWNER'}={}){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:768}}),page=await context.newPage();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(mode=>localStorage.setItem('zezms_cloud_sync_m4_state',JSON.stringify({initialized:true,deviceId:'SYNTHETIC-MAIN',deviceName:'Synthetic test device',businessId:'synthetic-business',syncOwnerId:'synthetic-owner',deviceAccessMode:mode,liveSyncEnabled:false,liveSyncDesired:false})),mode);
 await page.goto('http://127.0.0.1:'+server.address().port+'/'+(prior?'baseline/':'')+'index.html');await page.waitForFunction(()=>window.ZEZMS?.deviceEnrollment&&window.ZEZMS?.selfServiceRecovery&&document.documentElement.getAttribute('data-zezms-device-enrollment')==='ready');await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));
 await page.evaluate(owner=>{const db=JSON.parse(JSON.stringify(DB));db.sharedDeviceAuth={version:1,enabled:true,businessId:'synthetic-business',users:[owner],audit:[]};db.sharedDeviceDirectory={version:1,enabled:true,businessId:'synthetic-business',users:[owner]};localStorage.setItem(DB_KEY,JSON.stringify(db));},owner);
 await page.reload();await page.waitForFunction(()=>window.ZEZMS?.staffAuth&&window.ZEZMS?.cloudSync);await page.locator('#sharedLoginUser').selectOption(owner.id);await page.locator('#sharedLoginPassword').fill(password);await page.evaluate(()=>ZEZMS.staffAuth.signInFromLogin());await page.waitForFunction(()=>ZEZMS.staffAuth.getContext().role==='OWNER');await page.waitForTimeout(1000);
 return {page,context};
}
async function mock(page,mode='OWNER'){
 await page.evaluate(mode=>{
  const now=new Date().toISOString(),version=String(APP_VERSION),old=new Date(Date.now()-20*86400000).toISOString();
  window.__deviceTest={role:'OWNER',mode,ready:true,mfa:true,reads:0,mfaCalls:0,rpcs:[],records:[
   {device_id:'SYNTHETIC-MAIN',device_name:'Synthetic Main',app_version:version,last_seen_at:now},
   {device_id:'SYNTHETIC-SHOP',device_name:'Synthetic Shop',app_version:version,last_seen_at:now,metadata:{access_mode:'PAIRED_ANONYMOUS'}},
   {device_id:'SYNTHETIC-CAMON',device_name:'Synthetic Camon',app_version:version,last_seen_at:now},
   {device_id:'SYNTHETIC-OLD-SHOP',device_name:'Older unused Shop',app_version:version,last_seen_at:old},
   {device_id:'SYNTHETIC-REVOKED',device_name:'Revoked phone',app_version:version,last_seen_at:now,revoked_at:now},
   {device_id:'SYNTHETIC-OLD-APP',device_name:'Older app',app_version:'3.31.17',last_seen_at:now},
   ...Array.from({length:15},(_,i)=>({device_id:'SYNTHETIC-HISTORY-'+i,device_name:'History '+i,app_version:version,last_seen_at:old}))]};
  const t=__deviceTest;
  const client={from(table){return {select(){return this;},eq(){return this;},order(){return this;},abortSignal(){return this;},then(resolve,reject){if(table==='zezms_business_devices')t.reads++;return Promise.resolve({data:table==='zezms_business_devices'?structuredClone(t.records):[{id:'synthetic-branch',name:'Synthetic Branch',is_primary:true,status:'ACTIVE'}],error:null}).then(resolve,reject);}};},rpc(name,args){t.rpcs.push({name,args});return Promise.resolve({data:name==='zezms_commercial_context'||name==='zezms_m5a3_device_context'?{business_id:'synthetic-business',trading_name:'Synthetic Business',member_role:'OWNER',branch_id:'synthetic-branch',device_status:'ACTIVE'}:[],error:null});}};
  const current=ZEZMS.cloudSync.getState();ZEZMS.cloudSync.getState=()=>({...current,initialized:true,deviceId:'SYNTHETIC-MAIN',deviceName:'Synthetic test device',businessId:'synthetic-business',syncOwnerId:'synthetic-owner',deviceAccessMode:t.mode});
  ZEZMS.cloudSync.getClient=()=>client;ZEZMS.cloudSync.getSession=()=>({user:{id:'synthetic-owner'}});ZEZMS.cloudSync.getOwnerManagementContext=()=>({ready:t.ready,temporary:t.mode==='PAIRED',client,session:{user:{id:'synthetic-owner'}}});ZEZMS.cloudSync.ensureMfa=async()=>{t.mfaCalls++;return t.mfa;};
  ZEZMS.staffAuth.getContext=()=>({role:t.role,user:{id:'synthetic-staff',active:true}});ZEZMS.staffAuth.isActive=()=>true;ZEZMS.staffAuth.canView=()=>true;session.role='ADMIN';session.adminMode=true;session.commercialRole='OWNER';
 },mode);
}
test('Owner/Admin recovery and both directory cards are present on primary and paired registered devices; other staff are denied',async()=>{
 for(const mode of ['OWNER','PAIRED']){const f=await fixture({mode});try{await mock(f.page,mode);await f.page.evaluate(()=>{__deviceTest.ready=false;});for(const role of ['OWNER','ADMIN','CASHIER','AUDITOR','READ_ONLY']){
  const result=await f.page.evaluate(async role=>{__deviceTest.role=role;const allowed=ZEZMS.selfServiceRecovery._test.ownerRecoveryAllowed(),sync=String(viewSync()),settings=String(viewSettings());let paused=false;try{await ZEZMS.cloudSync.pauseForCanonicalRecovery();paused=true;}catch(_){}return {allowed,recovery:sync.includes('data-zezms-self-service-recovery='),registered:settings.includes('deviceRows-registered'),enrolled:settings.includes('deviceRows-enrolled'),paused,reads:__deviceTest.reads};},role);
  const expected=['OWNER','ADMIN'].includes(role);assert.equal(result.allowed,expected,mode+'/'+role);assert.equal(result.recovery,expected);assert.equal(result.registered,expected);assert.equal(result.enrolled,expected);assert.equal(result.paused,expected);assert.equal(result.reads,0,'unverified paired/primary context must not query fleet');
 }}finally{await f.context.close();}}
});
test('recent/current devices are the default, history remains available and self/unauthorized revocation is blocked',async()=>{
 const f=await fixture({mode:'PAIRED'});try{await mock(f.page,'PAIRED');await f.page.evaluate(()=>{currentView='settings';render();});await f.page.waitForFunction(()=>document.querySelectorAll('#deviceRows-enrolled tr').length===3);
 assert.equal(await f.page.locator('#deviceRows-registered tr').count(),3);assert.equal(await f.page.locator('#deviceRows-enrolled').textContent().then(s=>s.includes('Revoked phone')),false);
 await f.page.locator('#deviceFilter-enrolled').click();assert.equal(await f.page.locator('#deviceRows-enrolled tr').count(),21);assert.equal(await f.page.locator('#deviceRows-registered tr').count(),21);assert.match(await f.page.locator('#deviceRows-enrolled').textContent(),/REVOKED/);
 const result=await f.page.evaluate(async()=>{let selfBlocked=false;try{secureDeviceEnrollmentOpenRevocation('SYNTHETIC-MAIN','Main');}catch(_){selfBlocked=true;}__deviceTest.role='CASHIER';let otherBlocked=false;try{secureDeviceEnrollmentOpenRevocation('SYNTHETIC-SHOP','Shop');}catch(_){otherBlocked=true;}try{await ZEZMS.deviceCards.requireActor(true);}catch(_){}return {selfBlocked,otherBlocked,mutations:__deviceTest.rpcs.filter(r=>/revoke|create_device_pairing/.test(r.name)).length};});assert.deepEqual(result,{selfBlocked:true,otherBlocked:true,mutations:0});
 }finally{await f.context.close();}
});
test('real Settings rerenders reproduce legacy table churn while the new shared directory retains rows, scroll and typed form inputs',async()=>{
 const evidence=[];
 for(const prior of [true,false]){const f=await fixture({prior});try{
  await mock(f.page);await f.page.evaluate(()=>ZEZMS.commercialFoundation.refresh({silent:true}));await f.page.evaluate(()=>{currentView='settings';render();});
  const selector=prior?'#enrolledDeviceRows':'#deviceRows-enrolled';await f.page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('Synthetic Shop'),selector);
  if(!prior)await f.page.locator('#deviceFilter-enrolled').click();
  await f.page.locator('#devicePairName').fill('Unposted device draft');
  const result=await f.page.evaluate(async selector=>{
   const body=document.querySelector(selector),row=body.querySelector('tr'),wrap=body.closest('.table-wrap'),before=JSON.stringify(DB),queue=JSON.stringify(ZEZMS.cloudSync.getOutbox());let removed=0;
   const observer=new MutationObserver(records=>records.forEach(r=>{removed+=r.removedNodes.length;}));observer.observe(body,{childList:true});
   wrap.scrollTop=100;const scroll=wrap.scrollTop;const reads=__deviceTest.reads;
   for(let i=0;i<6;i++){render();await new Promise(r=>setTimeout(r,90));}
   observer.disconnect();return {reads:__deviceTest.reads-reads,removed,rowRetained:row===body.querySelector('tr'),scrollStable:wrap.scrollTop===scroll,draft:document.getElementById('devicePairName').value,dbUnchanged:before===JSON.stringify(DB),queueUnchanged:queue===JSON.stringify(ZEZMS.cloudSync.getOutbox())};
  },selector);evidence.push({prior,...result});assert.equal(result.draft,'Unposted device draft');assert.equal(result.dbUnchanged,true);assert.equal(result.queueUnchanged,true);
  if(prior){assert.ok(result.reads>=4,JSON.stringify(result));assert.ok(result.removed>0);}else{assert.equal(result.reads,0);assert.equal(result.removed,0);assert.equal(result.rowRetained,true);assert.equal(result.scrollStable,true);
   await f.page.setViewportSize({width:412,height:915});await f.page.waitForTimeout(250);assert.equal(await f.page.locator('#devicePairBranch').inputValue(),'synthetic-branch');assert.match(await f.page.locator('#devicePairBranch').textContent(),/Synthetic Branch/);
  }
 }finally{await f.context.close();}}console.log('DEVICE_TABLE_STABILITY '+JSON.stringify(evidence));
});
test('paired Cloud verification and primary MFA cancellation stop device actions before a mutation RPC',async()=>{
 const f=await fixture();try{await mock(f.page);await f.page.evaluate(()=>{currentView='settings';render();});await f.page.waitForFunction(()=>document.getElementById('devicePairBranch')?.options[0]?.value==='synthetic-branch');
 const result=await f.page.evaluate(async()=>{__deviceTest.role='ADMIN';__deviceTest.mfa=false;document.getElementById('devicePairName').value='Synthetic new device';await ZEZMS.deviceEnrollment.createPairing();__deviceTest.mode='PAIRED';__deviceTest.ready=false;await ZEZMS.deviceEnrollment.createPairing();return {mutations:__deviceTest.rpcs.filter(r=>/revoke|create_device_pairing/.test(r.name)).length,mfa:__deviceTest.mfaCalls};});assert.equal(result.mutations,0);assert.equal(result.mfa,1);
 }finally{await f.context.close();}
});

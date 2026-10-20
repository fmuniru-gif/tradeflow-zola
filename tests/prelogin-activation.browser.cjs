/* Run with PLAYWRIGHT_CORE_PATH or NODE_PATH pointing to playwright-core. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const playwright = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function embedded(name){
  const match=shell.match(new RegExp('const '+name+'="([^"]+)";'));
  assert.ok(match, name+' must exist in the production shell');
  return Buffer.from(match[1], 'base64').toString('utf8');
}
const baseline=embedded('VERIFIED_BASELINE_B64');
const phaseMarker=baseline.indexOf('window.ZEZMS.bootstrapPhaseA=Object.freeze');
assert.ok(phaseMarker>0);
const phaseSource=baseline.slice(baseline.lastIndexOf('(function () {',phaseMarker),baseline.indexOf('}());',phaseMarker)+5);
const staffMarker=baseline.indexOf('/* Embedded so Owner Recovery');
assert.ok(staffMarker>0);
let staffSource=baseline.slice(baseline.lastIndexOf('<script>',staffMarker)+8,baseline.indexOf('</script>',staffMarker));
function replaceOnce(source,needle,replacement){
  assert.equal(source.split(needle).length-1,1,'production staff patch marker must be unique');
  return source.replace(needle,replacement);
}
// Mirror the two staff-directory field patches applied by index.html to VERIFIED_BASELINE_B64.
staffSource=replaceOnce(staffSource,"    updatedAt:String(u.updatedAt||'')\n  };\n}\n\nfunction directoryPayload(){","    updatedAt:String(u.updatedAt||''),\n    lastLoginAt:String(u.lastLoginAt||'')\n  };\n}\n\nfunction directoryPayload(){");
staffSource=replaceOnce(staffSource,"      lastLoginAt:String(local.lastLoginAt||'')","      lastLoginAt:(function(){const localLogin=String(local.lastLoginAt||''),remoteLogin=String(remote.lastLoginAt||''),localTime=Date.parse(localLogin),remoteTime=Date.parse(remoteLogin);if(!Number.isFinite(remoteTime))return Number.isFinite(localTime)?localLogin:'';if(!Number.isFinite(localTime))return remoteLogin;return remoteTime>=localTime?remoteLogin:localLogin;}())");
const recoverySource=embedded('RECOVERY_STABILIZATION_R70G_B64');
const salt=Buffer.from('r70u-synthetic-salt');
const password='fixture-password';
const staff={id:'staff-1',name:'Fixture Staff',role:'CASHIER',active:true,passwordAlgorithm:'PBKDF2-SHA256',passwordIterations:210000,passwordSalt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64')};
const fixture = `<!doctype html><html><body>
<div id="loginScreen"><div id="sharedDeviceLoginPanel">
<select id="sharedLoginUser"><option value="">Local staff access needs recovery</option></select>
<input id="sharedLoginPassword" type="password"><button id="sharedLoginButton" type="button" onclick="ZEZMS.staffAuth.signInFromLogin()">Sign in to this shared device</button>
<div id="sharedLoginStatus">Local staff access needs recovery</div>
</div></div><div id="appShell" style="display:none"></div>
<script>
window.DB={marker:'empty',cashBalances:{},sales:[],sharedDeviceAuth:{users:[],audit:[],businessId:'business-1'}};
if(location.search.indexOf('missing-auth')>=0)delete DB.sharedDeviceAuth;
window.activationCalls=0;window.rpcCalls=0;window.directoryReads=0;window.persistCalls=0;window.saveCalls=0;window.outbox=[];
window.session={cashier:null,tel:null,role:null,adminMode:false,sig:null,isCashier2:false};window.cart=[];
window.priceAdjUnlocked=false;window.vatRateUnlocked=false;window.withholdingTaxRateUnlocked=false;
var deviceId='11111111-2222-4333-8444-555555555555';
var lifecycleId='camon-17p-verified-lifecycle';
var candidate={marker:'cloud-current',cashBalances:{Others:0},sales:[{id:'cloud-sale-1',total:17}],sharedDeviceDirectory:{businessId:'business-1',enabled:true,updatedAt:'2026-10-15T00:00:00Z',users:[${JSON.stringify(staff)}]},sharedDeviceAuth:{users:[],audit:[],businessId:'business-1'}};
if(location.search.indexOf('missing-auth')>=0)delete candidate.sharedDeviceAuth;
var fingerprint={deviceId:deviceId,operationalHash:'op-cloud-current',extendedHash:'ext-cloud-current',collections:{sales:'sales-cloud-current'},createdAt:'2026-10-01T00:00:00Z',appVersion:'3.31.17'};
var stage={version:1,build:'r70s-q1',deviceId:deviceId,lifecycleId:lifecycleId,cursor:42,candidate:candidate,fingerprint:fingerprint,attestedAt:'2026-10-15T00:00:00Z'};
var journal={version:2,deviceId:deviceId,lifecycleId:lifecycleId,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:42};
if(location.search!=='?missing')localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));
var state={deviceId:location.search.indexOf('wrong-device')>=0?'different':deviceId,deviceAccessMode:'PAIRED',businessId:'business-1',syncOwnerId:'owner-1',cursor:0,cloudHeadSeq:42};
var context={lifecycle_id:lifecycleId,device_id:deviceId,lifecycle_state:location.search.indexOf('verifying')>=0?'VERIFYING':'ACTIVE',business_id:'business-1',owner_id:'owner-1',branch_id:'branch-1'};
window.ZEZMS={
 syncIntegrity:{_test:{localAudit:function(){return {violations:[]};}}},
 convergence:{buildFingerprint:function(){return {deviceId:state.deviceId,operationalHash:'op-'+DB.marker,extendedHash:'ext-'+DB.marker,collections:{sales:'sales-'+DB.marker},createdAt:new Date().toISOString(),appVersion:'3.31.18'};}},
 cloudSync:{getState:function(){return state;},waitUntilReady:async function(){},getSession:function(){return {user:{id:'paired-user'}};},
  getClient:function(){return {rpc:async function(name,args){if(name!=='zezms_m5a4_device_context'||JSON.stringify(args.p_allowed_states)!=='["ACTIVE"]')throw Error('unexpected cloud RPC');window.rpcCalls++;return {data:context,error:null};}};},
  commitM5a4BootstrapCandidate:function(){},getOutbox:function(){return window.outbox;},
  activateVerifiedBootstrapR70M:async function(ready,proof){window.activationCalls++;if(proof.context.lifecycle_state!=='ACTIVE'||window.outbox.length)throw Error('approval or queue guard failed');window.DB=JSON.parse(JSON.stringify(ready));state.cursor=proof.cursor;state.cloudHeadSeq=proof.cursor;},
  fetchSharedDeviceDirectoryControlRoot:async function(){window.directoryReads++;return JSON.parse(JSON.stringify(candidate.sharedDeviceDirectory));},
  repairActiveDeviceControlPlane:function(){return state;},persistLocalControlPlane:function(){window.persistCalls++;}}
};
window.viewSettings=function(){return '';};window.render=function(){};window.toast=function(){};
window.saveDB=function(){window.saveCalls++;};window.updateUserBadge=function(){};window.applyRoleUI=function(){};
window.updatePeriodUI=function(){};window.audit=function(){};window.nav=function(){};
</script>
<script src="/embedded/phase-a.js"></script>
<script src="/embedded/staff-auth.js"></script>
<script src="/embedded/recovery-r70g.js"></script>
<script src="/js/managed-device-lifecycle-r61.js"></script>
<script src="/js/prelogin-verified-activation-r70u.js"></script>
</body></html>`;

const server = http.createServer((request,response)=>{
  const pathname = new URL(request.url,'http://localhost').pathname;
  if(pathname.startsWith('/full/')){
    const file=path.resolve(root,pathname.slice('/full/'.length));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
    const type=file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream';
    response.writeHead(200,{'content-type':type+'; charset=utf-8'});response.end(fs.readFileSync(file));return;
  }
  if(pathname==='/'){response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(fixture);return;}
  const embeddedScripts={'/embedded/phase-a.js':phaseSource,'/embedded/staff-auth.js':staffSource,'/embedded/recovery-r70g.js':recoverySource};
  if(embeddedScripts[pathname]){response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});response.end(embeddedScripts[pathname]);return;}
  if(pathname==='/js/managed-device-lifecycle-r61.js'||pathname==='/js/prelogin-verified-activation-r70u.js'){
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(fs.readFileSync(path.join(root,pathname.slice(1))));return;
  }
  response.writeHead(404);response.end();
});
let browser;
async function pageFor(query=''){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+query);
  return page;
}
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});

test('older verified bootstrap activates, imports real staff auth, and accepts existing password',async()=>{
  const page=await pageFor();
  try{
    await assert.equal(await page.locator('#sharedLoginUser').inputValue(),'');
    await page.getByRole('button',{name:'Complete verified activation'}).waitFor();
    await page.getByRole('button',{name:'Complete verified activation'}).click();
    await page.locator('#sharedLoginUser option[value="staff-1"]').waitFor({state:'attached'});
    const result=await page.evaluate(()=>({activationCalls,rpcCalls,marker:DB.marker,sales:DB.sales,stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1'),journal:localStorage.getItem('zezms_m5a4_safe_bootstrap_journal_v2'),staffReady:document.documentElement.getAttribute('data-zezms-shared-device-auth'),users:DB.sharedDeviceAuth.users.map(u=>({id:u.id,role:u.role,hash:u.passwordHash})),deviceId:state.deviceId,cursor:state.cursor,cloudHead:state.cloudHeadSeq,outbox:window.outbox,directoryReads,persistCalls}));
    assert.deepEqual(result,{activationCalls:1,rpcCalls:1,marker:'cloud-current',sales:[{id:'cloud-sale-1',total:17}],stage:null,journal:null,staffReady:'ready',users:[{id:'staff-1',role:'CASHIER',hash:staff.passwordHash}],deviceId:'11111111-2222-4333-8444-555555555555',cursor:42,cloudHead:42,outbox:[],directoryReads:0,persistCalls:0});
    await page.locator('#sharedLoginUser').selectOption('staff-1');
    await page.locator('#sharedLoginPassword').fill(password);
    await page.locator('#sharedLoginButton').click();
    await page.waitForFunction(()=>session.sharedUserId==='staff-1');
    assert.equal(await page.locator('#appShell').evaluate(element=>element.style.display),'flex');
    assert.equal(await page.evaluate(()=>JSON.stringify(DB.sales)),JSON.stringify([{id:'cloud-sale-1',total:17}]));
    assert.deepEqual(await page.evaluate(()=>({deviceId:state.deviceId,cursor:state.cursor,outbox:window.outbox,staffCount:DB.sharedDeviceAuth.users.length})),{deviceId:'11111111-2222-4333-8444-555555555555',cursor:42,outbox:[],staffCount:1});
    assert.equal(await page.locator('#r70uCompleteVerifiedActivation').count(),0);
  }finally{await page.close();}
});

test('missing local auth uses genuine r70G pre-login recovery after activation without business writes',async()=>{
  const page=await pageFor('?missing-auth');
  try{
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-shared-device-auth')==='failed');
    await page.getByRole('button',{name:'Complete verified activation'}).waitFor();
    await page.getByRole('button',{name:'Complete verified activation'}).click();
    await page.waitForFunction(()=>activationCalls===1&&localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1')===null);
    assert.equal(await page.evaluate(()=>DB.sharedDeviceAuth===undefined),true);
    await page.locator('#r70gRecoverLocalStaffAccess').waitFor();
    await page.locator('#r70gRecoverLocalStaffAccess').click();
    await page.locator('#sharedLoginUser option[value="staff-1"]').waitFor({state:'attached'});
    const result=await page.evaluate(()=>({activationCalls,rpcCalls,directoryReads,persistCalls,marker:DB.marker,sales:DB.sales,users:DB.sharedDeviceAuth.users.map(u=>({id:u.id,role:u.role,hash:u.passwordHash})),deviceId:state.deviceId,cursor:state.cursor,cloudHead:state.cloudHeadSeq,outbox:window.outbox}));
    assert.deepEqual(result,{activationCalls:1,rpcCalls:2,directoryReads:1,persistCalls:1,marker:'cloud-current',sales:[{id:'cloud-sale-1',total:17}],users:[{id:'staff-1',role:'CASHIER',hash:staff.passwordHash}],deviceId:'11111111-2222-4333-8444-555555555555',cursor:42,cloudHead:42,outbox:[]});
    await page.locator('#sharedLoginUser').selectOption('staff-1');
    await page.locator('#sharedLoginPassword').fill(password);
    await page.locator('#sharedLoginButton').click();
    await page.waitForFunction(()=>session.sharedUserId==='staff-1');
    assert.equal(await page.locator('#appShell').evaluate(element=>element.style.display),'flex');
  }finally{await page.close();}
});

test('missing or mismatched staged identity never exposes the control',async()=>{
  for(const query of ['?missing','?wrong-device']){
    const page=await pageFor(query);
    try{await page.waitForTimeout(900);assert.equal(await page.locator('#r70uCompleteVerifiedActivation').count(),0);assert.equal(await page.evaluate(()=>activationCalls),0);}
    finally{await page.close();}
  }
});

test('VERIFYING lifecycle keeps stage and login blocked after click',async()=>{
  const page=await pageFor('?verifying');
  try{
    await page.getByRole('button',{name:'Complete verified activation'}).waitFor();
    await page.getByRole('button',{name:'Complete verified activation'}).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>activationCalls),0);
    assert.equal(await page.evaluate(()=>!!localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1')),true);
    assert.equal(await page.locator('#sharedLoginUser option[value="staff-1"]').count(),0);
  }finally{await page.close();}
});

test('complete production shell renders with the pre-login module and no stage control',async()=>{
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage();
  try{
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/full/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.19-prebranch-functional',null,{timeout:12000});
    await page.locator('script[data-zezms-prelogin-verified-activation-r70u]').waitFor({state:'attached'});
    assert.equal(await page.locator('script[data-zezms-prelogin-verified-activation-r70u]').count(),1);
    assert.equal(await page.locator('#r70uCompleteVerifiedActivation').count(),0);
  }finally{await page.close();}
});

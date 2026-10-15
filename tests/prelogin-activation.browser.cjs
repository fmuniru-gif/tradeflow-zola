/* Run with PLAYWRIGHT_CORE_PATH or NODE_PATH pointing to playwright-core. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const fixture = `<!doctype html><html><body>
<div id="loginScreen"><div id="sharedDeviceLoginPanel">
<select id="sharedLoginUser"><option value="">Local staff access needs recovery</option></select>
<div id="sharedLoginStatus">Local staff access needs recovery</div>
</div></div><div id="appShell" style="display:none"></div>
<script>
window.DB={marker:'empty',cashBalances:{},sharedDeviceAuth:{users:[],audit:[]}};
window.activationCalls=0;window.rpcCalls=0;
var deviceId='11111111-2222-4333-8444-555555555555';
var lifecycleId='camon-17p-verified-lifecycle';
var candidate={marker:'cloud-current',cashBalances:{Others:0},sharedDeviceDirectory:{users:[{id:'staff-1',name:'Staff',active:true,passwordHash:'hash'}]},sharedDeviceAuth:{users:[],audit:[]}};
var fingerprint={deviceId:deviceId,operationalHash:'op-cloud-current',extendedHash:'ext-cloud-current',collections:{sales:'sales-cloud-current'},createdAt:'2026-10-01T00:00:00Z',appVersion:'3.31.17'};
var stage={version:1,deviceId:deviceId,lifecycleId:lifecycleId,cursor:42,candidate:candidate,fingerprint:fingerprint,attestedAt:'2026-10-15T00:00:00Z'};
var journal={version:2,deviceId:deviceId,lifecycleId:lifecycleId,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',replayCursor:42};
if(location.search.indexOf('missing')<0)localStorage.setItem('zezms_m5a4_safe_bootstrap_stage_v1',JSON.stringify(stage));
localStorage.setItem('zezms_m5a4_safe_bootstrap_journal_v2',JSON.stringify(journal));
var state={deviceId:location.search.indexOf('wrong-device')>=0?'different':deviceId,deviceAccessMode:'PAIRED',businessId:'business-1',syncOwnerId:'owner-1'};
var context={lifecycle_id:lifecycleId,device_id:deviceId,lifecycle_state:location.search.indexOf('verifying')>=0?'VERIFYING':'ACTIVE',business_id:'business-1',owner_id:'owner-1'};
window.ZEZMS={
 bootstrapPhaseA:{inspect:function(){var raw=localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1');if(raw===null)return {status:'ABSENT'};try{var s=JSON.parse(raw);return s.version===1&&s.candidate&&Number.isSafeInteger(s.cursor)?{status:'PRESENT',stage:s}:{status:'MALFORMED'};}catch(_){return {status:'MALFORMED'};}}},
 syncIntegrity:{_test:{localAudit:function(){return {violations:[]};}}},
 convergence:{buildFingerprint:function(){return {deviceId:state.deviceId,operationalHash:'op-'+DB.marker,extendedHash:'ext-'+DB.marker,collections:{sales:'sales-'+DB.marker},createdAt:new Date().toISOString(),appVersion:'3.31.18'};}},
 cloudSync:{getState:function(){return state;},waitUntilReady:async function(){},getSession:function(){return {user:{id:'paired-user'}};},
  getClient:function(){return {rpc:async function(){window.rpcCalls++;return {data:context,error:null};}};},
  commitM5a4BootstrapCandidate:function(){},getOutbox:function(){return [];},
  activateVerifiedBootstrapR70M:async function(ready,proof){window.activationCalls++;if(proof.context.lifecycle_state!=='ACTIVE')throw Error('approval required');window.DB=JSON.parse(JSON.stringify(ready));}},
 recoveryStabilization:{showRecoveryButton:function(){}}
};
window.viewSettings=function(){return '';};window.render=function(){};window.toast=function(){};
window.addEventListener('zezms-shared-device-directory-updated',function(){
 var users=DB.sharedDeviceDirectory&&DB.sharedDeviceDirectory.users||[];
 var select=document.getElementById('sharedLoginUser');
 select.innerHTML='<option value="">Select staff member</option>'+users.map(function(u){return '<option value="'+u.id+'">'+u.name+'</option>';}).join('');
});
</script>
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

test('blocked staff login offers verified activation and then exposes cloud staff',async()=>{
  const page=await pageFor();
  try{
    await assert.equal(await page.locator('#sharedLoginUser').inputValue(),'');
    await page.getByRole('button',{name:'Complete verified activation'}).waitFor();
    await page.getByRole('button',{name:'Complete verified activation'}).click();
    await page.locator('#sharedLoginUser option[value="staff-1"]').waitFor({state:'attached'});
    const result=await page.evaluate(()=>({activationCalls,rpcCalls,marker:DB.marker,stage:localStorage.getItem('zezms_m5a4_safe_bootstrap_stage_v1')}));
    assert.deepEqual(result,{activationCalls:1,rpcCalls:1,marker:'cloud-current',stage:null});
    assert.equal(await page.locator('#r70uCompleteVerifiedActivation').count(),0);
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
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-zezms-release')==='v3.31.18-r70u',null,{timeout:12000});
    await page.locator('script[data-zezms-prelogin-verified-activation-r70u]').waitFor({state:'attached'});
    assert.equal(await page.locator('script[data-zezms-prelogin-verified-activation-r70u]').count(),1);
    assert.equal(await page.locator('#r70uCompleteVerifiedActivation').count(),0);
  }finally{await page.close();}
});

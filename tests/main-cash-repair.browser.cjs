const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const core=require('../diagnostics/main-cash-repair/repair-core.js');
const {decrypt}=require('../tools/main-cash-repair/verify-backup.cjs');
const root=path.resolve(__dirname,'..');
const origin='https://fmuniru-gif.github.io';
const project='https://ruadyqcsutfprrxdaahi.supabase.co';
let browser;
after(async()=>{if(browser)await browser.close();});
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const [personal,cash100,cash70]=core.CASH;
  const cashLog=[
    {id:personal.id,cashType:'Others',action:'Deduct',amount:70,at:'2026-10-15T11:28:34.639Z',status:'ACTIVE'},
    {id:cash100.id,cashType:'Cash in Hand',action:'Deduct',amount:100,at:'2026-10-15T11:30:05.658Z',status:'ACTIVE',meta:{expenseId:core.EXPENSE}},
    {id:cash70.id,cashType:'Cash in Hand',action:'Deduct',amount:70,at:'2026-10-15T11:30:41.508Z',status:'ACTIVE'}];
  const expense={id:core.EXPENSE,amount:100,wallet:'Cash in Hand',cashLogId:cash100.id,
    date:'2026-10-15T00:00:00.000Z',description:'Synthetic',status:'ACTIVE'};
  const baseline={cashBalances:{'Cash in Hand':1000,Others:500,MOMO:200},cashLog:[],expenses:[]};
  const operations=cashLog.map((row,i)=>{
    const patches=[{action:'insert',collection:'cashLog',key:row.id,value:copy(row)}];
    if(i===1)patches.push({action:'insert',collection:'expenses',key:core.EXPENSE,value:copy(expense)});
    patches.push({action:'root-object',root:'cashBalances',key:row.cashType,mode:'delta',value:-row.amount,before:0});
    const payload={opId:'synthetic-operation-'+i,protocolVersion:'M4/2',patches};
    payload.payloadHash=core.operationHash(payload);
    return {seq:i+1,op_id:payload.opId,device_id:'shop-synthetic',kind:i===1?'EXPENSE':'DATABASE_CHANGE',payload};
  });
  const state={deviceId:core.MAIN,deviceAccessMode:'OWNER',initialized:true,cursor:3,syncOwnerId:'owner-1',
    supabaseUrl:project,publishableKey:'sb_publishable_synthetic_for_tests'};
  const raw={tradeflow_v321_zola:JSON.stringify(baseline),zezms_cloud_sync_m4_state:JSON.stringify(state),
    zezms_cloud_sync_m4_queue:'[]',zezms_cloud_sync_m4_failed_v2:'[]',zezms_cloud_sync_m4_rejected:'[]',
    zezms_cloud_sync_m4_applied_v2:JSON.stringify(Object.fromEntries(operations.map(o=>[o.op_id,o.seq])))};
  const master={owner_id:'owner-1',payload:baseline,revision:1,operation_cursor:0,sync_mode:'operations',
    updated_at:'2026-10-15T12:00:00Z',updated_by:'owner-1'};
  return {raw,operations,master};
}
async function setup(options={}){
  if(!browser)browser=await playwright.chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext({acceptDownloads:true});
  const tab=await context.newPage();
  const f=fixture(),requests=[];
  if(options.wrongDevice){const state=JSON.parse(f.raw.zezms_cloud_sync_m4_state);
    state.deviceId='shop-synthetic';f.raw.zezms_cloud_sync_m4_state=JSON.stringify(state);}
  if(options.alreadyDeducted){const db=JSON.parse(f.raw.tradeflow_v321_zola);
    db.cashBalances['Cash in Hand']=830;db.cashBalances.Others=430;
    f.raw.tradeflow_v321_zola=JSON.stringify(db);}
  await tab.addInitScript(({raw,origin,pickerFailure})=>{
    if(location.origin!==origin)return;
    if(!sessionStorage.getItem('synthetic-seeded')){
      for(const [key,value] of Object.entries(raw))localStorage.setItem(key,value);
      localStorage.setItem('zezms-m3-supabase-auth',JSON.stringify({access_token:'synthetic-owner-token',
        expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'owner-1',is_anonymous:false}}));
      sessionStorage.setItem('synthetic-seeded','1');
    }
    window.__confirmationCount=0;
    window.confirm=()=>{window.__confirmationCount++;return true;};
    window.showSaveFilePicker=async()=>{
      if(pickerFailure)throw Error('Synthetic disk failure');
      let saved='';window.__savedBackup=()=>saved;
      return {createWritable:async()=>({write:async text=>{saved=text;},close:async()=>{}}),
        getFile:async()=>({text:async()=>saved})};
    };
  },{raw:f.raw,origin,pickerFailure:!!options.pickerFailure});
  await tab.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){
      const name=url.pathname.endsWith('/')?'diagnostics/main-cash-repair/index.html':
        url.pathname.replace(/^\/tradeflow-zola\//,'');
      const file=path.join(root,name);
      if(!fs.existsSync(file)){await route.fulfill({status:404,body:'Missing synthetic route'});return;}
      const type=name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html';
      await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});return;
    }
    if(url.origin===project){
      requests.push({method:route.request().method(),pathname:url.pathname});
      if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,
        headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, OPTIONS',
          'access-control-allow-headers':'apikey,authorization,accept'}});return;}
      let result;
      if(url.pathname==='/auth/v1/user')result={id:'owner-1',is_anonymous:false,app_metadata:{provider:'email'}};
      else if(url.pathname==='/rest/v1/zezms_sync_state')result=[f.master];
      else if(url.pathname==='/rest/v1/zezms_sync_operations'){
        if(url.searchParams.get('select')==='seq')result=[{seq:options.headDrift?4:3}];
        else result=f.operations.filter(o=>o.seq>Number((url.searchParams.get('seq')||'gt.0').slice(3)));
      }else{await route.fulfill({status:404,body:'Unknown cloud read'});return;}
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'access-control-allow-origin':origin},body:JSON.stringify(result)});return;
    }
    requests.push({method:route.request().method(),pathname:url.pathname});
    await route.abort();
  });
  await tab.goto(origin+'/tradeflow-zola/diagnostics/main-cash-repair/');
  await tab.waitForFunction(()=>!document.getElementById('status').textContent.includes('Running read-only'));
  return {tab,context,f,requests};
}
test('real projection module and Main-only screen repair four records with verified backup and no cloud write',async()=>{
  const {tab,context,f,requests}=await setup();
  try{
    assert.match(await tab.locator('#status').textContent(),/Read-only preflight passed/);
    assert.equal(await tab.locator('#repair').isDisabled(),true);
    await tab.locator('#passphrase').fill('synthetic-long-backup-passphrase');
    await tab.locator('#backup').click();
    await tab.waitForFunction(()=>document.getElementById('status').textContent.includes('backup saved'));
    assert.equal(await tab.locator('#repair').isEnabled(),true);
    await tab.locator('#repair').click();
    await tab.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PASS:'));
    const result=await tab.evaluate(()=>({db:JSON.parse(localStorage.getItem('tradeflow_v321_zola')),
      queue:localStorage.getItem('zezms_cloud_sync_m4_queue'),
      confirmationCount:window.__confirmationCount,backup:window.__savedBackup()}));
    assert.equal(result.db.cashLog.length,3);
    assert.equal(result.db.expenses.length,1);
    assert.equal(result.db.cashBalances['Cash in Hand'],830);
    assert.equal(result.db.cashBalances.Others,430);
    assert.equal(result.db.syncReconciliationLog.length,1);
    assert.equal(result.queue,f.raw.zezms_cloud_sync_m4_queue);
    assert.equal(result.confirmationCount,1);
    assert.equal(result.backup.includes('synthetic-long-backup-passphrase'),false);
    assert.equal(decrypt(result.backup,'synthetic-long-backup-passphrase').raw.tradeflow_v321_zola,
      f.raw.tradeflow_v321_zola);
    assert.ok(requests.every(x=>['GET','OPTIONS'].includes(x.method)));
    await tab.reload();
    await tab.waitForFunction(()=>!document.getElementById('status').textContent.includes('Running read-only'));
    assert.match(await tab.locator('#status').textContent(),/Already repaired/);
  }finally{await context.close();}
});
test('failed backup and concurrent Main change preserve the original database',async()=>{
  const failed=await setup({pickerFailure:true});
  try{
    await failed.tab.locator('#passphrase').fill('synthetic-long-backup-passphrase');
    await failed.tab.locator('#backup').click();
    await failed.tab.waitForFunction(()=>document.getElementById('status').textContent.includes('Synthetic disk failure'));
    assert.equal(await failed.tab.locator('#repair').isDisabled(),true);
    assert.equal(await failed.tab.evaluate(()=>localStorage.getItem('tradeflow_v321_zola')),
      failed.f.raw.tradeflow_v321_zola);
  }finally{await failed.context.close();}
  const concurrent=await setup();
  try{
    await concurrent.tab.locator('#passphrase').fill('synthetic-long-backup-passphrase');
    await concurrent.tab.locator('#backup').click();
    await concurrent.tab.waitForFunction(()=>document.getElementById('status').textContent.includes('backup saved'));
    await concurrent.tab.evaluate(()=>localStorage.setItem('zezms_cloud_sync_m4_queue','[{"opId":"other"}]'));
    await concurrent.tab.locator('#repair').click();
    await concurrent.tab.waitForFunction(()=>document.getElementById('status').textContent.startsWith('NO_CHANGE:'));
    assert.equal(await concurrent.tab.evaluate(()=>localStorage.getItem('tradeflow_v321_zola')),
      concurrent.f.raw.tradeflow_v321_zola);
  }finally{await concurrent.context.close();}
});
test('wrong device and cloud head drift stop before backup or local changes',async()=>{
  for(const options of [{wrongDevice:true},{headDrift:true}]){
    const {tab,context,f,requests}=await setup(options);
    try{
      assert.match(await tab.locator('#status').textContent(),/STOP_/);
      assert.equal(await tab.locator('#backup').isDisabled(),true);
      assert.equal(await tab.locator('#repair').isDisabled(),true);
      assert.equal(await tab.evaluate(()=>localStorage.getItem('tradeflow_v321_zola')),f.raw.tradeflow_v321_zola);
      assert.ok(requests.every(x=>['GET','OPTIONS'].includes(x.method)));
    }finally{await context.close();}
  }
});

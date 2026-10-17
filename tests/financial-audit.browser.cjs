const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const {decryptEvidence,contents,analyze}=require('../tools/financial-audit/analyze.cjs');
const root=path.resolve(__dirname,'../diagnostics/financial-audit');
const server=http.createServer((request,response)=>{
  const name=new URL(request.url,'http://localhost').pathname.replace(/^\//,'')||'index.html';
  if(!['index.html','capture.js','style.css'].includes(name)){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
  response.end(fs.readFileSync(path.join(root,name)));
});
let browser;
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));});
async function page(){
  if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(!browser)browser=await playwright.chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const tab=await browser.newPage({acceptDownloads:true});
  const external=[];
  tab.on('request',request=>{if(new URL(request.url()).hostname!=='127.0.0.1')external.push(request.url());});
  await tab.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await tab.goto('http://127.0.0.1:'+server.address().port+'/');
  return {tab,external};
}
function fixture(id,balance){return {
  tradeflow_v321_zola:JSON.stringify({cashBalances:{MOMO:balance},cashLog:[{id:'CB-1',cashType:'MOMO',action:'Add',amount:balance,before:0,after:balance}]}),
  zezms_cloud_sync_m4_state:JSON.stringify({deviceId:id,cursor:42,liveSyncEnabled:true}),
  zezms_cloud_sync_m4_queue:'[]',zezms_cloud_sync_m4_failed_v2:'[]',
  zezms_cloud_sync_m4_rejected:'[]',zezms_cloud_sync_m4_applied_v2:'{}'
};}
async function capture(tab,data){
  await tab.evaluate(raw=>{for(const [key,value] of Object.entries(raw))localStorage.setItem(key,value);},data);
  const before=await tab.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  await tab.locator('#passphrase').fill('synthetic-passphrase-long-enough');
  const download=tab.waitForEvent('download');
  await tab.locator('#capture').click();
  const saved=await download;
  const envelope=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
  const after=await tab.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  assert.deepEqual(after,before,'collector changed origin storage');
  assert.equal(await tab.locator('#passphrase').inputValue(),'');
  return envelope;
}
test('standalone financial evidence capture encrypts exact raw state without writes or cloud calls',async()=>{
  const {tab,external}=await page();
  try{
    const envelope=await capture(tab,fixture('synthetic-main',100));
    assert.equal(external.length,0);
    assert.equal(JSON.stringify(envelope).includes('CB-1'),false,'plaintext transaction leaked');
    const payload=decryptEvidence(envelope,'synthetic-passphrase-long-enough');
    const device=contents(payload,'Main');
    assert.equal(device.db.cashBalances.MOMO,100);
    assert.equal(device.state.deviceId,'synthetic-main');
    assert.throws(()=>decryptEvidence(envelope,'wrong-passphrase'));
  }finally{await tab.close();}
});
test('offline comparison reports exact wallet discrepancy and uncertain transaction loss',()=>{
  const make=(label,id,balance)=>contents({origin:'https://example.invalid',capturedAt:'2026-10-17T00:00:00Z',
    raw:fixture(id,balance)},label);
  const result=analyze([make('Main','main',100),make('Shop','shop',90),make('Camon 50 Pro','camon50',100)]);
  assert.equal(result.perWallet[0].maxMinusMin,10);
  assert.equal(result.perWallet[0].cloudStatus,'NOT_VERIFIED');
  assert.equal(result.perWallet[0].transactionLoss,'UNDETERMINED_WITHOUT_ORDERED_CLOUD_EVIDENCE');
});
test('missing wallet is reported as unknown rather than a zero balance',()=>{
  const make=(label,id,balance)=>contents({origin:'https://example.invalid',capturedAt:'2026-10-17T00:00:00Z',
    raw:fixture(id,balance)},label);
  const devices=[make('Main','main',100),make('Shop','shop',90),make('Camon 50 Pro','camon50',100)];
  delete devices[1].db.cashBalances.MOMO;
  const wallet=analyze(devices).perWallet[0];
  assert.equal(wallet.local.Shop,null);
  assert.equal(wallet.maxMinusMin,null);
});
test('collector refuses missing database without producing evidence or changing storage',async()=>{
  const {tab,external}=await page();
  try{
    const before=await tab.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
    let downloads=0;tab.on('download',()=>downloads++);
    await tab.locator('#passphrase').fill('synthetic-passphrase-long-enough');
    await tab.locator('#capture').click();
    assert.match(await tab.locator('#status').textContent(),/^STOP:/);
    assert.equal(downloads,0);
    assert.deepEqual(await tab.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))),before);
    assert.deepEqual(external,[]);
  }finally{await tab.close();}
});
test('encrypted capture handles a mobile-sized local database without truncation',async()=>{
  const {tab,external}=await page();
  try{
    const data=fixture('synthetic-large',1);
    const db=JSON.parse(data.tradeflow_v321_zola);
    db.cashLog[0].note='x'.repeat(900000);
    data.tradeflow_v321_zola=JSON.stringify(db);
    const envelope=await capture(tab,data);
    const recovered=contents(decryptEvidence(envelope,'synthetic-passphrase-long-enough'),'Main');
    assert.equal(recovered.db.cashLog[0].note.length,900000);
    assert.deepEqual(external,[]);
  }finally{await tab.close();}
});

'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const delivery = require('../tools/build-pr11-delivery.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const root = path.resolve(__dirname, '..');
const stageKey = 'zezms_m5a4_safe_bootstrap_stage_v1';
const databaseKey = 'tradeflow_v321_zola';
const journalKey = 'zezms_m5a4_safe_bootstrap_journal_v2';
const app = delivery.assembledShell(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
const hookPoint = 'var r70mPublicSync = window.ZEZMS && ZEZMS.cloudSync;';
assert.equal(app.split(hookPoint).length, 2);
const shell = app.replace(hookPoint, `
  window.prepareOfflineActivationFixture = function (context) {
    state = Object.assign({},state,{
      deviceId:context.device_id, deviceAccessMode:'PAIRED', deviceAccessStatus:'VERIFYING',
      businessId:context.business_id, syncOwnerId:context.owner_id, branchId:context.branch_id,
      initialized:false, liveSyncEnabled:false, liveSyncDesired:null, cursor:0, cloudHeadSeq:0
    });
    queue=[]; failedOperations=[]; appliedOperations={};
    persistState(); persistQueue();
    const sync=ZEZMS.cloudSync;
    sync.getSession=()=>({user:{id:'SYNTHETIC-PHONE-USER',is_anonymous:true}});
    sync.getClient=()=>({rpc:async (name,args)=>{
      if (name!=='zezms_m5a4_device_context' || args.p_device_id!==context.device_id || args.p_allowed_states.join()!=='ACTIVE') {
        throw Error('Unexpected synthetic Cloud request');
      }
      return {data:{...context,lifecycle_state:window.fixtureApproval},error:null};
    }});
    activateM5a4Live=async function () {
      window.fixtureLiveCalls++;
      if (state.cursor!==5000 || !state.initialized || queue.length || failedOperations.length) throw Error('Invalid committed state');
      if (window.fixtureLiveHold) await window.fixtureLiveHold;
      if (window.fixtureLiveFailure) throw Error('Synthetic sync interruption.');
      setState({liveSyncEnabled:true,liveSyncDesired:true,status:'live'},false);
    };
  };
` + hookPoint);

let browser;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/fixture.html') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.end(shell);
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404);
    return response.end();
  }
  response.setHeader('Content-Type', pathname.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

after(async () => {
  if (browser) await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
});

async function setupPage(page) {
  await page.goto('http://127.0.0.1:' + server.address().port + '/fixture.html');
  await page.waitForFunction(() => window.ZEZMS?.managedDevices && window.prepareOfflineActivationFixture);
  await page.evaluate(async () => {
    await ZEZMS.cloudSync.waitUntilReady(10000);
    window.fixtureLiveCalls=0;
    window.fixtureApproval='ACTIVE';
    prepareOfflineActivationFixture({
      device_id:'SYNTHETIC-IPHONE', lifecycle_id:'SYNTHETIC-LIFECYCLE',
      owner_id:'SYNTHETIC-OWNER', business_id:'SYNTHETIC-BUSINESS', branch_id:'SYNTHETIC-BRANCH'
    });
    ZEZMS.preloginVerifiedActivation.refresh();
  });
}

async function fixture() {
  if (!server.listening) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (!browser) browser = await chromium.launch({ executablePath:process.env.CHROME_PATH, headless:true });
  const context = await browser.newContext({ serviceWorkers:'block' });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function (key,value) {
      if (this===localStorage) {
        let size=String(key).length+String(value).length;
        for (let i=0;i<this.length;i++) {
          const other=this.key(i);
          if (other!==String(key)) size+=other.length+this.getItem(other).length;
        }
        if (size>2621440) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return original.call(this,key,value);
    };
  });
  const page = await context.newPage();
  await setupPage(page);
  const seed = await page.evaluate(({stageKey,databaseKey,journalKey}) => {
    const before=localStorage.getItem(databaseKey);
    const candidate=JSON.parse(JSON.stringify(DB));
    candidate.activationFixture='x'.repeat(2160000);
    const real=DB;
    DB=candidate;
    const fingerprint=ZEZMS.convergence.buildFingerprint();
    DB=real;
    const stage={version:1,deviceId:'SYNTHETIC-IPHONE',lifecycleId:'SYNTHETIC-LIFECYCLE',
      cursor:5000,candidate,fingerprint,attestedAt:new Date().toISOString()};
    localStorage.setItem(stageKey,JSON.stringify(stage));
    localStorage.setItem(journalKey,JSON.stringify({version:2,stage:'VERIFYING',lastVerifiedStage:'VERIFYING',
      deviceId:stage.deviceId,lifecycleId:stage.lifecycleId,replayCursor:stage.cursor}));
    let duplicateError;
    try { localStorage.setItem(databaseKey,JSON.stringify(candidate)); }
    catch (error) { duplicateError=error.name; }
    ZEZMS.preloginVerifiedActivation.refresh();
    return {duplicateError,unchanged:before===localStorage.getItem(databaseKey)};
  }, {stageKey,databaseKey,journalKey});
  assert.deepEqual(seed, {duplicateError:'QuotaExceededError',unchanged:true});
  await page.locator('#r70uCompleteVerifiedActivation').waitFor();
  return {context,page};
}

test('iPhone-sized candidate activates from the login page with the real bootstrap commit under a Safari-sized quota', async () => {
  const { context, page } = await fixture();
  try {
    await page.locator('#r70uCompleteVerifiedActivation').click();
    await page.waitForFunction(key => localStorage.getItem(key)===null, stageKey);
    assert.deepEqual(await page.evaluate(({databaseKey,journalKey}) => ({
      live:ZEZMS.cloudSync.getState().liveSyncEnabled, cursor:ZEZMS.cloudSync.getState().cursor,
      stored:JSON.parse(localStorage.getItem(databaseKey)).activationFixture.length,
      outbox:ZEZMS.cloudSync.getOutbox().length, journal:localStorage.getItem(journalKey), liveCalls:fixtureLiveCalls
    }), {databaseKey,journalKey}), {live:true,cursor:5000,stored:2160000,outbox:0,journal:null,liveCalls:1});
  } finally { await context.close(); }
});

test('approval and archive failure preserve the original stage, while a failed sync permits reload and retry', async () => {
  const { context, page } = await fixture();
  try {
    await page.evaluate(() => { window.fixtureApproval='VERIFYING'; });
    await assert.rejects(page.evaluate(() => ZEZMS.managedDevices.finish()), /not been activated/);
    await page.evaluate(() => {
      window.fixtureApproval='ACTIVE';
      window.fixtureOpen=indexedDB.open;
      indexedDB.open=()=>{ throw Error('Synthetic IndexedDB failure.'); };
    });
    await assert.rejects(page.evaluate(() => ZEZMS.managedDevices.finish()), /Synthetic IndexedDB failure/);
    assert.ok(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).candidate.activationFixture.length===2160000, stageKey));
    await page.evaluate(() => { indexedDB.open=window.fixtureOpen; window.fixtureLiveFailure=true; });
    await assert.rejects(page.evaluate(() => ZEZMS.managedDevices.finish()), /Synthetic sync interruption/);
    assert.deepEqual(await page.evaluate(({stageKey,databaseKey}) => ({
      reference:!!JSON.parse(localStorage.getItem(stageKey)).activationArchive,
      lock:ZEZMS.bootstrapPhaseA.pending(), live:ZEZMS.cloudSync.getState().liveSyncEnabled,
      noCommit:typeof JSON.parse(localStorage.getItem(databaseKey)).activationFixture==='undefined'
    }), {stageKey,databaseKey}), {reference:true,lock:true,live:false,noCommit:true});
    await setupPage(page);
    await page.locator('#r70uCompleteVerifiedActivation').waitFor();
    assert.equal(await page.evaluate(() => ZEZMS.managedDevices.getStage().candidate.activationFixture.length),2160000);
    await page.locator('#r70uCompleteVerifiedActivation').click();
    await page.waitForFunction(key => localStorage.getItem(key)===null, stageKey);
  } finally { await context.close(); }
});

test('two tabs cannot activate the same staged device concurrently', async () => {
  const { context, page } = await fixture();
  try {
    const second = await context.newPage();
    await setupPage(second);
    await page.evaluate(() => { window.fixtureLiveHold=new Promise(resolve => {window.releaseFixture=resolve;}); });
    await page.locator('#r70uCompleteVerifiedActivation').click();
    await page.waitForFunction(() => fixtureLiveCalls===1);
    await assert.rejects(second.evaluate(() => ZEZMS.managedDevices.finish()), /another TradeFlow tab/);
    await page.evaluate(() => window.releaseFixture());
    await page.waitForFunction(key => localStorage.getItem(key)===null, stageKey);
    assert.equal(await second.evaluate(() => fixtureLiveCalls),0);
  } finally { await context.close(); }
});

'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runFixture}=require('./remaining-tabs-performance.browser.cjs'),probe=require('./table-page-fixture.cjs');
const samples=Number(process.env.BENCH_SAMPLES||(process.env.NODE_TEST_CONTEXT?1:7));
runFixture(async({page,cdp,metrics,profile,profileName,browser,baseline,blocked})=>{
  await probe.installProbe(page);
  const original=await page.evaluate(()=>({db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}));
  const result={baseline:baseline||'candidate',profile:profileName,cpuRate:profile.cpu,browser:browser.version(),samples,measurements:{},functional:null};
  for(let round=0;round<=samples;round++)for(const route of ['receipts','products','stock','accounts','dashboard','cash']){
    const before=await metrics();
    const value=await page.evaluate(async route=>{
      const button=document.querySelector('#mainNav .nav-submenu-item[data-view="'+route+'"]');if(!button)throw Error('Missing route '+route);
      const start=performance.now();let timerMs;
      const queued=new Promise(resolve=>setTimeout(()=>{timerMs=performance.now()-start;resolve();},0));
      window.__domWork=[];button.click();const syncMs=performance.now()-start;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const paintOpportunityMs=performance.now()-start;
      await queued;await new Promise(resolve=>setTimeout(resolve,100));
      return {syncMs,paintOpportunityMs,queuedInputMs:timerMs,liveNodes:document.getElementById('viewRoot').querySelectorAll('*').length,
        rootReplacements:window.__domWork.filter(x=>x.id==='viewRoot').length,
        longTasks:window.__longTasks.filter(x=>x.start+x.duration>start&&x.start<performance.now())};
    },route);
    const after=await metrics();for(const [name,counter] of [['scriptMs','ScriptDuration'],['layoutMs','LayoutDuration'],['styleMs','RecalcStyleDuration']])value[name]=(after[counter]-before[counter])*1000;
    const bucket=result.measurements[route]||={first:null,warm:[]};if(round===0)bucket.first=value;else bucket.warm.push(value);
    console.error(profileName+' '+(baseline?'production':'candidate')+' '+round+'/'+samples+' '+route+' '+Math.round(value.paintOpportunityMs)+' ms');
  }
  result.interactions=await page.evaluate(async()=>{
    const results=[],settle=__tableProbe.settle;
    async function measure(name,action){
      const start=performance.now();let queuedInputMs;const pending=new Promise(resolve=>setTimeout(()=>{queuedInputMs=performance.now()-start;resolve();},0));
      action();const syncMs=performance.now()-start;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const paintOpportunityMs=performance.now()-start;await pending;await settle();
      results.push({name,syncMs,paintOpportunityMs,queuedInputMs,longTasks:window.__longTasks.filter(t=>t.start+t.duration>start&&t.start<performance.now())});
    }
    nav('receipts');await settle();
    for(const query of ['ZEZ-2026-00000899','PDF',''])await measure('receipt-search:'+query,()=>{const input=document.getElementById('receiptNameSearch');input.focus();input.value=query;filterSalesRecordsByName();});
    if(ZEZMS.tablePages){
      if(document.activeElement?.id!=='receiptNameSearch')throw Error('Search focus was lost');
      await measure('receipt-next-page',()=>document.querySelector('[data-page-key="receipts"][data-page-step="1"]').click());
      nav('products');await settle();await measure('products-next-page',()=>document.querySelector('[data-page-key="products"][data-page-step="1"]').click());
    }
    nav('cash');await settle();return results;
  });
  result.functional=await probe.functional(page);
  result.rows=Object.fromEntries(Object.entries(result.functional.all).map(([route,rows])=>[route,{count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}]));
  delete result.functional.all;
  if(!baseline){
    result.paging=await page.evaluate(async()=>{
      const settle=__tableProbe.settle;nav('products');await settle();document.getElementById('pName').value='Unposted synthetic draft';
      const next=document.querySelector('[data-page-key="products"][data-page-step="1"]');next.click();await settle();
      if(document.querySelectorAll('#productCatalogBody tr').length!==50||document.getElementById('pName').value!=='Unposted synthetic draft')throw Error('Page bounds or form draft preservation failed');
      if(!document.querySelector('#productCatalogBody button[onclick="editProduct(50)"]'))throw Error('Page action index changed');
      nav('dashboard');await settle();nav('products');await settle();if(ZEZMS.tablePages.inspect('products').page!==0)throw Error('Route return did not reset page');
      for(const route of ['receipts','stock','accounts']){nav(route);await settle();const selector=route==='receipts'?'#salesRecordsBody .sales-record-row':route==='stock'?'#stockBalanceBody .stock-balance-row':'#accountHolderBody tr';if(document.querySelectorAll(selector).length!==50)throw Error('Unbounded '+route);}
      nav('cash');await settle();return {boundedRows:50,draftPreserved:true,actionIndex:true,routeReset:true};
    });
  }
  const after=await page.evaluate(()=>({db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}));assert.deepEqual(after,original,'Read-only pagination/actions changed business state');
  result.databaseUnchanged=true;result.outboxUnchanged=true;result.blockedExternalRequests=blocked.length;
  for(const bucket of Object.values(result.measurements)){
    const q=(key,p)=>{const values=bucket.warm.map(v=>v[key]).sort((a,b)=>a-b);return values.length?values[Math.ceil(values.length*p)-1]:bucket.first[key];};
    bucket.summary=Object.fromEntries(['paintOpportunityMs','syncMs','queuedInputMs','scriptMs','layoutMs','styleMs','liveNodes','rootReplacements'].map(key=>[key,{median:q(key,.5),max:q(key,1),...(samples>=20?{p95:q(key,.95)}:{})}]));
    bucket.summary.longTaskCount=bucket.warm.reduce((sum,v)=>sum+v.longTasks.length,0);bucket.summary.longestTaskMs=Math.max(0,...bucket.warm.flatMap(v=>v.longTasks.map(t=>t.duration)));
  }
  if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT,JSON.stringify(result,null,2)+'\n');
  if(process.env.BENCH_COMPARE){const previous=JSON.parse(fs.readFileSync(process.env.BENCH_COMPARE,'utf8'));assert.deepEqual(result.rows,previous.rows,'Complete ordered row HTML/actions differ from production');assert.deepEqual(result.functional,previous.functional,'Full search/totals/statement models differ from production');result.equivalencePassed=true;}
  if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({profile:profileName,baseline:baseline||'candidate',browser:browser.version(),rows:result.rows,businessState:'UNCHANGED',interactions:result.interactions,measurements:Object.fromEntries(Object.entries(result.measurements).map(([k,v])=>[k,v.summary]))}));
}).catch(error=>{console.error(error);process.exitCode=1;});

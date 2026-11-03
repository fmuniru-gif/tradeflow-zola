'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runFixture}=require('./remaining-tabs-performance.browser.cjs');
runFixture(async({page,profileName,browser,baseline})=>{
 const samples=Number(process.env.BENCH_SAMPLES||7),rows=[];
 const before=await page.evaluate(()=>({db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}));
 const html={};
 for(let round=0;round<=samples;round++)for(const route of ['receipts','stockin','cash','stock','accounts','dashboard']){
  const result=await page.evaluate(async route=>{const start=performance.now();document.querySelector('#mainNav .nav-submenu-item[data-view="'+route+'"]').click();const sync=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {sync,paint:performance.now()-start,html:document.getElementById('viewRoot').innerHTML,nodes:document.getElementById('viewRoot').querySelectorAll('*').length};},route);
  html[route]=crypto.createHash('sha256').update(result.html).digest('hex');delete result.html;rows.push({round,route,...result});
 }
 const after=await page.evaluate(()=>({db:JSON.stringify(DB),queue:JSON.stringify(ZEZMS.cloudSync.getOutbox())}));assert.deepEqual(after,before);
 const result={profile:profileName,browser:browser.version(),baseline,rows,html,businessState:'UNCHANGED'};
 if(process.env.BENCH_COMPARE){const prior=JSON.parse(fs.readFileSync(process.env.BENCH_COMPARE));assert.deepEqual(result.html,prior.html,'Visible values, row markup and actions changed');result.equivalencePassed=true;}
 if(process.env.BENCH_OUTPUT)fs.writeFileSync(process.env.BENCH_OUTPUT,JSON.stringify(result,null,2));
 const median=v=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)];console.log(JSON.stringify({profile:profileName,baseline,html,equivalence:result.equivalencePassed,measurements:Object.fromEntries(['receipts','stockin','cash','stock','accounts','dashboard'].map(route=>{const warm=rows.filter(r=>r.round&&r.route===route);return [route,{syncMedian:median(warm.map(r=>r.sync)),paintMedian:median(warm.map(r=>r.paint)),paintMax:Math.max(...warm.map(r=>r.paint))}];}))}));
}).catch(error=>{console.error(error);process.exitCode=1;});

// Disposable devices; no production access. Actual correction builder and replay engine.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');const root=path.resolve(__dirname,'..');let browser;
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':name.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(fs.readFileSync(file));});
after(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));});
async function device(){
 if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));if(!browser)browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const context=await browser.newContext(),page=await context.newPage();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.waitForFunction(()=>window.ZEZMS?.syncResilience&&window.ZEZMS?.stockCorrections);await page.evaluate(()=>ZEZMS.cloudSync.waitUntilReady(10000));return {page,context};
}
async function seed(page){await page.evaluate(()=>{
 const date=new Date();DB.selectedYear=date.getFullYear();DB.selectedMonth=date.getMonth()+1;
 DB.products=[{id:'P1',name:'Synthetic appliance',category:'Test',uPrice:25}];DB.stockRows=[{id:'R1',productId:'P1',productName:'Synthetic appliance',year:DB.selectedYear,month:DB.selectedMonth,qtyIn:12,qtyOut:0,rStock:12,uCost:5}];DB.stockCorrections=[];
 ZEZMS.staffAuth.getContext=()=>({role:'OWNER',user:{id:'synthetic-owner'}});ZEZMS.cloudSync._test.ensureSyncIds(DB);ZEZMS.cloudSync.rebaselineOwnerTrustedRecovery();
});}
test('actual stock corrections synchronize once, retain subsequent stock movements and reverse across two synthetic devices',async()=>{
 const a=await device(),b=await device();try{
  await seed(a.page);await seed(b.page);
  const sent=await a.page.evaluate(()=>{
   const api=ZEZMS.stockCorrections,record=api.commitCorrection(api.preparePhysicalCount({productId:'P1',physicalCount:'8'}));
   const operation=ZEZMS.cloudSync.getOutbox().find(o=>o.kind==='STOCK_CORRECTION_UPSERT');if(!operation)throw Error('Correction did not enter the actual outbox');return {record,operation};
  });
  const ack=await a.page.evaluate(async operation=>{
   const t=ZEZMS.syncResilience.create({sleep:async()=>{}}),native=ZEZMS.cloudSync._test;let committed=null,posts=0;
   const result=await t.push({operation,hash:native.deterministicHash,send:async()=>{posts++;committed=JSON.parse(JSON.stringify(operation));throw TypeError('Failed to fetch');},read:async()=>({data:{seq:21,op_id:operation.opId,payload:committed,created_at:'2026-11-03T00:00:00Z'}})});return {posts,seq:result.server_seq};
  },sent.operation);assert.deepEqual(ack,{posts:1,seq:21});
  const received=await b.page.evaluate(operation=>{
   const native=ZEZMS.cloudSync._test;native.applyOperation(operation,{silent:true});const first=JSON.stringify(DB);
   native.applyOperation(operation,{silent:true});if(JSON.stringify(DB)!==first)throw Error('Duplicate correction changed business data');
   DB.stockRows[0].rStock-=1;saveDB(); // A later local stock movement must survive replay.
   native.applyOperation(operation,{silent:true});return {qty:DB.stockRows[0].rStock,corrections:DB.stockCorrections.length};
  },sent.operation);assert.deepEqual(received,{qty:7,corrections:1});
  const rejected=await b.page.evaluate(operation=>{const before=JSON.stringify(DB);const conflict=JSON.parse(JSON.stringify(operation));conflict.patches.find(p=>p.collection==='stockCorrections').value.quantity=99;let message='';try{ZEZMS.cloudSync._test.applyOperation(conflict,{silent:true});}catch(e){message=e.message;}return {message,unchanged:before===JSON.stringify(DB)};},sent.operation);
  assert.match(rejected.message,/STOCK_CORRECTION_ID_CONFLICT/);assert.equal(rejected.unchanged,true);
  const reversal=await a.page.evaluate(id=>{ZEZMS.stockCorrections.reverseCorrection(id);return ZEZMS.cloudSync.getOutbox().filter(o=>o.kind==='STOCK_CORRECTION_UPSERT').at(-1);},sent.record.correctionId);
  const final=await b.page.evaluate(operation=>{ZEZMS.cloudSync._test.applyOperation(operation,{silent:true});const before=JSON.stringify(DB);ZEZMS.cloudSync._test.applyOperation(operation,{silent:true});return {qty:DB.stockRows[0].rStock,corrections:DB.stockCorrections.length,reversed:DB.stockCorrections[0].status,unchanged:before===JSON.stringify(DB)};},reversal);
  assert.deepEqual(final,{qty:11,corrections:2,reversed:'Reversed',unchanged:true});
 }finally{await a.context.close();await b.context.close();}
});
test('receipt, invoice and waybill system/direct HTML stretch only the watermark over the A5 page',async()=>{
 const f=await device();try{
  const docs=await f.page.evaluate(async()=>{
   const logo=await ZEZPrint.getEmbeddedWatermark(),p={receiptNo:'SYNTHETIC',date:'2026-11-03',lines:[],total:0};
   return [ZEZMS.operationsUpdate.buildReceiptPrintDocument(p,logo),ZEZMS.commercialDocuments.buildCommercialPrintDocument('invoice',p,logo),ZEZMS.commercialDocuments.buildCommercialPrintDocument('waybill',p,logo)];
  });
  for(const html of docs){assert.match(html,/width:148mm;height:210mm/);assert.match(html,/background-size:100% 100%;opacity:.10/);assert.match(html,/object-fit:contain/);assert.match(html,/data-zezms-approved-logo src="data:image\/jpeg;base64,/);}
 }finally{await f.context.close();}
});
test('the pinned Supabase SDK retries an interrupted operation through the actual RPC and read-back builders',async()=>{
 const f=await device();try{
  await f.page.addScriptTag({path:path.join(root,'diagnostics/r70t-owner-check/supabase-js-2.112.1.js')});
  let posts=0,reads=0,stored=null;
  await f.context.route('**/rest/v1/**',async route=>{
   const request=route.request();
   if(request.method()==='POST'){
    posts++;const payload=request.postDataJSON();
    if(posts===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic unavailable'})});
    stored=payload.p_operations[0];return route.fulfill({contentType:'application/json',body:JSON.stringify([{server_seq:21}])});
   }
   reads++;return route.fulfill({contentType:'application/json',body:JSON.stringify(stored?{seq:21,op_id:stored.opId,payload:stored,created_at:'2026-11-03T00:00:00Z'}:null)});
  });
  const result=await f.page.evaluate(async()=>{
   const client=supabase.createClient(location.origin,'synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),operation={opId:'sdk-test',kind:'STOCK_CORRECTION_UPSERT',patches:[]};
   const result=await ZEZMS.syncResilience.create({sleep:async()=>{}}).push({operation,hash:ZEZMS.cloudSync._test.deterministicHash,
    send:signal=>client.rpc('zezms_ops_push',{p_operations:[operation]}).abortSignal(signal),
    read:signal=>client.from('zezms_sync_operations').select('seq,op_id,payload,created_at').eq('owner_id','synthetic-owner').eq('op_id',operation.opId).maybeSingle().abortSignal(signal)});
   return result.server_seq;
  });assert.equal(result,21);assert.equal(posts,2);assert.equal(reads,2);assert.equal(stored.opId,'sdk-test');
 }finally{await f.context.close();}
});

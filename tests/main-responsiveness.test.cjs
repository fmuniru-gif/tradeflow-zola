'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='e3e0bf654519f3d9745ec89f3d9dbc394cf53067';
const old=file=>execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:32*1024*1024});
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const owner=read('js/owner-maintenance-v373.js'),before=old('js/owner-maintenance-v373.js').toString().replace(/\r\n/g,'\n');
test('every existing standalone source, printing path and asset stays exact except the scoped receipt UI function',()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',base,'js','assets'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  for(const file of files)if(file!=='js/owner-maintenance-v373.js')assert.deepEqual(execFileSync('git',['show',':'+file],{cwd:root,maxBuffer:32*1024*1024}),old(file),file);
  const originalStart=before.indexOf('  function installReceiptEditButtons()'),currentStart=owner.indexOf('  function receiptEditLookup()');
  const end='  /* ---------------- Purchase order document and printing';
  assert.equal(owner.slice(0,currentStart),before.slice(0,originalStart));
  assert.equal(owner.slice(owner.indexOf(end)).replace(', receiptEditLookup: receiptEditLookup',''),before.slice(before.indexOf(end)));
});
test('receipt edit lookup preserves first-match IDs, status, period and permission predicates with one period read',()=>{
  const source=owner.slice(owner.indexOf('  function receiptEditLookup()'),owner.indexOf('  function installReceiptEditButtons()'));
  const records=[{receiptNo:'R1'},{receiptNo:'R1',voided:true},{receiptNo:2},{receiptNo:'R3',status:'VOID'},{receiptNo:'R4',voided:true},{receiptNo:'R5'}];
  const sales=[{receiptNo:'R1',year:'2026',month:'10'},{receiptNo:'R1',status:'UNDONE',year:2026,month:10},{receiptNo:2,year:2026,month:9},{receiptNo:'R3',year:2026,month:10},{receiptNo:'R4',year:2026,month:10},{receiptNo:'R5',status:'UNDONE',year:2026,month:10}];
  const text=v=>v==null?'':String(v);
  for(const allowed of [true,false]){
    let calls=0;const context={DB:{receipts:records,sales},text,canEditReceipts:()=>allowed,getLatestMonth:()=>{calls++;return {year:2026,month:10};}};
    const lookup=vm.runInNewContext(source+'\nreceiptEditLookup()',context);
    for(const id of ['R1','2',2,'R3','R4','R5','missing','']){
      const r=records.find(item=>text(item.receiptNo)===text(id)),s=sales.find(item=>text(item.receiptNo)===text(id));
      assert.equal(lookup(id),!!(allowed&&r&&s&&!r.voided&&r.status!=='VOID'&&s.status!=='UNDONE'&&Number(s.year)===2026&&Number(s.month)===10));
    }
    assert.equal(calls,allowed?1:0);
  }
});
test('pagination bounds rows before construction without mutating records, order or numeric data',()=>{
  const context={window:{}};vm.runInNewContext(read('js/main-table-pages.js'),context);const api=context.window.ZEZMS.tablePages;
  const records=Object.freeze(Array.from({length:121},(_,i)=>Object.freeze({id:i,balance:i/7}))),original=JSON.stringify(records);
  assert.equal(api.size,50);assert.equal(api.slice('test',records).length,50);assert.equal(api.inspect('test').total,121);
  // Page movement still goes through the existing render function.
  let renders=0;context.window.render=()=>{renders++;};context.document={getElementById:()=>null,activeElement:null,querySelector:()=>null};
  api.move('test',1);assert.equal(api.slice('test',records)[0],records[50]);api.move('test',1);assert.equal(api.slice('test',records).length,21);
  api.move('test',1);assert.equal(renders,2);assert.equal(api.slice('test',records,'new-filter')[0],records[0]);
  api.move('test',1);assert.equal(api.slice('test',[records[0]]).length,1);assert.equal(api.inspect('test').page,0);
  assert.equal(api.slice('empty',[]).length,0);assert.equal(JSON.stringify(records),original);
  for(const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','saveDB(','supabase'])assert.ok(!read('js/main-table-pages.js').includes(forbidden),forbidden);
});
test('bounded tables are coupled to the verified shell and retain strict passive delivery',()=>{
  const delivery=require('../tools/build-pr11-delivery.cjs'),html=delivery.assembledShell(read('index.html'));
  assert.ok(html.includes('window.ZEZMS.tablePages=Object.freeze'));
  assert.ok(html.includes('data-zezms-pr11-module="owner-maintenance-v373.js"'));
  assert.equal(Object.keys(delivery.workerHashes(read('sw.js'),read('index.html'))).length,77);
  for(const file of ['sw.js','MAIN_RESPONSIVENESS_UPDATE.html'])for(const forbidden of ['skipWaiting(', 'clients.claim(', 'caches.delete(', 'localStorage.clear(', 'indexedDB.deleteDatabase('])assert.ok(!read(file).includes(forbidden));
});

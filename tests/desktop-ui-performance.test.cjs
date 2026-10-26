const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const production='1241e0ea2a02d05d68e976d16f51164ad72c216b';
const read=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
const old=name=>execFileSync('git',['show',production+':'+name],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');
const navPattern=/const NAVIGATION_V3101_R68_B64=\s*(?:"[A-Za-z0-9+/=]+"\s*\+?\s*)+;/;

function fixture(source,rows){
  const db={selectedYear:2026,selectedMonth:10,stockRows:structuredClone(rows)};
  let coreCalls=0;
  const context={DB:db,console:{error(){}},viewDashboard(){coreCalls++;return '<div>Existing KPI renderer</div>';}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {db,context,api:context.ZEZMS.managementIntelligence,coreCalls:()=>coreCalls};
}
const rows=[
  {id:'a',productId:'P1',productName:'A & B',category:'Test',year:2026,month:10,qtyIn:12,qtyOut:3,rStock:9,uCost:4,tSales:21,profit:9},
  {id:'b',productName:'A & B',year:2026,month:10,qtyIn:2,qtyOut:0,rStock:2,uCost:5,tSales:0,profit:0},
  {id:'c',productId:'P2',productName:'No sales',year:2026,month:10,qtyIn:7.25,qtyOut:0,rStock:7.25,uCost:2,tSales:0,profit:0},
  {id:'d',productId:'P3',productName:'Old month',year:2026,month:9,qtyIn:100,qtyOut:50,rStock:50,uCost:1,tSales:100,profit:50}
];

test('direct Management rendering matches production for live, changed, historical and empty periods',()=>{
  const before=fixture(old('js/management-intelligence-v380.js'),rows);
  const after=fixture(read('js/management-intelligence-v380.js'),rows);
  for(const change of [()=>{},db=>{db.stockRows[0].rStock=1;db.stockRows[0].uCost=9;},db=>{db.selectedMonth=9;},db=>{db.selectedMonth=8;}]){
    change(before.db);change(after.db);
    const unchanged=JSON.stringify(after.db);
    const legacy=before.context.viewDashboard().replace('<div>Existing KPI renderer</div>','');
    assert.equal(after.api.viewHTML(),legacy);
    assert.equal(JSON.stringify(after.api.getSelectedPeriodAggregate()),JSON.stringify(before.api.getSelectedPeriodAggregate()));
    assert.equal(JSON.stringify(after.db),unchanged);
  }
  assert.equal(after.coreCalls(),0,'Management should not construct hidden Dashboard KPIs');
  assert.equal(after.api.viewDashboardHTML(),'<div>Existing KPI renderer</div>');
  assert.equal(after.coreCalls(),1);
});

test('direct Management retains the production error display and cannot hide calculation failure',()=>{
  const before=fixture(old('js/management-intelligence-v380.js'),rows);
  const after=fixture(read('js/management-intelligence-v380.js'),rows);
  for(const f of [before,after])Object.defineProperty(f.db,'stockRows',{get(){throw Error('synthetic calculation failure');}});
  const expected=before.context.viewDashboard().replace('<div>Existing KPI renderer</div>','');
  assert.equal(after.api.viewHTML(),expected);
  assert.match(after.api.viewHTML(),/could not be calculated/);
});

test('assembled navigation matches reviewed source; all other shell bytes and embedded modules match production',()=>{
  const shell=read('index.html'),prior=old('index.html');
  const encoded=shell.match(navPattern)[0];
  const decoded=Buffer.from([...encoded.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(m=>m[1]).join(''),'base64').toString('utf8');
  assert.equal(decoded,read('js/navigation-v3101-r68.js'));
  assert.equal(shell.replace(navPattern,'NAVIGATION_ONLY'),prior.replace(navPattern,'NAVIGATION_ONLY'));
});

test('all protected production files remain byte-equivalent, including Stock Balance and release lifecycle',()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',production],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
  const allowed=new Set(['index.html','js/navigation-v3101-r68.js','js/management-intelligence-v380.js','js/stock-velocity-v390.js','tests/prelogin-release.test.cjs']);
  for(const file of files){
    if(allowed.has(file))continue;
    assert.equal(read(file),old(file),'Protected or unrelated source changed: '+file);
  }
});

test('velocity change only exposes the existing presentation scenario reset; all model and calculation code is preserved',()=>{
  const addition='    // Direct Dashboard/Management visits retain the legacy scenario reset\n'
    +'    // without building an unmounted planning screen or touching business data.\n'
    +'    clearPlanningSnapshot: function(){ runtime.planningSnapshot = null; },\n';
  assert.equal(read('js/stock-velocity-v390.js').replace(addition,''),old('js/stock-velocity-v390.js'));
});

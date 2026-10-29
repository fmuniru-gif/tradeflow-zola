const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {transformMainTables}=require('../tools/main-table-transform.cjs');
const delivery=require('../tools/build-pr11-delivery.cjs'),{transformRemainingTabs}=require('../tools/remaining-tabs-transform.cjs');
const root=path.resolve(__dirname,'..'),baseline='83c7450483f0063fd7857aff696634830d70f8d8';
const old=file=>execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:32*1024*1024});
const raw=delivery.assetBytes('js/remaining-tabs-presentation.js').toString('utf8');
function fixture(){const context={window:{},Intl};vm.createContext(context);vm.runInContext(raw,context);return {context,api:context.window.ZEZMS.remainingTabsPresentation};}

test('reused number formatter retains every numeric coercion and visible financial string',()=>{
  const {api}=fixture(),values=[0,-0,NaN,Infinity,-Infinity,undefined,null,'','  ','12.345','not a number',false,true,12n,1e-308,1e308,-0.005,0.005,-1234567.895,{valueOf:()=>12.345}];
  let seed=73;for(let i=0;i<1000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push((seed-2147483648)/1000);}
  for(const value of values)assert.equal(api.number(value),(Number(value)||0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}));
  assert.throws(()=>api.number(Symbol('invalid')),/Symbol/);
});

test('render-local stock quantities preserve exact names, periods, row-order sums and malformed-number behavior',()=>{
  const {api}=fixture(),objectName={},rows=[
    {productName:'TV',year:2026,month:10,rStock:'3.5'},{productName:'TV',year:2026,month:10,rStock:-1},
    {productName:'tv',year:2026,month:10,rStock:9},{productName:'TV',year:2026,month:'10',rStock:900},
    {productName:'TV',year:2026,month:9,rStock:800},{productName:'Sum',year:2026,month:10,rStock:Infinity},
    {productName:'Sum',year:2026,month:10,rStock:-Infinity},{productName:'Sum',year:2026,month:10,rStock:7},
    {productName:NaN,year:2026,month:10,rStock:99},{productName:objectName,year:2026,month:10,rStock:5},
    {productName:'TV',year:2026,month:10,rStock:'invalid'},{productName:null,year:2026,month:10,rStock:4}
  ].map(Object.freeze);Object.freeze(rows);
  for(const latest of [{year:2026,month:10},{year:2026,month:9},{year:2027,month:1}]){
    const quantities=api.stockQuantities(rows,latest);
    for(const name of ['TV','tv','Sum','missing',NaN,objectName,null]){
      const expected=rows.filter(row=>row.productName===name&&row.year===latest.year&&row.month===latest.month).reduce((sum,row)=>sum+(Number(row.rStock)||0),0);
      assert.equal(quantities.has(name)?quantities.get(name):0,expected);
    }
  }
});

const legacy=(html,receipts)=>receipts.filter(receipt=>receipt&&receipt.receiptRef).reduce((output,receipt)=>{
  const id=String(receipt.receiptNo||receipt.id||''),ref=String(receipt.receiptRef||'');return id&&ref?output.split(id).join(ref):output;
},String(html||''));
test('single-pass receipt presentation exactly preserves sequential behavior and conservative fallback edge cases',()=>{
  const {api}=fixture(),cases=[
    [{receiptNo:'A',receiptRef:'B'},{receiptNo:'B',receiptRef:'C'}],
    [{receiptNo:'R12345678901',receiptRef:'PUBLIC-A'},{receiptNo:'R12345678901',receiptRef:'PUBLIC-B'}],
    [{receiptNo:'R12345678901',receiptRef:'R123456789012'},{receiptNo:'R123456789012',receiptRef:'LAST'}],
    [{receiptNo:'R12345678901',receiptRef:'$&/<em>x</em>'}],
    [{receiptNo:'R12345678901',receiptRef:'R12345678901'}],
    [{receiptNo:'R.12345678901',receiptRef:'PUBLIC'},{receiptNo:'R123456789012',receiptRef:'PUBLIC-2'}],
    [null,{receiptNo:'',receiptRef:'PUBLIC'},{id:'R12345678901',receiptRef:'PUBLIC'}],
    [{receiptNo:'R12345678901',receiptRef:'PUBLIC'},{receiptNo:'R123456789012',receiptRef:'PUBLIC-2'}]
  ];
  const html='<tr><td>R12345678901 R123456789012</td><td>AB B R.12345678901</td><button onclick="show(\'R12345678901\')">R12345678901</button><td>prefixR12345678901suffix</td></tr>';
  for(const receipts of cases){const before=JSON.stringify(receipts);assert.equal(api.replaceReceiptIds(html,receipts),legacy(html,receipts));assert.equal(JSON.stringify(receipts),before);}
  let state=19;for(let round=0;round<100;round++){
    const receipts=Array.from({length:50},(_,i)=>({receiptNo:'RCP-'+String(i).padStart(8,'0'),receiptRef:'ZEZ-2026-'+String(i).padStart(8,'0')}));
    let text='';for(let i=0;i<80;i++){state=(Math.imul(state,1103515245)+12345)>>>0;const record=receipts[state%receipts.length];text+='<td>'+record.receiptNo+'</td><button onclick="open(\''+record.receiptNo+'\')">View</button>';}
    if(round%3===0)text+='prefix'+receipts[0].receiptNo+'suffix';
    if(round%5===0)receipts[10].receiptRef=receipts[20].receiptNo;
    assert.equal(api.replaceReceiptIds(text,receipts),legacy(text,receipts));
  }
});

test('eligible referenced receipt rows avoid the old per-receipt whole-page split pass',()=>{
  const {api,context}=fixture(),receipts=Array.from({length:900},(_,i)=>({receiptNo:'RCP-'+String(i).padStart(8,'0'),receiptRef:'ZEZ-2026-'+String(i).padStart(8,'0')}));
  const html=receipts.map(r=>'<td>'+r.receiptNo+'</td>').join('');
  vm.runInContext('globalThis.splitCalls=0;const originalSplit=String.prototype.split;String.prototype.split=function(){splitCalls++;return originalSplit.apply(this,arguments);};',context);
  assert.equal(api.replaceReceiptIds(html,receipts),legacy(html,receipts));assert.equal(context.splitCalls,0);
});

test('assembled changes are exactly the reviewed presentation edits, while every original embedded module remains intact',()=>{
  const before=old('index.html').toString('utf8'),after=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const embedded=source=>new Map([...source.matchAll(/const ([A-Z0-9_]+_B64)=([\s\S]*?);\s*(?=const|function|let|var|\/\/)/g)].map(m=>[m[1],m[2]]));
  const beforeModules=embedded(before),afterModules=embedded(after);assert.ok(beforeModules.size>20);
  for(const [key,value] of beforeModules)assert.equal(afterModules.get(key),value,key);
  const original=delivery.assembledShell(before),actual=delivery.assembledShell(after);
  const expected=transformMainTables(transformRemainingTabs(original,raw.replace(/<\/script/gi,'<\\/script')),delivery.assetBytes('js/main-table-pages.js').toString('utf8').replace(/<\/script/gi,'<\\/script')).replace('content="20261027-pr12-raw-bytes-r1"','content="'+delivery.DELIVERY+'"');
  const owner=delivery.assetBytes('js/owner-maintenance-v373.js').toString('utf8').replace(/<\/script/gi,'<\\/script');
  const withCoupledOwner=expected.replace('<script src="js/owner-maintenance-v373.js?v=20260822-supplier-procurement-intelligence-r51"></script>',()=>'<script data-zezms-pr11-module="owner-maintenance-v373.js">\n'+owner+'\n</script>');
  assert.equal(actual,withCoupledOwner);
  const body=source=>source.slice(source.indexOf('function stockOnHand(name){'),source.indexOf('function getBaseUnitPrice(name){'));
  assert.equal(body(actual),body(original),'POS/global stock calculation changed');
  assert.throws(()=>transformRemainingTabs(original.replace('const fmt =','const fmtChanged ='),raw),/MARKER_MISMATCH/);
});

test('all pre-existing standalone application and protected delivery helper blobs remain exact production bytes',()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'js','manifest.json','FORCE_UPDATE_MOBILE.html','PR11_DELIVERY_UPDATE.html','PR12_RAW_BYTE_UPDATE.html'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  for(const file of files.filter(file=>file!=='js/owner-maintenance-v373.js'))assert.deepEqual(delivery.assetBytes(file),old(file),file);
  for(const forbidden of ['localStorage','indexedDB','fetch(', 'saveDB(', 'sessionStorage','supabase'])assert.ok(!raw.includes(forbidden),forbidden);
});

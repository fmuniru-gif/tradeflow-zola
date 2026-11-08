const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process'),delivery=require('../tools/build-pr11-delivery.cjs');
let assembled;function html(){return assembled ||= delivery.assembledShell(fs.readFileSync('index.html','utf8'));}
function fixture(role='OWNER'){
 const elements={},db={selectedYear:2026,selectedMonth:11,products:[{id:'P1',name:'Synthetic TV',category:'TV',uPrice:100,barcodes:['001234']},{id:'P2',name:'Synthetic fridge',category:'FRIDGE',uPrice:200}],sales:[],receipts:[],inventoryTxns:[],stockRows:[]};let saves=0,durable=JSON.parse(JSON.stringify(db)),fail=false,selection='NORMAL',open=true;
 const c={window:null,DB:db,DB_KEY:'SYNTHETIC',Date,Set,Map,console,Event:class{},document:{body:{},getElementById:id=>elements[id]||null,addEventListener(){}},navigator:{},queueMicrotask(){},MutationObserver:class{observe(){}},isOpenMonth:()=>open,localDateKey:d=>{d=new Date(d);return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-');},fmt:n=>'GHS '+n.toFixed(2),round2:n=>Math.round(n*100)/100,saveDB(){if(fail)throw Error('SYNTHETIC_SAVE_HOLD');saves++;durable=JSON.parse(JSON.stringify(db));},addEventListener(){},ZEZMS:{staffAuth:{getContext:()=>({user:{id:'SYN-STAFF',active:true},role}),can:()=>role!=='AUDITOR'},db:{load:()=>durable},dashboardRestoration:{getSelection:()=>({kind:selection})},cloudSync:{getState:()=>({initialized:true}),isReadyForLocalOperations:()=>true}}};c.window=c;vm.createContext(c);
 const source=html().match(/<script data-zezms-executive-performance-r63>([\s\S]*?)<\/script>/)[1],prefix=source.slice(0,source.indexOf('  function cashEvents(data) {'));
 vm.runInContext(prefix+'\nwindow.ZEZMS.executivePerformance={getSaleEvents:saleEvents};\n}());',c);
 const h=html(),a=h.indexOf('function receiptSalesBaseValue(record){'),b=h.indexOf('function KPI_DailySalesValue(',a);vm.runInContext(h.slice(a,b),c);const active=h.slice(h.indexOf('function isActiveSaleRecord(record){'),a);vm.runInContext(active,c);
 vm.runInContext(fs.readFileSync('js/daily-profit-barcodes.js','utf8'),c);
 return {c,db,elements,api:c.ZEZMS.barcodes,profit:c.ZEZMS.dailyProfit,saves:()=>saves,fail:()=>fail=true,selection:v=>selection=v,open:v=>open=v};
}
const today=new Date('2026-11-08T12:00:00Z');
function sale(id='S1',date='2026-11-08T09:00:00Z'){return {id,receiptNo:id,date,status:'ACTIVE',subtotal:95,total:110,vatAmount:15,withholdingTax:3,lines:[{product:'Synthetic TV',qty:1,price:100,disc:5,amount:95,fifo:[{qty:1,uCost:60}]}]};}
test('daily actual profit includes receipt/Quick Sale margins after discounts, excludes VAT, WHT and duplicate receipt register',()=>{
 const f=fixture();f.db.sales=[sale()];f.db.receipts=[{...sale(),amountPaid:110}];f.db.inventoryTxns=[{id:'Q1',type:'SALE_OUT',subtype:'QUICK',date:today.toISOString(),amount:50,details:{lines:[{qty:1,amount:50,fifo:[{qty:1,uCost:20}]}]}}];const before=JSON.stringify(f.db),r=f.profit.calculate(today);assert.equal(r.value,65);assert.equal(r.count,2);assert.equal(JSON.stringify(f.db),before);assert.equal(f.saves(),0);
});
test('reversed/void transactions and prior days do not count; no transactions is a genuine zero',()=>{
 const f=fixture();f.db.sales=[{...sale(),status:'VOID'},sale('Y','2026-11-07T23:59:59Z'),{...sale('U'),status:'UNDONE'}];assert.equal(f.profit.calculate(today).value,0);f.db.sales=[sale('NEG')];f.db.sales[0].subtotal=40;assert.equal(f.profit.calculate(today).value,-20);assert.equal(f.profit.calculate(new Date('2026-11-09T00:00:00Z')).value,0);
});
test('missing/partial cost or an orphan receipt produces Unavailable, never an estimated catalogue margin',()=>{
 for(const mutate of [s=>delete s.lines[0].fifo,s=>s.lines[0].fifo[0].qty=.5,s=>delete s.lines[0].fifo[0].uCost]){const f=fixture();const s=sale();mutate(s);f.db.sales=[s];assert.equal(f.profit.calculate(today).value,null);assert.equal(f.profit.calculate(today).missing,1);}
 const f=fixture();f.db.receipts=[sale()];assert.equal(f.profit.calculate(today).value,null);f.open(false);assert.equal(f.profit.calculate(today).value,null);f.open(true);f.selection('YEAR');assert.equal(f.profit.calculate(today).value,null);
});
test('barcode lookup preserves zeros, matches Product IDs and fails closed on ambiguity/unknown/control characters',()=>{
 const f=fixture();assert.equal(f.api.resolve('001234').id,'P1');assert.equal(f.api.resolve('p1').id,'P1');assert.throws(()=>f.api.resolve('1234'),/No product/);assert.throws(()=>f.api.resolve('unknown'),/No product/);assert.throws(()=>f.api.resolve('12\u000034'),/valid barcode/);f.db.products[1].barcodes=['001234'];assert.throws(()=>f.api.resolve('001234'),/multiple/);
});
test('Owner/Admin can sync barcode aliases without changing IDs, prices, stock or other products; other roles cannot',()=>{
 const f=fixture(),old=JSON.stringify(f.db.products[1]);f.api.setBarcode('P1','0000123',false);assert.equal(f.api.resolve('0000123').id,'P1');assert.equal(f.db.products[0].uPrice,100);assert.equal(f.db.products[0].id,'P1');assert.equal(f.saves(),1);assert.equal(JSON.stringify(f.db.products[1]),old);assert.throws(()=>f.api.setBarcode('P2','0000123'),/belongs/);assert.throws(()=>f.api.setBarcode('P2','p1'),/belongs/);f.api.setBarcode('P1','0000123',true);assert.throws(()=>f.api.resolve('0000123'),/No product/);
 for(const role of ['CASHIER','MANAGER','AUDITOR'])assert.throws(()=>fixture(role).api.setBarcode('P1','12345'),/Owner\/Admin/);
});
test('failed native save restores prior alias metadata',()=>{const f=fixture(),before=JSON.stringify(f.db);f.fail();assert.throws(()=>f.api.setBarcode('P1','NEWCODE'),/SAVE_HOLD/);assert.equal(JSON.stringify(f.db),before);});
test('scans select through the existing entry handlers without adding quantity or saving a transaction',()=>{
 const f=fixture();function select(id,value){f.elements[id]={isConnected:true,value:'',options:[{value}],dispatchEvent(){}};}
 select('posProduct','Synthetic TV');f.c.pickProduct=name=>f.elements.posProduct.value=name;f.api.select('001234','posProduct');assert.equal(f.elements.posProduct.value,'Synthetic TV');
 select('siProduct','Synthetic TV');f.api.select('001234','siProduct');assert.equal(f.elements.siProduct.value,'Synthetic TV');
 select('invProduct','Synthetic TV');f.c.pickCommercialProduct=(prefix,name)=>f.elements[prefix+'Product'].value=decodeURIComponent(name);f.api.select('001234','invProduct');
 select('quoteProductSearch','P1');f.api.select('001234','quoteProductSearch');assert.equal(f.elements.quoteProductSearch.value,'P1');assert.equal(f.saves(),0);assert.equal(f.db.stockRows.length,0);assert.equal(f.db.sales.length,0);
 f.elements.siProduct.options=[];assert.throws(()=>f.api.select('001234','siProduct'),/not eligible/);
});
test('apart from the new tile/provider export and helper, every assembled production byte remains exact',()=>{
 const old=execFileSync('git',['show','b762cbda924cb135de43b6f388f323bb007e164e:index.html'],{maxBuffer:32*1024*1024}).toString(),strip=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');assert.equal(strip(require('../tools/daily-barcode-transform.cjs').withoutDailyBarcodes(require('../tools/device-sign-in-transform.cjs').withoutDeviceSignIn(html()))),strip(delivery.assembledShell(old)));
});
test('new-product barcode stays a draft until the native Stock In save and remains distinct from Product ID',()=>{
 const f=fixture(),before=JSON.stringify(f.db);f.elements['barcodeInput-siNewName']={value:'0000693213513488'};
 assert.equal(f.api.prepareNewStockIn('','New appliance','NEW-1'),'0000693213513488');assert.equal(JSON.stringify(f.db),before);assert.equal(f.saves(),0);
 const p=f.api.newProductRecord({id:'NEW-1',name:'New appliance',uPrice:150},'0000693213513488');assert.equal(p.id,'NEW-1');assert.deepEqual(Array.from(p.barcodes),['0000693213513488']);assert.equal(f.saves(),0);assert.equal(JSON.stringify(f.db),before);
});
test('new product barcode rejects an existing alias/ID, existing name, mixed selection, invalid data and unauthorized staff before mutation',()=>{
 const f=fixture(),before=JSON.stringify(f.db);f.elements['barcodeInput-siNewName']={value:'001234'};assert.throws(()=>f.api.prepareNewStockIn('','New','N1'),/already belongs/);
 f.elements['barcodeInput-siNewName'].value='p1';assert.throws(()=>f.api.prepareNewStockIn('','New','N1'),/already belongs/);
 f.elements['barcodeInput-siNewName'].value='NEWCODE';assert.throws(()=>f.api.prepareNewStockIn('Synthetic TV','New','N1'),/Clear Existing/);assert.throws(()=>f.api.prepareNewStockIn('','Synthetic TV','N1'),/name already exists/);assert.throws(()=>f.api.prepareNewStockIn('','','N1'),/Enter the new product name/);assert.throws(()=>f.api.prepareNewStockIn('','New','001234'),/already belongs/);assert.throws(()=>f.api.newProductRecord({id:'001234',name:'New'},'NEWCODE'),/already belongs/);
 f.elements['barcodeInput-siNewName'].value='x'.repeat(129);assert.throws(()=>f.api.prepareNewStockIn('','New','N1'),/valid barcode/);assert.equal(JSON.stringify(f.db),before);assert.equal(f.saves(),0);
 const staff=fixture('CASHIER');staff.elements['barcodeInput-siNewName']={value:'NEWCODE'};assert.throws(()=>staff.api.prepareNewStockIn('','New','N1'),/Only Owner/);
 f.elements['barcodeInput-siNewName'].value='';assert.equal(f.api.prepareNewStockIn('Synthetic TV','',''),'');assert.equal(f.api.newProductRecord({id:'N1'},'').id,'N1');
});

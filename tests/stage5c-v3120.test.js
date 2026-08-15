'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const root = require('path').resolve(__dirname, '..');
const customerCode = fs.readFileSync(require('path').join(root, 'js/customer-master-v3120.js'), 'utf8');
const printCode = fs.readFileSync(require('path').join(root, 'js/print-readiness-v3120.js'), 'utf8');

function customerHarness(database) {
  const elements = Object.create(null);
  const notices = [];
  const context = {
    console, Map, Set, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
    DB:database,
    ZEZMS:{ staffAuth:{ getContext:()=>({ role:'OWNER' }) } },
    session:{ role:'ADMIN', adminMode:false },
    saveCount:0, renderCount:0, modalHtml:'', closed:false,
    toast(message,type){ notices.push({ message:String(message), type:type||'ok' }); },
    confirm(){ return true; },
    document:{
      baseURI:'https://example.test/app/',
      getElementById(id){ return elements[id] || null; }
    },
    addEventListener(){}, dispatchEvent(){}, CustomEvent:function CustomEvent(type){this.type=type;}
  };
  context.saveDB=()=>{ context.saveCount++; };
  context.render=()=>{ context.renderCount++; };
  context.openModal=(html)=>{ context.modalHtml=html; };
  context.closeModal=()=>{ context.closed=true; };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(customerCode, context, { filename:'customer-master-v3120.js' });
  return { context, api:context.ZEZMS.customerMaster, elements, notices };
}

function field(elements, id, value) { elements[id] = { value:value == null ? '' : String(value) }; return elements[id]; }

const baselineSales = [
  { id:'SR-1', receiptNo:'SR-1', customer:'Alice A', contact:'024 123 4567', location:'Tamale', total:100, date:'2026-08-01T10:00:00Z', salesChannel:'Walk-in', status:'ACTIVE', lines:[{product:'Phone',qty:1,amount:100}] },
  { id:'SR-2', receiptNo:'SR-2', customer:'Alice Alternate', contact:'+233241234567', location:'Accra', total:50, date:'2026-08-05T10:00:00Z', salesChannel:'WhatsApp', status:'ACTIVE', lines:[{product:'Cable',qty:2,amount:50}] },
  { id:'SR-3', receiptNo:'SR-3', customer:'Bob Name', contact:'', location:'Yendi', total:30, date:'2026-07-10T10:00:00Z', salesChannel:'Referral', status:'ACTIVE', lines:[{product:'Case',qty:1,amount:30}] },
  { id:'SR-4', receiptNo:'SR-4', customer:'Bobb Name', contact:'', location:'', total:20, date:'2026-07-11T10:00:00Z', salesChannel:'Referral', status:'ACTIVE', lines:[{product:'Case',qty:1,amount:20}] },
  { id:'SR-X', receiptNo:'SR-X', customer:'Void Person', contact:'0200000000', total:999, date:'2026-08-06T10:00:00Z', status:'VOID', lines:[] }
];
const quickSales = [
  { id:'Q-1', type:'SALE_OUT', subtype:'QUICK', status:'ACTIVE', customerName:'Quick Customer', customerPhone:'055 111 2233', amount:75, date:'2026-08-07T10:00:00Z', salesChannel:'Phone Call', details:{lines:[{product:'Charger',qty:3,amount:75}]} },
  { id:'Q-2', type:'SALE_OUT', subtype:'QUICK', status:'ACTIVE', customerName:'Name Quick Only', customerPhone:'', amount:12, date:'2026-08-08T10:00:00Z', details:{lines:[]} }
];
const db = { customers:undefined, sales:JSON.parse(JSON.stringify(baselineSales)), inventoryTxns:JSON.parse(JSON.stringify(quickSales)), products:[{name:'Phone',category:'Devices'},{name:'Cable',category:'Accessories'},{name:'Case',category:'Accessories'},{name:'Charger',category:'Accessories'}] };
const originalTransactions = JSON.stringify({ sales:db.sales, inventoryTxns:db.inventoryTxns });
const h = customerHarness(db);
const api = h.api;

assert.strictEqual(api.version, '3.12.0');
assert.strictEqual(api.build, '20260815-customer-master-print-readiness-r45');
assert.ok(Array.isArray(db.customers));
assert.strictEqual(api.phoneKey('024-123-4567'), '233241234567');
assert.strictEqual(api.phoneKey('+233 (24) 123 4567'), '233241234567');
assert.strictEqual(api.phoneKey('00233 24 123 4567'), '233241234567');
assert.strictEqual(api.phoneKey('abc'), '');
assert.ok(/^CUS-P[A-F0-9]{10}$/.test(api.stableCustomerId('phone','233241234567')));
assert.ok(!api.stableCustomerId('phone','233241234567').includes('233241234567'));

const preview = api.buildHistoryPreview();
assert.strictEqual(preview.identifiable, 5);
assert.strictEqual(preview.phoneBased, 2);
assert.strictEqual(preview.nameOnly, 3);
assert.strictEqual(preview.potentialNew, 5);
assert.strictEqual(preview.existingMatches, 0);
assert.strictEqual(JSON.stringify({ sales:db.sales, inventoryTxns:db.inventoryTxns }), originalTransactions);

api.confirmBuildFromHistory();
assert.strictEqual(db.customers.length, 5);
assert.strictEqual(JSON.stringify({ sales:db.sales, inventoryTxns:db.inventoryTxns }), originalTransactions);
const idsAfterFirstImport = db.customers.map(c=>c.customerId).sort();
api.confirmBuildFromHistory();
assert.strictEqual(db.customers.length, 5);
assert.deepStrictEqual(db.customers.map(c=>c.customerId).sort(), idsAfterFirstImport);
assert.notStrictEqual(api.findByPhone('0241234567'), null);
assert.strictEqual(api.findByPhone('0241234567').name, 'Alice A');
assert.ok(db.customers.some(c=>c.name==='Bob Name' && c.identityQuality==='name-only'));
assert.ok(db.customers.some(c=>c.name==='Bobb Name' && c.identityQuality==='name-only'));
assert.notStrictEqual(db.customers.find(c=>c.name==='Bob Name').customerId, db.customers.find(c=>c.name==='Bobb Name').customerId);

const alice = api.findByPhone('0241234567');
const relationshipModel=api._test.preparedModel();
const aliceStats=relationshipModel.rows.find(row=>row.customer.customerId===alice.customerId);
assert.strictEqual(aliceStats.transactions,2);
assert.strictEqual(aliceStats.lifetimeSales,150);
assert.strictEqual(aliceStats.firstPurchase,'2026-08-01T10:00:00.000Z');
assert.strictEqual(aliceStats.lastPurchase,'2026-08-05T10:00:00.000Z');
assert.ok(aliceStats.daysSince>=0);
assert.strictEqual(aliceStats.mostUsedChannel,'Walk-in');
assert.strictEqual(aliceStats.totalQuantity,3);
assert.strictEqual(aliceStats.products.size,2);
assert.strictEqual(aliceStats.categories.size,2);
assert.strictEqual(aliceStats.history.length,2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(alice,'lifetimeSales'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(alice,'transactionCount'),false);
const selected = api.resolveCustomerId({ phone:'+233241234567', selectedId:alice.customerId });
assert.strictEqual(selected, alice.customerId);
const prospective = api.resolveCustomerId({ phone:'020 999 8888' });
assert.strictEqual(prospective, api.stableCustomerId('phone','233209998888'));

const beforeUpsert = db.customers.length;
api.upsertAfterCommittedSale({ name:'New Sale Customer', phone:'020 999 8888', location:'Savelugu', source:'receipt' });
assert.strictEqual(db.customers.length, beforeUpsert + 1);
api.upsertAfterCommittedSale({ name:'Different Typed Name', phone:'+233209998888', location:'Different old location', source:'receipt' });
assert.strictEqual(db.customers.length, beforeUpsert + 1);
assert.strictEqual(api.findByPhone('0209998888').name, 'New Sale Customer');
assert.strictEqual(api.findByPhone('0209998888').location, 'Savelugu');
assert.strictEqual(api.upsertAfterCommittedSale({ name:'No Phone', phone:'', source:'quick-sale' }), null);

const failedCrm = customerHarness({ customers:[], sales:[{id:'COMMITTED',total:10}], inventoryTxns:[], products:[] });
const committedBeforeFailure = JSON.stringify(failedCrm.context.DB.sales);
failedCrm.context.saveDB=()=>{ throw new Error('simulated CRM persistence failure'); };
assert.throws(()=>failedCrm.api.upsertAfterCommittedSale({name:'Committed Customer',phone:'0201112222',source:'receipt'}));
assert.strictEqual(failedCrm.context.DB.customers.length,0);
assert.strictEqual(JSON.stringify(failedCrm.context.DB.sales),committedBeforeFailure);

const view = api.viewHTML();
assert.ok(view.includes('Customer Master'));
assert.ok(view.includes('Total Customer Records'));
assert.ok(view.includes('Phone-Identified Customers'));
assert.ok(view.includes('Name-Only Customers'));
assert.ok(view.includes('Customers with Recorded Purchases'));
assert.ok(view.includes('Lifetime Sales'));
assert.ok(view.includes('Purchase History'));
assert.ok(view.includes('Name-only identity — review recommended'));
assert.ok(!view.includes('Delete Customer'));
assert.ok(!view.includes('loyalty'));
h.elements.cmTableBody={innerHTML:''};
api.search('Alice'); assert.ok(h.elements.cmTableBody.innerHTML.includes(alice.customerId));
api.search('2332412'); assert.ok(h.elements.cmTableBody.innerHTML.includes(alice.customerId));
api.search(alice.customerId); assert.ok(h.elements.cmTableBody.innerHTML.includes('Alice A'));

field(h.elements,'cmNewName','Manual Person'); field(h.elements,'cmNewPhone','027 111 2222');
field(h.elements,'cmNewLocation','Bolgatanga'); field(h.elements,'cmNewNotes','Prefers evening calls.');
const transactionCountBeforeManual = db.sales.length + db.inventoryTxns.length;
api.createManual();
assert.ok(api.findByPhone('0271112222'));
assert.strictEqual(api.findByPhone('0271112222').notes, 'Prefers evening calls.');
assert.strictEqual(db.sales.length + db.inventoryTxns.length, transactionCountBeforeManual);
const countBeforeDuplicateManual = db.customers.length;
field(h.elements,'cmNewName','Manual Duplicate'); field(h.elements,'cmNewPhone','+233271112222');
api.createManual();
assert.strictEqual(db.customers.length, countBeforeDuplicateManual);
assert.ok(h.notices.some(n=>n.message==='Another customer already uses this telephone number.'));

api.viewHTML(); api.selectCustomer(alice.customerId);
field(h.elements,'cmEditName','Alice Master Name'); field(h.elements,'cmEditPhone','0241234567');
field(h.elements,'cmEditLocation','Tamale Central'); field(h.elements,'cmEditNotes','Important note');
api.saveSelectedProfile();
assert.strictEqual(api.findByPhone('0241234567').name, 'Alice Master Name');
assert.strictEqual(api.findByPhone('0241234567').location, 'Tamale Central');
assert.strictEqual(api.findByPhone('0241234567').notes, 'Important note');
assert.strictEqual(db.sales[0].customer, 'Alice A');

const quickCustomer = api.findByPhone('0551112233');
api.viewHTML(); api.selectCustomer(quickCustomer.customerId);
field(h.elements,'cmEditName',quickCustomer.name); field(h.elements,'cmEditPhone','0241234567');
field(h.elements,'cmEditLocation',''); field(h.elements,'cmEditNotes','');
api.saveSelectedProfile();
assert.strictEqual(quickCustomer.phoneKey, '233551112233');
assert.ok(h.notices.filter(n=>n.message==='Another customer already uses this telephone number.').length >= 2);

const posName=field(h.elements,'posCust',''), posPhone=field(h.elements,'posTel',''), posLocation=field(h.elements,'posLoc','');
h.elements.posCustomerResults={innerHTML:'',classList:{add(){},remove(){}}};
h.elements.posCustomerLookup={value:''}; h.elements.posCustomerMatch={textContent:'',innerHTML:''};
h.context.cart=[]; h.context.cart._salesChannel='Walk-in'; h.context.cart._vatRate=15; h.context.cart.push({name:'Phone',qty:1,uPrice:100});
const cartBefore = JSON.stringify(Array.from(h.context.cart));
api.selectPOS(alice.customerId);
assert.strictEqual(posName.value, 'Alice Master Name');
assert.strictEqual(posPhone.value, '0241234567');
assert.strictEqual(posLocation.value, 'Tamale Central');
assert.strictEqual(h.context.cart._salesChannel, 'Walk-in');
assert.strictEqual(h.context.cart._vatRate, 15);
assert.strictEqual(JSON.stringify(Array.from(h.context.cart)), cartBefore);
posName.value='Deliberately typed name';
api.onPOSTelephoneInput('+233241234567');
assert.strictEqual(posName.value, 'Deliberately typed name');
assert.ok(h.elements.posCustomerMatch.innerHTML.includes('Existing customer found'));

api.viewHTML(); api.selectCustomer(alice.customerId);
field(h.elements,'cmEditName','Alice Master Name'); field(h.elements,'cmEditPhone','020 333 4444');
field(h.elements,'cmEditLocation','Owner Edited Location'); field(h.elements,'cmEditNotes','Important note');
api.saveSelectedProfile();
assert.strictEqual(alice.phoneKey,'233203334444');
assert.ok(alice.phoneAliases.includes('233241234567'));
api.confirmBuildFromHistory();
assert.strictEqual(alice.location,'Owner Edited Location');
assert.strictEqual(db.customers.length,countBeforeDuplicateManual);
assert.strictEqual(db.sales[0].customer,'Alice A');

const restricted = customerHarness({customers:[],sales:[],inventoryTxns:[],products:[]});
restricted.context.ZEZMS.staffAuth.getContext=()=>({role:'CASHIER'});
assert.ok(restricted.api.viewHTML().includes('only to Owner or Admin'));

function printHarness() {
  let output='', printCalls=0;
  const popup={
    document:{ open(){}, write(value){output += value;}, close(){} },
    addEventListener(){}, focus(){}, print(){printCalls++;}, close(){}
  };
  const context={ console, Map, Date, Object, Array, String, Number, Boolean, URL,
    document:{baseURI:'https://example.test/app/'}, print(){printCalls++;}, open(){return popup;}, toast(){}, window:null };
  context.window=context; vm.createContext(context); vm.runInContext(printCode,context,{filename:'print-readiness-v3120.js'});
  return {context,api:context.ZEZPrint,getOutput:()=>output,getPrintCalls:()=>printCalls};
}
const p=printHarness();
assert.strictEqual(p.api.transport,'system-dialog');
assert.strictEqual(typeof p.api.printWithTransport,'function');
assert.strictEqual(p.api.isSystemPrintSupported(),true);
assert.deepStrictEqual(Array.from(p.api.listTransports()),['system-dialog']);
assert.ok(p.api.settingsHtml().includes('Printing &amp; Wireless Printer Readiness'));
assert.ok(p.api.settingsHtml().includes('does not automatically discover or select printers'));
p.api.openPrintTest();
assert.ok(p.getOutput().includes('@page{size:A5 portrait;margin:0}'));
assert.ok(p.getOutput().includes('A5 PRINT TEST'));
assert.ok(p.getOutput().includes('APPROVED'));
assert.ok(p.getOutput().includes('assets/zez-document-watermark.jpg'));
assert.ok(p.getOutput().includes('148mm × 210mm'));
assert.ok(!/customerName|customerPhone|receiptNo/.test(p.getOutput()));
assert.throws(()=>p.api.registerTransport('system-dialog',{printHtml(){}}));
p.api.registerTransport('future-test',{printHtml(){}});
assert.deepStrictEqual(Array.from(p.api.listTransports()),['system-dialog','future-test']);

const source = {
  index:fs.readFileSync(require('path').join(root,'index.html'),'utf8'),
  operations:fs.readFileSync(require('path').join(root,'js/operations-update.js'),'utf8'),
  cloud:fs.readFileSync(require('path').join(root,'js/cloud-sync.js'),'utf8'),
  backup:fs.readFileSync(require('path').join(root,'js/backup-manager.js'),'utf8'),
  nav:fs.readFileSync(require('path').join(root,'js/navigation-v3101.js'),'utf8'),
  sw:fs.readFileSync(require('path').join(root,'sw.js'),'utf8')
};
assert.ok(source.index.includes("const APP_VERSION = '3.12.0'"));
assert.ok(source.index.includes("const DB_KEY = 'tradeflow_v321_zola'"));
assert.ok(source.index.includes("customers: []"));
assert.ok(source.index.includes('ZEZMS.customerMaster.upsertAfterCommittedSale'));
assert.ok(source.index.indexOf('saveDB();\n  try{\n    if(ZEZMS.customerMaster') > source.index.indexOf('function printReceiptSale'));
const receiptSource=source.index.slice(source.index.indexOf('function printReceiptSale'),source.index.indexOf('function showReceiptModal'));
assert.ok(receiptSource.indexOf('Customer Name is required') < receiptSource.indexOf('recordSaleOutFIFO'));
assert.ok(receiptSource.indexOf('Customer Telephone is required') < receiptSource.indexOf('recordSaleOutFIFO'));
assert.ok(receiptSource.indexOf('saveDB();') < receiptSource.indexOf('upsertAfterCommittedSale'));
assert.ok(source.operations.includes('ZEZMS.customerMaster.upsertAfterCommittedSale'));
assert.ok(source.operations.includes('saveDB();\n    try {\n      if(window.ZEZMS && ZEZMS.customerMaster'));
const quickSource=source.operations.slice(source.operations.indexOf('quickSaleOut = function'),source.operations.indexOf('function activeInventoryTransactions'));
assert.ok(quickSource.indexOf('recordSaleOutFIFO') < quickSource.indexOf('saveDB();'));
assert.ok(quickSource.indexOf('saveDB();') < quickSource.indexOf('upsertAfterCommittedSale'));
assert.ok(source.cloud.includes("'products', 'customers', 'stockRows'"));
assert.ok(source.cloud.includes("return 'CUSTOMER_UPSERT'"));
assert.ok(source.cloud.includes('customerByPhoneKey'));
assert.ok(source.backup.includes("'products', 'customers', 'stockRows'"));
assert.ok(source.nav.indexOf("view: 'portfolio-signals'") < source.nav.indexOf("view: 'customer-master'"));
assert.ok(source.nav.indexOf("view: 'customer-master'") < source.nav.indexOf("view: 'customer-intelligence'"));
assert.ok(source.sw.includes('./js/customer-master-v3120.js?v=20260815-customer-master-print-readiness-r45'));
assert.ok(source.sw.includes('./js/print-readiness-v3120.js?v=20260815-customer-master-print-readiness-r45'));
assert.ok(!source.index.includes('WebUSB'));
assert.ok(!source.index.includes('WebBluetooth'));
assert.ok(!source.index.includes('PrintNode'));
assert.ok(!fs.readFileSync(require('path').join(root,'js/customer-master-v3120.js'),'utf8').includes('deleteCustomer'));

console.log('Stage 5C functional/static assertions passed:', 122);


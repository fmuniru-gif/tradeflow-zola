'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.resolve(__dirname,'../js/cloud-sync.js'),'utf8');
const storage=new Map(),events=[],saves=[];
const context={console,Map,Set,Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Promise,
  DB:{customers:[],products:[],stockRows:[],sales:[],receipts:[]},DB_KEY:'tradeflow_v321_zola',APP_VERSION:'3.12.0',
  ZEZMS:{db:{save(key,value){saves.push({key,customers:value.customers.length})}}},
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(storage.size).padStart(12,'0')}`},
  document:{getElementById(){return null}},navigator:{userAgent:'test',onLine:true},location:{href:'https://example.test/'},
  CustomEvent:function(type){this.type=type},addEventListener(){},dispatchEvent(event){events.push(event.type)},render(){},
  setTimeout,clearTimeout,confirm:()=>true,window:null};
context.window=context;vm.createContext(context);vm.runInContext(code,context,{filename:'cloud-sync.js'});
const test=context.ZEZMS.cloudSync._test;
const before={customers:[],products:[],stockRows:[],sales:[],receipts:[]};
const customer={customerId:'CUS-PABC1234567',name:'Sync Customer',phone:'0201112233',phoneKey:'233201112233',phoneAliases:[],location:'Tamale',notes:'',identityQuality:'phone',createdAt:'2026-08-15T10:00:00Z',updatedAt:'2026-08-15T10:00:00Z',source:'manual'};
const after=JSON.parse(JSON.stringify(before));after.customers.push(customer);
const built=test.buildOperation(before,after,'customer-create');
assert.strictEqual(built.kind,'CUSTOMER_UPSERT');
assert.strictEqual(built.patches.length,1);
assert.strictEqual(built.patches[0].collection,'customers');
assert.strictEqual(built.patches[0].action,'insert');
assert.strictEqual(built.patches[0].key,customer.customerId);

context.DB.customers=[{...customer,customerId:'CUS-EXISTING',name:'Older Name',updatedAt:'2026-08-15T09:00:00Z'}];
test.applyOperation({opId:'REMOTE-1',kind:'CUSTOMER_UPSERT',patches:[built.patches[0]]},{silent:true});
assert.strictEqual(context.DB.customers.length,1);
assert.strictEqual(context.DB.customers[0].customerId,'CUS-EXISTING');
assert.strictEqual(context.DB.customers[0].name,'Sync Customer');
assert.ok(events.includes('zezms-customer-master-updated'));
assert.ok(saves.some(save=>save.key==='tradeflow_v321_zola'));

test.applyOperation({opId:'REMOTE-OLD',kind:'CUSTOMER_UPSERT',patches:[{
  action:'update',collection:'customers',key:'CUS-EXISTING',fallback:{...customer,customerId:'CUS-EXISTING',name:'Stale Name',updatedAt:'2026-08-15T08:00:00Z'},
  changes:[{field:'name',mode:'set',value:'Stale Name',before:'Sync Customer'},{field:'updatedAt',mode:'set',value:'2026-08-15T08:00:00Z',before:'2026-08-15T10:00:00Z'}]
}]},{silent:true});
assert.strictEqual(context.DB.customers[0].name,'Sync Customer');

test.applyOperation({opId:'REMOTE-NEW',kind:'CUSTOMER_UPSERT',patches:[{
  action:'update',collection:'customers',key:'CUS-EXISTING',fallback:{...customer,customerId:'CUS-EXISTING',name:'Newest Name',notes:'Synced note',updatedAt:'2026-08-15T11:00:00Z'},
  changes:[{field:'name',mode:'set',value:'Newest Name',before:'Sync Customer'},{field:'notes',mode:'set',value:'Synced note',before:''},{field:'updatedAt',mode:'set',value:'2026-08-15T11:00:00Z',before:'2026-08-15T10:00:00Z'}]
}]},{silent:true});
assert.strictEqual(context.DB.customers[0].name,'Newest Name');
assert.strictEqual(context.DB.customers[0].notes,'Synced note');
assert.strictEqual(context.DB.sales.length,0);
assert.strictEqual(context.DB.receipts.length,0);
console.log('Customer JSON-operation sync assertions passed: 15');

'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.resolve(__dirname,'../js/customer-master-v3120.js'),'utf8');
const sales=[];
for(let i=0;i<5000;i++){
  const customer=i%1000;
  const local='0'+String(200000000+customer).padStart(9,'0');
  sales.push({id:'S-'+i,receiptNo:'S-'+i,customer:'Performance Customer '+customer,contact:local,total:(i%200)+1,date:new Date(Date.UTC(2025,0,1+(i%500))).toISOString(),salesChannel:i%2?'Walk-in':'WhatsApp',status:'ACTIVE',lines:[{product:'Product '+(i%50),qty:1,amount:(i%200)+1}]});
}
const context={console,Map,Set,Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,
  DB:{customers:[],sales,inventoryTxns:[],products:[]},ZEZMS:{staffAuth:{getContext:()=>({role:'OWNER'})}},
  session:{role:'ADMIN'},saveDB(){},render(){},toast(){},confirm(){return true},closeModal(){},openModal(){},
  document:{baseURI:'https://example.test/',getElementById(){return null}},addEventListener(){},window:null};
context.window=context;vm.createContext(context);vm.runInContext(code,context);
const api=context.ZEZMS.customerMaster;
let start=performance.now();const preview=api.buildHistoryPreview();const previewMs=performance.now()-start;
assert.strictEqual(preview.identifiable,1000);
start=performance.now();api.confirmBuildFromHistory();const importMs=performance.now()-start;
assert.strictEqual(context.DB.customers.length,1000);
start=performance.now();const html=api.viewHTML();const modelMs=performance.now()-start;
assert.ok(html.includes('Performance Customer'));
start=performance.now();for(let i=0;i<250;i++)api.search('Customer '+(i%1000));const searchMs=performance.now()-start;
assert.ok(previewMs<5000,`preview too slow: ${previewMs}`);
assert.ok(importMs<5000,`import too slow: ${importMs}`);
assert.ok(modelMs<5000,`model too slow: ${modelMs}`);
assert.ok(searchMs<1000,`prepared-model search too slow: ${searchMs}`);
console.log(JSON.stringify({transactions:5000,customers:1000,previewMs:+previewMs.toFixed(1),importMs:+importMs.toFixed(1),modelRenderMs:+modelMs.toFixed(1),search250Ms:+searchMs.toFixed(1)}));

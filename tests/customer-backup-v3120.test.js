'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.resolve(__dirname,'../js/backup-manager.js'),'utf8');
function defaultDB(){return{products:[],customers:[],stockRows:[],sales:[],saleLines:[],debtors:[],creditors:[],depositors:[],debtorsMonthly:[],creditorsMonthly:[],depositorsMonthly:[],accountTxns:[],cashLog:[],expenses:[],kpiHistory:[],receipts:[],invoices:[],waybills:[],purchaseOrders:[],undoLog:[],inventoryTxns:[],backupHistory:[],backupSettings:{}}}
const context={console,Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Promise,Blob,URL,FormData,fetch:async()=>{},
  ZEZMS:{},ZEZMS_CONFIG:{},DB:defaultDB(),defaultDB,document:{getElementById(){return null}},toast(){},setTimeout,clearTimeout,window:null};
context.window=context;vm.createContext(context);vm.runInContext(code,context,{filename:'backup-manager.js'});
const test=context.ZEZMS.backup._test;
const oldBackup=defaultDB();delete oldBackup.customers;
const restoredOld=test.normalizeRestoredDatabase(oldBackup,{});
assert.ok(Array.isArray(restoredOld.customers));
assert.strictEqual(restoredOld.customers.length,0);
const customer={customerId:'CUS-PABC',name:'Backup Customer',phone:'0201112233',phoneKey:'233201112233',phoneAliases:['233241112233'],location:'Tamale',notes:'Keep me',identityQuality:'phone',createdAt:'2026-08-01T00:00:00Z',updatedAt:'2026-08-15T00:00:00Z',source:'manual'};
const modern=defaultDB();modern.customers=[customer];
const restored=test.normalizeRestoredDatabase(modern,{});
assert.strictEqual(restored.customers.length,1);
assert.deepStrictEqual(JSON.parse(JSON.stringify(restored.customers[0])),customer);
(async()=>{
  const text=await test.createBackupBlob(modern).text();const parsed=JSON.parse(text);
  assert.strictEqual(parsed.customers[0].customerId,'CUS-PABC');
  assert.strictEqual(parsed.customers[0].notes,'Keep me');
  assert.strictEqual(parsed.customers[0].location,'Tamale');
  console.log('Customer backup/restore assertions passed: 7');
})().catch(error=>{console.error(error);process.exitCode=1});

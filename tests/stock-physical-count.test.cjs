const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../js/stock-corrections-v3150.js'),'utf8');

function fixture(role='OWNER') {
  const db={selectedYear:2026,selectedMonth:10,products:[{id:'P1',name:'Test Widget',category:'Test',uPrice:25}],
    stockRows:[{id:'R1',productId:'P1',productName:'Test Widget',year:2026,month:10,qtyIn:12,qtyOut:0,rStock:12,uCost:5}],stockCorrections:[]};
  let saves=0;
  const context={DB:db,ZEZMS:{staffAuth:{getContext:()=>({role})}},session:{cashier:'Synthetic Owner'},
    getLatestMonth:()=>({year:db.selectedYear,month:db.selectedMonth}),saveDB:()=>{saves++;},
    document:{getElementById:()=>null,createElement:()=>({style:{},textContent:''}),head:{appendChild:()=>{}}},
    render:()=>{},window:null,crypto:{randomUUID:()=> '12345678-0000-0000-0000-000000000000'},console};
  context.window=context;
  vm.createContext(context);vm.runInContext(source,context);
  return {db,api:context.ZEZMS.stockCorrections,saves:()=>saves};
}

test('physical count 12 to zero creates a positive 12-unit audited decrease, no sale or financial posting',()=>{
  const f=fixture();const p=f.api.preparePhysicalCount({productId:'P1',physicalCount:'0'});
  assert.equal(p.correctionType,'Quantity Decrease');assert.equal(p.quantity,12);
  assert.equal(p.beforeQty,12);assert.equal(p.afterQty,0);
  assert.equal(p.beforeValue,60);assert.equal(p.afterValue,0);
  const r=f.api.commitCorrection(p);
  assert.equal(r.quantity,12);assert.equal(r.afterQty,0);assert.equal(r.reason,'Physical Count Adjustment');
  assert.equal(f.db.stockRows[0].qtyIn,12);assert.equal(f.db.stockRows[0].qtyOut,0);assert.equal(f.db.stockRows[0].rStock,0);
  assert.equal(f.db.stockCorrections.length,1);assert.equal(f.saves(),1);
  assert.throws(()=>f.api.commitCorrection(p),/changed after preview|No adjustment required/);
  assert.equal(f.db.stockCorrections.length,1);
  assert.deepEqual(Object.keys(f.db).sort(),['products','selectedMonth','selectedYear','stockCorrections','stockRows'].sort());
});
test('nonzero physical increases and decreases use existing audited correction and reversal records',()=>{
  const up=fixture();const p=up.api.preparePhysicalCount({productId:'P1',physicalCount:'14.25',unitCost:'6'});
  assert.equal(p.quantity,2.25);assert.equal(p.correctionType,'Quantity Increase');assert.equal(p.afterValue,73.5);
  const r=up.api.commitCorrection(p);assert.equal(up.db.stockRows.length,2);assert.equal(r.referenceValueImpact,13.5);
  assert.equal(up.db.stockRows[1].source,'STOCK_CORRECTION');
  const reversal=up.api.reverseCorrection(r.correctionId);assert.equal(reversal.reversalOf,r.correctionId);
  assert.equal(up.db.stockCorrections[0].status,'Reversed');assert.equal(up.api.currentQuantity(up.db.products[0]),12);
  const down=fixture();const q=down.api.preparePhysicalCount({productId:'P1',physicalCount:'5.5'});
  assert.equal(q.quantity,6.5);assert.equal(q.afterValue,27.5);
  const decreased=down.api.commitCorrection(q);assert.equal(down.db.stockRows[0].rStock,5.5);
  const restored=down.api.reverseCorrection(decreased.correctionId);
  assert.equal(restored.reversalOf,decreased.correctionId);assert.equal(down.db.stockRows[0].rStock,12);
});
test('equal count has no event and cannot commit',()=>{
  const f=fixture();const p=f.api.preparePhysicalCount({productId:'P1',physicalCount:'12'});
  assert.equal(p.noAdjustmentRequired,true);assert.throws(()=>f.api.commitCorrection(p),/No adjustment required/);
  assert.equal(f.saves(),0);assert.equal(f.db.stockCorrections.length,0);
});
test('invalid, missing, negative, overprecision and insufficient-cost targets fail closed',()=>{
  const f=fixture();for(const value of ['',null,'-1','0.001','1e2','abc','1.234','Infinity'])
    assert.throws(()=>f.api.preparePhysicalCount({productId:'P1',physicalCount:value}),/physical count/);
  assert.throws(()=>f.api.preparePhysicalCount({productId:'P1',physicalCount:'13'}),/Actual Unit Cost/);
  assert.throws(()=>f.api.preparePhysicalCount({productId:'P1',physicalCount:'13',unitCost:'1.234'}),/Actual Unit Cost/);
  assert.throws(()=>f.api.prepareCorrection({productId:'P1',correctionType:'Quantity Decrease',quantity:'13',reason:'Damaged Stock'}),/cannot exceed current available stock/);
  assert.throws(()=>f.api.preparePhysicalCount({productId:'wrong',physicalCount:'0'}),/Product Catalog/);
  assert.equal(f.saves(),0);
});
test('fractional counts are exact and invalid existing stock layers stop before preview',()=>{
  const f=fixture();const p=f.api.preparePhysicalCount({productId:'P1',physicalCount:'0.29'});
  assert.equal(p.quantity,11.71);assert.equal(p.afterQty,0.29);
  f.db.stockRows[0].rStock=-1;
  assert.throws(()=>f.api.preparePhysicalCount({productId:'P1',physicalCount:'0'}),/stock layer quantity or cost is invalid/);
});
test('stale quantity, unchanged quantity with changed cost, and changed period cannot commit',()=>{
  const f=fixture();const p=f.api.preparePhysicalCount({productId:'P1',physicalCount:'0'});
  f.db.stockRows[0].rStock=11;assert.throws(()=>f.api.commitCorrection(p),/changed after preview/);
  f.db.stockRows[0].rStock=12;f.db.stockRows[0].uCost=7;
  assert.throws(()=>f.api.commitCorrection(p),/changed after preview/);
  f.db.stockRows[0].uCost=5;f.db.selectedMonth=11;
  assert.throws(()=>f.api.commitCorrection(p),/changed after preview/);
  f.db.selectedMonth=10;f.db.products[0].name='Renamed Widget';
  assert.throws(()=>f.api.commitCorrection(p),/changed after preview/);
  assert.equal(f.db.stockCorrections.length,0);assert.equal(f.saves(),0);
});
test('failed guarded save restores original stock rows and creates no correction',()=>{
  const f=fixture();const p=f.api.preparePhysicalCount({productId:'P1',physicalCount:'0'});
  const originalRows=JSON.stringify(f.db.stockRows);
  // The production hold throws at saveDB; this fixture checks the correction rollback itself.
  const sandbox={DB:f.db,ZEZMS:{staffAuth:{getContext:()=>({role:'OWNER'})}},session:{cashier:'Synthetic Owner'},
    getLatestMonth:()=>({year:2026,month:10}),saveDB:()=>{throw Error('SHOP_RECOVERY_HOLD');},
    document:{getElementById:()=>null,createElement:()=>({style:{},textContent:''}),head:{appendChild:()=>{}}},
    render:()=>{},window:null,crypto:{randomUUID:()=> '12345678-0000-0000-0000-000000000000'},console};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
  assert.throws(()=>sandbox.ZEZMS.stockCorrections.commitCorrection(p),/SHOP_RECOVERY_HOLD/);
  assert.equal(JSON.stringify(f.db.stockRows),originalRows);
  assert.equal(f.db.stockCorrections.length,0);
});
test('Owner/Admin gate applies to preparation and commit',()=>{
  const staff=fixture('CASHIER');assert.throws(()=>staff.api.preparePhysicalCount({productId:'P1',physicalCount:'0'}),/Owner or an Administrator/);
  const admin=fixture('ADMIN');const p=admin.api.preparePhysicalCount({productId:'P1',physicalCount:'0'});assert.equal(admin.api.commitCorrection(p).quantity,12);
});
test('existing positive-delta increase/decrease entry points remain valid',()=>{
  const f=fixture();const p=f.api.prepareCorrection({productId:'P1',correctionType:'Quantity Decrease',quantity:'2',reason:'Damaged Stock'});
  assert.equal(p.quantity,2);assert.equal(f.api.commitCorrection(p).afterQty,10);
  assert.equal(f.db.stockRows[0].qtyIn,12);assert.equal(f.db.stockRows[0].qtyOut,0);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const delivery=require('../tools/build-pr11-delivery.cjs'),transform=require('../tools/tv-trade-in-transform.cjs');
let assembledCache;function assembled(){return assembledCache ||= delivery.assembledShell(fs.readFileSync('index.html','utf8'));}
function section(html,start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
function fixture(role='OWNER') {
 const db={products:[{id:'OLD',name:'Synthetic 32 inch TV',category:'TV',uPrice:1000},{id:'NEW',name:'Synthetic 55 inch TV',category:'TV',uPrice:3000}],stockRows:[{id:'NEWROW',productId:'NEW',productName:'Synthetic 55 inch TV',category:'TV',year:2026,month:11,qtyIn:3,qtyOut:0,rStock:3,uCost:2000,uPrice:3000,tSales:0,profit:0,disc:0,aPrice:0}],customers:[{customerId:'C1',name:'Synthetic Customer',phone:'0200000000',location:'Synthetic'}],sales:[{id:'OLD-SALE',receiptNo:'OLD-SALE',customerId:'C1',customer:'Synthetic Customer',contact:'0200000000',date:'2026-01-01',status:'ACTIVE',lines:[{product:'Synthetic 32 inch TV',productId:'OLD',qty:1,price:1000}]}],receipts:[],inventoryTxns:[],undoLog:[],cashLog:[],cashBalances:{'Cash in Hand':100},warranties:[]};
 let durable=structuredClone(db),saves=0,fail='',outbox=[],failed=[],pullChange=null,pushError='',roleValue=role;
 const state={initialized:true,deviceAccessStatus:'ACTIVE',signedInEmail:'synthetic@example.invalid',deviceId:'SYN-DEVICE',syncOwnerId:'SYN-OWNER'};
 const syntheticClient={},syntheticSession={user:{id:'SYN-OWNER'}};
 const c={DB:db,DB_KEY:'synthetic-db',window:null,console,AbortController,setTimeout,clearTimeout,TextEncoder,Uint8Array,crypto:crypto.webcrypto,navigator:{onLine:true},session:{cashier:'Synthetic Owner',tel:''},nowISO:()=>new Date().toISOString(),getLatestMonth:()=>({year:2026,month:11}),round2:n=>Math.round(n*100)/100,render(){},document:{getElementById:()=>null},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}},dispatchEvent(){},stockOnHand:name=>c.DB.stockRows.filter(r=>r.productName===name&&r.year===2026&&r.month===11).reduce((s,r)=>s+Number(r.rStock),0),saveDB(){saves++;if(fail==='before')throw Error('SYNTHETIC_SAVE_HOLD');durable=structuredClone(c.DB);outbox.push({opId:c.DB.inventoryTxns.at(-1).details.tradeIn.operationId});if(fail==='after')throw Error('SYNTHETIC_QUEUE_FAILURE');},ZEZMS:{staffAuth:{getContext:()=>({role:roleValue,user:roleValue?{id:'SYN-STAFF',name:'Synthetic '+roleValue}:null})},db:{load:()=>structuredClone(durable)},warrantyManagement:{createForCompletedSale:()=>({created:[]})},cloudSync:{getClient:()=>syntheticClient,getSession:()=>syntheticSession,currentSyncOwnerId:()=>state.syncOwnerId,getState:()=>state,isReadyForLocalOperations:()=>true,isApplyingRemote:()=>false,getOutbox:()=>outbox,getFailedOperations:()=>failed,pullNow:async()=>{if(pullChange)pullChange();},pushNow:async()=>{if(pushError)throw Error(pushError);outbox=[];}},cashWallets:{keyFromSelection:key=>key,getByKey:key=>({balanceKey:key,status:'ACTIVE'}),isActive:key=>key==='Cash in Hand',label:key=>key}}};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/sync-resilience.js','utf8'),c);
 const html=assembled();
 vm.runInContext(section(html,'function normalizeVatPercent(value){','function resetSaleWithholdingTaxControl('),c);
 vm.runInContext(section(html,'function recordSaleOutFIFO(productName, qty, uPrice, disc){','function getOrCreateDebtorID('),c);
 vm.runInContext(section(html,'function adjustCash(type, action, amount, note){','function doCashMove('),c);
 const baseCash=c.adjustCash;c.adjustCash=(wallet,action,amount,note,meta)=>{baseCash(wallet,action,amount,note);const e=c.DB.cashLog.at(-1);e.meta=meta;return e;};
 c.idStamp=prefix=>prefix+crypto.randomUUID();
 vm.runInContext(fs.readFileSync('js/tv-trade-ins.js','utf8'),c);
 const input={sourceKind:'RECEIPT',sourceSaleId:'OLD-SALE',sourceLineIndex:'0',sourceUnit:'1',serial:'SERIAL-1234',purchaseConfirmed:true,verificationNote:'Matched customer receipt and physical television.',condition:'Fully working, minor cosmetic wear.',checks:{picture:true,sound:true,inputs:true,controls:true,screen:true,power:true},originalScreen:'32',newScreen:'55',newProductId:'NEW',newPrice:'3000',credit:'500',resalePrice:'800',cash:'2500',vatPercent:'0',withholdingPercent:'0',wallet:'Cash in Hand'};
 return {c,input,api:c.ZEZMS.tvTradeIns,db:()=>c.DB,durable:()=>durable,saves:()=>saves,state,setRole:r=>roleValue=r,fail:v=>fail=v,pullChange:fn=>pullChange=fn,pushError:v=>pushError=v,outbox:()=>outbox,failed};
}
test('preview is read-only and produces the same collision-resistant claim on every device',async()=>{
 const f=fixture(),before=JSON.stringify(f.db()),p=await f.api.prepare(f.input),other=fixture();other.state.deviceId='OTHER';const q=await other.api.prepare(other.input);
 assert.equal(p.operationId,q.operationId);assert.match(p.operationId,/^TVTI-[a-f0-9]{64}$/);assert.equal(JSON.stringify(f.db()),before);assert.equal(f.saves(),0);
});
test('accepted TV becomes distinct used stock immediately; only the additional payment increases cash',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input),result=await f.api.accept(p),db=f.db();
 assert.equal(result.pending,false);assert.equal(f.saves(),1);assert.equal(db.stockRows[0].rStock,2);assert.equal(db.stockRows[0].profit,1000);
 const used=db.stockRows[1];assert.equal(used.qtyIn,1);assert.equal(used.rStock,1);assert.equal(used.uCost,500);assert.equal(used.uPrice,800);assert.equal(used.condition,'USED');assert.notEqual(used.productId,'OLD');
 assert.equal(db.cashBalances['Cash in Hand'],2600);assert.equal(db.cashLog.length,1);assert.equal(db.cashLog[0].amount,2500);
 const receipt=db.receipts[0],sale=db.sales[1];assert.equal(receipt.amountPaid,3000);assert.equal(sale.paid,3000);assert.equal(receipt.cashReceived,2500);assert.equal(receipt.tradeInCredit,500);assert.equal(receipt.balance,0);assert.equal(receipt.tradeInId,p.tradeInId);
 assert.equal(db.inventoryTxns[0].details.tradeIn.newSaleId,receipt.receiptNo);assert.equal(db.inventoryTxns[0].details.tradeIn.approvedBy.id,'SYN-STAFF');assert.equal(db.undoLog.length,2);
 assert.equal(f.durable().inventoryTxns.length,1);await assert.rejects(f.api.accept(p),/already has a trade-in/);assert.equal(f.saves(),1);
});
test('existing tax calculations are reused; total settlement includes credit but cash does not',async()=>{
 const f=fixture();Object.assign(f.input,{vatPercent:'15',withholdingPercent:'3',cash:'2860'});const p=await f.api.prepare(f.input);assert.equal(p.taxes.grossAmountDue,3450);assert.equal(p.taxes.withholdingTax,90);assert.equal(p.taxes.netAmountCollectible,3360);await f.api.accept(p);assert.equal(f.db().cashBalances['Cash in Hand'],2960);assert.equal(f.db().sales[1].paid,3360);assert.equal(f.db().sales[1].total,3450);
});
test('faulty, unverified, ambiguous and missing original sale identities are rejected without saving',async()=>{
 const changes=[f=>f.input.checks.picture=false,f=>f.input.purchaseConfirmed=false,f=>f.input.verificationNote='short',f=>f.input.sourceSaleId='UNKNOWN',f=>f.db().sales[0].status='VOID',f=>f.db().customers=[],f=>f.db().sales.push(structuredClone(f.db().sales[0])),f=>f.db().products[0].category='FRIDGE',f=>{f.db().products[0].category='FRIDGE';f.db().products[0].name='Synthetic fridge';f.db().sales[0].lines[0].product='Synthetic fridge';}];
 // A TV name remains valid when the category itself is broad; the last change removes both signals.
 changes.splice(7,1);
 for(const change of changes){const f=fixture();change(f);await assert.rejects(f.api.prepare(f.input));assert.equal(f.saves(),0);}
});
test('serial evidence rejects a different physical television; missing historical serial requires explicit manual evidence',async()=>{
 const f=fixture();f.db().warranties=[{saleTransactionId:'OLD-SALE',sourceLineIndex:0,serialNumber:'SERIAL-OTHER',status:'Active'}];await assert.rejects(f.api.prepare(f.input),/does not match/);f.db().warranties[0].serialNumber='serial 1234';assert.equal((await f.api.prepare(f.input)).serialEvidence,'MATCHED_WARRANTY_SERIAL');
});
test('unit quantities, upgrade size, money, tax and payment validation fail closed',async()=>{
 for(const [key,value]of [['sourceUnit','2'],['sourceUnit','0'],['sourceLineIndex','1'],['serial','ab'],['originalScreen','55'],['newScreen','31'],['credit','3000'],['credit','-1'],['resalePrice','0'],['newPrice','1e4'],['vatPercent','101'],['cash','2499'],['cash','2501'],['cash','2500.001'],['wallet','ARCHIVED'],['newProductId','OLD']]){const f=fixture();f.input[key]=value;await assert.rejects(f.api.prepare(f.input),undefined,key);assert.equal(f.saves(),0);}
});
test('Owner/Admin authority and device readiness are rechecked at commit',async()=>{
 for(const role of ['CASHIER','MANAGER','AUDITOR','']){const f=fixture(role);await assert.rejects(f.api.prepare(f.input),/Owner or Admin/);}
 const f=fixture('ADMIN'),p=await f.api.prepare(f.input);f.setRole('CASHIER');await assert.rejects(f.api.accept(p),/Owner or Admin/);assert.equal(f.saves(),0);
 for(const patch of [{initialized:false},{deviceAccessStatus:'REVOKED'},{signedInEmail:''},{integrityWarning:true},{oldClientDetected:true}]){const g=fixture(),q=await g.api.prepare(g.input);Object.assign(g.state,patch);await assert.rejects(g.api.accept(q));assert.equal(g.saves(),0);}
 const offline=fixture(),op=await offline.api.prepare(offline.input);offline.c.navigator.onLine=false;await assert.rejects(offline.api.accept(op),/Connect to Cloud/);
});
test('changed original sale, customer, product, stock, period, device or staff prevents a stale preview from posting',async()=>{
 for(const change of [f=>f.db().sales[0].lines[0].price=999,f=>f.db().customers[0].name='Changed',f=>f.db().products[1].uPrice=3100,f=>f.db().stockRows[0].uCost=2100,f=>f.state.deviceId='OTHER',f=>f.c.getLatestMonth=()=>({year:2026,month:12}),f=>f.setRole('ADMIN')]){const f=fixture(),p=await f.api.prepare(f.input);f.pullChange(()=>change(f));await assert.rejects(f.api.accept(p));assert.equal(f.saves(),0);}
});
test('failed pre-commit storage save restores every in-memory business record',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input),before=JSON.stringify(f.db());f.fail('before');await assert.rejects(f.api.accept(p),/SYNTHETIC_SAVE_HOLD/);assert.equal(JSON.stringify(f.db()),before);assert.equal(f.durable().inventoryTxns.length,0);
});
test('a durable posting followed by bookkeeping failure is preserved and cannot be submitted again',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input);f.fail('after');await assert.rejects(f.api.accept(p),/saved locally.*Do not submit/);assert.equal(f.db().inventoryTxns.length,1);assert.equal(f.durable().inventoryTxns.length,1);assert.equal(f.db().cashBalances['Cash in Hand'],2600);await assert.rejects(f.api.prepare(f.input),/already has/);
});
test('uncertain Cloud acknowledgement leaves one durable local posting, pending status and unchanged credit',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input);f.pushError('Synthetic network interruption');const r=await f.api.accept(p);assert.equal(r.pending,true);assert.match(r.syncError,/network/);assert.equal(f.outbox().length,1);assert.equal(f.saves(),1);assert.equal(f.db().cashLog.length,1);
});
test('concurrent accept clicks cannot overlap; reused serials and source units cannot duplicate',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input),first=f.api.accept(p);await assert.rejects(f.api.accept(p),/already running/);await first;
 const other=structuredClone(f.input);other.sourceSaleId='SECOND';f.db().sales.push({...structuredClone(f.db().sales[0]),id:'SECOND',receiptNo:'SECOND'});await assert.rejects(f.api.prepare(other),/serial number already/);
});
test('linked original purchase, upgrade, acquisition and cash cannot be partially edited or reversed',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input),r=await f.api.accept(p);for(const id of [r.tradeInId,r.receiptNo,'SALE:'+r.receiptNo,'OLD-SALE'])assert.throws(()=>f.api.blockPartial(id),/must stay together/);assert.throws(()=>f.api.blockCash(f.db().cashLog[0].id),/must stay together/);assert.doesNotThrow(()=>f.api.blockPartial('UNRELATED'));
 const html=f.api.receiptHTML({receiptNo:r.receiptNo});assert.match(html,/500.00/);assert.match(html,/2,500.00/);assert.equal(f.api.receiptPDFRows({receiptNo:r.receiptNo}).length,3);
});
test('the production operation builder uses one deterministic claim ID for all linked patches',async()=>{
 const f=fixture(),p=await f.api.prepare(f.input);await f.api.accept(p);const c={COLLECTIONS:['sales','receipts','stockRows','products','inventoryTxns','cashLog'],state:{deviceSeq:0,deviceId:'Synthetic'},persistState(){},diffRoot(){},diffCollection(collection,before,after,patches){for(const item of after)patches.push({action:'insert',collection,key:item.id || item.receiptNo,value:item});},inferKind:()=> 'STOCK_IN',makeUUID:()=> 'random-id',sealOperation:op=>op,APP_VERSION:'3.31.19'};vm.createContext(c);vm.runInContext(section(assembled(),'  function buildOperation(before, after, reason) {','  function findEntity('),c);const op=c.buildOperation({},f.db(),'database-save');assert.equal(op.opId,p.operationId);assert.ok(op.patches.some(p=>p.collection==='products'));assert.ok(op.patches.some(p=>p.collection==='sales'));assert.ok(op.patches.some(p=>p.collection==='inventoryTxns'));
});
test('new transaction and guard edit sites are the only changes to the assembled production app',()=>{
 const before=execFileSync('git',['show','fbbf50afe60d18d74a8bfc09889d25c6185bb810:index.html'],{maxBuffer:32*1024*1024}).toString();const strip=s=>s.replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY');assert.equal(strip(transform.withoutTradeIns(require('../tools/daily-barcode-transform.cjs').withoutDailyBarcodes(assembled()))),strip(delivery.assembledShell(before)));
 assert.throws(()=>transform.transformTradeIns('<html></html>','',transform.edits()),/MARKER/);
});
test('warranty is prepared without a second save and belongs to the same stock-in operation kind',async()=>{
 const f=fixture();f.c.ZEZMS.warrantyManagement.createForCompletedSale=(detail,options)=>{assert.equal(options.noSave,true);f.db().warranties.push({warrantyId:'SYN-WAR',saleTransactionId:detail.transactionId});};await f.api.accept(await f.api.prepare(f.input));assert.equal(f.saves(),1);assert.equal(f.db().warranties.length,1);
 const c={};vm.createContext(c);vm.runInContext(section(assembled(),'  function inferKind(patches) {','  function buildOperation('),c);assert.equal(c.inferKind([{action:'insert',collection:'warranties',value:{warrantyId:'W1'}},{action:'insert',collection:'inventoryTxns',value:f.db().inventoryTxns[0]}]),'STOCK_IN');
});
test('unacknowledged acquisition stock cannot be resold; normal acknowledged used stock remains available',async()=>{
 const f=fixture();f.pushError('Synthetic timeout');await f.api.accept(await f.api.prepare(f.input));const used=f.db().products.at(-1);assert.throws(()=>f.api.assertResalable(used.name),/Wait for.*acknowledgement/);
 const g=fixture();await g.api.accept(await g.api.prepare(g.input));assert.doesNotThrow(()=>g.api.assertResalable(g.db().products.at(-1).name));
});
test('competing device payloads for the same trade-in claim cannot receive a false acknowledgement',async()=>{
 const a=fixture(),b=fixture();b.input.credit='600';b.input.cash='2400';const p=await a.api.prepare(a.input),q=await b.api.prepare(b.input);assert.equal(p.operationId,q.operationId);
 const op1={opId:p.operationId,kind:'STOCK_IN',patches:[{action:'insert',collection:'inventoryTxns',key:p.tradeInId,value:{credit:p.credit,cash:p.cash}}]},op2={opId:q.operationId,kind:'STOCK_IN',patches:[{action:'insert',collection:'inventoryTxns',key:q.tradeInId,value:{credit:q.credit,cash:q.cash}}]},hash=op=>crypto.createHash('sha256').update(JSON.stringify(op)).digest('hex');
 await assert.rejects(b.c.ZEZMS.syncResilience.transport.push({operation:op2,hash,send:async()=>({data:[{server_seq:12}]}),read:async()=>({data:{seq:12,op_id:op1.opId,payload:op1}})}),/PAYLOAD_CONFLICT/);
 assert.ok(assembled().includes("operation.kind === 'STOCK_IN' && operation.patches.some"));
});

test('background renders preserve the inspection form; a different staff role gets a new form',()=>{
 const f=fixture(),root={html:'',writes:0,get innerHTML(){return this.html;},set innerHTML(value){this.html=value;this.writes++;},querySelector(){return this.html.includes('id="tvTradeIns"')?{}:null;}};
 f.c.currentView='pos';f.c.document.getElementById=id=>id==='viewRoot'?root:null;f.api.open();assert.equal(root.writes,1);for(let i=0;i<10;i++)f.c.render();assert.equal(root.writes,1);f.setRole('ADMIN');f.c.render();assert.equal(root.writes,2);
});

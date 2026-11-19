'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cloud=Buffer.from(source.match(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/)[1],'base64').toString('utf8');
const integrity=Buffer.from([...source.match(/const INTEGRITY_B64=([\s\S]*?);/)[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(x=>x[1]).join(''),'base64').toString('utf8');
function fixture(device='synthetic-main',options={}){
 const db=options.database||{products:[{id:'P1',name:'Synthetic affected',uPrice:20},{id:'P2',name:'Synthetic other',uPrice:20}],stockRows:[{id:'L1',productId:'P1',productName:'Synthetic affected',year:2026,month:11,qtyIn:2,qtyOut:0,rStock:2,uCost:5,uPrice:20},{id:'L2',productId:'P2',productName:'Synthetic other',year:2026,month:11,qtyIn:134,qtyOut:0,rStock:134,uCost:5,uPrice:20}],stockCorrections:[],selectedYear:2026,selectedMonth:11,cashBalances:{'Cash in Hand':100,Others:0,MOMO:0},sales:[],receipts:[],inventoryTxns:[],cashLog:[],expenses:[],saleLines:[],accountTxns:[]};
 const store=new Map([['zezms_cloud_sync_m4_state',JSON.stringify({deviceId:device,deviceName:device,deviceAccessMode:'OWNER',syncOwnerId:'synthetic-owner',businessId:'synthetic-business',initialized:true,cursor:3957,deviceSeq:0,liveSyncEnabled:false,liveSyncDesired:false,configurationVerificationRequired:options.configurationVerificationRequired===true,supabaseUrl:'',publishableKey:'',lastError:''})],['zezms_cloud_sync_m4_queue',JSON.stringify(options.queue||[])],['zezms_cloud_sync_m4_failed_v2','[]']]);
 const writes=[],timers=[];
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>{writes.push(k);store.set(k,String(v));},removeItem:k=>{writes.push(k);store.delete(k);}};
 const document={readyState:'loading',addEventListener(){},getElementById:()=>null,createElement:()=>({style:{},setAttribute(){},remove(){},click(){}}),head:{appendChild(){}},documentElement:{setAttribute(){},getAttribute:()=>null}};
 const c={DB:db,DB_KEY:'tradeflow_v321_zola',APP_VERSION:'synthetic',crypto:crypto.webcrypto,localStorage,session:{cashier:'Synthetic Owner'},getLatestMonth:()=>({year:2026,month:11}),document,navigator:{onLine:true},location:{origin:'https://synthetic.invalid',href:'https://synthetic.invalid/',pathname:'/'},console:{log(){},warn(){},error(){}},setTimeout:(fn,n)=>{timers.push({fn,n});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{},URL,TextEncoder,TextDecoder,Uint8Array,atob,btoa,performance,ZEZMS:{staffAuth:{getContext:()=>({role:'OWNER'})}},render(){}};
 c.window=c;c.saveDB=()=>{localStorage.setItem(c.DB_KEY,JSON.stringify(c.DB));c.ZEZMS.cloudSync.onLocalSave('database-save');};
 vm.createContext(c);
 const end=cloud.lastIndexOf('}());');
 const hook='\nwindow.__fixture={ready(){ensureSyncIds(DB);observedSnapshot=cleanSnapshot(DB);initSettled=true;},transport(c,s){client=c;session=s;},wire:wireOperation};\n';
 vm.runInContext(cloud.slice(0,end)+hook+cloud.slice(end),c,{timeout:10000});
 c.__fixture.ready();localStorage.setItem(c.DB_KEY,JSON.stringify(c.DB));
 vm.runInContext(fs.readFileSync(path.join(root,'js/stock-corrections-v3150.js'),'utf8'),c,{timeout:10000});
 vm.runInContext(integrity,c,{timeout:10000});
 writes.length=0;
 return {c,db:c.DB,store,writes,timers,sync:c.ZEZMS.cloudSync,api:c.ZEZMS.stockCorrections,integrity:c.ZEZMS.syncIntegrity};
}
module.exports={fixture,root,cloud,integrity};
if(require.main===module){const f=fixture();f.api.commitCorrection(f.api.preparePhysicalCount({productId:'P1',physicalCount:'0'}));console.log(JSON.stringify({queue:f.sync.getOutbox().map(o=>({kind:o.kind,patches:o.patches.length,attempts:o.attempts})),qty:f.db.stockRows[0].rStock,warning:f.integrity.viewHTML().includes('Actionable integrity issue detected.')}));}

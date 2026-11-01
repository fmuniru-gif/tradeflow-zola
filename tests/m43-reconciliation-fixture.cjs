'use strict';
const {fixture,cloud}=require('./stock-correction-sync-fixture.cjs'),crypto=require('node:crypto');
const copy=x=>JSON.parse(JSON.stringify(x));
const ids={owner:'11111111-1111-4111-8111-111111111111',other:'22222222-2222-4222-8222-222222222222',business:'33333333-3333-4333-8333-333333333333',branch:'44444444-4444-4444-8444-444444444444',evidence:'55555555-5555-4555-8555-555555555555',life:'66666666-6666-4666-8666-666666666666'};
function scenario(){
 const original=fixture(),before=copy(original.c.DB);
 original.api.commitCorrection(original.api.preparePhysicalCount({productId:'P1',physicalCount:'0',notes:'SYNTHETIC missing delivery'}));
 const raw=Object.fromEntries(original.store),s=JSON.parse(raw.zezms_cloud_sync_m4_state);
 Object.assign(s,{syncOwnerId:ids.owner,businessId:ids.business,branchId:ids.branch,liveSyncEnabled:false,liveSyncDesired:false});
 raw.zezms_cloud_sync_m4_state=JSON.stringify(s);raw.zezms_cloud_sync_m4_queue='[]';raw.zezms_cloud_sync_m4_applied_v2='{}';
 const f=fixture('synthetic-main',{raw}),operation=copy(original.sync.getOutbox()[0]);
 Object.assign(operation,{opId:'new-compensating-delivery-synthetic',deviceSeq:s.deviceSeq+1,createdAt:'2026-11-02T08:00:00.000Z',reason:'Owner-reviewed delivery of existing audit'});
 operation.payloadHash=f.sync._test.deterministicHash(operation);
 const evidence={evidence_id:ids.evidence,owner_id:ids.owner,business_id:ids.business,branch_id:ids.branch,device_id:s.deviceId,correction_id:f.c.DB.stockCorrections[0].correctionId,operation,audit:copy(f.c.DB.stockCorrections[0]),stock_before:before.stockRows[0],product:before.products[0],operational_year:2026,operational_month:11};
 return {f,before,evidence,originalOperation:copy(original.sync.getOutbox()[0])};
}
function ioFor(f,options={}){
 const sha=async text=>crypto.createHash('sha256').update(text).digest('hex');
 return {storage:f.c.localStorage,sync:f.sync,database:()=>f.c.DB,sha,cloudSHA:()=>sha(cloud),hash:f.sync._test.deterministicHash,guard:async()=>{},...options};
}
module.exports={scenario,ioFor,ids,copy,fixture,cloud};

'use strict';
// Exact staged Git bytes. Normal HTTP fixtures never normalize assets or rebuild
// the worker: otherwise generator/fixture agreement can mask a broken manifest.
// Re-sign only the pre-existing, explicitly requested activation variant.
const delivery=require('../tools/build-pr11-delivery.cjs');
let previousVariant,bundle;
function fixtureBundle(activationVariant=false){
  if(bundle&&previousVariant===activationVariant)return bundle;
  let index=delivery.assetBytes('index.html').toString('utf8');
  if(activationVariant){
    index=index.replace(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/,(_all,b64)=>{
      const cloud=Buffer.from(b64,'base64').toString('utf8');
      if(!cloud.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;'))throw Error('Synthetic activation marker missing');
      return 'const CLOUD_B64="'+Buffer.from(cloud.replace('var SHOP_TRADING_ACTIVATION_ENABLED=false;','var SHOP_TRADING_ACTIVATION_ENABLED=true;')).toString('base64')+'";';
    });
    index=delivery.finishShell(index);
  }
  const rawWorker=delivery.assetBytes('sw.js').toString('utf8');
  const worker=activationVariant?delivery.finishWorker(rawWorker,index):rawWorker;
  previousVariant=activationVariant;bundle={index,worker};return bundle;
}
function fixtureAsset(file,activationVariant=false){
  if(file==='index.html')return Buffer.from(fixtureBundle(activationVariant).index);
  if(file==='sw.js')return Buffer.from(fixtureBundle(activationVariant).worker);
  return delivery.assetBytes(file);
}
module.exports={fixtureAsset,fixtureBundle};

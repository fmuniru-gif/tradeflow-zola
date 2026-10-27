'use strict';
// Canonical Git text bytes, plus the existing explicit synthetic activation
// variant. Re-sign only that deliberate fixture; never re-sign fault responses.
const fs=require('node:fs'),path=require('node:path');
const delivery=require('../tools/build-pr11-delivery.cjs');
const root=path.resolve(__dirname,'..');
let previousVariant,bundle;
function fixtureBundle(activationVariant=false){
  if(bundle&&previousVariant===activationVariant)return bundle;
  let index=delivery.normalized(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  if(activationVariant){
    index=index.replace(/const CLOUD_B64="([A-Za-z0-9+/=]+)";/,(_all,b64)=>{
      const cloud=Buffer.from(b64,'base64').toString('utf8');
      if(!cloud.includes('var SHOP_TRADING_ACTIVATION_ENABLED=false;'))throw Error('Synthetic activation marker missing');
      return 'const CLOUD_B64="'+Buffer.from(cloud.replace('var SHOP_TRADING_ACTIVATION_ENABLED=false;','var SHOP_TRADING_ACTIVATION_ENABLED=true;')).toString('base64')+'";';
    });
    index=delivery.finishShell(index);
  }
  const worker=delivery.finishWorker(delivery.normalized(fs.readFileSync(path.join(root,'sw.js'),'utf8')),index);
  previousVariant=activationVariant;bundle={index,worker};return bundle;
}
function fixtureAsset(file,activationVariant=false){
  if(file==='index.html')return Buffer.from(fixtureBundle(activationVariant).index);
  if(file==='sw.js')return Buffer.from(fixtureBundle(activationVariant).worker);
  return delivery.canonicalFile(file);
}
module.exports={fixtureAsset,fixtureBundle};

'use strict';
/** Remove exactly the reviewed r70W embedded Cloud additions for legacy code
 * preservation comparisons. Fail if an expected anchor is absent or repeated. */
function undoR70W(source){
 let s=String(source);
 const changes=[
  [ '\n  var r70wEntry=r70wReplayEntry(row,operation);\n  if (r70wEntry) return r70wEntry;', '' ],
  [ '\n  if (plan.r70wExactChain) {\n    if (!r70wReplayEntry(row,operation) || !r70wSame(getDatabase().sharedDeviceDirectory,r70wActivePlan.finalDirectory))\n      throw new Error("ZEZMS_R70W_STOP_FINAL_DIRECTORY_NOT_MATERIALIZED");\n    return true;\n  }', '' ],
  [ '\n    var r70wPlan=await r70wPreflightExactShopChain(candidate,activationProof);', '' ],
  [ '\n    if(r70wPlan){r70wMaterializeFinalDirectory(r70wPlan);r70wActivePlan=r70wPlan;}', '' ],
  [ '\n  } finally {\n    r70wActivePlan=null;', '' ]
 ];
 for(const [old,replacement] of changes){
  if(s.split(old).length!==2)throw Error('R70W_SOURCE_DIFF_NOT_RECOGNIZED: '+old.slice(0,55));
  s=s.replace(old,replacement);
 }
 const start='\n/* R70W_SHOP_CHROME_EXACT_DIRECTORY_CHAIN_REVIEW_START */';
 const end='/* R70W_SHOP_CHROME_EXACT_DIRECTORY_CHAIN_REVIEW_END */\n';
 if(s.split(start).length!==2||s.split(end).length!==2)throw Error('R70W_SOURCE_BLOCK_NOT_UNIQUE');
 const a=s.indexOf(start),b=s.indexOf(end,a);
 if(a<0||b<a)throw Error('R70W_SOURCE_BLOCK_ORDER');
 if(s[b+end.length]!=="\n")throw Error("R70W_SOURCE_BLOCK_TRAILING_LINE");
 s=s.slice(0,a)+s.slice(b+end.length+1);
 return s;
}
module.exports={undoR70W};

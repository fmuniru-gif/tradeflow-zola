const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function undoRecoveryCloud(cloud){
 const fragment=fs.readFileSync(path.join(__dirname,'../js/canonical-recovery-sync.js'),'utf8');
 const inserted='/* CANONICAL_RECOVERY_BRIDGE_BEGIN */\n'+fragment+'/* CANONICAL_RECOVERY_BRIDGE_END */\n';
 assert.equal(cloud.split(inserted).length,2,'exact reviewed recovery bridge');cloud=cloud.replace(inserted,'');
 for(const name of ['pauseForCanonicalRecovery','inspectCanonicalRecoveryQueue','prepareCanonicalRecovery','getCanonicalRecoveryPreparation','completeCanonicalRecoveryPreparation']){
  const value=name==='getCanonicalRecoveryPreparation'?'canonicalRecoveryPreparationSummary':name;
  const line='\n    '+name+': '+value+',';assert.equal(cloud.split(line).length,2);cloud=cloud.replace(line,'');
 }
 return cloud;
}
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),baseline='a3d30228cfcf2c1577209d779534164bc72452f9';
const baselineIndex=execFileSync('git',['show',baseline+':index.html'],{cwd:root,maxBuffer:32*1024*1024}).toString();
const recoveryFiles=new Set(['index.html','sw.js','js/bootstrap-startup-guard.js','tools/build-pr11-delivery.cjs','tests/prelogin-release.test.cjs','tests/prebranch-functional-rollback.test.cjs','tests/shop-directory-delivery.test.cjs','tests/shop-chrome-bootstrap.browser.cjs','tests/desktop-ui-performance.test.cjs','tests/main-responsiveness.test.cjs','tests/pr11-cache-delivery.test.cjs','tests/pr11-cache-delivery.browser.cjs','tests/pr12-raw-byte-delivery.test.cjs','tests/remaining-tabs-performance.test.cjs']);
function withoutRecoveryIndex(index){
 for(const [name,file] of [['CLOUD',null],['CANONICAL_RESTORE','js/canonical-restore.js'],['SELF_SERVICE_RECOVERY_R62W','js/self-service-recovery.js']]){
  const pattern=new RegExp('const '+name+'_B64="([^\"]+)";');
  const match=index.match(pattern),old=baselineIndex.match(pattern);assert.ok(match&&old,name);
  const actual=Buffer.from(match[1],'base64').toString();
  if(file)assert.equal(actual,fs.readFileSync(path.join(root,file),'utf8'),name+' reviewed source');
  else assert.equal(undoRecoveryCloud(actual),Buffer.from(old[1],'base64').toString(),'all other M4/3 bytes');
  index=index.replace(match[0],old[0]);
 }
 return index;
}
function withoutRecoveryGuardCoupling(html){
 for(const name of ['bootstrap-startup-guard.js','auto-month-rollover-bootstrap-guard.js']){
  const tag='<script data-zezms-recovery-module="'+name+'">\n';
  const start=html.indexOf(tag);assert.ok(start>=0,name);
  const end=html.indexOf('</script>',start);
  assert.equal(html.slice(start+tag.length,end).trim(),fs.readFileSync(path.join(root,'js',name),'utf8').replace(/<\/script/gi,'<\\/script').trim());
  html=html.slice(0,start)+'<script src="js/'+name+'?v=20261024-ui-stock-review-r1"></script>'+html.slice(end+9);
 }
 return html;
}
module.exports={undoRecoveryCloud,withoutRecoveryIndex,withoutRecoveryGuardCoupling,recoveryFiles,baseline};

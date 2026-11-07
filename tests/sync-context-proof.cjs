// Remove only the independently reviewed sync-context/receive-queue edit sites.
// Whole-output equality then protects every other assembled application byte.
const assert=require('node:assert/strict');
function withoutContextQueue(html){
 html=require('../tools/tv-trade-in-transform.cjs').withoutTradeIns(html);
 function section(start,end){assert.equal(html.split(start).length,2,start);const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(b>a,end);html=html.slice(0,a)+'SYNC-CONTEXT-REVIEWED-SECTION\n'+html.slice(b);}
 section('  async function pushOne(operation) {','  async function publishRoot(');
 section('  async function fetchOperationsAfter(cursor) {','  async function fetchAllOperationsAfter(');
 section('  async function fetchMaster() {','  function recordFromResult(');
 section('  async function fetchM43Checkpoint() {','  async function fetchCloudAuditBundle() {');
 const start=html.includes('  var resilienceQueuedPull = null;')?'  var resilienceQueuedPull = null;':'  function pullNow(silent) {';
 section(start,'  function flushQueue(showNotice) {');
 assert.equal((html.match(/<script data-zezms-sync-resilience>/g)||[]).length,1);
 return html.replace(/<script data-zezms-sync-resilience>[\s\S]*?<\/script>/,'SYNC-CONTEXT-REVIEWED-HELPER').replace(/<meta name="zezms-delivery" content="[^"]+">/,'DELIVERY-METADATA');
}
module.exports={withoutContextQueue};

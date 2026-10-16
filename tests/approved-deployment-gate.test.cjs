const {test}=require('node:test');
const assert=require('node:assert/strict');
const gate=require('../scripts/approved-deployment-gate.cjs');
const sha='a'.repeat(40),baseline='b'.repeat(40),files=['index.html','sw.js'];
const ready={reviewedSha:sha,approvedSha:sha,approvedByOwner:true,baselineSha:baseline,remoteMainSha:baseline,testsPassed:true,expectedFiles:files,actualFiles:files};
test('deployment gate refuses unapproved, changed and unverified releases',()=>{
  assert.equal(gate.assess(ready),'READY_FOR_AUTHORIZED_GITHUB_MERGE');
  for(const invalid of [
    {approvedByOwner:false},{approvedSha:'c'.repeat(40)},{approvedSha:''},
    {remoteMainSha:'c'.repeat(40)},{testsPassed:false},{actualFiles:['index.html','sw.js','secret.sql']}
  ])assert.match(gate.assess({...ready,...invalid}),/^STOP:/);
});
test('simulated GitHub failure halts before Pages verification',()=>{
  assert.match(gate.requireSuccessfulMutation({exitCode:1,remoteSha:baseline,approvedSha:sha}),/^STOP:/);
  assert.match(gate.requireSuccessfulMutation({exitCode:0,remoteSha:baseline,approvedSha:sha}),/^STOP:/);
  assert.equal(gate.requireSuccessfulMutation({exitCode:0,remoteSha:sha,approvedSha:sha}),'VERIFY_PAGES');
});

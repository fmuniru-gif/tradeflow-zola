/* Read-only preflight for a separately Owner-approved deployment. Never pushes. */
const {execFileSync}=require('node:child_process');
const SHA=/^[0-9a-f]{40}$/;
function assess({reviewedSha,approvedSha,approvedByOwner,baselineSha,remoteMainSha,testsPassed,expectedFiles,actualFiles}){
  if(approvedByOwner!==true||!SHA.test(approvedSha||'')||approvedSha!==reviewedSha)return 'STOP: exact reviewed commit lacks explicit Owner approval';
  if(!SHA.test(baselineSha||'')||remoteMainSha!==baselineSha)return 'STOP: production main advanced or baseline cannot be verified';
  if(testsPassed!==true)return 'STOP: verification gate did not pass';
  if(!Array.isArray(expectedFiles)||!Array.isArray(actualFiles)||
     JSON.stringify([...expectedFiles].sort())!==JSON.stringify([...actualFiles].sort()))return 'STOP: changed-file set differs from review';
  return 'READY_FOR_AUTHORIZED_GITHUB_MERGE';
}
function requireSuccessfulMutation(result){
  if(!result||result.exitCode!==0||result.remoteSha!==result.approvedSha)return 'STOP: GitHub mutation failed or returned an unexpected commit';
  return 'VERIFY_PAGES';
}
if(require.main===module){
  const cwd=process.cwd();
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
  try{
    const input=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
    const remoteMainSha=git('ls-remote','origin','refs/heads/main').split(/\s/)[0];
    const actualFiles=git('diff','--name-only',input.baselineSha,input.reviewedSha).split(/\r?\n/).filter(Boolean);
    const result=assess({...input,remoteMainSha,actualFiles});
    process.stdout.write(result+'\n');
    if(result!=='READY_FOR_AUTHORIZED_GITHUB_MERGE')process.exitCode=2;
  }catch(error){process.stderr.write('STOP: deployment preflight could not verify local input and remote main\n');process.exitCode=2;}
}
module.exports={assess,requireSuccessfulMutation};

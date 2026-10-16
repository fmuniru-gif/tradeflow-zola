const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline='d7e0cfbce8f75f9568a3e24bfdabf982ee9ce89c';
const file=name=>fs.readFileSync(path.join(root,name),'utf8');
const old=name=>execFileSync('git',['show',baseline+':'+name],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});

test('pre-login inspector source and embedded shell payload remain unchanged',()=>{
  const normalize=text=>text.replace(/\r\n/g,'\n');
  assert.equal(normalize(file('js/prelogin-verified-activation-r70u.js')),normalize(old('js/prelogin-verified-activation-r70u.js')));
  const embedded=text=>text.match(/const PRELOGIN_VERIFIED_ACTIVATION_R70U_B64="([^"]+)";/)?.[1];
  assert.ok(embedded(file('index.html')));
  assert.equal(embedded(file('index.html')),embedded(old('index.html')));
});

test('review-only SQL changes one guarded projection and preserves auth, 23 columns and ACL',()=>{
  const sql=file('sql/REVIEW_ONLY_R70V_CANONICAL_FLEET_ACCESS.sql');
  assert.equal((sql.match(/create or replace function public\.zezms_m5a4_canonical_fleet_read\(/gi)||[]).length,1);
  assert.match(sql,/R70V_CANONICAL_FLEET_DEFINITION_DRIFT/);
  assert.match(sql,/if auth\.uid\(\) is null/);
  assert.match(sql,/public\.zezms_has_business_role\(p_business_id,array\['OWNER','ADMIN'\]\)/);
  assert.match(sql,/where life\.business_id=p_business_id/);
  assert.match(sql,/not exists\s*\([\s\S]*?revoked_access\.status='REVOKED' or revoked_access\.revoked_at is not null/);
  assert.match(sql,/access_row\.device_id is null and registered_row\.user_id=life\.owner_id/);
  assert.doesNotMatch(sql,/\b(?:grant|revoke|insert|update|delete|truncate|drop|alter)\b\s+(?:on|into|public\.|table|function)/i);
  const table=sql.match(/returns table\(([\s\S]*?)\)\s*language plpgsql/i);
  assert.ok(table);
  assert.equal(table[1].split(',').filter(Boolean).length,23);
});

test('review-only resolver correction gives every explicit revocation precedence',()=>{
  const sql=file('sql/REVIEW_ONLY_R70V_RESOLVE_DEVICE_REVOKED_ACCESS.sql');
  assert.equal((sql.match(/create or replace function public\.zezms_m5a4_resolve_device\(/gi)||[]).length,1);
  assert.match(sql,/R70V_RESOLVE_DEVICE_DEFINITION_DRIFT/);
  assert.match(sql,/a22b23a190733d202c97335aa9646700/);
  assert.match(sql,/set search_path to ''/);
  assert.match(sql,/v_uid uuid:=auth\.uid\(\)/);
  assert.match(sql,/l\.lifecycle_state=any\(p_allowed_states\)/);
  assert.match(sql,/not exists\s*\([\s\S]*?revoked_access\.status='REVOKED' or revoked_access\.revoked_at is not null/);
  assert.match(sql,/a\.status='ACTIVE' and a\.revoked_at is null/);
  assert.match(sql,/l\.owner_id=v_uid\s*and not exists\s*\([\s\S]*?public\.zezms_device_access owner_access/);
  assert.match(sql,/d\.user_id=v_uid and d\.revoked_at is null/);
  assert.doesNotMatch(sql,/\b(?:grant|revoke|insert|update|delete|truncate|drop|alter)\b\s+(?:on|into|public\.|table|function)/i);
});

test('authorization decision matrix includes revoked, healthy and owner-only cases',()=>{
  // Independent policy model for reviewing the SQL. Production execution remains unverified.
  function allowed({state,accepted=['ACTIVE'],uid,deviceUser,owner,business,registration,access=[]}){
    return accepted.includes(state) && !access.some(a=>a.business===business&&(a.status==='REVOKED'||a.revokedAt)) &&
      ((deviceUser===uid&&access.some(a=>a.business===business&&a.user===uid&&a.status==='ACTIVE'&&!a.revokedAt)) ||
       (owner===uid&&!access.some(a=>a.business===business)&&registration?.business===business&&registration.user===uid&&!registration.revokedAt));
  }
  const base={state:'ACTIVE',uid:'owner',deviceUser:'owner',owner:'owner',business:'B',registration:{business:'B',user:'owner'},access:[{business:'B',user:'owner',status:'ACTIVE'}]};
  assert.equal(allowed(base),true);
  assert.equal(allowed({...base,access:[{business:'B',user:'owner',status:'REVOKED'}]}),false);
  assert.equal(allowed({...base,access:[{business:'B',user:'owner',status:'ACTIVE',revokedAt:'now'}]}),false);
  assert.equal(allowed({...base,state:'REVOKED'}),false);
  assert.equal(allowed({...base,access:[]}),true);
  assert.equal(allowed({...base,registration:{business:'OTHER',user:'owner'},access:[]}),false);
  assert.equal(allowed({...base,uid:'outsider',access:[]}),false);
  // Both production device_context and ops_push delegate to this resolver in
  // the reviewed read-only function exports; these model checks are not live RPC calls.
  for(const operation of ['device_context','ops_push']){
    const invoke=identity=>allowed(identity);
    assert.equal(invoke({...base,access:[{business:'B',user:'owner',status:'REVOKED'}]}),false,operation);
    assert.equal(invoke({...base,access:[{business:'B',user:'owner',status:'ACTIVE',revokedAt:'now'}]}),false,operation);
    assert.equal(invoke(base),true,operation);
  }
});

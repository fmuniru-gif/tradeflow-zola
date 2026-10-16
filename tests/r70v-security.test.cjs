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

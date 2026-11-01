'use strict';
// SELECT-only disposable PostgreSQL check. No schema, migration or application
// data is loaded. PGOPTIONS forces every transaction read-only.
const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const core=require('../diagnostics/m43-correction-reconciliation/preflight-core.js'),{sha}=require('./m43-preflight-fixture.cjs');
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='postgres')throw Error('ISOLATED_SELECT_ONLY_POSTGRES_REQUIRED');
test('native PostgreSQL JSONB text and aggregate SHA match the GET-only preflight without losing numeric evidence',async()=>{
 const input="SELECT payload::text AS payload_text,op_id,seq FROM (VALUES(11::bigint,'synthetic-😀', '{\"n\":2.00,\"s\":\"line\\nquote\\\"\",\"x\":0.30000000000000004}'::jsonb),(30::bigint,'synthetic-two','{\"other\":1e23}'::jsonb)) v(seq,op_id,payload)";
 const query="BEGIN READ ONLY;WITH evidence_rows AS ("+input+") SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'rows',jsonb_agg(jsonb_build_object('seq',seq,'op_id',op_id,'payload_text',payload_text) ORDER BY seq),'digest',encode(sha256(convert_to(jsonb_agg(jsonb_build_array(seq,op_id,payload_text::jsonb) ORDER BY seq)::text,'UTF8')),'hex')) FROM evidence_rows;COMMIT;";
 const result=JSON.parse(execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c default_transaction_read_only=on'}}).trim());
 assert.equal(result.readOnly,'on');const text='['+result.rows.map(r=>'['+r.seq+', '+JSON.stringify(r.op_id)+', '+r.payload_text+']').join(', ')+']';assert.equal(await sha(text),result.digest);result.rows.forEach(r=>core.parsePg(r.payload_text));
});

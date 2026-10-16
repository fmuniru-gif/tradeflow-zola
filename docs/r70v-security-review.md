# r70V focused security review — NO-GO

This review is based on the unmodified production-definition exports in `Supabase Snippet Untitled query (64).csv` (canonical fleet), query (65) (role helper, resolver, context), and query (60) (context, attestation, operation push). No Supabase query, migration, RPC, or device action was executed during this correction.

## Confirmed defect and narrow correction

The reviewed canonical fleet read has 23 return columns, an `auth.uid()` check, OWNER/ADMIN membership authorization through `public.zezms_has_business_role`, and a `life.business_id=p_business_id` filter. Its old eligibility expression allowed `registered_row.user_id=life.owner_id` to return true even when the selected access row was explicitly REVOKED. This is a confirmed authorization **projection** defect. It does not by itself prove that a revoked identity can execute a cloud mutation; the production mutation and device-context RPCs require separate verification.

The Device Control Center now treats `device_access_status='REVOKED'` **or** a non-null `device_access_revoked_at` as an explicit revocation. It forces `authenticationEligible=false`, places an ACTIVE lifecycle in **Pending / Needs Attention** as **ACCESS REVOKED**, and offers no operational action for that row, regardless of the server's boolean. A REVOKED lifecycle also stays in history regardless of legacy registration labels. A healthy ACTIVE access row remains operational.

The unexecuted [SQL correction](../sql/REVIEW_ONLY_R70V_CANONICAL_FLEET_ACCESS.sql) changes only the canonical read projection. It excludes any matching explicitly revoked access record. The historical Owner-registration fallback remains possible only when **no** access row exists. That fallback is supported by the earlier M5A-4 `resolve_device` source's Owner registration path, but its necessity and safety must be checked against the current production definition before approval. The SQL includes a guard against drift from the reviewed canonical function definition and contains no GRANT, REVOKE, or table mutation.

## Confirmed server authorization defect and limits

Query (65) shows that `zezms_m5a4_resolve_device(text,text[])` is `SECURITY DEFINER`, owned by `postgres`, with an empty `search_path`, and grants EXECUTE to neither `anon` nor `authenticated`. The externally callable `zezms_m5a4_device_context(text,text[])` grants authenticated EXECUTE and invokes the resolver. The resolver's Owner branch checks an unrevoked historical `zezms_business_devices` registration but does **not** reject an explicitly REVOKED `zezms_device_access` row. Thus a signed-in Owner who still has that registration can resolve an ACTIVE lifecycle for a device with revoked access. This is a confirmed server-side authorization defect in the exported definition; it does not establish that the former device account can authenticate after revocation.

Query (65) also shows that `device_context` performs `UPDATE` statements on lifecycle, access, and registration timestamps. It is **not** a read-only preflight RPC. Query (60) shows `zezms_ops_push(jsonb)` depends on `resolve_device(..., ARRAY['ACTIVE'])` and proceeds to insert sync operations and update sync state; `zezms_m5a4_submit_attestation` also depends on the resolver. Additional query (39) definitions refer to the same resolver, including checkpoint publication, bootstrap reads, device presence, and protocol transition; their latest production definitions still need confirmation. The operation-push code enforces protocol, branch, identity, and payload checks, but those do not remove the resolver's revoked-access fallback. The exact affected sessions and device registration rows require production data review before impact can be quantified.

The separate unexecuted [resolver SQL correction](../sql/REVIEW_ONLY_R70V_RESOLVE_DEVICE_REVOKED_ACCESS.sql) rejects **any** matching access row marked REVOKED or with `revoked_at`, even if another row is ACTIVE. Its Owner-registration fallback works only when no access row exists for that business and device. It preserves ACTIVE lifecycle, device-user access, Owner identity, business binding, registered-device revocation, and the existing `search_path=''` and ACL. Its drift guard is based on the whitespace-normalized query (65) definition (`a22b23a190733d202c97335aa9646700`); verify that hash again in production and save the exact current definition for rollback before separate approval. The correction has not been executed or tested against live production rows.

## Role-helper evidence and limits

The query (65) production-definition export for `public.zezms_has_business_role(uuid,text[])` matches the earlier M5A-1 SQL source: it returns true only when `public.zezms_business_members` contains an ACTIVE membership for the supplied business, `auth.uid()`, and a role in `p_roles`. It is `SECURITY DEFINER`, `STABLE`, owned by `postgres`, uses `search_path=public`, denies `anon` EXECUTE, and allows `authenticated`. Its table and `auth.uid()` references are schema-qualified. This helper checks **business membership**, not whether the caller's device access has been revoked.

Before GO, recheck current function definitions and actual access/registration relationships using read-only SQL. Verify whether Owner registration without an access row is still required on healthy devices. Do not use `zezms_m5a4_device_context` as a read-only test because it updates timestamps. Do not infer server mutation safety from the client fix or fleet projection.

### Exact read-only production verification

Run only in the existing production Supabase SQL editor. These statements read catalog metadata and function source; they invoke no device or business RPC and change no rows.

```sql
select p.oid::regprocedure as function_signature,
       p.prosecdef as security_definer,
       p.proowner::regrole as owner_role,
       p.proconfig as function_settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) as live_definition
from pg_proc p
where p.oid in (
  to_regprocedure('public.zezms_has_business_role(uuid,text[])'),
  to_regprocedure('public.zezms_m5a4_resolve_device(text,text[])'),
  to_regprocedure('public.zezms_m5a4_device_context(text,text[])'),
  to_regprocedure('public.zezms_m5a4_canonical_fleet_read(uuid)')
);

select md5(regexp_replace(
         pg_get_functiondef(to_regprocedure('public.zezms_m5a4_resolve_device(text,text[])')),
         '[[:space:]]+','','g')) as resolver_definition_guard_hash;

select md5(regexp_replace(
         pg_get_functiondef(to_regprocedure('public.zezms_m5a4_canonical_fleet_read(uuid)')),
         '[[:space:]]+','','g')) as canonical_definition_guard_hash;

select has_schema_privilege('anon','public','CREATE') as anon_can_create_in_public,
       has_schema_privilege('authenticated','public','CREATE') as authenticated_can_create_in_public;
```

The expected canonical guard hash from query (64) is `284281eed143763a166f33ac755f9197`; the resolver guard from query (65) is `a22b23a190733d202c97335aa9646700`. A different value blocks the corresponding prepared SQL; review the current definition rather than bypassing the guard. The live checks must also confirm whether any business/device has conflicting ACTIVE and REVOKED access rows and whether the Owner-only fallback is needed for the existing primary device. Do not execute either correction until those checks and exact rollback definitions are reviewed.

## Tests and readiness

The assembled-shell browser tests cover ACTIVE lifecycle + REVOKED access + historical registration + erroneous `authentication_eligible=true`, a revocation timestamp with an ACTIVE status, REVOKED lifecycle + historical ACTIVE registration, and a healthy ACTIVE device. Repeated Settings reconciliation remains stable. A source comparison test confirms the pre-login bootstrap-outbox inspector and its embedded payload are unchanged. The existing r70U/r70V activation, staff-login, outbox, and release tests remain in the suite.

**NO-GO for merge, migration, deployment, or Camon 17P activation.** The SQL is prepared but unexecuted; current function-definition hashes, access/registration data, Owner-fallback justification, and Camon 17P's actual outbox remain unverified.

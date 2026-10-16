# r70V focused security review — NO-GO

This review is based on the unmodified production-definition export in `Supabase Snippet Untitled query (64).csv`, the earlier role-helper export in query (57), and the original r70P SQL source. No Supabase query, migration, RPC, or device action was executed during this correction.

## Confirmed defect and narrow correction

The reviewed canonical fleet read has 23 return columns, an `auth.uid()` check, OWNER/ADMIN membership authorization through `public.zezms_has_business_role`, and a `life.business_id=p_business_id` filter. Its old eligibility expression allowed `registered_row.user_id=life.owner_id` to return true even when the selected access row was explicitly REVOKED. This is a confirmed authorization **projection** defect. It does not by itself prove that a revoked identity can execute a cloud mutation; the production mutation and device-context RPCs require separate verification.

The Device Control Center now treats `device_access_status='REVOKED'` **or** a non-null `device_access_revoked_at` as an explicit revocation. It forces `authenticationEligible=false`, places an ACTIVE lifecycle in **Pending / Needs Attention** as **ACCESS REVOKED**, and offers no operational action for that row, regardless of the server's boolean. A REVOKED lifecycle also stays in history regardless of legacy registration labels. A healthy ACTIVE access row remains operational.

The unexecuted [SQL correction](../sql/REVIEW_ONLY_R70V_CANONICAL_FLEET_ACCESS.sql) changes only the canonical read projection. It excludes any matching explicitly revoked access record. The historical Owner-registration fallback remains possible only when **no** access row exists. That fallback is supported by the earlier M5A-4 `resolve_device` source's Owner registration path, but its necessity and safety must be checked against the current production definition before approval. The SQL includes a guard against drift from the reviewed canonical function definition and contains no GRANT, REVOKE, or table mutation.

## Role-helper evidence and limits

The available query (57) live-definition export for `public.zezms_has_business_role(uuid,text[])` matches the earlier M5A-1 SQL source: it returns true only when `public.zezms_business_members` contains an ACTIVE membership for the supplied business, `auth.uid()`, and a role in `p_roles`. It is `SECURITY DEFINER`, `STABLE`, owned by `postgres`, uses `search_path=public`, denies `anon` EXECUTE, and allows `authenticated`. Its table and `auth.uid()` references are schema-qualified. This helper checks **business membership**, not whether the caller's device access has been revoked. The export is not a current-production recheck.

Before GO, obtain fresh, read-only production evidence of this helper's exact definition, owner, ACL, `search_path`, and the current business-membership policies. Check the current `zezms_m5a4_resolve_device`, `zezms_m5a4_device_context`, and mutation RPC definitions for Owner-registration fallback when access is revoked. The earlier M5A-4 `resolve_device` source has a separate Owner-registration branch; whether later production changes close it is unverified. Do not infer server mutation safety from this client fix or fleet projection.

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
         pg_get_functiondef(to_regprocedure('public.zezms_m5a4_canonical_fleet_read(uuid)')),
         '[[:space:]]+','','g')) as canonical_definition_guard_hash;

select has_schema_privilege('anon','public','CREATE') as anon_can_create_in_public,
       has_schema_privilege('authenticated','public','CREATE') as authenticated_can_create_in_public;
```

The expected guard hash from query (64) is `284281eed143763a166f33ac755f9197`. A different value blocks the prepared SQL; review the current definition rather than bypassing the guard. The live checks must also confirm that the same business/device has no conflicting ACTIVE and REVOKED access rows and that the Owner-only fallback is genuinely needed for the existing primary device. Do not execute the correction until those checks and a rollback copy of the current definition are reviewed.

## Tests and readiness

The assembled-shell browser tests cover ACTIVE lifecycle + REVOKED access + historical registration + erroneous `authentication_eligible=true`, a revocation timestamp with an ACTIVE status, REVOKED lifecycle + historical ACTIVE registration, and a healthy ACTIVE device. Repeated Settings reconciliation remains stable. A source comparison test confirms the pre-login bootstrap-outbox inspector and its embedded payload are unchanged. The existing r70U/r70V activation, staff-login, outbox, and release tests remain in the suite.

**NO-GO for merge, migration, deployment, or Camon 17P activation.** The SQL is prepared but unexecuted; current production helper/device-context definitions, Owner-fallback justification, and Camon 17P's actual outbox remain unverified.

# r70G — Active Device Binding Recovery

## Fixed

r70F treated the local `deviceAccessMode === 'PAIRED'` cache as a prerequisite for staff-auth recovery. If that cache was the item lost, r70F threw `ZEZMS_LOCAL_STAFF_AUTH_DEVICE_NOT_ACTIVE` before it queried Cloud.

r70G makes the authoritative server lifecycle/access context the decision point. A signed-in ACTIVE device may now recover local staff access in either `PAIRED` or legacy `OWNER` mode, and a blank/stale local mode is repaired from the verified context.

## Pre-deployment SQL correction

Before deployment, the optional reconnect RPC was corrected for PL/pgSQL `RETURNS TABLE` output-variable ambiguity. Every collision-prone expression, `WHERE`, metadata RHS and `RETURNING` reference is now table-qualified; legal unqualified `SET` targets remain unqualified. A same-binding retry remains read-only.

## Lost-session path

When no usable session exists, the login recovery UI says **Reconnect this existing device**, not Set up a new device. Owner sign-in and MFA/AAL2 create a new anonymous Auth identity only after the narrowly scoped server RPC locks and verifies the exact existing ACTIVE lifecycle. The lifecycle and device ID are retained.

## Unchanged

- M4/3 remains active; M4/4 and branch data-plane isolation remain off.
- r70F Safe Bootstrap eligibility, durable journal, BOOTSTRAPPING/VERIFYING resume, write lock, manifest revision handoff, and direct M5A4 claim remain.
- Canonical Restore payload, business roots, transaction logic, queue, cursor, hashes and Phone 2 data are unchanged.

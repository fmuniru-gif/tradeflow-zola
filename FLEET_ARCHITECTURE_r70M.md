# r70M fleet-state architecture

## Authorities

| Concern | Authority | r70M treatment |
| --- | --- | --- |
| Authentication eligibility | Active managed-device lifecycle plus server device-context authorization | Only canonical `ACTIVE` is eligible. A stale directory/enrollment flag cannot grant access. |
| Operational lifecycle | `zezms_m5a4_managed_fleet_with_branch` lifecycle result | Primary source for the resolver. |
| Branch assignment | Lifecycle/managed-fleet branch assignment | Displayed from the same row; M4/4 branch data plane is still disabled. |
| Replacement relationship | Lifecycle parent/child (`replaces_lifecycle_id` / replacement fields) | Used to form lineage and keep one active projection per lineage. |
| Bootstrap stage | local Safe Bootstrap stage and journal plus verified server manifest/attestation | Local evidence only; never an authority to make a retired/revoked identity active. |
| Last seen, verified cursor, app version | Managed-fleet server projection | Displayed as operational evidence. |
| Enrolled/registered/directory records | Supporting projection/evidence | May explain a contradiction; can never override lifecycle revocation, retirement, or replacement. |

## Canonical resolver

`resolveCanonicalDeviceState()` maps lifecycle first to `ACTIVE`, `VERIFYING`, `AWAITING OWNER APPROVAL`, `REPLACED`, `RETIRED`, `REVOKED`, or `FAILED / EXPIRED`. Any `REVOKED`, `RETIRED`, or `REPLACED` result denies authentication eligibility and operational access even when a legacy enrollment row says `ACTIVE`.

The normal Settings experience is one **Device Control Center**:

- **Active Devices** — only operational identities, with role/type, branch, status, health, last seen, app version, and appropriate action.
- **Pending / Needs Attention** — only actionable verification, approval, conflict, or health work; absent when empty.
- **Device History** — collapsed audit projection with All, Replaced, Retired, Revoked, and Failed enrollment filters.

The older full-list enrollment panels are hidden in favour of this lifecycle-led projection. Server authorization remains the ultimate enforcement; r70M’s client resolver stops stale UI status from misleading operators.

## Lineage and normal workflow

Each row uses replacement parent/child fields to form a lineage. The newest active row is the one operational projection; old/replaced/revoked rows remain in History with their lineage relationship. Add and Recover / replace use the existing safe lifecycle wizard: Owner creates a code/link, phone verifies, Owner approves, and the phone completes activation. The existing journal-resume route remains preferred when the same identity is resumable.

# r70L test report

All tests below run locally against source or an isolated in-memory Node VM. No browser/mobile device, Supabase project, SQL endpoint, Cloud operation history or real business database was contacted.

| Test | Status | Result / classification |
|---|---|---|
| `build-r70l-bootstrap-replay-origin-invariant.js` | PASS | Generated shell contains the origin-independent plan and acknowledgement proof. |
| `r70l-bootstrap-replay-origin-invariant.runtime.test.js` | PASS | 68 checks: remote and queue-empty same-device materialization, normal same-device idempotency, conflict fail-closed diagnostic, mixed origins, save-failure rollback, pre-save/post-save journals and restart between operations. |
| `r70i-m43-freeze.contract.test.js` | PASS | 9 checks; M4/3 remains current and M4/4 remains inactive. |
| `r70-mb3-m44-transition.test.js` | PASS | 196 static checks; no browser/mobile/Supabase execution by design. |
| `r70g-safe-bootstrap-preservation.integration.test.js` | PASS | 24 checks. |
| `r70f-recovery-stabilization.integration.test.js` | PASS | 63 checks. |
| `r70g-active-device-binding-recovery.integration.test.js` | PASS | 55 checks. |
| `r70e-safe-bootstrap-claim-reliability.test.js` | PASS | 61 checks. |
| `r70i-legacy-checkpoint-hash-compatibility.integration.test.js` | FAIL (environmental) | It intentionally requires `ZEZMS_PRODUCTION_CHECKPOINT_EXPORT` to point to a caller-supplied local checkpoint export. The executed test stopped at that prerequisite because no such export is in this clean source workspace. r70L did not invent or access production data; its source retains the historical checkpoint assertions and updates only the current r70L marker assertion. |

The two acceptance fixtures required for this release both pass in the final generated runtime: a remote post-boundary sale and a same-device, queue-empty post-boundary sale are materialized/equivalence-proven before acknowledgement.

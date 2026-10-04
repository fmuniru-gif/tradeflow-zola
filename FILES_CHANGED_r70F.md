# r70F Files Changed

| File | Change |
| --- | --- |
| `index.html` | r70F version/release/cache markers; embeds updated Cloud control-plane helper, lifecycle overlay, and staff-access recovery module |
| `js/managed-device-lifecycle-r61.js` | explicit authoritative eligibility model, durable resume journal, non-destructive resume path, retained manifest-revision attestation |
| `js/recovery-stabilization-r70f.js` | new ACTIVE-device-only local staff-auth recovery action |
| `tests/build-r70f-recovery-stabilization.js` | deterministic production payload build/parity validation and Cloud control-plane helper injection |
| `tests/r70f-recovery-stabilization.integration.test.js` | 62-assertion stateful recovery, lifecycle, update, and preservation tests |
| `manifest.json` | 3.31.6/r70F release identity and start URL |
| `sw.js` | r70F cache/release identity and static recovery-module asset; app-shell cache only |
| `FORCE_UPDATE_MOBILE.html` | r70F route and explicit cache-only safety notice |
| `README_FIRST_r70F.md`, `RELEASE_NOTES_r70F.md`, `RECOVERY_ARCHITECTURE_r70F.md`, `TEST_REPORT_r70F.md`, `DEPLOYMENT_r70F.md`, `ROLLBACK_r70F.md` | r70F operator and audit documentation |

No Supabase SQL file was added or changed. Existing M4/4/branch SQL artifacts are carried forward untouched and must not be run for r70F.

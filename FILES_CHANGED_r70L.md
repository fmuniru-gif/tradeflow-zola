# Files changed for r70L

- `index.html` — generated `v3.31.12/r70L` application shell and final encoded Cloud Sync runtime.
- `js/bootstrap-replay-origin-invariant-r70l.js` — narrow replay plan, materialization-proof acknowledgement and all-or-fail candidate-commit wrapper.
- `js/bootstrap-replay-reconciliation-r70k.js` — retained unchanged as the direct r70K overlay.
- `js/managed-device-lifecycle-r61.js` — r70L lifecycle marker only; existing lifecycle semantics are retained.
- `sw.js`, `manifest.json`, `FORCE_UPDATE_MOBILE.html` — r70L version, purpose and cache markers.
- `tests/build-r70l-bootstrap-replay-origin-invariant.js` — deterministic r70K-to-r70L generated-shell materializer.
- `tests/r70l-bootstrap-replay-origin-invariant.runtime.test.js` — generated-runtime regression coverage for remote, same-device, conflict, mixed-origin, interruption/restart and rollback paths.
- Seven inherited current-marker tests — release-marker assertions changed from r70J to r70L only; their substantive assertions remain.
- r70L documentation and test result files.

No Supabase SQL file, database migration, business record, Cloud operation, tenant, branch, device identity or lifecycle record was changed or executed.

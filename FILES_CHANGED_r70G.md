# r70G files changed

- `js/recovery-stabilization-r70g.js` — authoritative ACTIVE-context staff recovery, OWNER/PAIRED/blank-marker handling and separate Owner+AAL2 reconnect UI.
- `js/managed-device-lifecycle-r61.js` — r70G marker only; r70F Safe Bootstrap behavior remains intact.
- `index.html` — embeds the reviewed r70G source and exposes Cloud control-plane session adoption/repair helpers only.
- `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html` — r70G cache/version rotation only.
- `SUPABASE_R70G_ACTIVE_DEVICE_BINDING_RECOVERY.sql` — optional, unexecuted least-scope reconnect RPC required only for the no-session path; all `RETURNS TABLE` name collisions are explicitly qualified in expressions, predicates and `RETURNING`.
- `tests/build-r70g-active-device-binding-recovery.js` and `tests/r70g-active-device-binding-recovery.integration.test.js` — deterministic source assembly and 55-assertion in-memory test.
- `tests/r70g-reconnect-sql-ambiguity.contract.test.js` — 39-assertion contract against the actual optional SQL source.
- `tests/r70g-safe-bootstrap-preservation.integration.test.js` — 24-assertion r70G-native execution of the preserved Safe Bootstrap eligibility, BOOTSTRAPPING/VERIFYING resume and manifest-revision behavior.
- r70G README, release, architecture, test, deployment, rollback and provenance reports.

No business-data source, M4/3 operation implementation, r70E claim SQL or Phone 2 record was changed.

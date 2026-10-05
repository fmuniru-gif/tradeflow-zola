# r70I changed files

- `js/managed-device-lifecycle-r61.js` — adds deterministic historical/current checkpoint verification, strict stable errors, stage-accurate failure headings, and r70I build marker.
- `index.html` — embeds the reviewed r70I lifecycle module and advances app-shell release/cache markers only.
- `sw.js`, `manifest.json`, `FORCE_UPDATE_MOBILE.html` — rotate application-shell identifiers to r70I without touching browser data stores.
- `tests/r70i-legacy-checkpoint-hash-compatibility.integration.test.js` — validates the real local exported checkpoint without packaging it, corruption rejection, current hash validation, format rejection, CAMON resume, and UI wording.
- `tests/r70e-bootstrap-manifest-revision-handoff.integration.test.js`, `tests/r70f-recovery-stabilization.integration.test.js`, `tests/r70g-safe-bootstrap-preservation.integration.test.js` — make existing fixtures valid current sixteen-character checkpoint hashes so they continue to test their original workflows.
- `tests/build-r70i-legacy-checkpoint-hash-compatibility.js` — embeds only the reviewed lifecycle module and preserves r70H identity relink and Canonical Restore overlays.

No business-operation source, Canonical Restore source, Supabase SQL, or M4/4 source changed.

# r70U local verification report

Base: `origin/main` at `ab188728d9c1a8897801385ea7c41f03cd9789cb`.

Command: `node --test tests/prelogin-activation.browser.cjs tests/prelogin-activation.test.cjs tests/prelogin-release.test.cjs`

Result on 2026-10-15: **28 passed, 0 failed**. Browser tests used installed Google Chrome through Playwright Core, with a localhost fixture and no production credentials. The complete shell test blocked every non-local request.

Coverage includes:

- Synthetic reproduction of Camon 17P's blocked-login state: empty staff selector, verified stage, ACTIVE Owner-approved lifecycle, pre-login activation, restored cloud database and staff selector. No production device ID or evidence is stored in this branch.
- No stage, malformed stage, altered candidate, wrong device, wrong or malformed journal, missing integrity module, VERIFYING/REVOKED/RETIRED lifecycle, missing paired session, server permission rejection, mismatched lifecycle or business, and missing guarded activation bridge.
- Retry after interrupted activation, reconstructed journal after interrupted journal write, and simultaneous clicks sharing one activation attempt.
- Synthetic newly enrolled Android and replacement Windows identities, with no hardcoded device identity in runtime source.
- Missing staff directory leaves staff accounts uninvented and invokes the existing pre-login local-staff recovery route.
- Source-to-embedded byte equality, consistent release identifiers, unchanged cloud/protocol/integrity/baseline payloads, unchanged production shell behavior when no stage exists, and preservation of the service-worker integrity checks.

Additional syntax checks: `node --check` passed for `sw.js`, `js/managed-device-lifecycle-r61.js`, `js/prelogin-verified-activation-r70u.js`, and all three test files. The full `index.html` shell executed successfully in Chrome.

Limits: RPC results and activation effects were synthetic. Real Camon 17P stage contents, production Supabase authorization, physical browser storage, service-worker upgrade on the phone, and live synchronization were not exercised. Production remains **NO-GO pending review, explicit deployment approval, and physical verification**.

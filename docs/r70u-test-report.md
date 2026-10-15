# r70U local verification report

Base: `origin/main` at `ab188728d9c1a8897801385ea7c41f03cd9789cb`.

Command: `node --test tests/prelogin-activation.browser.cjs tests/prelogin-activation.test.cjs tests/prelogin-release.test.cjs`

Result on 2026-10-15: **29 passed, 0 failed**. Browser tests used installed Google Chrome through Playwright Core, with a localhost fixture, synthetic PBKDF2 staff credentials, and no production credentials. The complete shell test blocked every non-local request.

Coverage includes:

- Synthetic reproduction of Camon 17P's blocked-login state: empty staff selector, older verified stage, ACTIVE Owner-approved lifecycle, pre-login activation, restored cloud database, and usable staff selector. The browser fixture now runs the actual embedded Phase A, staff-authentication, and r70G recovery modules, including the shell's two staff-directory field patches. It no longer restores the selector with a test-only event listener. No production device ID or evidence is stored in this branch.
- The real staff-login module verifies an existing synthetic PBKDF2 password after activation. The test confirms the cloud sale, device identity, cursor 42, and empty queue remain intact.
- When staged cloud data has a published `sharedDeviceDirectory` but no `sharedDeviceAuth`, the real staff controller initially fails closed. After activation, the genuine **Recover local staff access** button reads the published directory for the same ACTIVE device, restores only the existing user and role, and permits login. The test confirms no new user, role, business record, or queued operation is created. Mock cloud RPC access is limited to the read-only device-context call.
- No stage, malformed stage, altered candidate, wrong device, wrong or malformed journal, missing integrity module, VERIFYING/REVOKED/RETIRED lifecycle, missing paired session, server permission rejection, mismatched lifecycle or business, and missing guarded activation bridge.
- Retry after interrupted activation, reconstructed journal after interrupted journal write, and simultaneous clicks sharing one activation attempt.
- Synthetic newly enrolled Android and replacement Windows identities, with no hardcoded device identity in runtime source.
- Missing staff directory leaves staff accounts uninvented and invokes the existing pre-login local-staff recovery route.
- Source-to-embedded byte equality, consistent release identifiers, unchanged cloud/protocol/integrity/baseline payloads, unchanged production shell behavior when no stage exists, and preservation of the service-worker integrity checks.

Additional syntax checks: `node --check` passed for `sw.js`, `js/managed-device-lifecycle-r61.js`, `js/prelogin-verified-activation-r70u.js`, and all three test files. The full `index.html` shell executed successfully in Chrome.

Limits: RPC results and the activation bridge effects were synthetic; the actual production staff and r70G modules ran in Chrome. Real Camon 17P stage contents, production Supabase authorization, physical browser storage, service-worker upgrade on the phone, and live synchronization were not exercised. Production remains **NO-GO pending review, explicit deployment approval, and physical verification**.

# r70U verified pre-login activation hotfix

## Scope and baseline

This branch starts at production `origin/main` commit `ab188728d9c1a8897801385ea7c41f03cd9789cb`. It does not include the abandoned r70T recovery branch. The r70U release identifier is `20261015-r70u-prelogin-verified-activation`.

The fix applies to every supported newly enrolled or replacement device. It uses the browser's staged device ID and the authenticated server lifecycle; no Camon 17P identifier is embedded in the application. The Camon 17P identifier appears only in regression fixtures.

## Activation path

1. Safe Bootstrap still reconstructs the cloud checkpoint and ordered post-checkpoint operations, runs Integrity Core and Fleet fingerprint checks, submits attestation, and leaves a staged candidate and journal. It does not commit business data at that point.
2. The pre-login control appears only if the staged candidate passes local shape, identity, journal, integrity, and fingerprint checks. It does not authenticate staff or approve a lifecycle.
3. Clicking **Complete verified activation** uses the authenticated paired cloud session to read `zezms_m5a4_device_context` for this exact device, restricted to `ACTIVE`, and checks lifecycle, owner, and business binding.
4. The unchanged r70M activation bridge inspects the local outbox and failed operations, rejects unrelated business work, commits the candidate, starts the existing M4/3 live path, and rolls back local state on failure. The less guarded legacy fallback is no longer accepted.
5. After successful commitment, the stage and journal are cleared and the existing staff-directory update event rebuilds the login selector. If the candidate has no usable directory, the existing pre-login **Recover local staff access** route reads the published cloud directory for this ACTIVE device and hydrates only local staff access. That route does not create accounts or change cloud records.

The control remains absent on a browser with no valid staged candidate. An interrupted journal write may be reconstructed from a valid stage. A malformed or mismatched journal is rejected. Expiration of an enrollment code after staging does not invalidate the already attested candidate.

## Review and deployment procedure

**Status: NO-GO for production until the Owner approves the reviewed package.** No device or cloud data has been changed by preparing this hotfix.

1. Review the branch diff and `SHA256SUMS.txt` in the package. Confirm the deployment commit contains the six runtime files listed below and no SQL, cloud-sync, database, or business logic changes.
2. Preserve the currently deployed Git commit and its six files for shell rollback. Do not clear browser storage on any device.
3. After approval, publish the six runtime files together from one reviewed Git commit through the existing GitHub Pages workflow. Do not upload files one at a time to a live site. Wait for GitHub Pages to serve the new `index.html`, `sw.js`, `manifest.json`, and update helper consistently before opening the update helper on a device.
4. On a healthy device, open the update helper only when a normal maintenance window is available. Confirm the release `20261015-r70u-prelogin-verified-activation`, no pre-login activation control, and unchanged staff login and sync status. Do not clear site data.
5. On a staged, Owner-approved device, close other TradeFlow tabs, open the same-origin `FORCE_UPDATE_MOBILE.html`, follow its wait/close instructions, and reopen TradeFlow. Confirm the release, the same device ID, a verified staged candidate, and the visible **Complete verified activation** control. Keep the device online for the existing authenticated ACTIVE lifecycle read and catch-up. Click once and wait. The staff selector should populate from the committed cloud directory; sign in with an existing individual staff credential. If the directory is absent, use **Recover local staff access** after activation and verify that the existing published staff list appears. Never re-enroll or clear storage to recover from a failed attempt.
6. Verify that the staged key is gone only after success, the local staff login works, the device remains ACTIVE, and the queue has no unexpected operations. Check that Main, Shop, and Camon 50 Pro continue normal sync before declaring the rollout complete.

Runtime files: `index.html`, `sw.js`, `manifest.json`, `FORCE_UPDATE_MOBILE.html`, `js/managed-device-lifecycle-r61.js`, `js/prelogin-verified-activation-r70u.js`. The new pre-login module and managed-lifecycle module are embedded in the verified shell; their source files remain in the deployment for review and version coherence.

## Rollback

If the update fails before activation, preserve the staged candidate, journal, browser profile, IndexedDB, local database, cloud session, and queue. Republish the previous production shell files from the preserved commit through the existing deployment process. Do not reset the browser or Supabase lifecycle. Capture the release, visible error, local stage/journal status, and cloud lifecycle state before retrying or investigating. If activation has already succeeded, do not restore a pre-activation local database; roll back only the application shell if necessary.

## Verification limits

Automated tests exercise the exact blocked-login interface and the guarded activation call using synthetic cloud responses. The complete static production shell was loaded in Chrome with external requests blocked. No real device, production Supabase RPC, physical storage limit, or live catch-up was tested. The Owner-approved Camon 17P lifecycle and staged candidate were reported by the user; this package has not inspected that device. These physical and production checks remain deployment gates.

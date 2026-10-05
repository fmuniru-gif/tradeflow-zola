# r70I deployment instructions

This package has not been deployed. No SQL is required or included.

1. Upload the contents of the **GitHub-upload-only** archive to the same deployed application location. Include `index.html`, `sw.js`, `manifest.json`, `FORCE_UPDATE_MOBILE.html`, the reviewed managed-device lifecycle module, and the r70I documentation. Do not upload the full-source archive as a web root.
2. Let the deployment complete, then open the deployed application’s update page or reload with the r70I build URL so the application shell and service worker rotate. The update clears only application caches; it must not clear site data.
3. On **CAMON 50 PRO**, use the same browser profile that already has the `BOOTSTRAPPING` journal. Do not clear browser/site data, request a pairing code, create another enrollment, or use Repair / replace a device.
4. Reopen the existing Safe Bootstrap screen and choose its existing **Claim and verify bootstrap** / retry action. r70I checks the durable journal before reading pairing fields, detects the same lifecycle, rereads the manifest, validates `179277F7` with the historical verifier, replays post-checkpoint operations, runs Integrity/Fleet checks, and submits attestation.
5. Confirm it reaches **VERIFYING**. Owner approval remains a separate, existing M5A-4 action. Do not treat a legacy M5A-3 “ACTIVE” badge as M5A-4 activation.

Do not run any Supabase SQL, delete operations, alter the checkpoint, or cancel the existing CAMON lifecycle for this release.

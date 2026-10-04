# r70F Deployment Instructions

1. Confirm the current production site is r70E and has the corrected r70E M5A4 claim SQL already deployed.
2. Do **not** run SQL for r70F. Do not run MB2/MB3 scripts. Do not activate M4/4.
3. Upload the complete contents of `GITHUB_UPLOAD_ONLY` together as one static-site deployment. Do not mix its `index.html`, `manifest.json`, `sw.js`, or `FORCE_UPDATE_MOBILE.html` with files from another release.
4. Open `FORCE_UPDATE_MOBILE.html` once on each device if a normal reload has not picked up r70F. It clears only stale app caches and returns to the r70F build URL.
5. On Main, open Settings / Managed Device Lifecycle and confirm protocol remains M4/3. Do not touch the old Phone 2 queue.
6. Create/continue the replacement for `ZEZMS Phone 2 Repaired`, open its setup link on the replacement device, then choose **Claim and verify bootstrap** or **Resume bootstrap** if a journal is detected.
7. Wait for VERIFYING. Approve from an Owner device only after the expected verified evidence is shown. Confirm the old Phone 2 changes to RETIRED only after that approval.
8. On any existing ACTIVE phone which lacks the staff list, use **Recover local staff access** rather than Owner Recovery, site-data clearing, re-enrollment, or Canonical Restore.

Post-deployment checks: normal healthy devices remain ACTIVE; failed operations remain zero; replacement reaches VERIFYING; no device requires another pairing code after an interruption; staff recovery preserves its local business contents and queue.

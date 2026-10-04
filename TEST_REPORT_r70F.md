# r70F Test Report

**Executed:** 2026-10-04  
**Command:** `node tests/r70f-recovery-stabilization.integration.test.js`  
**Result:** PASS — 63 assertions

## Covered runtime scenarios

1. An empty replacement profile with `initialized: true`, an unbound anonymous identity, and no live lifecycle is eligible and reaches VERIFYING. This proves `initialized` alone no longer blocks Safe Bootstrap.
2. A browser identity with an authoritative ACTIVE lifecycle is rejected with `ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND`, with no claim mutation.
3. A matching BOOTSTRAPPING journal resumes the same lifecycle without a new pairing code, then reaches VERIFYING.
4. A matching VERIFYING journal opens verification status without claim, manifest retrieval, replay, or duplicate attestation.
5. The actual embedded Cloud bridge calls only `zezms_m5a4_claim_device_pairing` and returns BOOTSTRAPPING context.
6. The replacement remains staged/write-locked and leaves the old Phone 2 ACTIVE until the simulated Owner approval, then the replacement becomes ACTIVE and old Phone 2 becomes RETIRED.
7. An ACTIVE paired phone with absent local staff auth recovers its staff directory and immediately refreshes the open login selector while preserving business projection, queue, device ID, and lifecycle; it performs no pull/replay, claim, enrollment, or Canonical Restore.
8. r70E-to-r70F force-update execution preserves device/access/lifecycle/auth/business/queue/journal test state and rotates app caches only.
9. Production embedded payloads equal their reviewed source modules; Canonical Restore remains byte-for-byte preserved by the builder.

## Additional checks

- `node --check` passed for the lifecycle module, staff recovery module, builder, and integration test.
- `node tests/build-r70f-recovery-stabilization.js` passed; it verifies embedded payload parity, direct M5A4 claim bridge retention, r70F release markers, and unchanged Canonical Restore payload.
- Root/GitHub deployment-file SHA-256 parity passed for `index.html`, `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html`, managed lifecycle source, and staff recovery source.
- No SQL was executed. No database or production deployment was touched.

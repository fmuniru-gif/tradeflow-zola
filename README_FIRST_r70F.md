# ZEZMS TradeFlow Owner Edition v3.31.6 / r70F

Build: `20261004-r70f-recovery-stabilization`

r70F is a recovery-stabilization release built directly from the verified v3.31.5 / r70E production package. It does not deploy SQL and does not activate M4/4.

## What it changes

- Safe Bootstrap no longer mistakes `Cloud Sync initialized` for proof that a browser owns a live managed device.
- Replacement bootstrap has an explicit eligibility result, durable recovery journal, and a true Resume path for the same pairing, lifecycle, device ID, and anonymous identity.
- A paired ACTIVE device whose local staff-auth cache is missing can rehydrate only its published staff directory through its existing Cloud identity. This is not enrollment, Canonical Restore, or a business-history replay.
- The force-update shell rotates only app caches; it does not clear local device binding, staff auth, business data, queue, or bootstrap journal.

## Read before deployment

1. Read [DEPLOYMENT_r70F.md](DEPLOYMENT_r70F.md).
2. Upload the contents of `GITHUB_UPLOAD_ONLY` as one atomic static-site deployment.
3. Do not run any SQL. r70F reuses the deployed r70E M5A4 claim contract.
4. Keep protocol M4/3. M4/4 and branch operational data isolation remain inactive.

## Expected recovery journey

1. On the Owner device, use **Repair / replace a device**, select `ZEZMS Phone 2`, then copy the setup link for `ZEZMS Phone 2 Repaired`.
2. On the replacement device, open that link and select **Claim and verify bootstrap**. If interrupted, select **Resume bootstrap**; do not clear site data or request another code.
3. Wait for **VERIFYING**, then approve on the Owner device. The old device is retired only at that approved cutover.

For an existing ACTIVE phone which displays **Owner setup required** because local staff auth is absent, use **Recover local staff access**. It verifies the existing paired identity and ACTIVE lifecycle before reading only the published staff directory.

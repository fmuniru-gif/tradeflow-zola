# r70F Release Notes — Recovery Stabilization

**Version:** 3.31.6  
**Build:** `20261004-r70f-recovery-stabilization`  
**Baseline:** verified 3.31.5 / r70E production package

## Included

- Replaced the old boolean `initialized || PAIRED` browser gate with an authoritative eligibility inspection.
- Added explicit outcomes: `FRESH_UNBOUND`, `UNBOUND_ANONYMOUS_SESSION`, `SAME_BOOTSTRAP_RESUMABLE`, `ZEZMS_DEVICE_IDENTITY_ALREADY_BOUND`, `ZEZMS_BOOTSTRAP_LOCAL_BUSINESS_DATA_PRESENT`, `ZEZMS_BOOTSTRAP_INVALID_DEVICE_ID_BINDING`, and `ZEZMS_BOOTSTRAP_UNKNOWN_UNSAFE_STATE`.
- Added a version-2 bootstrap journal recording lifecycle/pairing/device identity, checkpoint cursor/hash, replay cursor, manifest revision, verified stage, timestamps, and safe error detail.
- Preserved the r70E direct `zezms_m5a4_claim_device_pairing` claim path and manifest-revision attestation handoff.
- Added the local ACTIVE-device staff-access recovery action, restricted to Cloud-verified paired ACTIVE devices and to the shared staff-directory control root.
- Updated release, manifest, service-worker, force-update, embedded production payloads, tests, and release documentation.

## Explicit non-changes

- No SQL is supplied or required.
- No sale, receipt, stock, inventory, cash, expense, account, customer, purchase-order, quotation, invoice, waybill, or warranty business semantics changed.
- M4/3 remains the protocol. M4/4 remains inactive. No branch operational data plane, branch-specific stock, branch envelope enforcement, or multi-branch extension was enabled.
- Old Phone 2’s divergent queue is neither uploaded nor replayed.

# CAMON 17P bootstrap outbox root-cause report — r70M

## What source evidence proves

r70L correctly refuses to replace a local database while `zezms_cloud_sync_m4_queue` is non-empty. The inherited local-save path can nevertheless observe a root difference while a Safe Bootstrap candidate is staged and call the ordinary operation builder. `diffRoot()` recognizes roots such as `sharedDeviceDirectory`, `settings`, `selectedYear`, and `selectedMonth`; the inferred root operation can be `DATABASE_CHANGE` or `SHARED_DEVICE_DIRECTORY`.

That explains how staged control-plane hydration can create entries even though the business database is empty. It does **not** prove that an arbitrary entry bearing either operation type is harmless.

The supplied r70L source archive contains no CAMON 17P browser storage, Cloud outbox, or production operation payload. Accordingly, the exact five real patches and their individual producers cannot be identified from source alone. r70M does not guess, discard, or replay them blindly.

## r70M evidence and gate

When a verified bootstrap has a non-zero queue, **Inspect bootstrap outbox** returns each operation ID, time, type, reason/source, every patch, affected root/collection, classification, and rationale. It classifies each patch as:

- `SAFE_SETUP_RESIDUE` only for exact candidate-equivalent values under `sharedDeviceDirectory`, `settings`, `selectedYear`, or `selectedMonth`;
- `BUSINESS_OPERATION` for business kinds/collections/roots; or
- `UNKNOWN / REVIEW REQUIRED` for all other cases.

The queue can be reconciled only when the staged candidate, exact device and active lifecycle context remain valid; failed operations are zero; the local database has no independent business records; **all** patches are identified `SAFE_SETUP_RESIDUE`; and each resulting root exactly matches the candidate. Unknown or business changes keep the queue intact and block activation.

This is not a generic clear-queue feature. The normal local-save path is only suppressed while a verified candidate is staged and only for candidate-equivalent control-plane hydration; it remains active for business or unknown changes, which then block activation.

## Atomicity

Before reconciliation r70M snapshots database, observed snapshot, sync state, queue, applied registry, stage, and journal. It reconciles, commits the candidate, resumes r70L protected replay, enables Live Sync, and verifies a clean postcondition. Any error restores every snapshot and keeps the device resumable. The r70M runtime test injects database-save failure and proves the original five-entry queue and local database return intact.

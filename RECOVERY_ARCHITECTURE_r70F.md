# r70F Recovery Architecture and Source-Backed Diagnosis

## Incident diagnosis

The r70E lifecycle overlay implemented `freshDeviceCheck()` with `s.initialized || s.deviceAccessMode === 'PAIRED'`. `initialized` is Cloud Sync M4 readiness/master-state, not managed-device ownership. Consequently an otherwise unbound replacement browser could fail locally with `ZEZMS_BOOTSTRAP_CLAIM_REJECTED` before the M5A4 claim RPC was called.

The second phone’s **Owner setup required** message has a separate, source-backed cause in the shared-device login code embedded in `index.html`: `model()` creates an empty `DB.sharedDeviceAuth` model whenever that local cache is absent; `importDirectory()` returns false when `DB.sharedDeviceDirectory` is absent or stale; then `refreshUsers()` renders **Owner setup required**. Its normal rehydration depends on a later `zezms-cloud-ready` event. If the event was already emitted during load, an ACTIVE paired device can retain the empty local model and display the wrong first-setup message. That presentation does not prove business data, device binding, or lifecycle were lost.

`FORCE_UPDATE_MOBILE.html` and `sw.js` were audited. They rotate service-worker/app-shell caches only. They do not call `localStorage.clear`, touch `sessionStorage`, or call `indexedDB.deleteDatabase`; they were not the demonstrated cause of the missing staff-auth cache.

## Independent state axes in r70F

| Axis | r70F interpretation |
| --- | --- |
| Cloud Sync | readiness/initialized, online state, and cursor only |
| Device identity | current authenticated anonymous identity and device ID |
| Lifecycle | authoritative ENROLLING, BOOTSTRAPPING, VERIFYING, ACTIVE, RETIRED, or REVOKED context |
| Business DB | empty, materially populated, or staged candidate; never inferred from Cloud readiness |
| Local staff auth | present/missing and separately recoverable |
| Branch | retained control-plane assignment metadata only |

## Eligibility and resume

`inspectBootstrapEligibility()` first records local state and journal, then asks `zezms_m5a4_device_context` for a permitted live lifecycle. It permits an initialized browser with no live binding. It rejects material local business data unless it belongs to the same recorded bootstrap, an invalid paired/device-ID state, an unverifiable paired state, or a different live lifecycle. A same journal/lifecycle/device binding in BOOTSTRAPPING or VERIFYING is `SAME_BOOTSTRAP_RESUMABLE`: it never asks for another code and never clears site data. VERIFYING opens its status only and does not reconstruct or re-attest.

## ACTIVE-device staff-access recovery

The r70F action first validates `deviceAccessMode: PAIRED`, the existing Cloud identity, and the authoritative lifecycle state `ACTIVE`. It then reads only the latest `sharedDeviceDirectory` control root from the already available audit bundle, reconstructs only `sharedDeviceAuth`/directory data locally, refreshes the open staff selector, and pre-baselines the Sync snapshot before the local save. It does not invoke `pullNow`, enqueue an operation, reclaim a pairing, create a lifecycle, Canonical Restore, or modify business roots. Any guard failure restores the in-memory pre-recovery database.

## Write lock and replacement cutover

New replacements remain write-locked through ENROLLING, BOOTSTRAPPING, and VERIFYING. The Owner activation remains the only cutover: it makes the verified replacement ACTIVE and then retires the replaced Phone 2 under the existing r70E contract.

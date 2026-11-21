# Managed-device bootstrap approval

The legacy registered/enrolled-device tables describe registration and can show ACTIVE while a safe-bootstrap lifecycle is VERIFYING. The bootstrap remains write-locked until its own activation RPC succeeds.

Delivery `20261121-device-approval-r1` restores an Owner/Admin Managed Device Lifecycle panel when the optional Device Control Center is absent. It uses the existing authoritative managed-fleet read, scoped cache, lifecycle rows, normal confirmation, MFA and revision-bound activation RPC. Rendering and refreshing do not approve devices. A current Owner/Admin permission check also runs when approval is clicked.

The existing Settings composition owns one slot; a supplied control center retains ownership. Paired devices and other local staff do not receive the fallback Owner panel. Read errors remain visible rather than becoming false empty or ACTIVE results.

The claim-finally path now refreshes the existing login activation UI. It still exposes completion only when all existing local candidate, fingerprint, journal and integrity proofs pass. This fixes the missing button after claiming in the same tab; it does not reconstruct, discard or replace a candidate, or bypass server Owner approval.

The change is an exact reversible delivery transformation. Business calculations, payment code, transport, durable journals, bootstrap checkpoint/replay and guarded candidate commit sources remain unchanged. No live enrollment is approved during development or deployment.

On Main, update using `DEVICE_APPROVAL_UPDATE.html?delivery=20261121-device-approval-r1`, close all TradeFlow tabs/windows after verification, then reopen Settings. Match the existing iPhone name and device ID in Managed Device Lifecycle before choosing Approve activation. Then use Complete verified activation in the same iPhone Safari context that performed the verified download.

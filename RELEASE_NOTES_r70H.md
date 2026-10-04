# r70H — Existing ACTIVE Device Identity Relink

The affected Phone has an authenticated Owner session but an unmatched local `deviceId`; r70G therefore cannot resolve its current lifecycle. r70H treats this as local identity-pointer loss, not a new-device or restore case.

After explicit Owner selection and MFA/AAL2 server verification, r70H preserves the selected device's authoritative mode. OWNER mode retains the Owner session. PAIRED mode creates or reuses an exact anonymous session and atomically binds it to the same existing access, lifecycle and registry rows before the browser pointer changes. It then refreshes presence against that same row.

The phones remained shown as 3.31.4 because their browsers had drifted from the original device IDs, so their normal device-context calls no longer reached the original registered rows. Main and Shop continued updating because their local identities remained matched. The old M5A3 compatibility context accepted app-version input but discarded it when delegating to M5A4, while M5A4 refreshed only last-seen metadata. r70H makes the same validated M5A3 context perform the resolver-protected presence update after a verified, mode-consistent relink. It updates existing lifecycle, device-access and registered-device records—never duplicates.

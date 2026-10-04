# r70G recovery architecture

`deviceAccessMode` is a local control-plane cache, not proof of lifecycle authority. r70G keeps these concerns separate:

1. The persisted device ID identifies the proposed existing device.
2. The current Cloud session authenticates an ACTIVE-device context through `zezms_m5a4_device_context`.
3. The server context must contain the exact ACTIVE lifecycle, owner, business and branch. Local business ID, if present, must agree.
4. Only after that proof does r70G hydrate `sharedDeviceDirectory` and `sharedDeviceAuth`, then persist the minimal local control-plane fields.

This path never calls `pullNow`, never claims a pairing, never invokes Canonical Restore, and snapshots the business roots and outbox before/after its local change.

For an absent session, a temporary non-persistent Owner client signs in and proves AAL2. The normal device client creates a new anonymous identity. The optional RPC then verifies and locks the exact ACTIVE lifecycle, valid business, active branch, active access row and device register before updating only that lifecycle's access identity/control-plane rows and auditing it. The temporary Owner client is signed out. No device ID or lifecycle is created or replaced. If that same identity is already bound, the RPC returns the context without another write, audit event or lifecycle-revision change.

RETIRED, REVOKED, inactive and unknown lifecycle cases reject. A device ID alone is never enough authority.

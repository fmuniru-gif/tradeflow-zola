# ZEZMS TradeFlow v3.31.8 / r70H

Build: `20261004-r70h-existing-active-device-identity-relink`.

r70H repairs a browser that lost the local pointer to its existing ACTIVE device in both supported surviving-session states. When the original PAIRED anonymous session survives, it first resolves that exact authenticated identity to its own ACTIVE device and restores only the local pointer—no Owner login, fleet list, new anonymous identity or server rebind. When that proof is unavailable, or when an Owner/Admin session survives, **Identify this existing device** uses deliberate Owner MFA/AAL2 and explicit ACTIVE-device selection. OWNER-mode records retain the Owner session. A genuinely needed PAIRED relink receives a new, verified anonymous identity bound to that same existing lifecycle, access row and registered-device row before the local pointer changes.

It does not enrol a device, create a lifecycle, replace a device, restore business data, clear site data, replay operations, or activate M4/4.

The included SQL is source-only and was not executed. It supplies a narrow authenticated no-argument self-binding resolver, secure Owner-selected fleet verification, the self-contained paired-identity rebind (without the undeployed r70G RPC), and the M5A3 compatibility heartbeat correction.

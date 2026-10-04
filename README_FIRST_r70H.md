# ZEZMS TradeFlow v3.31.8 / r70H

Build: `20261004-r70h-existing-active-device-identity-relink`.

r70H repairs a browser that still has an Owner Cloud session but lost the local pointer to its existing ACTIVE device. It introduces **Identify this existing device**: the Owner explicitly selects the correct ACTIVE fleet entry and verifies MFA/AAL2. OWNER-mode records retain the Owner session. PAIRED-mode records first receive a new, verified anonymous identity bound to that same existing lifecycle, access row and registered-device row; only then is the local pointer changed.

It does not enrol a device, create a lifecycle, replace a device, restore business data, clear site data, replay operations, or activate M4/4.

The included SQL is source-only and was not executed. It is necessary because the server, not the browser UI, is the source of truth for the ACTIVE fleet and Registered Devices evidence. It supplies secure Owner-selected fleet verification, the self-contained paired-identity rebind (without the undeployed r70G RPC), and the M5A3 compatibility heartbeat correction.

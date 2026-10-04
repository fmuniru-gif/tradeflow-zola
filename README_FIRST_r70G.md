# ZEZMS TradeFlow Owner Edition v3.31.7 / r70G

Build: `20261004-r70g-active-device-binding-recovery`

r70G repairs a recovery gap for an **existing ACTIVE managed device** whose local browser lost its staff-login cache and/or its local access-mode marker. It does not enrol, replace, restore, clear, replay, or modify business data.

Use the normal static deployment procedure in `DEPLOYMENT_r70G.md`. For a device with a usable Cloud session, r70G alone is sufficient: choose **Recover local staff access**. This supports both current `PAIRED` devices and legitimate older `OWNER` devices.

If the Cloud session is gone, use **Reconnect this existing device**. It requires the optional Owner/AAL2 server RPC in `SUPABASE_R70G_ACTIVE_DEVICE_BINDING_RECOVERY.sql`; the SQL is supplied for review only and was **not executed**.

Never use this recovery path for a RETIRED, REVOKED, or unknown device. It will reject those cases without changing local business data.

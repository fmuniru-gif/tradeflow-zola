# r70H files changed

- `js/identity-relink-r70h.js` — preserves the selected OWNER/PAIRED mode, verifies paired session identity, and fully rolls back pointer/session state on failure.
- `index.html` — embeds r70H module and Cloud control-plane helpers.
- `SUPABASE_R70H_ACTIVE_DEVICE_IDENTITY_RELINK.sql` — unexecuted active-fleet read, Owner/AAL2 selection verification, self-contained paired identity rebind, presence and narrow M5A3 app-version propagation correction.
- Release/cache files — version and shell-cache rotation to 3.31.8/r70H.
- `tests/r70h-existing-active-device-identity-relink.integration.test.js`, SQL contract test, and r70G-preservation regression tests updated for the r70H release marker.

No business-data code, transaction logic, lifecycle creation, M4/3 behavior, M4/4 activation, or Phone 2 data was changed.

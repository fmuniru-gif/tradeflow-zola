# r70G deployment

1. Keep a copy of the currently deployed static tree.
2. Upload the contents of `GITHUB_UPLOAD_ONLY` to the same static site root. Do not nest its folder.
3. On every device, use the supplied force-update page or reload once online until the title shows **v3.31.7 / r70G**.
4. For the affected phone, use **Recover local staff access** if it still has a Cloud session. It will verify the existing lifecycle and restore only the local staff cache.

## Optional SQL gate — do not run as part of normal deployment

`SUPABASE_R70G_ACTIVE_DEVICE_BINDING_RECOVERY.sql` was deliberately **not run**. Review and execute it manually in Supabase only when the no-session **Reconnect this existing device** path is needed. It is necessary only because a newly created anonymous identity cannot safely bind itself to an ACTIVE lifecycle. The function requires an authenticated OWNER/ADMIN, AAL2, exact ACTIVE lifecycle/device/business/branch/access validation, and writes an audit event.

Do not run any SQL automatically. Do not use Canonical Restore, Repair/replace, site-data clearing, or new-device setup for an ACTIVE device being recovered under this release.

## Acceptance check

Confirm the device is still listed as the same ACTIVE lifecycle in Managed Device Lifecycle; sign in using the restored staff selector; verify its device ID, queue/cursor and Cloud-vs-local business audit remain unchanged.

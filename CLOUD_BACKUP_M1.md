# Cloud Backup & Restore — Milestone 1

## Delivered

- Backup Manager module (`js/backup-manager.js`).
- Backup settings scaffold in **Settings**.
- **Backup Now** card in **Sync / Backup**.
- Manual local backup download as a portable JSON file compatible with the existing **Import JSON backup** screen.
- Backup history data model stored in `DB.backupHistory`.
- Backup settings data model stored in `DB.backupSettings`.
- Provider adapter contract for browser downloads, future desktop packaging, and future cloud providers.
- Backup events: `backup:completed`, `backup:failed`, and `backup:settings-saved`.

## Browser/PWA behavior

Browsers do not permit silent writing to arbitrary local folders. Therefore, this milestone creates a user-visible download when **Backup Now** is selected. It is compatible with offline use.

When ZEZMS is later packaged as a desktop application, the existing `ZEZMS.backup.adapters.desktop` contract can be implemented to write scheduled backups automatically to a selected local directory.

## Cloud readiness

The `ZEZMS.backup.adapters.cloud` placeholder is intentionally disconnected in this milestone. A later milestone can implement Google Drive, OneDrive, Dropbox, Supabase Storage, or a private ZEZMS cloud service without changing the user interface or backup history model.

## Restore

Restore is deliberately not enabled in Milestone 1. The existing **Import JSON backup** workflow remains unchanged and is still the supported recovery mechanism. A later restore milestone should add validation, preview, confirmation, and rollback protection.

## Testing checklist

1. Open **Sync / Backup** and select **Backup Now**.
2. Confirm that a JSON download starts and a success message appears.
3. Open **Settings** and confirm the Backup settings section is visible.
4. Save backup settings and confirm the success message.
5. Return to **Sync / Backup** and confirm that Last backup shows a timestamp.
6. Refresh the application and confirm the backup history and settings remain available.

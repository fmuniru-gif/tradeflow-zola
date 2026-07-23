# ZEZMS Live Cloud Sync — Milestone 3

## What M3 adds

- Automatic cloud upload shortly after every local database save.
- Realtime delivery of newer cloud revisions to other online devices.
- Offline queue: local work remains saved and uploads after reconnection.
- Supabase email/password cloud account with persistent browser sessions.
- Row Level Security so each cloud account can access only its own ZEZMS database.
- Atomic revision checks to prevent silent overwriting by another device.
- Manual **Upload now** and **Download now** controls.
- Initial-master workflow for safely onboarding additional devices.
- Conflict controls: **Keep this device** or **Use cloud copy**.
- Google Drive Backup & Restore M2 remains available for disaster recovery.

## Part A — Create the Supabase backend

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Open `SUPABASE_SETUP_M3.sql` from this release.
4. Copy the whole SQL script into the editor and run it once.
5. Open **Project Settings → API**.
6. Copy:
   - the Project URL;
   - the publishable key (or legacy anon key).

Never put a `service_role` or secret key in the browser app.

## Part B — Configure the first device

Use the device that already contains the complete and correct ZEZMS records.

1. Sign in to ZEZMS as an administrator.
2. Open **Settings → Cloud Sync M3**.
3. Enter the Supabase Project URL.
4. Enter the publishable key.
5. Give the device a clear name, such as `Main Till`.
6. Select **Save cloud configuration**.
7. Enter an email address and a strong cloud password.
8. Select **Create cloud account**.
9. If Supabase asks for email confirmation, confirm the email and return to ZEZMS.
10. Select **Sign in**.
11. Select **Upload this device as cloud master**.
12. Select **Enable live sync**.

The Sync / Backup page should show **M3 ACTIVE**, **Live sync connected**, and a cloud revision greater than zero.

## Part C — Configure every additional device

1. Install/open the same GitHub Pages ZEZMS app.
2. Open **Settings → Cloud Sync M3**.
3. Enter the same Supabase URL and publishable key.
4. Give this device a unique name, such as `Office Laptop` or `Cashier Phone`.
5. Save the configuration.
6. Sign in with the same ZEZMS cloud email and password used on the first device.
7. Select **Download cloud master to this device**.
8. Verify products, stock, sales, and balances.
9. Select **Enable live sync**.

## Normal daily operation

When Device A records a transaction:

1. ZEZMS saves it immediately to Device A's local offline database.
2. M3 marks the change as pending.
3. After a brief debounce, M3 uploads the complete current database with the expected cloud revision.
4. Supabase creates the next revision.
5. Device B and other online devices receive the Realtime notification.
6. A clean device automatically applies the newer cloud copy and refreshes its interface.

When a device is offline, its local records continue to work. The pending change uploads after the device reconnects.

## Conflict protection

M3 synchronises a revisioned database snapshot. It does not silently merge two devices that make different transactions against the same old revision.

If two devices have unsent changes at the same time, ZEZMS displays a conflict:

- **Keep this device**: its complete database becomes the new cloud master.
- **Use cloud copy**: its unsent local differences are discarded and the newer cloud copy is applied.

For M3, avoid simultaneous transaction entry on multiple devices whenever practical. The later transaction-ledger milestone can add field-level or transaction-level merging for true concurrent tills.

## Backup remains important

Cloud Sync is not a replacement for backup. Continue using Google Drive Backup M2 or local JSON backup regularly. Sync can reproduce an accidental deletion across devices; a dated backup can recover an earlier state.

## Security notes

- Use only the Supabase publishable key in ZEZMS.
- Never expose a Supabase secret or `service_role` key.
- The SQL script enables Row Level Security and limits the sync row to the signed-in account.
- Use a strong, unique cloud password.
- The same business cloud account is used on all authorised devices in M3.

## GitHub Pages deployment

Upload the complete extracted release, including `index.html`, `sw.js`, `manifest.json`, the full `js` folder, and the SQL/guide files if you want them retained in the repository.

After deployment:

1. Close old ZEZMS tabs.
2. Reopen the GitHub Pages site.
3. Perform a hard refresh once.
4. Confirm that **Sync / Backup** displays **M3 ACTIVE**.

The M3 service-worker cache is:

`zezms-m3-operations-20260723-r1`

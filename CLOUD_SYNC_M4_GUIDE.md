# ZEZMS Cloud Sync M4 — Transaction-Level Merging Guide

## What M4 changes

M3 synchronised one complete database snapshot. If two devices changed the same old snapshot, one device had to be chosen as the master.

M4 keeps a compact cloud master for onboarding and then uploads each saved change as an idempotent transaction operation. Operations from different devices are replayed in server order and merged into every device.

Examples:

- A sale on Device A and an unrelated sale on Device B are both retained.
- A stock-in on one device and a sale on another update the same FIFO row by numeric deltas.
- Debtor, creditor, depositor and cash balance movements are merged as deltas.
- New receipts, expenses, account transactions, stock rows and audit records are inserted independently.
- Duplicate delivery of the same operation is ignored by its unique operation ID.

## Important upgrade rule

Upgrade **all devices** to v3.4.0 before recording new transactions. Do not leave an older M3 device active after M4 has been initialized, because M3 does not understand the M4 operation log.

## Before upgrading

1. On the current main device, open **Sync / Backup**.
2. Create a local backup and a Google Drive backup.
3. Make sure the device contains the complete and correct records.
4. Confirm that no other device has unsent M3 changes.

## Supabase database upgrade

1. Open the existing Supabase project used by M3.
2. Open **SQL Editor**.
3. Open `SUPABASE_UPGRADE_M4.sql` from this release.
4. Copy the complete script into the SQL Editor.
5. Run it once.
6. Confirm that the verification result lists:
   - `zezms_sync_operations`
   - `zezms_sync_state`

The script preserves the existing M3 cloud snapshot. It adds:

- an append-only operation table;
- per-owner Row Level Security;
- an atomic operation-upload function;
- stock and cash counters for concurrency protection;
- Realtime publication for the operation log.

## Deploy the app

1. Extract the complete v3.4.0 ZIP.
2. Upload all extracted files and the complete `js` folder to GitHub.
3. Replace the older files.
4. Wait for GitHub Pages deployment to complete.
5. Close every open ZEZMS tab and installed PWA window.
6. Reopen ZEZMS and perform one hard refresh.
7. Confirm that the footer/system information shows **v3.4.0** and **M4 TRANSACTION MERGE**.

## Initialize the main device

Use the device that contains the authoritative complete data.

1. Sign in as administrator.
2. Open **Settings → Cloud Sync M4**.
3. Confirm the Supabase project URL and publishable key.
4. Save the cloud configuration.
5. Sign in with the existing ZEZMS cloud email and password.
6. Select **Activate M4 from this device**.
7. Read the warning and confirm.
8. Select **Enable live sync**.
9. Open **Sync / Backup** and confirm:
   - Status: `Live transaction merging connected`
   - Queued transactions: `0`

Activating M4 stores the current database as the compact baseline and seeds the protected stock and cash counters.

## Initialize every other device

1. Upgrade the device to the same v3.4.0 release.
2. Open **Settings → Cloud Sync M4**.
3. Use the same Supabase project URL and publishable key.
4. Give the device a distinct name.
5. Sign in with the same ZEZMS cloud email and password.
6. Select **Download M4 cloud master**.
7. Confirm that the products, stock, accounts and receipts are correct.
8. Select **Enable live sync**.

Do not record transactions on an additional device before it has downloaded the M4 cloud master.

## Normal operation

When a device saves a transaction:

1. ZEZMS saves it locally immediately.
2. M4 creates a unique operation containing only the changed records and numeric deltas.
3. The operation is queued if the internet is unavailable.
4. Supabase accepts the operation once and assigns a server sequence.
5. Other devices receive a Realtime notification.
6. Each device downloads missing operations in server order and merges them.

The **Upload queued transactions** and **Receive transactions now** buttons remain available for manual checks.

## Concurrent stock protection

M4 maintains a protected cloud counter for each FIFO row's remaining quantity. When two devices try to sell the same final units:

- the operation that reaches the server first is accepted;
- a later operation that would make remaining stock negative is rejected;
- the rejected local transaction is rolled back automatically;
- the device downloads the accepted cloud operations;
- a red rejected-transaction warning remains visible in Sync / Backup.

Because a paper receipt may already have been handed to a customer, staff should watch for the rejection warning whenever two tills are selling the same low-stock item.

## Concurrent cash protection

Cash-wallet deductions are checked atomically. A transaction that would make a shared wallet negative is rejected and rolled back in the same manner.

## Offline use

Transactions remain saved locally and are listed in the M4 operation queue. When the device reconnects, M4 receives newer cloud operations, rebases the queued local operations, and uploads them.

## Identifier safety

New receipt, stock, account and transaction identifiers now include milliseconds and a random suffix. This greatly reduces the chance that two devices create the same identifier at the same second.

## Maintenance

The operation log is append-only. Re-activating a new compact baseline can be used later as a maintenance/compaction step, but only when:

- all devices are online;
- every device shows zero queued transactions;
- one verified device contains the complete merged data;
- no transactions are being entered during the compaction.

Always create a Google Drive backup before compacting.

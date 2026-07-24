# ZEZMS v3.4.0 — Cloud Sync M4 Release Notes

## Delivered

- Transaction-level merging across devices.
- Append-only, idempotent cloud operation log.
- Offline transaction queue with automatic retry.
- Realtime operation delivery through Supabase.
- Rebase of queued local operations around newly received cloud operations.
- Additive merging for stock quantities, account balances and cash balances.
- Independent merging of receipts, sales, expenses, account transactions and audit records.
- Atomic server-side remaining-stock guard.
- Atomic server-side cash-wallet guard.
- Automatic rollback and local rejection log when a transaction cannot be accepted safely.
- M3 snapshot retained as the onboarding/compaction baseline.
- Collision-resistant IDs containing milliseconds and a random suffix.
- Existing M2 Google Drive backup/restore, receipt reprinting, Undo tools, account deletion, KPI charts and Product ID search retained.

## Required database action

Run `SUPABASE_UPGRADE_M4.sql` once in the existing Supabase project before activating M4.

## Required device action

Every active device must be upgraded to v3.4.0. Initialize one verified main device with **Activate M4 from this device**. On every additional device, use **Download M4 cloud master** before recording transactions.

## Cache version

`zezms-m4-transaction-merge-20260724-r1`

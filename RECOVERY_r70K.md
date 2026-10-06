# Current CAMON 50 PRO recovery

## Preconditions

- Deploy and load r70K first.
- Do not reset/re-pair, clear site data, use Canonical Restore, upload/download a backup, add a sale manually, or rewrite the cursor.
- Do not proceed if queue or failed-operation counts become non-zero or integrity reports a new warning.

## Read-only proof

1. Open **Data Integrity & Sync** on the affected CAMON.
2. In **Safe Bootstrap replay audit**, enter `3173` as the bootstrap boundary and `3188` as the Cloud head.
3. Select **Inspect replay boundary (read-only)**.
4. Download the audit. It must identify the exact Cloud row(s) that are `MISSING_EFFECTS`, show their operation/sale/receipt IDs, and mark them safe for targeted replay. A row showing a conflict or a present/effect-neutral result is not eligible.
5. If there is no uniquely proven safe missing row, stop. Do not guess or run a broad replay.

## Targeted repair only after proof

1. Select only the proven missing row(s) in the audit table.
2. Choose **Replay selected proven-missing effects** and confirm the displayed operation count.
3. r70K fetches the bounded Cloud range again, verifies the same cursor, operation ID and payload signature, verifies that the local sale/receipt effect remains absent, applies only safe patches, writes a local durable journal and verifies the postcondition.
4. The local cursor remains unchanged. Cloud history, identity, tenant, branch and lifecycle are not modified.
5. Run Local Integrity Audit and Compare Local vs Cloud. Expected outcome: the missing sale returns, no duplicate sale or receipt appears, cursor remains 3188, queue and failed counts are zero, and integrity is clean.

If revalidation fails at any point, r70K restores its in-memory local database and applied-operation registry from before the requested replay and stops. Preserve the audit; do not retry through a different recovery tool.

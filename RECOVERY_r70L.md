# Current CAMON 50 PRO recovery

## Guardrails

Known state: Safe Bootstrap completed, M4/3 Active, M4/4 Ready, cursor `3188`, queue `0`, failed `0`, integrity clean, Products `354`, Stock rows `3446`, Sales `64`; immediately before bootstrap commit Sales was `65`.

Do not re-pair, reset, restore a backup, clear site data, rewind a cursor, or create a replacement sale manually.

## First action after r70L deployment — read-only only

1. On CAMON 50 PRO, open **Data Integrity & Sync**.
2. In **Safe Bootstrap replay audit**, use boundary `3173` and Cloud head `3188`.
3. Select **Inspect replay boundary (read-only)** and download the audit.
4. Stop unless it identifies a specific row as `MISSING_EFFECTS` and safe for targeted replay. Record the cursor, operation ID, transaction kind, sale/receipt IDs, source device and reason.

## Targeted replay, only after proof

1. Select only the proven missing row(s).
2. Select **Replay selected proven-missing effects** and confirm the count.
3. The application re-fetches the bounded Cloud range, revalidates cursor/ID/payload signature and local absence, applies only safe patches, journals locally and verifies the postcondition.
4. Re-run Local Integrity Audit and Compare Local vs Cloud. Expected: exact missing effects restored once, no duplicate sale/receipt, cursor still `3188`, queue/failed `0`, clean integrity.

If the audit shows a conflict, an already-present/effect-neutral result, more than one ambiguous row, or any warning, stop and preserve the audit. r70L must not be used to guess a sale or broadly replay history.

# Canonical recovery workflow — 3 November 2026

Canonical Restore now handles the failures reproduced during Main recovery:

- It uses a real manual pause, cancels a pending upload timer, and waits for the serialized sync boundary. A transport stop is still available separately for ordinary reconnect handling.
- Its executing, interrupted-preparation, and pending-verification states hold automatic initialization and trading through the existing bootstrap gate. Focus, online and interval callbacks cannot open another month during replacement.
- A pending deterministic rollover is eligible only when retained Cloud history contains a unique, valid, other-device winner. Before any disposition the Owner confirms the complete canonical replacement and the app downloads the original business safety backup. Fresh authenticated authority is checked again. Exact outbox evidence is retained and read back locally before that superseded queue is removed. No operation is uploaded, no speculative operation is reversed, and no applied-operation acknowledgement is fabricated.
- Preparation is durable. Interruption or storage failure holds the device for resuming recovery; unknown business operations and inconsistent evidence remain blocked. On successful post-restore verification the exact evidence is retained as an archive before the preparation hold is released.
- Registered wallets with matching definitions may represent zero by either an absent balance slot or numeric `0`. Unknown wallets, changed definitions, string values, and nonzero differences are rejected.
- Only a stock row's numeric profit may normalize to the corresponding Cloud value, within eight floating-point ULPs capped at `1e-9`, with identical values at two decimal places. Actual price, quantity, cash, account, and profit differences remain blocked. Original input files are not rewritten.

The ordinary M4/3 wire format, rule hashes, FIFO, operation application, Cloud checkpoint projection, correction history, device identity, Shop recovery and branch controls are unchanged. No SQL or business-data migration is included.

## Owner workflow

Create a current backup on the healthy device. Select it on the faulty Owner device and choose **Check selected backup**. Review the source and choose **Recover this device**. Its single replacement confirmation authorizes the local replacement and preservation of any independently verified superseded rollover. Allow the safety download and reload. Enable Live Sync only after **Canonical Restore verified**.

Do not clear storage or delete recovery evidence after interruption. Reselect and verify a current backup and resume Canonical Restore. An invalid preparation or a queue that differs from its archived original requires review, not forced removal.

## Delivery and validation

Delivery namespace: `20261103-canonical-recovery-r1`. The recovery modules are embedded in the verified shell. Updated bootstrap guards are coupled to that same shell, preventing an older worker from mixing them with old cached guard scripts. Service-worker activation remains passive; no cache deletion, forced takeover, or browser-data clearing is introduced.

Tests use synthetic business fixtures and disposable browser contexts. They cover the actual production module, queue evidence, interrupted writes, monetary differences, Owner restrictions, reload locks, and old-worker delivery. Live customer databases are never used by tests.

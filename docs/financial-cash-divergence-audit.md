# Cash-bucket divergence: read-only evidence plan

Status: **financial reconciliation NO-GO**. Production `main` was `4a774e86ff0228c2a3804a127959703497f3c03c` when this review began. No actual Main, Shop, Camon 50 Pro or cloud financial records were supplied or changed. The comparison utility must not be used to select a winning device or adjust a balance.

## Source findings and risks

- `DB.cashBalances` is persisted under `tradeflow_v321_zola`. The standard cash UI displays the underlying balance keys, formatted for presentation. Capture the visible wallet names and displayed values separately to detect naming, rounding or stale-render discrepancies.
- `js/cloud-sync.js` diffs each `cashBalances` key into an additive `root-object` delta. Cash log rows, expenses, account transactions, receipts, purchases and reversals are separate patches/collections. A balance may differ even if an apparent transaction row is present; the full multi-patch operation must be inspected.
- The pull path applies server rows in sequence, temporarily reverses unsent local operations, then reapplies them. It records op IDs in a durable applied register and records failed applies and an interruption journal. These are safeguards, but a missing/failed operation, interrupted apply, pending local delta, stale cursor or independently edited local projection could explain divergence. Source review alone does not establish which occurred.
- Applied IDs are retained up to 50,000, failed entries up to 100 and rejected entries up to 50. Absence from a truncated register is not proof an older operation was never applied. The highest cursor is not a financial authority.

## Minimum device evidence

For **each** of Main, Shop and Camon 50 Pro, obtain one coherent, timestamped snapshot from its existing browser profile: full persisted `tradeflow_v321_zola` database, M4 state/cursor, pending queue, failed/rejected lists, applied operation IDs and interrupted-apply journal. Record the wallet display screenshot at the same time. Keep all transaction references, cash-log rows and operation IDs in encrypted evidence. Do not use the normal Local Backup button for a strictly read-only collection: its implementation updates backup history.

`diagnostics/financial-audit/index.html` is a proposed standalone, same-origin collector. It does not import the business app, request cloud data, or write browser storage. It encrypts only fixed existing keys in memory, checks for a stable double read and downloads an AES-GCM file. Deploying that diagnostic page separately requires Owner approval; opening the file as `file://` cannot read the existing origin. Close other TradeFlow tabs for a stable snapshot, but do not stop or change Live Sync settings. If the page reports STOP, preserve the original state and do not retry by clearing data.

Keep the three encrypted files and passphrases on a trusted computer. Run `node tools/financial-audit/analyze.cjs MAIN.json SHOP.json CAMON50.json` locally; it asks for passphrases interactively and emits a per-wallet comparison. Save the output privately. The tool reports exact local balance spread, pending cash deltas, failed/pending counts, cash-log IDs missing from a device and duplicate IDs. Cross-device absence is a review signal, not proof of transaction loss.

## Minimum cloud evidence and decision rule

An authenticated Owner read-only export must identify the correct production business and provide the cloud master payload/cursor plus a continuous, server-ordered operation log from that cursor through a stable head, including op IDs, device IDs, complete payloads and hashes. Read the head before and after; reject a changing head, sequence gap, hash mismatch or RLS failure. A SQL-editor administrator view does not establish Owner RLS. No mutation RPC or SQL update is part of this audit. The current local analyzer deliberately labels cloud projection and first divergence **NOT_VERIFIED** until this evidence is independently obtained and a reviewed replay of its exact contract is available.

For each wallet, compare: local balance on each device; verified cloud balance at a stated head; locally queued deltas; cash-log and linked expense/account/supplier/receipt/reversal IDs; server operation IDs and sequence; and failed or unapplied operations. Locate the first *evidence-backed* divergent server sequence or local write. Classify a transaction as missing/duplicated only after both its business record and full cash-delta operation have been checked across the cloud and all three devices. A mismatch in display alone must be separated from a stored-value mismatch.

Until all three device files and the stable cloud ledger exist, avoid manual balance correction, transaction replay, queue clearing, snapshot replacement or forced synchronization. Camon 17P activation stays on hold while financial divergence is unexplained.

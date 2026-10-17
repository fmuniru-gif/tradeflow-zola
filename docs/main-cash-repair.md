# Main-only GH₵240 cash reconciliation — review candidate

**Execution status: NO-GO pending separate Owner approval, publication of this exact reviewed candidate, and a successful genuine Owner preflight on Main.** No production cloud read was possible in development: the completed Cloud-vs-Local audit was not exported, and no genuine Owner session was supplied to this workspace. The screen performs that read-only verification itself before enabling repair. Do not use a backup from Shop or Camon 50 Pro as Main's replacement database.

## Evidence bound to this candidate

The completed three-device comparison at `C:\Users\USER\Downloads\tradeflow-financial-comparison.json` identifies Main `9a5ab8eb-f67e-425c-866d-574b641295f0` as missing these three cash-log IDs, while Shop and Camon 50 Pro have them:

1. `CB-20261015-112834-639-6946A5A99F4241718B772CCAF5F30F00` — `Others` (Personal Wallet), GH₵70 deduction.
2. `CB-20261015-113005-658-C30CD6B2D6A146368C0F0CADCEC891DA` — Cash in Hand, GH₵100 deduction.
3. `CB-20261015-113041-508-CA67DEA2C4454137B56086CDBDFB92E7` — Cash in Hand, GH₵70 deduction.

The second cash-log record links to expense `EXP-20261015-113005-658-4F25DF798ADA47048395FE1C9E6B1969`. The saved local comparison showed Main at GH₵6,170 Cash in Hand and GH₵370 `Others`, versus GH₵6,000 and GH₵300 on Shop/Camon 50 Pro. Those historical amounts are **not** treated as current cloud balances. The Owner reports a live Cloud-vs-Local result of four Missing Locally, zero Missing in Cloud, zero Payload Mismatch and zero Unapplied Cloud Operations; no complete report or cloud payload was saved.

## Scope and safeguards

`diagnostics/main-cash-repair/` is a standalone same-origin page. It does not load the TradeFlow app or initialize cloud synchronization. It reads Main's fixed local database/M4 keys and the existing Owner Supabase session. Cloud requests are GET-only: authenticated Owner identity, cloud master, ordered operations and stable head. The source project URL is pinned to the existing production project; the stored public key is checked by Supabase. No token or business payload is displayed outside the exact local preview or sent elsewhere.

The page uses the existing `js/sync-integrity-v3161.js` cloud projector and collection comparator. It requires the exact Main identity, an Owner-mode session, an empty outbox and failed list, no interrupted apply journal, local cursor at stable cloud head, exactly four missing records and no other collection differences. It verifies the complete cloud records, source operation IDs and hashes, linked expense, each original cash delta, and every wallet. For each affected wallet, the local balance must already equal cloud or exceed it by exactly the full missing effect (GH₵170/70). Partial or unrelated discrepancies stop the repair. The candidate **sets affected balances to verified current cloud values**; it never subtracts GH₵240 again.

Before the sole local database write, Chrome's file picker saves a full encrypted snapshot of Main's database and M4 metadata to a user-chosen file. The page reads the file back, decrypts it, and checks exact equality. `tools/main-cash-repair/verify-backup.cjs` independently verifies that file offline. The page rechecks local state, cloud records, head and master immediately before one Owner confirmation. It then writes only `tradeflow_v321_zola` once, adding the four exact records, setting only the two wallet values, and appending a local-only audit entry with IDs and backup hashes. It calls no normal `saveDB`, push, pull, RPC or business transaction function. It reads back the database and automatically reruns the cloud comparison. Reopening the page after success reports `ALREADY_REPAIRED` and makes no write.

The app must be closed in all other Main tabs during this procedure. A storage event or page-background event invalidates the backup; a final raw-state comparison rejects a concurrent change. Browser tabs cannot be forcibly closed by the page, so this operator step is mandatory. A failed postcheck after the atomic database write is reported as `REPAIR_SAVED_POSTCHECK_STOP`; retain the encrypted backup and stop. No automatic rollback or repeated deduction occurs.

## Owner procedure after separate deployment approval

1. On Main's existing Chrome profile, ensure the genuine Owner cloud session is signed in. Close **all** TradeFlow app tabs and avoid transactions on Main during the brief repair. Keep Shop and Camon 50 Pro operating normally; do not use Camon 17P.
2. Open `https://fmuniru-gif.github.io/tradeflow-zola/diagnostics/main-cash-repair/preflight-r2.html`. This distinct path avoids the existing service worker's cache of the older diagnostic page and script. Wait for the automatic read-only preflight. **STOP** on any code beginning `STOP_` or `NO_CHANGE:`. Do not use developer tools or retry with another device.
3. Review all four exact cloud payloads, source operation IDs and the current cloud/local wallet values shown on the screen. Enter a new 20+ character backup passphrase, save the encrypted backup to a safe file location and wait for its readback-verification message. Keep the passphrase separately. Copy the encrypted file to a second storage location after the operation.
4. Select **Confirm Main-only repair** and accept its single confirmation. Wait for `PASS: Main matches the current cloud projection…`. Keep the backup and the displayed audit details. If the page reports a postcheck stop, leave Main's app closed and obtain review of the saved backup and local state before any further action.

This page has not been published, opened on Main, or connected to production Supabase. Shop's three `SHARED_DEVICE_DIRECTORY` operations are not touched. The root app shell, service worker, manifest, normal sync code and all production cloud records remain unchanged by this candidate.

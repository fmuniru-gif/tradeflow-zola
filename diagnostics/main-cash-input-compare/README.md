# Main audit input comparison

This standalone page is a read-only diagnostic. It cannot run the cash repair.

## Why it exists

Production `index.html` embeds Integrity Core r60o (version 3.20.0) and Cloud Sync r61o. The r3 repair page loads `js/sync-integrity-v3161.js` (version 3.16.1). The production Cloud Sync audit uses `zezms_m43_checkpoint_latest()` as its baseline when available; r3 reads `zezms_sync_state` as its baseline. Production Integrity Core also has a larger identity registry, M4/3 replay rules, historical-reference handling, and nine management collections absent from the older module. These are established source differences; their effect on Main must be measured there.

## Main procedure

1. If the normal Main audit tab is still open after the already completed Cloud-vs-Local audit, use **Export Integrity Snapshot** now. Do not rerun the audit or use Catch Up, Retry Pending Uploads, or a reconciliation action. The existing audit left its local audit in memory, so this export only downloads a file. The snapshot includes record IDs and hashes; keep it private. If the normal tab was closed, proceed without the snapshot and treat runtime-versus-saved database state as unverified.
2. Close the normal app tab. Open this page from the same GitHub Pages origin on Main. Select the just-downloaded snapshot and click **Compare audit inputs (read only)**. The page verifies the Main device ID and current authenticated Owner session.
3. Download the **safe report** and provide only that report for review. It contains collection counts, aggregate SHA-256 digests, cursors, comparison totals, and stage labels; it omits record IDs, payloads, wallet amounts, public keys, and access tokens.

The report runs four combinations: legacy rules with the old master, legacy rules with the M4/3 checkpoint, current rules with the old master, and current rules with the M4/3 checkpoint. This separates baseline and projection differences. It also compares the normal app's in-memory snapshot with the saved local database. If Main changes during the run, the diagnostic stops.

The recorded production SQL definition of `public.zezms_m43_checkpoint_latest()` (saved in `14_CHECKPOINT_FLEET_PROTOCOL_SEARCH.csv`) contains a single `SELECT` from `public.zezms_sync_checkpoints` filtered by `auth.uid()`. The diagnostic invokes this existing read-only function via PostgREST; the HTTP method is POST because Supabase RPC uses POST. All other cloud calls are GET. No table mutation, sync call, queue update, or localStorage write is present in the diagnostic.

Until a genuine Main report reproduces and explains the discrepancy, the cash repair remains blocked.

# r70K root-cause report

## Verified cause

`commitM5a4BootstrapCandidate()` replaces the active local database with the verified candidate and resets the local cursor to the candidate cursor. In r70J, it did **not** reset or reconcile `zezms_cloud_sync_m4_applied_v2`, a separate durable applied-operation registry.

The normal pull loop determines `alreadyApplied` from that registry. When it sees an acknowledged operation, it skips `applyOperation()` yet still records the operation sequence as the current cursor. Consequently, the following r70J sequence is possible:

1. Ordinary Live Sync runs early while a candidate at cursor 3173 is still staged and records operations 3174–3188 in the applied registry.
2. Safe Bootstrap replaces the database with its verified cursor-3173 candidate.
3. The stale registry survives the replacement.
4. The pull loop sees an operation such as the sale in the 3174–3188 range as already applied, skips its business mutation, and advances the cursor to 3188.

That explains how a device can truthfully show cloud cursor 3188, an empty queue and no failed operation while locally materializing only 64 rather than 65 sales.

No separate transaction or receipt deduplication registry was found in the r70J Cloud Sync runtime. The durable cross-database idempotency decision point is the applied-operation registry; entity identity checks then protect against duplicate sale and receipt inserts.

## r70K correction

- Before a candidate database is committed, r70K fails closed unless queue and failed-operation counts are zero.
- It retains only applied-operation entries at or below the candidate cursor. Every acknowledgement above that boundary is discarded and persisted with readback before database replacement.
- A locally staged Safe Bootstrap candidate blocks ordinary pull, push, reconnect and Live Sync until the explicit commit-to-activation path starts.
- The immediate verified activation path is allowed to replay from the candidate cursor. Repeated pulls stay idempotent through the normal applied-operation registry and entity identity checks.
- A post-event read-only audit identifies acknowledged-but-missing effects. It can replay only a selected, unchanged Cloud operation after absence and safe-patch revalidation; it does not alter Cloud history or the acknowledged cursor.

## Production record identification

The supplied source package contains no CAMON operation payloads, so it cannot truthfully name the missing production operation or sale in advance. r70K makes it determinable on the affected device: inspect cursors 3173–3188 and record the row marked `MISSING_EFFECTS`. The audit exports its cursor, operation ID, transaction type, sale/receipt identifiers, source device, applied-metadata evidence, inferred r70J duplicate decision, and materialization result without tokens or credentials.

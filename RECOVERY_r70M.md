# CAMON 17P safe activation/recovery procedure

1. Deploy r70M without clearing data.
2. On an Owner/Admin device, refresh Device Control Center and download the Fleet Reconciliation Report.
3. Identify which CAMON 17P identity owns the staged browser/profile. If there is any identity/journal conflict, stop.
4. On that same staged device, open the verified Safe Bootstrap status. Do not create a new pairing.
5. If the queue is zero, use **Complete activation** after Owner approval.
6. If the queue is non-zero, choose **Inspect bootstrap outbox**. Save the report/evidence outside the device if needed.
7. Proceed only when all operations/patches are classified `SAFE_SETUP_RESIDUE` and the inspector says activation eligible. The r70M activation wrapper will take local snapshots, reconcile only those exact superseded setup entries, commit, replay safely, enable Live Sync, and verify postconditions.
8. If an entry is business or unknown, or any error occurs, stop. The original local state, queue, stage, journal, registry, and snapshots remain/restored so recovery can resume after review.

Never use a raw import, a generic queue clear, a cache/site-data reset, or a second replacement as a shortcut for this case.

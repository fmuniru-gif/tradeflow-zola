# Verified local sync commits

Baseline: `505e1d8d76aefe87692dbafbd4efb4103988729f`.
Delivery: `20261111-sync-durability-r1`.

## Reproduced defects and scope

The previous restart handler marked an interrupted operation applied whenever
the database differed from its recorded before-hash. A deterministic reproduction
changes an unrelated field while leaving the cash entry and wallet untouched:
the old handler acknowledges the absent operation and advances its cursor. This
proves a defect; it does not establish the cause of Main's November 9 incident.

The ordinary receive path also durably saved each inverse/rebase intermediate
image before restoring queued local operations. Those intermediate states could
survive an interruption. Normal local saves persisted the database before their
outbox entry, and queue/register/state persistence could silently swallow storage
errors. A stale second window could overwrite another window's database.

## Changes

Normal receives stage the existing inverse, ordered replay, validation and queue
reapplication in memory. A single complete database image is saved before its
queue, applied register, failed list and cursor are committed. Normal established
`saveDB()` transactions use the same path to commit business effects and their
original, natively sealed outbox operation together. Existing financial rules,
operation IDs, hashes, capability checks, Cloud transport, permissions and
recovery/activation requirements remain authoritative.

The compact `zezms_sync_durable_commit_v1` write-ahead journal stores hashes of
the exact before/after database strings, before-metadata hashes, exact after
metadata, and the existing device/Owner/business/branch binding. It does not store
another database copy or auth tokens. All writes and removals require exact
read-back. If the complete database reached storage, restart finishes its exact
bookkeeping; if no database write occurred and all metadata is unchanged, restart
discards the uncommitted intent. Any other database, metadata or identity result
retains the journal and blocks normal business writes and sync for review. A quota
failure must never be resolved by clearing site data or deleting the journal.

The old operation journal is recovered only from its exact recorded after-hash,
or treated as uncommitted from an unchanged before-image with no acknowledgement.
An older journal with changed/unproven data is retained and requires review.
This does not automatically repair any historical missing business effects.

The database service checks read-back and detects changes since this window last
loaded or saved the database. A read-only load cannot reset that protection.
Normal Cloud state, queue and applied-register writes no longer silently report
success after a storage error. Window interference detection does not replace an
OS-level transaction across every old browser version; avoid simultaneous trading
in multiple TradeFlow windows in one browser profile.

## Validation and delivery

Unit fault injection interrupts every write boundary, verifies reopen completes
one entire state, and tests invalid journals, unrelated changes, wrong binding,
quota failures and stale-window rejection. Browser tests run the assembled app
and native operation engine with synthetic receive/network dependencies. They
exercise local cash saves, queued cash rebase without intermediate durable images,
restart after register failure, and stale-window rejection. Existing suites cover
Cloud acknowledgement loss, stale authenticated responses, repeated pages, recovery
holds, passive worker updates and business behavior.

The exact new assembly transformation reverses to the production baseline. Only
the separately reviewed database service changes among pre-existing standalone
application modules. Earlier preservation tests explicitly remove this reviewed
transformation or exclude that single service; they retain all other comparisons.
No device data, Cloud records, SQL policies, enrollment or Camon17 activation is
changed during development or CI. An authorized release uses the passive
`SYNC_DURABILITY_UPDATE.html` page; close all TradeFlow windows and reopen normally.
Passing synthetic tests does not certify physical-device convergence or eliminate
all possible future sync failures.

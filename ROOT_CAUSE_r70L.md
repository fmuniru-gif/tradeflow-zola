# r70L root-cause addendum

## r70K correction retained

r70K correctly removed acknowledgements above the Safe Bootstrap candidate boundary from `zezms_cloud_sync_m4_applied_v2`. This prevents a stale durable acknowledgement from claiming that a post-boundary operation survived candidate replacement.

## Same-device skip defect

The inherited pull loop still used this normal-live-sync decision:

```js
if (!alreadyApplied && (row.device_id !== state.deviceId || ownAcceptedFromQueue)) {
  applyOperation(operation, { silent: true });
}
```

For an operation made by the current device before candidate replacement, then absent from the candidate and absent from its queue, r70K produces `alreadyApplied === false`, `row.device_id === state.deviceId`, and `ownAcceptedFromQueue === false`. The inherited condition skips its materialization but the following code acknowledges the operation and advances the cursor. This can recreate the prohibited state: cursor ahead while the required local sale/receipt or other effect is absent.

## r70L correction

Only while r70K's verified Safe Bootstrap activation allowance is open, and only for rows above the committed candidate boundary, r70L evaluates `prepareMissingOperation()` against the candidate database. A safe non-empty plan is applied regardless of source device. A zero-change safe plan is accepted only as an already-present/effect-neutral proof. A conflict creates local diagnostic evidence and throws before acknowledgement or cursor advance. Outside that narrow window, the original same-device pull condition is retained.

The acknowledgement path independently repeats the proof immediately before writing `appliedOperations[opId]` or advancing the cursor. Device origin and sequence fetch alone are never acknowledgement evidence in this replay window.

## Commit rollback audit

The r70L wrapper snapshots the in-memory database, persisted database target, observed snapshot, sync state, queue and applied registry before delegating candidate commit. If candidate persistence or a later commit step throws, it restores and persists all of those local components. Failure injection proves a database-save failure leaves the pre-commit 65-sale database, cursor 3188, and applied registry intact rather than a candidate database paired with old acknowledgements.

The supplied package contains no real CAMON operation payload. r70L therefore does not name or replay a production operation automatically; the read-only `3173` to `3188` audit remains the only way to identify it safely.

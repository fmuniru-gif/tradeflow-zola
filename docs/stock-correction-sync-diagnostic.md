Stock correction synchronization diagnostic — 1 November 2026

Application baseline: `a3d30228cfcf2c1577209d779534164bc72452f9`.
Diagnostic only. All application, worker, delivery, business and recovery bytes
remain unchanged. No repair, merge, deployment, live database access or device
operation is authorized by this PR. No operational evidence is attached.

The exact embedded `CLOUD_B64` implements deployed M4/3. The standalone
`js/cloud-sync.js` still identifies itself as M4/2 and is not the authoritative
runtime for this investigation. Tests decode the production closure rather than
substituting the standalone module.

Confirmed source defect: with a queued stock correction and a later remote
operation, `pullNowCore()` first calls `applyInverseOperation()` to rebase the
unsent queue. `inversePatch(update)` retains the key but supplies `fallback:null`
and no `value`/`before` identity evidence. `validateOperationIdentity()` requires
identity from `patch.value || patch.fallback || patch.before`, so it rejects that
internal inverse with:

```
ZEZMS_IDENTITY_REQUIRED: stockRows operation has no stable collection identity.
```

This failure is before the inner download-validation/application failure
handlers. The synthetic case retains cursor 3957, queue 1, failed operations 0,
the zero-stock layer and the correction audit record. The new convergence test
remains an ordinary failing test: no TODO, skip, weakened assertion, timeout
increase or repaired application code hides it. A green surrounding test does
not mean the regression is fixed.

The defect has NOT been established as the cause of the Owner's live incident.
In particular, the real pending operation's kind, attempt metadata, durable
payload equality and relationship to the correction remain unknown. There is
no independently captured cloud acceptance/sequence/hash or device database.
Equal cursors alone do not prove equal local state or delivery of queued work.
An ordinary upload that durably acknowledges the queue before pulling passes
the synthetic scenario; the defect concerns pull/rebase while work is queued.

Other covered cases include 2→0 mutation preserving Qty In/Out and the layer;
one audited correction plus a numeric -2 stock patch; persistence/reload;
pre-attempt capability and configuration holds; invalid acknowledgment, absent
readback, mismatched readback hash and lost response; same-operation retries;
three-device convergence with a mocked durable server; duplicate replay; and
checkpoint-historical versus new actionable references. All data is disposable
and synthetic. The fixture adds only private initialization/transport hooks to
the in-memory closure, suppresses startup timers and mocks the server. It does
not validate real SQL, device authentication, service-worker delivery or live
data. Production guards, hashing, mutation, acknowledgment and replay functions
are retained.

The integrity banner can be caused by pending outbox work alone. It also covers
failed operations, old-client detection, errors/rejections, failing local
invariants, actionable comparison differences, unapplied operations and cloud
projection conflicts. Exact checkpoint-baseline orphan signatures are INFO;
undo `productId`-only differences are historical metadata INFO. Neither permits
ignoring a new missing row, stock payload mismatch or queued correction.

Smallest safe next step: Owner-controlled, separately authorized read-only
metadata collection on the already-open Main session. Establish the pending
operation's kind/state/attempts/times/error; memory versus persisted queue
equality/hash; correction/audit/layer linkage; exact view and selected period;
and existing integrity categories. Do not retry or publish the operation to
diagnose it. If needed, preserve private encrypted raw evidence with the
existing standalone capture facility and independently obtain scoped read-only
cloud evidence only after separate authorization. Ordinary JSON backups omit
the outbox; normal backup/audit buttons can update local metadata. Do not use
them as zero-write evidence collectors.

A future fix should retain valid identity evidence for internal inverse patches
while rejecting missing layers, mismatched keys and malformed operations. Do
not bypass validation or invent a missing layer. It requires separate review,
regression tests and incident evidence before any deployment or live action.
The logo/watermark correction remains a separate deferred task.

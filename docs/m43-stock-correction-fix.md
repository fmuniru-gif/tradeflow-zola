M4/3 queued stock correction fix — review only, 1 November 2026

Production baseline: `a3d30228cfcf2c1577209d779534164bc72452f9`.
Reuses PR #16's exact embedded-M4/3 fixtures. No live evidence or credentials
are included. No deployment, device action, live upload/retry/repair, database
change, merge or branding work is authorized by this draft.

The source defect and correction

`inversePatch(update)` previously supplied no identity-bearing record to
`validateOperationIdentity()`. The inverse now carries the original update's
post-image in `before`. The primary-ID/key validation is unchanged. Its
`fallback` remains null: a missing row still throws, rather than being invented.
No business calculation, receipt/FIFO function, stock-correction producer,
operation kind, wire envelope, operation hash rule or cloud RPC is changed.

Queued M4/3 pull/rebase also needs to avoid persisting an intermediate state
with the local correction reversed. The scoped persistence barrier defers
intermediate DB, queue, cursor, applied-register and failure writes until all
inverse/remote/reapply validation succeeds. It stages a checksummed transaction
in the existing apply-journal key, writes the final business DB once, verifies
readback, then finalizes exact bookkeeping. Recovery runs before startup queue
normalization. A pre-commit failure restores memory with the original durable
state intact. A post-commit interruption retains the journal and blocks normal
transport/business persistence until restart can finish exact bookkeeping.
Unknown, changed or corrupt journal/DB evidence fails closed. No majority,
newest-device selection, record reconstruction or queue discard is introduced.
Healthy pulls with no queued work and M4/4's existing transaction path are not
converted to the new M4/3 barrier.

`tools/m43-inverse-identity-fix.cjs` specifies exact reversible replacements;
`tools/m43-queued-rebase-body.js` is their readable, build-time source. They are
not new runtime assets. A dedicated test removes every replacement and proves
the entire remaining cloud closure equals the exact production bytes. Legacy
preservation tests undo only this independently verified patch before their
original comparisons. Their explicit path allowlist includes this review's
new test/tool/doc/workflow files; no preservation assertion is removed.

Delivery identities are regenerated from raw staged Git bytes. The existing
77-asset verifier, installation failure behavior, natural activation, old
caches, enrollment, device identity, offline data and worker lifecycle are
preserved. Do not use older update helpers as proof this fix is installed;
verify the new assembled-shell and embedded-cloud hashes from the review.

Readiness HTTP 400

For M4/3, the protocol-readiness publication is attempted after base Live Sync
start. Publication errors are retained as readiness metadata and caught;
they do not undo an accepted business operation or directly gate ordinary
`pushNow`. The source still rejects M4/4 publication errors. A 400 from the
protocol-transition/capability request is different: that guard runs before
upload and can block delivery with attempts/failed count still zero. Synthetic
tests exercise both branches. The live request URL, PostgREST error code and
server function signature have not been independently supplied; do not guess
the argument/schema defect or weaken capability checks. No readiness/server
change is included. Repeated HTTP400 must be attributed to its exact request
before any controlled live delivery.

Evidence and validation scope

Owner-confirmed evidence says the original 2-to-0 audit/layer/product linkage
and runtime/saved data equality were verified. Its ID was absent from the
3,964 stored operations and the sole checkpoint at1267 predates it. This is
historical evidence of non-delivery at that captured head, not a permanent
guarantee of current cloud absence. The current pending entry is not proven
to be the original operation. This fix never reconstructs or enqueues it.

Targeted tests cover the original queued rebase regression; original correction
and operation IDs/hash; zero-layer and audit retention; missing/key-conflicting
rows; hash corruption; duplicate replay; lost response and durable readback;
restart from every observed queued-rebase persistence boundary; journal quota
failure; post-DB bookkeeping failure; unknown journal/changed DB holds; multiple
queued operations; conflicting depletion; and three synthetic clients. The
server is an in-memory idempotent mock, not actual Supabase SQL/RLS. Full
source/unit, Chrome, cached/offline upgrades and byte-delivery release suites
are run once after the candidate is stable. Exact results are reported with
the tested commit in the PR description/consolidated Owner report.

Fail-closed Main procedure — design only, do not execute

1. Require separate Owner approval for the exact final commit and a controlled
   maintenance session. Preserve encrypted private DB/queue/state/applied and
   apply-journal evidence with independently verified file readback. Do not
   restore a backup, delete an identity/queue, or reset a worker/cache. Pause
   ordinary Live Sync only through separately authorized existing controls
   before fetching an update; this is a future local-metadata change, not an
   action performed by this PR. Ensure only one Main app client can write.
2. Allow only the reviewed natural worker update. Recheck installed source
   hashes, original correctionId/audit and allocated zero layer, runtime/saved
   equality, journal state and full outbox identity/order. Stop on any new,
   unknown, changed or additional operation. Do not equate pending count1 with
   the original correction or clear other operations to isolate it.
3. Bind the **original sealed wire operation** to that same audited correction
   and its -2 allocation, with the same operation ID and canonical hash, exact
   runtime/durable queue equality and only expected reviewed patches. If it is
   absent, differs, contains unreviewed effects, or cannot be recovered from
   verified private original evidence, **STOP**. Do not generate a replacement
   operation, new correction, stock movement, new ID or speculative before-state.
4. Immediately before any separately approved delivery, obtain a fresh,
   independently scoped SELECT-only canonical cloud projection and complete
   operation/checkpoint coverage. If the same correction is already accepted,
   STOP resending and review acknowledgment/replay evidence separately. Require
   every affected existing layer to match the original operation's before-state,
   no conflicting depletion/cost/identity, no unrelated differences and a stable
   head. The earlier absence at3964 is not a substitute for this gate.
5. Establish the precise HTTP400 endpoint/code. Transition/capability failure,
   unknown server contract, incomplete history, changed head or new journal is
   a STOP. Do not bypass guards, modify SQL or change keys/enrollment to proceed.
6. A later reviewed, identity-bound execution must be restricted to the exact
   preserved operation, with no automatic publication of later unknown queue
   work. This PR does not add that live repair executor. Generic Upload All is
   not authorization for a changing queue. **No live reconciliation is currently
   executable under this draft's authorization.**
7. Only after separately authorized execution, require durable same-ID/hash
   server readback, exactly one accepted correction, receive-only convergence
   on Shop/Camon, identical original audit/zero layer and unchanged other stock,
   receipts/finances/device identity. A differing total alone is insufficient.
   Lost acknowledgment must never be handled with a fresh operation ID. Stop
   on any failure; no automated repair/rerun, reversal, restore or cleanup.

This candidate fixes and tests the core mechanism. It does not claim to have
reconciled Main, diagnose the live HTTP400's server-side cause, prove real SQL
idempotency or authorize production activation. Main's reconciliation remains
HOLD until its original durable wire operation and the above gates are proved.

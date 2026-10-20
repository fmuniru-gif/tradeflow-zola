# Shop trading-readiness review addendum

This candidate starts from `fix/pre-branch-functional-rollback` commit
`3d4bce23f4ceba96114c73927c99f6085b7a3c7e`. It does not activate Shop
trading or publish to production. Its Settings panel is a numbered guide. The
latest safe report remains visible across Settings redraws in the current tab;
it is never an authorization token, and passphrases are cleared immediately.

## Controlling worker

The reviewed worker answers `ZEZMS_SHOP_RECOVERY_CLIENTS` with its Shop build
and an enumeration of controlled and uncontrolled windows. A pre-existing
controller that lacks that handler, a failed message channel, or a controller
that never finishes replying explains the old `NO_REPLY` symptom in code.
The exact live Shop controller cannot be identified from repository evidence.
The **Check recovery worker and tabs** button distinguishes `NO_CONTROLLER`,
`NO_REPLY`, `OUTDATED_WORKER`, `OTHER_CLIENTS`, and `READY` without a
cloud request, storage write or worker update. Only `READY` permits an
exclusive recovery mutation.

After a separately approved deployment, the Owner should check the worker in
Settings on Shop. If it is old, silent, or waiting, close every other TradeFlow
tab/PWA on Shop. Open the genuine same-origin
`FORCE_UPDATE_MOBILE.html` once; it calls only the browser's same-origin
`registration.update()`. If the reviewed worker is waiting, close that page
and every other TradeFlow client, reopen the app, sign in as the local Owner,
and check again. Never unregister workers, clear caches/site data or force
activation. Stop if the result is still not `READY`.

## Guided recovery

The remaining Settings steps are, in order:

1. Run a fresh read-only Owner/cloud preflight. Verify exact Shop device
   identity, three operation IDs and current staff-directory disposition.
2. Save and authenticate the complete external encrypted backup, or reselect
   and verify the previously saved file against the current journal.
3. Disconnect fully and separately confirm exact-three quarantine.
4. Reconnect for the read-only receive preflight. Save and readback-verify a
   new full backup, then separately confirm receive-only reconciliation.
5. Run complete Cloud-vs-Local and wallet verification. Stop for review.

Every step retains its identity, queue, lifecycle, cloud-head, journal,
rollback and interruption guards. The protected three operations remain in
the encrypted archive and journal. They are never uploaded or marked applied.
No previously recorded preflight alone authorizes a present-day mutation.

## Trading activation

The new **Read-only trading activation check** rechecks the current cloud
head, ACTIVE lifecycle and canonical authorization, genuine local Owner,
empty safe queue, preserved journal and authenticated archive, complete
business equality and wallet equality. It reports readiness only. The actual
`activateTrading` gate is compiled **disabled** in this review candidate.
Isolated tests enable it only in a disposable synthetic shell.

A later, separately authorized release must enable that gate after genuine
Shop verification. Activation then requires a second explicit Owner
confirmation and a fresh unchanged cloud read before recording
`TRADING_ACTIVE` in the durable journal. It never enables Live Sync
automatically. Invalid or missing journal, changed identity, original
protected operation reappearance or unresolved sync state restores the hold.
The first legitimate post-activation save starts from the verified current
database snapshot, so it cannot be silently absorbed as initialization.

## Source integrity

The old `tools/build-shop-directory-recovery.cjs` starts from an obsolete
cloud baseline and must not be run. The new
`tools/patch-shop-trading-readiness.cjs` pins the exact reviewed embedded
M4/3 preimage and changes only the Shop insertion and Shop build markers.
It verifies that the current production Owner-registration fallback correction
is present before patching. Tests compare all cloud code outside the Shop
insertion with the protected production baseline.

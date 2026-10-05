# r70I checkpoint verifier specification

## Historical eight-character checkpoints

The historical verifier first JSON-clones the payload and removes only the long-standing local-only roots: `backupHistory`, `backupSettings`, `syncSettings`, `syncMeta`, and `syncRejectedTransactions`. It recursively canonicalizes values: `undefined` becomes `null`, arrays retain their existing order, object keys are sorted lexically, and operation-local fields `payloadHash`, `outboxState`, `attempts`, `lastAttempt`, `lastError`, and `_legacyPayload` are excluded. It serializes with `JSON.stringify` and applies FNV-1a 32-bit using seed `2166136261`, per-character XOR, `Math.imul(hash, 16777619)`, then eight uppercase hexadecimal characters.

The local read-only production export for `M43-CP-1267-179277F7` (cursor `1267`) produced `179277F7` with that algorithm. The fixture is deliberately not included in this release because it contains production business data and credential material; the acceptance test reads it only from an explicit local path.

## Current sixteen-character checkpoints

Sixteen hexadecimal characters select the existing Cloud Sync `cleanSnapshot()` plus deterministic 64-bit hash path. The same production payload produces `006c07944bb141b7` there: that is evidence of a hash-version difference, not corruption.

## Integrity rule

The stored format selects exactly one verifier. An eight-character row can pass only when its historical computed value equals its stored value. A sixteen-character row can pass only when its current computed value equals its stored value. No mismatch retries the other algorithm. Verification happens before checkpoint reconstruction, operation replay, Integrity Core, Fleet fingerprinting, attestation, or local business-data commit.

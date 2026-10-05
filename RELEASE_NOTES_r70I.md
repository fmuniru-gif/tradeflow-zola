# r70I — Legacy M4/3 Checkpoint Hash Compatibility

The verified historical checkpoint `M43-CP-1267-179277F7` was rejected by r70H because r70H applied only the current sixteen-character deterministic hash and calculated `006c07944bb141b7`. The stored historical eight-character value `179277F7` is valid under the earlier canonical FNV-1a 32-bit algorithm.

r70I adds `verifyCheckpointPayloadHash(payload, storedHash)`. An eight-character hexadecimal value selects only the historical verifier; a sixteen-character hexadecimal value selects only the existing current verifier. There is no fallback from one algorithm to the other. Unsupported formats use `ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_FORMAT_UNSUPPORTED`; real mismatches use `ZEZMS_BOOTSTRAP_CHECKPOINT_HASH_MISMATCH` and keep the established human message: “Checkpoint payload hash mismatch. Local data was not changed.”

The failure panel now identifies the actual stage: claim, checkpoint verification, operation replay, integrity verification, or attestation. A hash failure now reads **Bootstrap checkpoint verification failed**.

No Supabase migration or SQL was created or run. No business collections, Canonical Restore, M5A-4 activation semantics, r70H identity relink behavior, protocol version, or branch behavior changed.

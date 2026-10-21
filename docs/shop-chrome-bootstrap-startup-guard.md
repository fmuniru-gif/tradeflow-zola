# Shop Chrome bootstrap startup guard — review candidate

Base: production `main` `ca6e8984dd6449ae393b04b5375deb4831910121`.
Build: `20261021-shop-chrome-bootstrap-guard-r1`. This candidate is not approved for deployment or queue disposition.

## Finding

The confirmed July snapshot module used `bootstrapPhaseA.pending()` as its only bootstrap guard. On a fresh profile, the Phase A stage does not yet exist, so the cloud-ready callback could insert `KPI-202607-CONFIRMED` and call `saveDB()` before claim and staging. The earlier assembled-shell synthetic run recorded an `insert kpiHistory` patch in that interval. The month rollover module can also initialize and save the database or publish rollover work at startup, on focus, on login, and after cloud readiness. Its contribution to Shop Chrome's actual operation has not been proved. The sanitized 21 October diagnostic records an `insert kpiHistory`, but does not contain the original payload or complete patch list; it cannot establish the actual producer or harmlessness.

The new read-only startup guard requires the Phase A stage and M5A-4 journal both to be absent, an initialized cloud state with device identity, and an eligible lifecycle. A paired device must have business and Owner bindings and `ACTIVE` lifecycle. An established Owner device may have an empty business ID if its Owner binding remains present; it accepts `ACTIVE` or its established empty lifecycle state. Unknown, revoked, enrolling, bootstrapping, verifying, interrupted, unbound and unreadable states defer automatic KPI and rollover writes. The established Shop Edge directory recovery hold also defers these writers through its existing hold API. Ordinary transaction wrappers use a separate established-business gate, so a maintenance-only deferral does not block authenticated staff trading; staged and recovery-held devices remain blocked. The guard is checked again after asynchronous cloud readiness and before rollover publication. Existing shells retain their historical module paths; the reviewed shell uses unique asset paths so an old worker's `ignoreSearch` fallback cannot substitute stale code.

## Existing Shop Chrome operation

The candidate adds **Inspect exact Shop Chrome operation proof (read only)** to the pre-login screen only for the existing verified stage with device `6229402b-947f-43b2-818f-143c3a27a1a0` and lifecycle `0820a9f3-9e62-45c8-ac81-c4e15f5a03a5`. It requires exactly operation `95bab3c9-04dd-4cf2-b514-90d3964fbd31`. It displays and downloads a privacy-safe report: original payload hash and recomputation result, canonical SHA-256 of the complete operation, device sequence, complete patch action/path list, field names, per-value SHA-256, exact staged-candidate equality, and exact confirmed July record equality. It does not include raw payload values, customer records, staff credentials, Supabase credentials or session tokens. Its disposition remains **UNRESOLVED** regardless of these comparisons. The existing r70M classifier and activation bridge are unchanged.

The proof compares against the **staged candidate at cursor 3642**, not a fresh cloud head. A later cloud change, an extra patch, a settings or financial effect, an unmatched hash, or an unproved historical source means STOP. Even an exact July match would require independently preserved, authenticated original operation evidence and separate Owner approval before any narrowly scoped disposition is implemented. This release has no queue mutation or disposition control.

## Controlled next sequence after independent code review

1. Obtain separate deployment approval. Preserve the Shop Chrome browser profile, staged candidate, journal, identity and queued operation. Keep Shop Edge's journal and encrypted archive separate.
2. Publish only the reviewed release through the existing Pages workflow. Verify the live shell, worker, manifest and unique guarded assets against the reviewed commit. Let the new worker take control by closing other tabs; do not clear site data or force activation.
3. On Shop Chrome, inspect the read-only proof once and download its JSON. Confirm device/lifecycle/operation IDs, queue count one, payload hash match, complete patch paths, value hashes, and candidate/July comparisons. Preserve the existing sanitized report and its SHA-256 separately.
4. STOP for independent review of the proof and current cloud authority. Do not click Complete verified activation while the operation remains unknown. No quarantine, upload, replay, deletion, acknowledgement, Live Sync, or trading action is in this candidate.

If the proof cannot be generated, changes across retries, or reveals an additional business effect, preserve the browser and original queue unchanged. No new enrollment or reset is indicated.

## Final isolated test result

`node --test tests/*.test.cjs`: 128/128 passed. `node --test --test-concurrency=1 tests/*.browser.cjs`: 48/48 passed with the bundled `playwright-core` path. The assembled-shell tests exercised real stock-in and Quick Sale Out on synthetic authenticated Owner and ACTIVE paired profiles, and rejected staged and recovery-held trading. The Shop recovery fixture kept its exact synthetic three-operation queue across reload (SHA-256 before and after `f289f9e03912d73ffac572236fc6d5757f0152457a109c89f6d2445a56ad59ea`), made zero upload requests, kept Live Sync disabled and retained the hold. All browser requests outside the local disposable test server were blocked.

# PR11 cache-delivery correction — review only

Base: `f810940762809e89a35f982a8577a9f32dcabf4e`. Delivery identifier: `20261026-pr11-cache-r1`. No merge or deployment is authorized by this review.

## Root cause

PR #11 changed the embedded navigation and the Management/Stock Velocity files while keeping the same worker script, worker cache, assembled-page cache, patched-page key/proof markers and runtime asset URLs. The outer loader first opens its saved assembled page. That saved page includes the older navigation and passed the unchanged build/proof/baseline-header checks even when a newer outer HTML file had been fetched. Separately, the worker serves cached JavaScript indefinitely and allows query-insensitive fallback. A fresh outer page alone therefore cannot establish that the three new APIs are executing. A worker update check cannot install a worker whose bytes have not changed.

The new browser test first installs and populates the real pre-PR11 worker/cache, serves the deployed PR #11 tree, observes the outer index being refreshed, and demonstrates that the old assembled page and missing APIs remain. No operational device is used.

## Correction

- Rotate the assembled-page cache/key by delivery revision and generated source digest. Validate its complete SHA-256 before reuse or storage; stale/mixed cached assembled content is rebuilt from the unchanged embedded verified baseline, including the exact PR #11 navigation.
- Give the Management and Stock Velocity runtime URLs a new delivery token. Do not change either JavaScript file or any embedded module.
- Give the worker a new cache namespace derived from the complete expected byte manifest. Download/verify the shell, manifest, required same-origin runtime scripts and retained assets before installation can finish. Versioned lookups are exact. Installed verified application entries cannot be silently replaced by later server content with different bytes.
- Retain the current application release/manifest/enrollment protocols and worker client guard. Add delivery fields to the existing read-only integrity response. Keep normal passive activation: no forced waiting-worker activation, client claiming, unregistering or origin/cache deletion.
- Add a new-path delivery-check page so the old worker cannot substitute its cached legacy update-helper page. It waits for installation, checks the expected waiting/active worker's delivery proof and instructs the Owner to close every client before reopening. It never changes business, device, sync or recovery state.

`node tools/build-pr11-delivery.cjs --check` checks reproducible hashes; running the tool without `--check` regenerates delivery metadata only. Any assembled-source change rotates its patched cache; any manifest byte change rotates the worker cache. Old caches remain available to the old active worker and are not deleted. A failed network request, unexpected byte digest or cache-write failure rejects installation while that prior generation remains active. A later successful retry can stage the complete new generation.

The externally hosted Supabase SDK remains outside this same-origin byte manifest, as before. The correction does not change its configuration, authentication or synchronization behavior. Offline tests verify local application/data preservation; they do not claim online Supabase connectivity while offline.

## Validation scope

Source tests prove that reversing the explicitly marked delivery edits restores the production outer shell exactly, every embedded module is unchanged, and protected application files and all three PR #11 modules remain identical. Browser tests use full cached upgrades for synthetic Main/Shop/Camon profiles, natural activation, exact navigation function fingerprint, the Management direct APIs, Stock Velocity reset API, local-storage business records, identity/cursor/configuration/outbox evidence, an IndexedDB sentinel and offline reopen. They also cover a fresh install, forged stale assembled-cache content, unavailable Velocity, a 200 response containing old Management bytes and a stale shell. Both full unit/source and browser suites run in CI with loopback-only networking and a cleared credential environment. Results and the exact tested commit belong in the PR review record and final report.

Existing recovery fixtures retain their assertions/timeouts. Their intentional synthetic activation variant is signed as a separate fixture bundle, and text responses use canonical Git line endings. Mixed/fault responses are never re-signed. Expected delivery namespace assertions are updated; FIFO, correction, recovery/identity and queue invariants are unchanged.

## Controlled update — only after separate Owner deployment approval

1. Review the exact candidate commit and complete CI results. Confirm application/module bytes against the approved manifest. Deploy only that approved commit through the existing deployment process; this review does not perform that step.
2. Pilot Main first. Finish/save the current operation, record existing device identity/cursor/queue status and preserve the normal backup evidence. Do not clear site data, unregister the worker, re-enroll, reset a device or change Live Sync.
3. On the normal application origin, open the new `PR11_DELIVERY_UPDATE.html` path. Wait for the explicit **complete verified PR11 bundle is waiting** result. If installation fails, the worker becomes redundant, attestation does not match or connectivity drops, stop: retain the existing application and all storage. Retry the delivery check only when the Owner approves the next attempt and connectivity is stable.
4. When verified and waiting, close every TradeFlow browser tab and installed-app window on that device, including the helper. Let the existing service-worker lifecycle activate normally; no forced activation is provided. Reopen normally. If a page began during activation and is not controlled, close/reopen after activation; do not delete data.
5. Confirm the delivery-check page reports the new worker active. In the application verify the new delivery metadata, expected PR #11 navigation function fingerprint, Management `viewHTML`/`viewDashboardHTML`, and Stock Velocity `clearPlanningSnapshot`. Compare identity, cursor, queues, configuration and business totals with the recorded evidence before resuming normal work. Do not invoke calculation/reset/posting APIs for verification; inspect their presence/source only.
6. After Main is accepted, repeat separately for Shop, then Camon 50 Pro, including installed-app/background windows. Do not update all devices concurrently. Do not click enrollment, quarantine, receive, recovery activation or worker-reset controls as part of delivery.

No financial/inventory/accounting/FIFO changes, speculative caches, business calculations, security rewrites, synchronization changes, recovery changes, performance optimization or branding changes are included.

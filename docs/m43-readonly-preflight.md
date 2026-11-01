# One read-only correction preflight — PR18 review build

Base: `cf9ff97c4f7ee9a3d65f2351ac7785fa2315bdd8`. This adds a standalone page and pure evidence checks. Application code, coordinator, migration, worker, caches and all77 delivery assets remain unchanged. Nothing is deployed or run on Main.

## Local review (synthetic data only)

From the repository run `node tests/m43-preflight-demo.cjs`, then open
`http://127.0.0.1:8787/preflight.html?synthetic=1` and press **Run read-only preflight**.
Node's built-in server serves only these diagnostic assets and disposable fixtures; it never reads a Chrome profile, connects to Supabase or proxies a request. The page labels its result **synthetic demo**. Stop the local server with Ctrl+C. No Console commands are required.

The real page is `diagnostics/m43-correction-reconciliation/preflight.html`.
There is **no deployed operational URL**. A localhost/other-origin page cannot access Main's saved session. A later separately approved operational host must share TradeFlow's origin but sit **outside** `/tradeflow-zola/` and its worker scope. Do not navigate Main to a not-yet-hosted path inside the worker scope: the old worker may return the application shell instead. The page refuses if a worker controls it and never registers, unregisters or updates a worker. This review does not authorize hosting, changing Main, or executing a live check.

## What the button does

1. Reads the existing database/state/queue/failure/journal/session keys using `getItem` only. It locates exactly one November1 audited2→0 candidate, verifies its existing audit/allocation/product/zero-layer linkage, and rejects ambiguity or queued/failed/staged work. A uniquely shaped record alone is not independent identification of the original.
2. Uses the saved, unexpired Owner session without loading the app or Supabase SDK. Before sending credentials it matches the JWT issuer/sub/role to the configured project and saved Owner; the server verifies the token. GET `/auth/v1/user` and the existing STABLE Owner-role RPC establish current authentication and active membership. Enrollment and scope are checked with SELECTs. There is no sign-in, refresh, configuration save or sync action.
3. Reads all relevant Owner-scoped retained operations and checkpoints (including superseded checkpoints), with exact counts and bounded pagination. Sequence gaps are allowed; they never certify coverage. Raw `payload::text` retains PostgreSQL numeric representation for SHA-256 comparison with the existing private binding. Unsafe lossy numeric parsing, bad wire hashes/identity, duplicate history, truncation and unsupported replay all stop. Target projection uses copies and the existing M4/3 additive semantics. It never fabricates a missing layer from a fallback or calls a mutating application helper.
4. Requires a protected independently provisioned evidence row for the same existing audit, layer, product, period, Owner and Main device. It matches the existing immutable compensating envelope without constructing or staging an operation. It compares exact checkpoint/history SHA-256, count, head/revision and archived-coverage attestation; verifies cloud layer/counter=2 and saved Main layer=0; rejects any accepted receipt or historical correction reference. It does not infer archived coverage from a count or cursor.
5. Repeats cloud/history/checkpoint/counter and approval reads, and checks that the original saved local evidence did not change. The HTTP reads are observational, not an atomic lock; a future separately approved coordinator/server must still recheck runtime equality and atomic acceptance. GO here supports Owner review only and always has `authorizesExecution:false`.

## Independent proof is never manufactured

No evidence/receipt table or row is created. Missing tables, missing/private approvals, insufficient archive coverage or plain unverified review notes are NO-GO. A binding must already have been provisioned by the independently authorized verifier under the reviewed permissions. The page cannot provision it and has no form for overriding it.

The existing private `review_reference` must contain structured verifier attestation:
`format=M43_INDEPENDENT_REVIEW_V1`, `commit=cf9ff97c4f7ee9a3d65f2351ac7785fa2315bdd8`, `atomicGuardVerified=true`, `effectivePermissionsVerified=true`, `originalEvidenceVerified=true`, and `originalAuditSHA256` equal to the independently bound audit's PostgreSQL text SHA-256. These are requirements on existing verifier evidence, not values the page generates or an Owner checkbox. The protected table's administrative provenance remains a prerequisite. Tests use synthetic attestations only. Export71 alone is not this proof and still omits some ACL/default/helper definitions.

## The HTTP400 check

The page only issues GET queries (plus browser-generated CORS OPTIONS). It NEVER invokes readiness publication, uploads, delivery, retry, catch-up or repair. It does not call the app's capability helper because that helper can persist state.

It reads existing resource timings from its page or a same-origin opener when available. Optional **existing** HAR evidence can be selected locally when Chrome omits response status. Only matching-project, allowlisted endpoint/method/status metadata is retained; HAR bodies, headers, query values and credentials never appear in results or requests. There is no upload or exported diagnostic file.

An observed400 on `zezms_mb3_publish_protocol_readiness` is classified as nonblocking for ordinary M4/3 publication failure using the already-reviewed startup catch. A400 on `zezms_mb3_get_protocol_transition` or `zezms_ops_push` holds delivery. Unknown endpoints/effects or absent failed-request evidence remain NO-GO; the page does not guess the past endpoint.

The existing transition RPC is exported VOLATILE. A GET may therefore be rejected even if its normal POST would work. Such a rejection is **read-only capability proof unavailable**, not a claim that the reported400 was reproduced or that POST delivery is broken. The page will not use POST to work around this limit. Original HTTP400 attribution and a compatible verified capability route remain necessary before GO.

## Privacy and validation

Results contain only fixed blocker codes, endpoint paths/methods/statuses, GO/NO-GO and read-only/no-execution flags. No IDs, names, record payloads, quantities/totals beyond the public incident description, project host, credentials or raw error bodies are returned. All UI output uses `textContent`; no record is inserted into HTML or logs. The tool never enumerates storage keys, writes/clears storage, opens IndexedDB, downloads assets into a worker cache or creates a realtime connection.

Focused tests exercise missing original/approval/history, identity/hash mismatches, precision loss, forbidden fallback fabrication, already-accepted references, concurrency, exact400 attribution and redaction. Fresh Chrome contexts trap storage writes, IndexedDB/worker mutation and non-GET traffic; test token refresh and publication/delivery routes are forbidden. The native PostgreSQL test executes only a SELECT in a read-only transaction against an empty disposable cluster to verify JSONB-text SHA parity. No migration or application schema is executed for this follow-up. Exact counts/commit/Actions URL are reported in PR18.

Until an independently authorized Main run, this page cannot state Main's current verdict. Known unresolved gates are operational hosting/access, independent original/guard/coverage proof, current capability-read proof and attribution of the actual400. No migration, staging, live request, device action, merge, deployment or reconciliation is performed by preparing this draft.

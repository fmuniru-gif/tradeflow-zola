# Shop directory quarantine and receive-only recovery — review candidate

Status: **NO-GO for deployment or live recovery until Owner review and the live gates below pass.** No production request, device action, push, merge or deployment was performed during development. Live Sync remains held after successful recovery.

## Baseline and scope

- Base: `3582ab43f0a3ae3911f606c2d47615db291336e4`, fetched and independently checked against remote `main`.
- Review branch: `fix/shop-directory-outbox-quarantine`.
- Shop identity: `197e3568-5a89-4a56-b9d0-07f5e8248734`. Device name alone never authorizes recovery.
- Exactly three historical operation IDs: `9084b206-fbf5-41d3-88ab-4e17ed309962`, `6d02b995-78a4-4f0d-858d-94d9b14dd33d`, `6d97f771-c8a3-45c7-900e-955238bf6306`.
- No current payload, cloud head, lifecycle, balance or Owner session was obtained from Shop. These are required live preflight inputs, not assumptions satisfied by this candidate.
- Production executes embedded `CLOUD_B64` in `index.html`; standalone `js/cloud-sync.js` is older M4/2 and is unchanged. M4/3 protocol, application release/version, manifest, financial reconciliation pages, database structures and unrelated embedded modules are unchanged.

## Root causes and implementation

1. The protective directory hold returns before cloud-client initialization. The generic capability check then reports `CLOUD_CONFIGURATION_REQUIRED` for a null client, even when saved configuration is present. Shop now displays a distinct recovery hold; actual configuration, authentication and lifecycle failures remain blocking.
2. Existing Main quarantine and Camon preservation are identity-specific and unsuitable for Shop. This implementation validates the precise Shop identity, local staff Owner, authenticated cloud Owner, business, ACTIVE lifecycle and canonical access; explicit revocation overrides historical registration fallback.
3. Real staff login mirrors login timestamps into the synchronized staff directory. Shop alone skips this mirror while held, allowing local login audit without regenerating directory publications. Healthy devices retain the original path.

The queued root is the whole **staff authorization directory**, including roles, activation flags and salted password verifiers. It is not a hardware registration directory. Each operation must have one `root-set` patch, correct predecessor chain, M4/3 identity, deterministic payload hash and increasing device sequence. Added/removed staff, changed roles, credentials and reactivation differences are counted for Owner review; they are never automatically declared harmless. A visible matching cloud operation is reported with its server cursor; absence is explicitly inconclusive about pre-checkpoint history.

All Shop uploads, direct last-hop pushes, directory publications, ordinary cloud pulls/bootstrap replacement and synchronized local posting remain blocked. Normal authentication callbacks, online/focus events and reload do not release the hold. The queued operations are never uploaded, acknowledged, relabelled or marked applied by quarantine. There is no Live Sync release control in this candidate.

## Evidence, storage and interruption safeguards

The read-only preflight uses the existing stored authenticated Owner token without refreshing it or changing the SDK session. Network methods are GET plus only the existing read-only checkpoint and canonical-fleet RPCs. It brackets paginated ordered operations with identical checkpoint/head/lifecycle/fleet/master metadata and accepted-operation lookups. Production checkpoint hashes, operation hashes and the actual integrity projector are checked. Missing authority, expired session, moving head, unsupported schema or replay conflict stops the procedure.

The externally saved archive is AES-256-GCM with random salt/IV and PBKDF2-SHA256 (600,000 iterations), bound to Shop. It preserves the original queue bytes losslessly, current authoritative staff directory, classifications and a SHA-256 manifest of the original local snapshots. The file is reopened from its saved handle, byte-compared, authenticated-decrypted and content-compared before mutation is possible. Keep it encrypted and private: it contains staff authorization evidence. Passphrase is never stored. Browser inability to save/read back the same file is a blocker; an ordinary unverified download is insufficient.

The durable local journal contains the original DB, queue, applied register and synchronization-state bytes needed for rollback, tied to the external archive manifest. **The external archive is an independent safety copy of the three operations and their evidence; it is not a complete external business-database backup. Rollback requires the intact local journal as well as the external archive.** Do not clear site data, delete the journal or use browser reset. A missing/corrupt journal fails closed and requires evidence review.

Journal writes and readbacks precede queue removal. Storage/quota failures leave the original queue or a documented resumable phase. Prepared receive targets are independently rederived from authenticated cloud data before resumed writes. Interruption never starts automatic upload or automatic resume. Reimport and decrypt the saved archive after reload before any further mutation. Other windows, an old worker, missing worker attestation or uncontrolled tabs block mutations.

## Receive-only proof

Receive is a separate Owner confirmation after quarantine. It requires an empty queue and independently verified archive, fresh stable authority and a checkpoint at or before Shop's cursor. A checkpoint newer than Shop is a blocker, not permission to overwrite the local DB.

The actual production integrity engine reconstructs cloud state at Shop's cursor and at the latest head. Every synchronized collection and root is compared, including financial balances, management/KPI roots and settings. Only explicitly local-only fields and the existing production-derived `undoLog.productId` metadata normalization are excluded. Unexpected business differences stop recovery. The only permitted pre-replay discrepancy is the preserved directory root, which must match the last archived publication or the cloud root at that cursor.

Replay uses a clone of Shop's DB with the cloud directory at its verified cursor, preserving local-only settings/authentication. Candidate and cloud current synchronized states must agree; stock, finite wallet amounts and production cash constraints are checked. Historical orphan references must match the cloud's own references and are separately reported, never deleted. Only actual received tail operations get applied-register entries; historical register gaps are untouched.

Post-commit Cloud-vs-Local verification requires current head equality, empty outbox, no ordinary missing/mismatched/duplicate records or unapplied tail, matching wallets and unchanged identity. New cloud activity requires a fresh receive preflight; it never justifies stale acceptance.

## Controlled deployment and Owner acceptance — proposal only

1. Review the local commit, tests and diff; recheck production `main` for unexpected movement. Obtain separate deployment approval. Deploy the reviewed `index.html` and `sw.js` together at the existing origin, with the complete existing asset set. Source modules are embedded; no new CDN or runtime dependency is introduced. The worker requires the new Shop build marker and retains existing integrity/cache safeguards. Do not reset caches/site data or force `skipWaiting`.
2. Validate same-origin upgrade and file-save/readback on a disposable profile first. Check healthy devices' normal login, Settings and synchronization remain unchanged. Before any Shop step, confirm independent existing backups and sufficient browser storage for original DB plus journal plus receive before/target copies. No fixed quota or desktop test proves Shop capacity.
3. On Shop, close every other TradeFlow tab/window/PWA and sign in as the genuine local Owner. In Settings use **Read-only Shop preflight**. This makes authenticated read requests only. Verify exact identity, exact three IDs/hashes/sequences, current ACTIVE lifecycle/access, tenant and directory effects. Unexpected operations or staff changes require review; do not substitute IDs or change records to make the check pass.
4. Enter a strong passphrase of at least 20 characters; choose **Save and read back encrypted evidence**. Keep the verified file independently outside browser storage and keep the passphrase separately. Record its SHA-256. Stop if saved-file readback/decryption, quota or genuine device checks fail. If the session expired, obtaining a normal Owner session is a separately supervised authentication action and may make network callbacks; this preflight never signs in or enables sync itself.
5. Fully disconnect Shop, confirm offline, then choose **Quarantine exact three (offline)** and approve its exact-ID prompt. It removes only those three from the active upload queue after the durable journal is verified. No cloud call occurs. Confirm count three, acknowledgements zero and Live Sync false. Original business DB and applied register remain unchanged.
6. Reconnect only after quarantine has succeeded and the hold is visible. If reloaded, select the saved archive and **Verify saved archive** first. Choose **Read-only receive preflight**; review head, replay count, zero unexpected business differences and wallet equality. Separately choose **Confirm receive only**. This commits only verified received state locally; no upload endpoint is called. Do not conduct business posting during recovery.
7. Choose **Verify current Cloud-vs-Local**. Record head, zero ordinary differences/queue/failures and wallet equality, plus separately reported cloud historical references. Retain archive and journal. Stop for Owner acceptance; **do not enable Live Sync**. Any later release of this hold requires separately reviewed authorization and must retain the quarantine journal/identity safeguards.

### Failure and rollback

- Stop on any `SHOP_STOP_*` result. Do not reconnect an unquarantined queue through an older shell or run generic repair/clear/reset tools.
- Interrupted quarantine: stay offline, keep the reviewed single-tab worker, reimport/verify archive after reload and repeat the exact-three action. It accepts only known original/empty queue states.
- Interrupted receive: reimport/verify archive and choose **Resume interrupted receive only**. Pinned authority must still match. If cloud moved or later local data exists, stop; do not force a retry or discard data.
- To undo this recovery, go fully offline, keep one reviewed tab, verify the original archive, and explicitly choose **Restore preserved local state (offline)**. It restores only known original DB/register/state/queue snapshots, with upload/live flags held. Later unrelated DB/register/queue changes block rollback. Retrying interrupted rollback is safe.
- A deployment rollback is not a data rollback. Keep Shop offline during any code rollback. Do not open the old production shell online with a restored queue or an empty quarantined queue: older code does not understand this Shop journal. Retain a guard-bearing shell until an independently reviewed successor preserves the hold. Main and other devices require no local data restoration.

## Validation and remaining gates

Automated evidence uses synthetic data, isolated desktop Chromium profiles, the actual assembled embedded shell/staff authentication/integrity modules and synthetic network routes. No production device, cloud record or genuine credential is used. The browser archive test writes and reads a real encrypted temporary file. Browser network assertions allow only read endpoints. Tests cover exact/incorrect identities, roles, queue IDs/types/counts/hashes, additional effects, failed readback/decryption, unavailable/stale/revoked authority, storage/interruption/rollback, reload/reconnect, old tabs, waiting worker updates, no upload/regeneration, legitimate business-data protection, current receive-only replay and healthy-device control isolation.

Final validation on 19 October 2026: **66/66** coordinator, delivery and activation/release regression tests passed; **14/14** assembled-shell browser tests passed; nine changed JavaScript/CJS files and both modified embedded JavaScript modules passed syntax checks. No final failing or skipped tests. Earlier browser fixture startup races were corrected in tests, without relaxing data-preservation assertions. Commands:

```powershell
node tools/build-shop-directory-recovery.cjs
node --test tests/shop-directory-recovery.test.cjs tests/shop-directory-delivery.test.cjs tests/prelogin-activation.test.cjs tests/prelogin-release.test.cjs
$env:PLAYWRIGHT_CORE_PATH='C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright-core'
node --test --test-concurrency=1 tests/shop-directory-recovery.browser.cjs tests/r70v-diagnostic.browser.cjs tests/prelogin-activation.browser.cjs
```

Not demonstrated: genuine Shop Owner/session/RLS/lifecycle and exact current queue contents, actual current checkpoint coverage and financial equivalence, mobile file-handle/readback support and available quota, physical same-origin service-worker upgrade/old-tab closure, and a real Shop post-catch-up audit. Live RPC definitions must remain the reviewed read-only contracts. These are explicit live acceptance gates. No development test constitutes permission to deploy or execute recovery.

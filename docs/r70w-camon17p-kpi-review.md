# Camon 17P single-operation review (r70W)

Status: **NO-GO for reconciliation, activation and deployment**. This branch is a read-only proof candidate based on production `main` at `4a774e86ff0228c2a3804a127959703497f3c03c`. It does not remove, upload, acknowledge or relabel any operation. The verifier API returns no queue, stage or hash details when invoked on another device identity.

## Delivery gate: not yet demonstrated on the original origin and phone

The original Pages origin previously observed for TradeFlow is `https://fmuniru-gif.github.io/tradeflow-zola/`. Verify it again against the installed PWA and GitHub Pages Settings before any device connection. `FORCE_UPDATE_MOBILE.html` checks for a service-worker update; it is **not** a network firewall. The earlier r70T default-deny gateway document is a design, explicitly marked untested. There is no recorded operational gateway configuration, deny log, Android trial, or Camon 17P delivery result. The production site was still serving r70V when this review was performed. Therefore no phone-update GO follows from the source tests.

The additional assembled-shell browser test loads r70W on a localhost-only origin with synthetic pending bootstrap state. It denies external destinations, checks that all loaded same-origin application scripts are cached, switches the browser fully offline, reloads, runs the genuine KPI verifier, and checks the original queue, stage, journal, database, IndexedDB inventory, identity, cursor and Live Sync setting. It observed no Supabase request during its restricted-network load or offline reload. This proves the shell's local offline path under those test conditions, **not** a genuine Pages fetch, a real gateway's enforcement, or Camon's physical storage and radio state.

Before a separately approved deployment or Camon connection, the smallest remaining correction is operational: configure and demonstrate a fail-closed Wi-Fi gateway that allows only the exact genuine Pages HTTPS host while blocking Supabase and all other destinations. A disposable Android emulator may be used for the first gateway trial because no spare phone is available; it cannot prove Camon's cellular, VPN or radio-fallback controls. Retain gateway rules and logs proving permitted Pages TLS traffic and denied Supabase, IPv4/IPv6 direct egress, alternate DNS/DoH/DoT, QUIC and VPN. A browser error alone is insufficient. Once the exact approved r70W files are published, repeat the test with that live shell, confirm the service-worker probe, manifest and required assets match the approved release, then disconnect all emulator network interfaces and prove offline restart and verifier availability. Camon's own cellular and alternate-interface isolation must be checked before it connects. If the gateway, publication, hash, or offline test fails, stop without connecting Camon.

**Conditional phone steps after fresh Owner approval and the gateway trial:**

1. Independently preserve Camon's existing encrypted evidence. Use its current Chrome/PWA profile and site data. Keep cellular, VPN, Private DNS, alternate Wi-Fi and tethering disabled; enable only the proven restricted Wi-Fi. Verify the gateway still denies Supabase and all non-Pages destinations.
2. Navigate to the confirmed original Pages origin's `FORCE_UPDATE_MOBILE.html`. Close other TradeFlow tabs as instructed. Open the r70W shell from that helper only after the published `index.html`, `sw.js`, `manifest.json`, verifier script and their dependencies have been checked against the approved commit. Do not clear storage, unregister the worker, use a private profile, or install from `file://`.
3. Confirm the r70W build and active worker while still under the restricted gateway. If the update is waiting or any asset is missing, stop. Disable Wi-Fi and verify the phone has no network route before reopening TradeFlow.
4. Offline, confirm the existing device identity, staged candidate, journal, cursor and one queued operation are unchanged. Run **Verify Camon 17P KPI outbox (read only)** and save its sanitized report externally. Do not activate, reconcile, start Live Sync, refresh staff access, or reconnect to Supabase. Any mismatch is a stop condition.

## Confirmed origin analysis

`js/confirmed-july-snapshot.js` builds the July 2026 closing KPI record with ID `KPI-202607-CONFIRMED`. Its `load` and `zezms-cloud-ready` handlers can add this record to local `DB.kpiHistory` and call `saveDB()` when Phase A is not pending. The embedded M4 Cloud Sync code diffs `kpiHistory` by `_syncId`, falling back to `id`, and represents a new record as `{action:'insert',collection:'kpiHistory',key,value}`. This path can produce a `DATABASE_CHANGE` operation before a Safe Bootstrap stage is attested. The actual Camon payload is absent from the sanitized diagnostic, so this is a plausible source, **not an established attribution**.

The r70M outbox classifier only permits exact candidate-equivalent control roots. Its `kpiHistory` insert remains `UNKNOWN / REVIEW REQUIRED` and activation stays blocked. This branch leaves that classifier and the activation bridge unchanged.

## Read-only local verifier

The additional pre-login control appears only on the specified Camon 17P browser identity when a stage key is present. It calls only local state, outbox, stage and integrity inspection helpers. It shows no KPI values. The downloadable sanitized report contains fixed identifiers, booleans, counts, SHA-256 hashes and reason codes, with a separate report checksum. **This sanitized file is not the full encrypted operation backup required before any future reconciliation.** It requires:

1. The exact device, lifecycle, cursor and operation identifiers; a paired identity; Live Sync off; one durable queued operation; zero failed operations; no material local business records.
2. The existing `hasVerifiedPendingStage()` integrity and fingerprint check, with a matching VERIFYING journal.
3. One complete `kpiHistory` insert patch, its key matching the full value's M4 identity, a valid operation payload hash, and creation before stage attestation.
4. Exact expected July initializer fields (allowing only M4's `_syncId`), exactly one identical local KPI record, and one **fully identical** record in the verified candidate, including `_syncId`. Extra fields produce partial equality at best. Other value or identity differences block equality.
5. The same persisted queue, stage, journal and state bytes before and after hashing. A concurrent change yields `NOT_VERIFIABLE`.

`EXACT_EQUALITY` is a local equivalence finding only. It does not independently verify the latest cloud head, the live lifecycle row, or Owner consent. `PARTIAL_EQUALITY`, `MISMATCH` and `NOT_VERIFIABLE` never authorize queue removal.

## Use after a separately approved deployment

1. Confirm the approved r70W release is live from the same TradeFlow origin. Preserve the previously verified encrypted recovery evidence independently. Keep Camon 17P's existing browser profile and site data. Do not install from a local file or clear Chrome data.
2. Use only the separately tested, controlled same-origin update route that blocks Supabase and other destinations during shell delivery. Do not put Camon 17P on unrestricted internet merely to update. Once the shell loads, make the phone fully offline before opening the verifier.
3. On the pre-login screen, tap **Verify Camon 17P KPI outbox (read only)**. Download the **sanitized KPI review report**. The button does not activate the device or remove the operation.
4. Preserve the report file outside the phone and verify its embedded report SHA-256; independently record the downloaded file's SHA-256. Check that it names the expected device, lifecycle, cursor and operation, shows one queued operation and zero failed operations, and reports `EXACT_EQUALITY`. If the button is absent, any check is false, or the report is not exact, stop and keep the original queue and stage untouched.
5. Send only the sanitized report and checksum for independent Owner review. Do **not** tap Complete verified activation, refresh or recover staff access, turn on Live Sync, or reconcile the outbox. A separate approved reconciliation remains necessary, along with a verified encrypted copy of the full original operation.

## Conditional reconciliation design, not executable in this branch

The actual Camon record and candidate have not been compared, so the condition for implementing an executable reconciliation is unmet. There is deliberately no reconciliation API or button. The next narrowly scoped review should proceed only if the genuine device report says `EXACT_EQUALITY` and is independently checked against a securely preserved export:

1. Independently preserve and verify the complete original queue item, stage, journal and device state in an encrypted file outside browser storage. Record its SHA-256. An interrupted or unverified download leaves the queue unchanged.
2. Obtain separate explicit Owner approval naming this device, lifecycle, operation ID and evidence hash. Keep the phone offline and Live Sync disabled.
3. Recheck the exact same full record and all guards immediately before a local, one-operation queue change. Verify durable and in-memory queue consistency. Never broaden r70M's classifier.
4. Retain the external artifact and a local audit record. On any uncertain write or interruption, remain offline and restore/review from the artifact. Do not call a cloud RPC or `finish()` during reconciliation.
5. Only after independent review of an empty outbox and ACTIVE cloud lifecycle, use the existing `ZEZMS.managedDevices.finish()` for the already verified candidate. Do not repeat enrolment or reset site data.

If the real report is anything other than `EXACT_EQUALITY`, preserve the operation and stage unchanged and review its full encrypted evidence. A legitimate differing KPI insert needs a separate business-data disposition; it cannot be silently discarded.

## Test boundary

`tests/r70w-camon17p-kpi.browser.cjs` uses the actual assembled shell with localhost-only network routing and synthetic data. It covers service-worker installation with matching shell, manifest and verifier asset; exact duplicate; altered value; extra field; missing candidate record; extra queue item; changed operation ID; corrupt fingerprint or journal; wrong lifecycle or device identity; attestation order; unavailable verifier dependency; unsuccessful existing activation; interrupted sanitized report download; and healthy-device UI absence. It verifies unchanged durable queue, stage, journal, state, IndexedDB database inventory and local DB around every verifier call. No production device or Supabase data was used.

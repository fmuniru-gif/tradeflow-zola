# Camon 17P single-operation review (r70W)

Status: **NO-GO for reconciliation, activation and deployment**. This branch is a read-only proof candidate based on production `main` at `4a774e86ff0228c2a3804a127959703497f3c03c`. It does not remove, upload, acknowledge or relabel any operation. The verifier API returns no queue, stage or hash details when invoked on another device identity.

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

# r70J Automated Test Report

## Final r70J regression pass — passed

The final focused run completed with **820 assertions** and **18 Canonical
Recovery scenarios** passing. It ran against the generated r70J shell and did
not contact Supabase, publish files, alter a device, or mutate business data.

- `r67j-production-capability-guard.test.js` — 39 assertions. Decodes the
  final `CLOUD_B64`; proves r70 owns the final global guard on MB3, no legacy
  RPC is used there, real mismatches still block, M4/4 has its own contract,
  the explicit old-server fallback remains fail-closed, and obsolete r67J
  mismatch state is cleared only after a successful current validation.
- `r70j-readiness-publication-audit.contract.test.js` — 10 assertions. The
  optional SQL retains security and protocol checks, permits only the 3.31.x
  patch train for the unchanged r70 engine build, and is not executed.
- `r70-mb3-m44-transition.test.js` — 196 assertions.
- `r70i-legacy-checkpoint-hash-compatibility.integration.test.js` — 53
  assertions, using the caller-supplied read-only historical checkpoint export.
- Safe Bootstrap, manifest handoff, recovery stabilization, existing ACTIVE
  identity relink, control-plane, Canonical Restore, active-device binding and
  M4/3-freeze suites — 360 assertions.
- r70E claim reliability, r70A rollover, r70G freeze/reconnect, and r70C
  picker checks — 162 assertions, including 4 picker scenarios.
- `r70b-canonical-recovery-checkpoint-bridge.test.js` — 18 required scenarios.
- Syntax checks passed for the final capability source, lifecycle source, and
  r70J builder.

The final generated-CLOUD test specifically proves the r70 dynamic guard is
the final global owner after all injected fragments execute. It is not merely a
source-fragment or string-presence test.

## Repository-wide inventory — recorded without bypassing failures

`tests/run-r70j-repository-suite.js` ran all 112 `*.test.js` files with an
independent 45-second bound per test. Its exact per-test status, timing, and
first diagnostic are recorded in
[`reports/r70j-repository-suite-results.json`](reports/r70j-repository-suite-results.json).

Result: **43 passed, 68 failed, 1 timed out**.

The 68 failures are retained, not hidden or changed. They are historical,
release-pinned test suites that require retired r62–r70I release markers,
byte-identical former generated payloads, or old dashboard/print assets that
are deliberately not present in this r70J baseline. The report names every
one of them, including their diagnostic. Several historical browser snapshots
also time out waiting for those retired screens.

`r67u-proforma-invoice-runtime.test.js` is the single 45-second timeout. It is
reported in the JSON result; no test was deleted or treated as passing.

The generic repository runner intentionally does not read a user production
export. Consequently its r70I checkpoint test reports its missing
`ZEZMS_PRODUCTION_CHECKPOINT_EXPORT` setting as a failure. The same test then
passed separately with the supplied local, read-only historical checkpoint
export (53 assertions); that data was not copied into this release or upload
package.

## Execution boundary

No Supabase SQL was executed. The optional readiness SQL is a separate
review-only artifact. No GitHub publish, application deployment, cache clear,
browser-site-data clear, pairing, lifecycle action, Canonical Restore, backup
restore, or business-data operation was performed by these tests.

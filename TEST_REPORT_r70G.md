# r70G test report

Executed locally on 2026-10-04:

`node tests/build-r70g-active-device-binding-recovery.js` — PASS

`node tests/r70g-active-device-binding-recovery.integration.test.js` — PASS, 55 assertions

`node tests/r70g-reconnect-sql-ambiguity.contract.test.js` — PASS, 39 assertions

`node tests/r70g-safe-bootstrap-preservation.integration.test.js` — PASS, 24 assertions against the r70G embedded lifecycle source.

`node tests/r70d-canonical-restore-execution.integration.test.js` — PASS, 43 assertions against the real embedded r70D engine.

`node tests/r70g-m43-freeze.contract.test.js` — PASS, 8 assertions: M4/3 active; M4/4 inactive; branch operational isolation OFF.

After packaging, ZIP entry integrity and byte-for-byte parity of the standalone `GITHUB_UPLOAD_ONLY` tree against the GitHub upload ZIP are checked again.

The in-memory test proves:

- production embedded payloads equal reviewed r70G source;
- PAIRED ACTIVE device staff recovery preserves business roots, device ID and queue;
- legacy OWNER ACTIVE device recovery succeeds without conversion/enrolment;
- blank local mode is repaired only from matching ACTIVE Cloud context;
- no-session UI says **Reconnect this existing device** and simulated Owner/AAL2 reconnect retains the same lifecycle;
- RETIRED and wrong-device contexts do not hydrate staff auth or repair binding;
- no business-data writes appear in the optional SQL;
- a same-identity reconnect retry is explicitly read-only and does not advance lifecycle revision;
- every `RETURNS TABLE` collision name is tested against unqualified expression, predicate and `RETURNING` use in the reconnect RPC;
- r70F Safe Bootstrap eligibility/resume and manifest-revision markers remain;
- M4/4 remains absent; force-update/cache code does not clear browser data.

No disposable PostgreSQL/Supabase-compatible runtime is installed locally, so the SQL check is a strict static contract test rather than a live function-creation test. No live Supabase RPC, migration, browser profile, business data or queue was touched.

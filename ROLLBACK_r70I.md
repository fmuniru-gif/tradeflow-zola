# r70I rollback

If the r70I application shell itself must be rolled back, redeploy the verified r70H application-shell files and force a normal cache refresh. Do not clear site data on CAMON 50 PRO and do not cancel its existing `BOOTSTRAPPING` lifecycle: its journal, anonymous identity, pairing claim and lifecycle are independent of the static shell.

Because r70I makes no database or business-data changes, rollback requires no SQL rollback and has no data reversal step. Preserve the r70I artifacts and local production export for diagnosis; do not modify or delete checkpoint rows or historical operations.

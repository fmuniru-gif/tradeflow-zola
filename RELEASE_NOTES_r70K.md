# Release notes — v3.31.11 / r70K

Build: `20261006-r70k-bootstrap-replay-reconciliation`

- Prevents ordinary Live Sync from operating while a Safe Bootstrap candidate remains staged locally.
- Reconciles pre-bootstrap applied-operation acknowledgements above the verified candidate cursor before candidate commitment.
- Adds a read-only Safe Bootstrap replay audit and downloadable evidence export.
- Adds a targeted local replay option that requires current Cloud-record identity, absent local effects and safe revalidation immediately before applying.
- Preserves r70J capability-guard precedence, r70J navigation fixes, M4/3 active status, M4/4 Ready-only status and disabled operational branch isolation.

No Supabase SQL, migration, business-data mutation, Cloud-history rewrite, backup transfer, re-pair or reset is included in this release.

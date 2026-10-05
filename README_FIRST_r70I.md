# ZEZMS TradeFlow v3.31.9 / r70I

Build: `20261005-r70i-legacy-checkpoint-hash-compatibility`

r70I is a narrow, client-only Safe Bootstrap compatibility release. It accepts an M4/3 historical checkpoint only when its stored eight-character hash exactly matches the historical canonical FNV-1a 32-bit calculation. A sixteen-character checkpoint continues to use the current deterministic 64-bit verifier. Unknown formats and all mismatches are rejected before any checkpoint data can be staged.

The release preserves r70H active-device identity relink, r70G recovery, Canonical Restore, M4/3 and the M4/4 freeze. It does not create devices, claim pairings, alter lifecycle semantics, change business logic, execute SQL, or deploy anything.

For the existing CAMON 50 PRO, retain the same browser profile and Safe Bootstrap journal. After deployment, reopen the existing bootstrap flow and use its retry action; r70I recognizes the same `BOOTSTRAPPING` lifecycle and resumes it without a new pairing code.

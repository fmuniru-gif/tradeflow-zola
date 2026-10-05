# r70J — Authoritative Capability Guard

**Release:** ZEZMS TradeFlow Owner Edition v3.31.10 / r70J  
**Build:** `20261005-r70j-authoritative-capability-guard`

- Restores the r70 protocol-transition guard as the authoritative global
  capability validator on MB3-capable servers.
- Preserves r67J as an explicit fail-closed fallback for a genuinely old
  M4/3-only server whose MB3 transition RPC is absent.
- Clears only the obsolete r67J capability mismatch sentinel after a successful
  r70 validation; unrelated error, integrity, lifecycle, queue and recovery
  state remains untouched.
- Rotates only application-shell caches. Existing site data and paired-device
  identity are preserved.
- Keeps M4/3 active and leaves M4/4 activation and branch operations blocked.

No deployment, SQL execution, device action, business-data mutation, operation
replay, backup restore, or lifecycle change was performed while producing this
release.

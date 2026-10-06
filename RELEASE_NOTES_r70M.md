# Release notes — v3.31.13 / r70M

- Adds proof-based Safe Bootstrap outbox inspection, reconciliation, atomic activation, and rollback.
- Prevents candidate-equivalent control-plane hydration from creating staged-bootstrap queue residue while preserving fail-closed handling for all other saves.
- Adds a lifecycle-led Device Control Center with Active, Pending, History, lineage projection, health labels, and downloadable reconciliation evidence.
- Routes normal add/recovery controls to the existing safe lifecycle wizard and presents paired-device Branch Management as neutral Owner/Admin-only information.
- Rejects blank replay-audit range fields instead of treating them as zero.
- Removes the obsolete `zezms-portfolio-signals-20260812-r39` cache label.
- Preserves r70L replay/materialization safeguards, M4/3 Active, M4/4 Ready only, business history, stock, cash, FIFO, Cloud history, lifecycle history, and existing CAMON 50 PRO protections.

No SQL artifact is required for this client/projection release; no SQL was generated or executed.

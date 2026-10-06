# r70M read-only Fleet Reconciliation Report

The production fleet is not packaged with this release. No current CAMON, ZEZMS Main, Shop, lifecycle, enrollment, Cloud, or authentication records were read or changed while building r70M. Therefore this document does not guess whether CAMON 17P or CAMON 17P Repaired is the surviving production identity.

In Settings → Device Control Center, **Download fleet reconciliation report** produces a local read-only JSON report for each returned managed-fleet identity:

- device ID and name;
- lifecycle mode and canonical status;
- enrollment status and authentication eligibility;
- replacement parent/child;
- branch, last seen, app version, verified cursor;
- Active-versus-History projection; and
- any lifecycle/enrollment contradiction.

For CAMON 17P, obtain this report from an Owner/Admin device and inspect the original/repaired lineage. If two identities have conflicting valid bootstrap journals or both appear active, stop: do not activate either automatically. The target is one authoritative active CAMON 17P identity, with the other preserved as retired/replaced history. Any later server-side repair requires a separately reviewed, read-only plan listing source state, proposed canonical state, authorization impact, and whether the change is projection-only. No bulk cleanup is included in r70M.

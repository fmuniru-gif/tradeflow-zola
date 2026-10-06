# ZEZMS TradeFlow v3.31.11 / r70K

## Bootstrap Replay Reconciliation

This package is a narrow follow-up to the verified `v3.31.10 / r70J` production baseline. It fixes a Safe Bootstrap handoff defect without changing the M4/3 protocol, enabling M4/4, enabling branch data-plane isolation, changing identity/tenant/branch/lifecycle records, or changing Cloud operation history.

The new **Safe Bootstrap replay audit** appears on the Data Integrity & Sync page. It is read-only until the user deliberately selects a row that the audit has proved is missing and safe to replay locally.

For the affected CAMON 50 PRO, use the audit range `3173` to `3188`. Do not repair anything if the audit does not identify a row as `MISSING_EFFECTS` and `safeForTargetedReplay`.

Read [RECOVERY_r70K.md](RECOVERY_r70K.md) before deployment or recovery.

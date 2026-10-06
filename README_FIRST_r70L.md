# ZEZMS TradeFlow v3.31.12 / r70L

## Bootstrap Replay Origin Invariant

r70L is a narrow follow-up to `v3.31.11 / r70K`. It corrects an immediate Safe Bootstrap replay defect without changing the active M4/3 protocol, enabling M4/4, enabling branch data-plane isolation, or altering Cloud history, identity, tenant, branch, lifecycle, FIFO, stock, cash, or transaction formulas.

The correction is limited to the verified replay window immediately after a candidate at a known checkpoint has replaced the local database. In that window, every operation above the candidate boundary is reconciled against the committed candidate's actual effects, regardless of its original device ID. It is acknowledged only after a successful safe materialization or positive effect-neutral proof.

The current CAMON 50 PRO remains recovery-only: deploy first, then run the read-only audit for `3173` through `3188`. Do not reset, re-pair, restore, clear site data, rewind its cursor, or create a sale manually.

Read [RECOVERY_r70L.md](RECOVERY_r70L.md) before any device recovery action.

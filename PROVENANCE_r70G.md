# r70G provenance

Direct baseline: ZEZMS TradeFlow v3.31.6 / r70F, build `20261004-r70f-recovery-stabilization`, copied into this clean r70G workspace before modification.

r70G build: `20261004-r70g-active-device-binding-recovery`.

The build verifies that the r70D Canonical Restore payload is byte-for-byte unchanged and that the r70E direct M5A4 Safe Bootstrap claim remains embedded. Before deployment, the optional reconnect RPC was corrected for `RETURNS TABLE` output-variable/table-column ambiguity and covered by a source contract test. `SUPABASE_R70G_ACTIVE_DEVICE_BINDING_RECOVERY.sql` is source-only; it was not executed.

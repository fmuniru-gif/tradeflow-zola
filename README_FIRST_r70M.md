# ZEZMS TradeFlow Owner Edition v3.31.13 / r70M

## Device-control-plane stabilization

r70M is built directly from the supplied verified `v3.31.12 / r70L` full-source archive. It keeps M4/3 active, leaves M4/4 Ready only, and does not execute SQL, alter a Supabase project, alter device state, or change business data.

The release has two connected protections:

1. A verified Safe Bootstrap can inspect and reconcile only provably redundant control-plane outbox residue during Owner-approved activation.
2. Settings now renders one lifecycle-led Device Control Center with Active Devices, Pending / Needs Attention, and collapsed Device History.

For CAMON 17P, deploy first and use the existing staged browser profile. Do not re-pair it, replace it again, clear site data, reset its cursor, or create transactions. Read [RECOVERY_r70M.md](RECOVERY_r70M.md) before touching that phone.

The source package has no production queue payload, so it does **not** claim to identify the actual five CAMON 17P patches. The new read-only **Inspect bootstrap outbox** action displays every operation and patch on that device, then activation proceeds only if every one satisfies the proof in [ROOT_CAUSE_r70M.md](ROOT_CAUSE_r70M.md).

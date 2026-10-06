# r70K test report

The final generated `CLOUD_B64` runtime was exercised locally in an isolated Node VM. No Supabase project, SQL endpoint, device or real business database was contacted.

`tests/r70k-bootstrap-replay-reconciliation.runtime.test.js` passes 30 assertions covering:

- a verified candidate at cursor 3173;
- temporary pre-commit local state through cursor 3188 and 65 sales;
- a stale applied-operation registry for all 3174–3188 operations;
- blocked pre-activation Live Sync;
- candidate commit restores 64 sales and removes post-boundary acknowledgements;
- ordered replay restores 65 sales and one receipt at cursor 3188;
- zero queue and failed operations with clean integrity;
- final per-operation invariant: every acknowledged replayed operation is present or effect-neutral;
- repeated reconnect/replay is idempotent;
- the read-only audit identifies the exact missing sale/receipt operation; and
- a targeted replay restores it without changing cursor or allowing a second replay to duplicate it.

The inherited durable apply journal remains the recovery mechanism for an interruption after local persistence but before applied-registry/cursor bookkeeping. The r70K commit guard removes the stale post-boundary acknowledgement condition that caused the observed cursor-ahead state.

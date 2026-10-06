# r70L release notes

- Version: `v3.31.12 / r70L`
- Build: `20261006-r70l-bootstrap-replay-origin-invariant`
- Direct source baseline: verified `v3.31.11 / r70K`

## Changed

- Immediate verified Safe Bootstrap replay is origin-independent after candidate replacement.
- Acknowledgement requires successful materialization or a fresh effect-neutral proof before registry/cursor bookkeeping.
- A same-device conflict now fails closed with local diagnostic evidence.
- Candidate commit now restores complete relevant local state if a persistence or later commit step fails.
- The generated shell, manifest, service-worker cache and visible metadata carry r70L markers and purpose text.

## Preserved

- r70K staged-sync gates, registry pruning, read-only replay audit and targeted recovery.
- Normal post-bootstrap same-device idempotency behaviour.
- M4/3 Active design; M4/4 remains Ready only.
- No automatic recovery, no Cloud rewrite, no SQL or migration.

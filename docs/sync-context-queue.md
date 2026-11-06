# Sync context and background receive guardrails

Baseline: `135a3cd44c59d9177a9af3cdd9b41535089f8fcd`.
Delivery: `20261106-sync-context-r1`.

## Reproduced behavior and changes

The production checkpoint request returned an owner-A response even after its Cloud owner changed to owner B while awaiting that response. The operation-page read also accepted an old-client response after a same-owner, same-device client replacement. The new context snapshot captures client identity, authenticated user, owner, device/access authority, business/branch, configuration and initialization state. Checkpoint, master and operation-page reads validate that context before requests, after responses and before retries. Uploads use the captured client and the same context guard for sends and durable read-back. Normal token refresh for the same authenticated user remains valid. A stale response is rejected; it cannot acknowledge or apply business operations.

The existing serialized receive queue executed twenty receive cycles for twenty simultaneous automatic notifications. Background callers now share a receive that is queued but has not begun. Notifications during a running receive retain one queued follow-up, so arriving operations are not lost. Manual receives remain distinct, retaining their existing notice behavior. Failure releases the shared slot; a changed context cannot inherit a previously queued request.

Deterministic tests cover the actual assembled checkpoint, master, operation read and receive functions, including rejection before rebase, apply/journal writes or cursor advancement. The synthetic notification benchmark reduces twenty queued receives to one; twenty notifications during an active receive produce two cycles total and retain the latest state. This measures avoided work, not a physical-laptop latency guarantee. New Chrome checks use the pinned SDK with a held synthetic HTTP response, checking changed-client rejection, normal token refresh and unchanged durable database/outbox data.

## Delivery and scope

The original embedded business/protocol modules remain unchanged. Only the existing reviewed materialization transform, bounded transport helper and delivery metadata change. Financial calculations, FIFO, correction/reversal semantics, permissions, recovery verification and upload acknowledgement rules remain authoritative. There is no Supabase migration and no production business-data or operational-device mutation.

The new passive update page is `SYNC_RELIABILITY_UPDATE.html`. Old caches, device identities and queued transactions are preserved. Use the verified bundle readiness result, close all TradeFlow tabs and app windows, then reopen normally. No force activation or storage clearing is added.

The branch workflow checks the exact baseline and delivery manifest, then runs every source/unit and Chrome browser suite with loopback-only networking. Deployment requires successful checks and exact reviewed tree verification. Real Main, Shop and Camon convergence still needs observation after their normal controlled updates.

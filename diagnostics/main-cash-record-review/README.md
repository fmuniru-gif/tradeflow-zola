# Main single cash-record review — read only

The current Main audit identifies a cashLog entry from event `CB-20261109-183110-271-` as missing locally. Main, Shop and Camon50 are at cursor4305, but Main's published operational fingerprint differs. This page captures fresh evidence for that exact entry without importing the business app or enabling a repair.

Use Main's existing Chrome profile and signed-in Owner cloud session. Close other TradeFlow windows, open this page, select **Check missing cash entry (read only)**, then download the private cash review report. A changing local store/session or cloud head stops capture.

The page authenticates the saved Owner session, verifies the native checkpoint hash format, reads ordered Owner-scoped history with a fixed head, verifies replay-operation hashes, and uses the exact shipped pure Integrity Core projector/comparator. It reports the target record, source operation hashes and wallet patches, local applied-register evidence, current wallet values, all actionable findings and both local/cloud orphan references. It simulates insertion into a detached database copy and reports the resulting operational fingerprint plus remaining full-root differences. Simulation never changes cash balances. This evidence does not authorize a repair.

Only GET requests and the existing SELECT-only `zezms_m43_checkpoint_latest` RPC are possible. No data writes, sync calls, auth refresh, queue/registry/cursor changes, activation or repair control exists. The downloaded report contains financial amounts and IDs; credentials, auth tokens and local staff access are omitted. Existing app, worker, manifest and delivery bytes remain unchanged.

Revision2 selects the exact record ID from the fresh native audit instead of transcribing the UUID from a screenshot. Only one missing cash entry from that precise timestamp event can be simulated. Zero, multiple, out-of-event or duplicate identities produce a downloadable report with no selected record or simulation; authority/hash/stability errors still stop capture.

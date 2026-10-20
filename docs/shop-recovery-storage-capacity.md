# Shop recovery storage-capacity review

This candidate starts from production `fe690cadf2419a0e43cbb79d02dd77e97e3bd16b`.
It changes Shop recovery storage planning only. Trading activation remains disabled;
Live Sync, business posting and all Shop uploads remain held. No device action is
part of this review.

The old quarantine capacity probe reserved a hypothetical later receive journal
with the full database in `original`, `receive.before` and `receive.target`.
It did this before quarantine, although only `original` was about to be written.
The one `SHOP_STOP_INSUFFICIENT_STORAGE` code also covered both the explicit
16-million-character ceiling and a failed browser write, so the historical
Shop error alone cannot distinguish those two causes. Shop's reported lengths
are not a quota measurement.

The new check reserves the **next** durable journal write, positive database,
register and state growth, and a 64 KiB margin. It probes localStorage with
readback and cleanup before mutation. A separate check runs before receive.
An explicit safety-ceiling failure now has its own code. A browser quota failure
remains `SHOP_STOP_INSUFFICIENT_STORAGE` and leaves the original queue intact.

The original full database, queue and metadata remain in the checksummed local
journal and the independently readback-verified encrypted external archive.
The receive journal stores SHA-256 hashes and small state/register fields instead
of two additional full database copies. Its exact before and target databases
are recovered only from the authenticated receive archive; their hashes, cloud
projection, and current local state are checked before any resumed write.
Older full journals remain readable. A damaged or lost journal continues to
require the authenticated external archive for the existing offline restoration
path. Neither archive format nor operation disposition changed.

A synthetic Shop-sized state used a 1,894,805-character database and 2,330,990
characters of initial localStorage values. The old hypothetical reservation was
5,757,896 characters. Under a simulated 5,242,880-character quota, the revised
quarantine journal was 1,900,468 characters, the prepared receive journal was
1,901,801 characters, and final stored values totalled 4,230,095 characters.
The test also rejected insufficient quota before mutation, resumed an interrupted
queue write after archive re-verification, and resumed an interrupted receive
after reload and archive re-verification. A disposable Chrome profile with the
same synthetic database and initial localStorage character counts completed the
assembled-shell quarantine and receive-only flow under its real browser quota.
These are synthetic measurements, not proof of Shop's actual browser quota or
current cloud state.

## Owner route after a separately authorized deployment

1. Keep the existing encrypted Shop archive saved externally. Do not clear site
   data. Install the reviewed same-origin shell with the existing safe update
   helper, close other TradeFlow tabs, and confirm the worker check reports
   `READY` and `shop-storage-capacity-v1`.
2. With Shop online but Live Sync still held, sign in as its genuine local
   Owner and run a **new read-only Shop preflight**. Review the exact three IDs,
   current Owner/cloud authorization and safe staff-directory disposition.
   The previous in-memory preflight and archive verification do not survive a
   reload or upgrade.
3. Reselect and verify the saved encrypted archive. If it does not match the
   fresh preflight, preserve it and create a separately named full encrypted
   backup with readback and decryption verification. Stop on any mismatch.
4. Only after separate approval, disconnect Shop fully and confirm offline
   status. Run the exact-three quarantine once. Stop on any storage or journal
   error; retain the archive and queue evidence.
5. Receive-only catch-up requires a new online preflight, a new verified full
   external backup, and its separate confirmation. Run full Cloud-vs-Local and
   wallet verification afterward. Keep the Shop hold in place. Do not enable
   Live Sync or trading.

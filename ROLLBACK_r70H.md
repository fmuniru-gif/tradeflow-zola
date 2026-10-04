# r70H rollback

Restore the r70G static shell and refresh only application caches. Do not clear site data.

If the r70H SQL was manually applied, leave it unless a separately reviewed database rollback is approved; it is dormant without an authenticated RPC call and does not perform background work.

If a relink fails after paired-session preparation, r70H restores the prior primary session, rebinds the existing access/lifecycle/registry identities back to their prior anonymous user, and restores every modified local pointer field, including `r70hRelinkLifecycleId`.

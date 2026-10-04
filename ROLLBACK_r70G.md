# r70G rollback

Static rollback: restore the previous r70F static tree and force-refresh the application shell cache. This does not erase local business data, device ID, staff cache, queue or bootstrap journal.

If the optional reconnect RPC was manually deployed, leave it in place unless a reviewed database rollback is explicitly approved. Removing it while a device has lost its Cloud session would remove the secure reconnect option; it has no automatic data-plane activity.

Do not use browser-data clearing as rollback. It would destroy the local evidence r70G is designed to preserve.

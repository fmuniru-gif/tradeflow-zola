# Rollback — r70L

1. Preserve the complete r70L package and the pre-deployment r70K static files.
2. If a static-shell rollback is necessary, restore the r70K files to the same site location and use the ordinary update path to refresh caches.
3. Do not clear site data, reset/re-pair a device, restore a backup, rewind a cursor, modify Cloud history, or run SQL as part of rollback.
4. If an affected CAMON has a recovery audit or any unexpected warning, preserve its audit/export and stop before a targeted replay. Rollback cannot be used to hide or fabricate a business operation.

r70L contains no schema migration, so no database rollback script exists or is required.

# Deployment — r70K

1. Preserve the existing deployed r70J files as rollback material.
2. Upload the contents of `GITHUB_UPLOAD_ONLY` from this r70K package to the same static site/repository location used for r70J. Do not upload source ZIP files or execute any SQL.
3. Confirm the deployed title/build is `v3.31.11 / r70K` and `20261006-r70k-bootstrap-replay-reconciliation`.
4. On each device, use the app's normal update path or open `FORCE_UPDATE_MOBILE.html`. This refreshes app caches only; do not clear site data, reset, re-pair, restore, or import a backup.
5. Confirm normal devices still show M4/3, M4/4 Ready only, active lifecycle, zero queued and failed operations, and clean integrity.
6. Only on the affected CAMON, follow `RECOVERY_r70K.md`.

Deployment contains no data migration and no Cloud write other than ordinary application behaviour already authorized by the user when they later choose a verified replay in the app.

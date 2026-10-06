# Deployment — r70L

1. Keep the deployed r70K files as rollback material.
2. Upload only the contents of `GITHUB_UPLOAD_ONLY` to the existing static-site location. Do not upload source archives and do not execute SQL.
3. Confirm the deployed title/build is `v3.31.12 / r70L` and `20261006-r70l-bootstrap-replay-origin-invariant`.
4. On each device, use the normal app-update route or `FORCE_UPDATE_MOBILE.html`. This rotates application caches only. Do not clear site data, reset, re-pair, restore, or import a backup.
5. Confirm normal devices show M4/3, M4/4 Ready only, active lifecycle, zero queued/failed operations and a clean integrity result.
6. For the affected CAMON only, make the first post-deployment action the read-only audit in [RECOVERY_r70L.md](RECOVERY_r70L.md). Do not make a targeted recovery decision from cursor or count alone.

Deployment does not include a data migration or automated recovery action.

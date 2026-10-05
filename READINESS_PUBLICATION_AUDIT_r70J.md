# r70J Readiness-Publication Compatibility Audit

The audit confirmed a latent reporting incompatibility. `r70PublishReadiness()`
sends the visible `APP_VERSION` and the retained r70 engine build. r70I/r70J
therefore report `3.31.9`/`3.31.10` with
`20261001-r70-mb3-branch-aware-m44-transition`. The existing server function
accepts only app version `3.31.0`, so it rejects a later r70 patch release even
though the protocol engine, dual-protocol support, lifecycle binding, and
current protocol have not changed.

`SUPABASE_MB3_M44_READINESS_R70J_PATCH_TRAIN.sql` is a separate, unexecuted
review artifact. It keeps the exact r70 build pin and every existing
authentication, ACTIVE-device, dual-protocol and current-protocol check. It
only changes the display-version rule to allow the `3.31.x` r70 patch train.
It does not activate M4/4 or modify business data, checkpoints, cursors, or
the protocol state.

The client guard repair does not depend on this SQL. Review and explicitly
authorize the artifact separately before any database action.

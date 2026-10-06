# r70M rollback

If an app-shell/UI problem is found before a device activation, redeploy the preserved r70L static assets. Do not clear browser storage, unregister unrelated service workers, delete lifecycle rows, or run SQL.

If r70M activation begins and fails, the r70M wrapper restores its captured local database, observed snapshot, sync state, queue, applied registry, stage, and journal. Leave that profile in place and investigate the displayed error/evidence; do not use rollback as a reason to rebuild or replace the identity.

After a successful activation, do not attempt to reverse Cloud/lifecycle state by redeploying an older shell. Stop and prepare a separately reviewed recovery plan based on read-only evidence.

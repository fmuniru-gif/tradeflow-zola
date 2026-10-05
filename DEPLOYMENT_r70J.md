# Deployment — Existing CAMON 50 PRO

1. Publish only the contents of `GITHUB_UPLOAD_ONLY` to the existing static
   application host. Do not publish `SUPABASE_MB3_M44_READINESS_R70J_PATCH_TRAIN.sql`.
2. On the CAMON, while signed into its existing paired session, open the hosted
   `FORCE_UPDATE_MOBILE.html` page once. It rotates **application caches only**
   and opens the r70J build URL.
3. Return to the app and use the existing **Reconnect now** action if Live Sync
   does not resume by itself. A successful r70 validation clears only the
   obsolete old capability-mismatch sentinel.
4. Confirm the app shows v3.31.10, the existing paired identity and lifecycle,
   M4/3 active, zero queue/failed operations, and then recheck Live Sync.

**Do not clear site data. Do not re-pair the device. Do not create a new
lifecycle.** Do not use Repair/replace, Canonical Restore, backup restore,
Owner recovery, or M4/4 activation for this issue.

If r70 validation reports a real current-contract mismatch, stop. Do not
attempt a data repair; retain the displayed error and investigate the server
transition contract separately.

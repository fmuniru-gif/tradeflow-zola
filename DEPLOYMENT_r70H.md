# r70H deployment

Upload the contents of `GITHUB_UPLOAD_ONLY` to the static site root, then refresh the application shell until v3.31.8/r70H appears.

Do not execute SQL automatically. Review `SUPABASE_R70H_ACTIVE_DEVICE_IDENTITY_RELINK.sql` and apply it manually only when ready to enable the secure Owner-selected relink and real registered-device presence/version updates. Without it, r70H refuses rather than guessing an ACTIVE identity.

For the affected Phone: choose **Recover local staff access**; when its unmatched pointer is confirmed, choose **Identify this existing device**; select **ZEZMS Phone**; complete Owner MFA; confirm the relink. r70H will establish its exact paired anonymous session before changing the local pointer. Verify the same registry row shows app 3.31.8 with fresh last-seen time and that no new device row appears.

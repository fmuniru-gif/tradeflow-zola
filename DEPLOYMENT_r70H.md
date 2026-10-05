# r70H deployment

Upload the contents of `GITHUB_UPLOAD_ONLY` to the static site root, then refresh the application shell until v3.31.8/r70H appears.

Do not execute SQL automatically. Review `SUPABASE_R70H_ACTIVE_DEVICE_IDENTITY_RELINK.sql` and apply it manually only when ready to enable the secure Owner-selected relink and real registered-device presence/version updates. Without it, r70H refuses rather than guessing an ACTIVE identity.

For the affected Phone: choose **Recover local staff access**. If its original anonymous PAIRED session survives, r70H restores the known Phone pointer immediately and retains that session. If it cannot prove a self-binding, use **Verify Owner to identify this existing device**, complete Owner MFA, then select **ZEZMS Phone** and confirm. An Owner session can use **Identify this existing device** directly. Verify the same registry row shows app 3.31.8 with fresh last-seen time and that no new device row appears.

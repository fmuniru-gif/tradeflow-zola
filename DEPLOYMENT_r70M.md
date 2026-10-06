# r70M deployment

1. Keep the current r70L deployment available for rollback. Do not clear any browser/app storage.
2. Upload only the contents of `GITHUB_UPLOAD_ONLY` to the existing static-app host, preserving paths.
3. Confirm the deployed shell reports `v3.31.13 / r70M` and the current service-worker cache boundary.
4. On an Owner/Admin device, open Settings → Device Control Center and press Refresh. Confirm that normal active devices appear only once and History is collapsed.
5. Do not run SQL, enable M4/4, alter branch data plane, or perform fleet state mutation as part of deployment.

Deployment replaces app assets only. It does not publish database migrations, change Cloud data, modify lifecycle records, or reconcile any device automatically.

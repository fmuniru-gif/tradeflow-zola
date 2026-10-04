# r70F Rollback Instructions

Rollback is static-site only. No r70F SQL or business-data migration exists.

1. If r70F fails before approving a replacement, stop at the write-locked state. Do not clear site data and do not recreate the pairing.
2. Redeploy the complete verified r70E static package as one set: `index.html`, `manifest.json`, `sw.js`, `FORCE_UPDATE_MOBILE.html`, `assets/`, and `js/`.
3. Open the r70E force-update page once to rotate only app caches. It does not erase local device, staff, business, queue, or journal state.
4. Do not replay old Phone 2 data and do not run M4/4 or branch SQL.
5. The r70F journal is intentionally retained during rollback. When r70F is redeployed, the matching lifecycle/device journal permits Resume rather than another claim code.

If the replacement has already been Owner-approved ACTIVE, do not perform a browser-only rollback as a way to undo the lifecycle cutover. Review the managed lifecycle evidence first.

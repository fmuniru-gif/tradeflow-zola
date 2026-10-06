# r70M post-deployment checks

## ZEZMS Main and ZEZMS Shop

Open the app normally, allow the new shell to load, and verify usual operations remain available. In Device Control Center, confirm their canonical status is Active and that there are no unexpected Pending rows. Do not alter their records merely to tidy History.

## CAMON 50 PRO

Do not reset or re-pair it. Confirm its existing normal app data and Live Sync health remain intact. It is protected by the unchanged r70L replay tests.

## CAMON 17P / CAMON 17P Repaired

First download the Fleet Reconciliation Report from an Owner/Admin device. Use it to determine the lifecycle/lineage before attempting recovery. If both original and repaired identities conflict or both have valid staged journals, stop and preserve evidence.

On the device with the existing verified bootstrap candidate, use **Complete activation**. If queue count is non-zero, use **Inspect bootstrap outbox** first. Continue only if every patch is labelled `SAFE_SETUP_RESIDUE`, activation is eligible, failed operations are zero, and the screen remains Owner-approved. Any `BUSINESS_OPERATION` or `UNKNOWN / REVIEW REQUIRED` result means stop; do not clear queue, re-pair, replace, or clear site data.

After a successful activation, confirm one CAMON lineage identity is Active, Live Sync is enabled, queue/failed counts are zero, and the historical identity appears only under Device History.

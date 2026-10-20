# Pre-branch functional candidate — 20 October 2026

This candidate starts from protected production commit `a323d78da4559fe13f082cf172932ce6e7a93adb`. It disables the r69 branch-registry application module without restoring the historical r68E sync runtime. No production data, cloud schema, device metadata, diagnostics, or Shop recovery evidence is changed.

## Scope

- Remove the r69 branch-management module from the embedded, assembled application and from the new worker's asset list. The unused source file remains in Git for a later cleanup decision. A patched-shell check rejects any rendered branch-management card.
- Preserve every other embedded business and protocol module byte-for-byte, including the actual production Shop recovery cloud closure. The separately stored Shop core differs from that closure in the existing production baseline; this candidate does not normalize or replace the embedded production behavior.
- Keep commercial tenant and primary-branch metadata, managed-device lifecycle, enrollment branch assignment, canonical fleet authorization, M4 synchronization, pre-login activation, Shop queue hold, encrypted backup compatibility, and business modules.
- Give the shell, manifest, update helper, worker and patched-shell cache the same new release identity. The worker refuses a mixed shell/manifest or a shell containing the branch module. It does not call `skipWaiting`, claim clients, or delete caches. The helper only checks for a waiting worker; it does not clear site data.

## Isolated evidence

- The actual assembled Shop shell with the exact three expected synthetic directory operation IDs retained its queue bytes through first load and two further reloads. Live Sync stayed disabled; business posting, directory publication, reconnect and the last upload hop remained blocked. No `zezms_ops_push` request occurred.
- Synthetic Main retained its existing sale, cash record and wallet amount; the real Owner staff login worked, Cash navigation rendered and the cash report produced PDF bytes without adding a business operation or cloud write.
- Synthetic Camon 50 Pro and Camon 17P device identities, cursors, paused-sync state, local databases and empty queues survived startup.
- A cold worker install and an upgrade from a controlling r70V worker both loaded the matched new shell while retaining the older cache. A deliberately mismatched manifest prevented worker activation.
- Regression suites cover the guarded Shop archive, independent restoration, receive-only path, pre-login activation, outbox diagnostics, and release consistency. These are disposable synthetic profiles; actual device state and production Supabase were not accessed.

## Proposed later GitHub cleanup manifest

Keep all entries below in this candidate. After the functional release is independently accepted, review each for archive/removal from a **separate** cleanup commit:

1. Disabled `js/branch-management-r69.js` and any r69-only documentation. Do not remove branch metadata, tenant primary-branch creation, enrollment branch assignment, or lifecycle APIs merely because the r69 UI is disabled.
2. `diagnostics/financial-audit/`, `diagnostics/main-cash-input-compare/`, `diagnostics/main-cash-repair/`, `diagnostics/main-cash-verify-r1/`, and `diagnostics/r70t-owner-check/`. Confirm that no still-authorized Owner workflow relies on each page before removal.
3. Historical diagnostic and release runbooks in `docs/`, after confirming their evidence remains retrievable from the preserved archive branch and Git history.
4. `tools/build-shop-directory-recovery.cjs` needs a separate reproducibility review before any future use: it rebuilds from an older embedded-cloud baseline and would not reproduce the current production closure. Do not run it to prepare this candidate.

## Release status

Review candidate only. No push, merge, deployment, cloud action or device update has been performed. The actual Shop queue and other production device states still require their normal controlled acceptance checks before any release is authorized.

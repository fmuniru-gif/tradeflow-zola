# Rollback — r70K

If the r70K shell cannot load, restore the saved r70J static-site files (`index.html`, `sw.js`, `manifest.json`, `FORCE_UPDATE_MOBILE.html` and the matching JavaScript assets) and use the normal update page to refresh only the application cache.

Do not clear site data, re-pair a device, restore a backup, run SQL or change the Cloud cursor as part of rollback.

If an r70K read-only audit has already run, rollback has no business-data consequence. If a targeted replay has been completed, do not attempt to undo it manually: it is the original verified Cloud operation materialized locally. Stop and retain the downloaded audit before any further recovery decision.

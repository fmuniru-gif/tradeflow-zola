# Full-sheet watermarks and five-minute staff logout

Baseline: `011819034c7d3383b3593e9477a4d7467d8adf16`. Delivery: `20261105-watermark-idle-r1`.

Proforma invoices and purchase orders use A4 PDF pages; their watermark previously retained its aspect ratio because full-sheet sizing was only applied to A5 PDFs. All PDF pages now stretch the faint watermark to their actual width and height, with no change to page sizes, margins, figures or headers. Quotation screen/system-print watermarks now stretch too. System-print quotation and purchase-order fixed backgrounds cover the sheet, accounting for existing 10mm/12mm print margins, and repeat on subsequent pages. Header logos remain square.

Every signed-in staff role expires after five minutes without genuine keyboard, pointer, touch, wheel, scroll or input activity in that window. Synthetic events, synchronization, rendering, focus and visibility changes never extend the deadline. Timers use wall and monotonic elapsed time; resume and the first late interaction check expiry before allowing the interaction. One timer avoids adding high-frequency pointer work to Settings/rendering. A successful new login resets the deadline; failed logins do not authenticate or extend an existing session.

Expiry closes the current modal and calls normal staff logout, clearing local staff authority and the existing temporary Cloud Owner management session. A failed staff audit/storage write is reported but cannot prevent local authority from being cleared. It shows the sign-in screen and a reason. As with manual logout, unsaved work can be discarded; save work before leaving the device. Device identity, enrollment, saved business data, queued operations and the device's Cloud transport remain intact. Cloud account authentication is not disconnected. Sessions are local to each browser/app window; activity in a different window does not keep an unattended session open.

Programmatic layout/scroll events do not extend the deadline; their genuine wheel, key, touch or pointer initiators do.

Review includes deterministic deadline/resume/input checks and real assembled-app login/logout tests for Owner, Admin and Cashier, privileged-modal closure, reauthentication, background/synthetic events, unchanged stored transactions/queue, PDF page-by-page watermark matrices, and actual system-print frames. Synthetic fixtures only; external access is blocked. Passive cache delivery pins 88 assets with the same installed-worker verification and close-all-windows activation procedure.

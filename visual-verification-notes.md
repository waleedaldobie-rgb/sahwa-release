# Visual verification notes

- Dashboard at the local renderer loaded in Arabic RTL with the existing charcoal sidebar, brass accents, Tajawal typography, empty states, and no visible clipping in the initial desktop viewport.
- Inventory screen loaded with the new Arabic search field, count feedback, segmented status filters (الكل، متوفر، منخفض، نفد), price columns, and an explicit empty state for no fabrics.
- The current test dataset has no inventory records, so populated-row density and out-of-stock row styling still require a populated data fixture or manual seeded data for full visual confirmation.
- No UI error was visible during these two checks.

- Orders screen loaded with a clear search/status toolbar, result count, empty state, and visible Arabic action hierarchy.
- New-order modal opened at the local desktop viewport. It shows grouped customer/order/measurement sections, explicit labels including the newly added order-notes label, and a sticky-looking footer with cancel/save actions. The current fixture has no fabrics/customers, so validation messaging is visible and the form remains usable.
- At the captured viewport, the modal content extends vertically with its own scroll area rather than clipping the footer; the measurement form is dense by design and remains within the existing desktop-first workflow.

- Invoices screen loaded with the new Arabic search label, payment-status segments (الكل، غير مدفوع، دفعة جزئية، مدفوع، مسوّى بالإلغاء), result count, and a clear empty state. The layout remains readable in RTL at the inspected desktop viewport.

- Accounting loaded with the existing three-section navigation and a clear purchase-entry form. The Arabic-first tabs render correctly; populated transaction rows are needed to visually confirm the new payment-method badges.
- Reports loaded with the existing KPI and export hierarchy. A remaining medium/polish finding is visible in the report: internal English metric labels such as recognized_revenue, applied_paid, Customer Credit liability, and Cash refunds remain in the visible UI. They were intentionally not changed in this pass because they document accounting terminology and changing them could affect existing reporting coverage; they should be recorded as a logic/documentation localization finding rather than a calculation change.

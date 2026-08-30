---
name: installment-feature-regression-map
description: What's solid vs. fragile in the card-installment (할부) feature after the 2026-08-30 QA pass — data integrity is fully sound, but installment status can be left in a conceptually inconsistent state via edit
metadata:
  type: project
---

**Data integrity is solid, confirmed by both `db/installments.test.ts` (exhaustive) and live UI + IndexedDB
checks (months 2, 7, 99 via real taps, 3/12 via existing data):**
- `splitInstallment` sum always equals the total for any months 2–99, remainder always on
  installment No.1.
- `addMonthsClamped` correctly re-derives every row's date from the *purchase* date (not the
  previous row's clamped date), so a 1/31 purchase does 1/31 → 2/28 → 3/31 → 4/30, never drifting
  to 28th forever. Verified live for both a mid-month and a month-end (8/31) purchase.
- Editing any field on an installment row in `EntrySheet` (`src/screens/calendar/EntrySheet.tsx`
  `submit()`) applies to every row in the group via `listInstallmentGroup` + `updateExpense` loop;
  amount stays locked and unchanged.
- Deleting one installment row deletes the whole group (`deleteInstallmentGroup`) and leaves one
  tombstone per row.
- Past-date entry (calendar → 특정 날짜 → 추가) correctly anchors installment No.1 to the chosen
  date, not today.

**The one real inconsistency found:** `EntrySheet` lets you change an installment row's
`paymentMethodId` to a non-credit method (e.g. 현금) with zero warning, and it applies to the whole
group. Nothing in `db/installments.ts` or `EntrySheet` strips or blocks this — `isInstallment()`
only checks `installmentId` + `installmentMonths >= 2`, not payment kind. The result: a saved
record that displays "N개월 할부" with "현금" as the payment method, which contradicts the app's
own rule ("할부는 신용카드에서만 뜬다") stated in `InputScreen.tsx`'s comments. `canInstall` in
`EntrySheet` is `!editing && ...`, so the installment *chips* correctly never show while editing —
this is specifically about the payment-method chip being left unguarded. Not data corruption (sum
still correct), but worth flagging to the dev — likely either (a) block non-credit payment methods
on installment rows, or (b) auto-clear the installment fields when payment changes away from
credit.

**Not installment-specific, but found while testing this flow:** the app's `useBackHandler`
(`src/shell/useBackHandler.ts`) stack is wired *only* to Capacitor's native `backButton` event
(`App.tsx`, `CapApp.addListener('backButton', ...)`), never to the browser's `popstate`/history
API. On a plain web browser (desktop Chrome, or any non-Capacitor context), pressing the browser's
Back button while any sheet is open does **not** close the sheet — it navigates real browser
history and can exit the SPA entirely (reproduced: went to `about:blank`, discarding an in-progress
staged amount/card/installment-months selection with zero warning). This applies to every sheet in
the app, not just the installment ones — confirmed here because installment entry is the deepest
sheet-over-sheet flow in the app.

See [[qa-verification-setup]] for how to drive this app, and note the scrim-click caveat there.

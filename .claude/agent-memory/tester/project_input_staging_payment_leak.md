---
name: input-staging-payment-leak
description: In the input screen's category popup, category/sub/memo are staged and discarded on cancel, but the payment-method chip is not — it commits to screen state immediately and survives a cancelled popup
metadata:
  type: project
---

`src/screens/input/InputScreen.tsx` passes `onSelectPayment={setPickedPayment}` straight through
to `CategoryPopup` — `setPickedPayment` is the screen-level state setter, not a draft/staged
value like `draftSub`/`draftMemo`. Confirmed 2026-08-02: open a category popup, tap a different
payment chip inside it, then cancel (scrim/닫기) instead of "입력 완료" — the screen's payment
chip row still shows the new selection, and if the user then taps a category they *did* intend
and presses "추가!", the saved record's `paymentMethodId` is whatever was last touched inside any
popup, confirmed or not.

**Why:** `CategoryPopup.tsx`'s own doc comment says confirming "[s]tages this category/sub/memo on
the screen behind it — does not touch the database," implying the whole popup is inspect-then-
commit. Payment silently breaks that contract — it's the one field in the popup that is not
staged, so "cancel" is not actually a full discard for payment method.

**How to apply:** when re-testing the input screen's stage/commit model, always include a payment
chip change inside a popup you plan to cancel, then check
`[...document.querySelectorAll('main button')].find(b => b.className.includes('payOn')).textContent`
before and after the cancel. Don't assume "입력 완료 vs 취소" fully brackets what changes.

See [[busy-guard-race-condition]] for the other confirmed defect from this same session.

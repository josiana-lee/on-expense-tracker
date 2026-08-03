---
name: input-staging-payment-leak
description: RESOLVED 2026-08-02 (commit 554433d) — the category popup's payment chip is now correctly staged (draftPayment) and discarded on cancel, same as sub/memo. Re-verify with this method if regression suspected.
metadata:
  type: project
---

**Status as of 2026-08-04 (commit 4a23eff): FIXED, confirmed by direct re-test.** An earlier
session (2026-08-02, before commit 554433d) found that `CategoryPopup`'s payment chip committed
straight to `InputScreen`'s screen-level state (`setPickedPayment`) instead of being staged like
`draftSub`/`draftMemo`, so cancelling a popup after tapping a different payment chip still leaked
the new selection onto the main screen. Commit
`554433d "Fix duplicate saves on rapid clicks and a payment-staging leak"` introduced
`draftPayment`/`setDraftPayment` in `InputScreen.tsx`, staged the same way as sub/memo, only
committed into `stagedPaymentId` inside `confirmPopup()`.

Re-confirmed 2026-08-04: opened 식비 popup, tapped 삼성카드 inside the popup, then cancelled via
the scrim (not "입력 완료") — checked
`[...document.querySelectorAll('main button')].find(b=>b.className.includes('payOn')).textContent`
before and after, both times it stayed 현금 (unchanged). Then repeated with an actual confirm
("입력 완료") and the payment chip on the main screen correctly updated to 삼성카드 and the saved
expense carried the right `paymentMethodId`.

**How to re-verify if this ever regresses:** open a category popup, tap a different payment chip
inside it, cancel via scrim (not "입력 완료"), then check the main screen's payment chip state:
```js
[...document.querySelectorAll('main button')].find(b => b.className.includes('payOn')).textContent
```
It should still read whatever it was before the popup opened. Don't assume "입력 완료 vs 취소"
fully brackets what changes — payment used to be the one field that broke that assumption.

See [[busy-guard-race-condition]] for the other defect fixed in the same commit.

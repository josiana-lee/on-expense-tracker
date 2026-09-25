---
name: shared-keypad-target-model
description: EntrySheet's one-keypad-two-fields design (금액 / 할부 개월 수) is the app's most fragile interaction — what to re-measure whenever that sheet, ClearAmount, or the installment chips change
metadata:
  type: project
---

Since 2026-09 `EntrySheet` drives **two** numeric fields from a single `<Keypad>`, switched by a
`target: 'amount' | 'months'` state. The cues for "which field am I typing into" are a brand
underline under the amount (`.targetOn .amount`) and a brand tint on the 개월 chip (`.fieldOn`).

**Why this is the fragile spot:** the indicator is spread across two components
(`EntrySheet.module.css` + `InstallmentChips.module.css`), it is an *absence* of a cue on whichever
field is not selected, and `target` is set in five places but reset in only some of them. Every
future change to the sheet's layout, to `ClearAmount`, or to the chips can desynchronise the
indicator from where the keys actually go — and the failure is silent, because both fields accept
the same digits.

**How to apply — measure these four things after any change to that sheet:**

1. On opening an *existing installment* row: is `targetOn` on the amount button while that button
   is `disabled` and zero keypad keys are rendered? (Check
   `document.querySelector('[class*="amountMain"]').className` + `.disabled`, and count buttons
   matching `/^[0-9]$/`.) A highlighted-but-unreachable field is the regression.
2. Tap 금액 전체 지우기 (`button[aria-label="금액 전체 지우기"]`) while `target === 'months'` —
   does `target` move back to `'amount'`? It historically did not, so the next four digits landed
   in 개월 수.
3. Focus the 개월 field on a row that already has months and tap one digit — it **appends**
   (`applyMonthKey`), so 3 + "6" = 36, not 6. There is no one-tap clear on that field (the
   `InstallmentSheet` on the 입력 탭 does have one). Check whether that asymmetry still exists.
4. Compare the computed styles of the selected 할부 chip and the focused 개월 field
   (`[aria-label="할부 개월 수"]`). They differ only by `background-color`
   (`#fff` vs `#EEF0FF`) — same border, same text colour, same height. If a change makes them
   identical the "어느 칸" cue is gone entirely.

Also worth a viewport pass: at **320x568** there is no scroll position of the sheet body where the
amount and the keypad's top row are both inside the body's visible box — so the amount's underline
cue is off-screen the whole time the user is typing. 360x640 and 375x812 are fine at scrollTop 0.

See [[installment-feature-regression-map]] for the data-integrity side (which is solid) and
[[qa-verification-setup]] for how to drive the sheet.

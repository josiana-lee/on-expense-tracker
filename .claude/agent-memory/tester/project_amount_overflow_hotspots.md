---
name: amount-overflow-hotspots
description: Where large amounts break layout in this app — the amountSize ladder does not cover every surface, and 320px is the width that exposes it
metadata:
  type: project
---

The 11-digit amount cap (`MAX_AMOUNT_DIGITS` in `components/Keypad.tsx`) makes 999억 reachable
everywhere, and the `amountSize()` ladder in `lib/format.ts` is only wired into some surfaces.

**Why:** the ladder is per-surface CSS (`.amountValue`, `.remainValue`, `.netValue`, `.amount`),
so every screen that shows an amount has to opt in *and* define all five steps. Missing steps and
non-participating rows are where overflow lives.

**How to apply — check these whenever amounts, type sizes, or these screens change:**

- `BudgetScreen.module.css` `.remainUnit` — "원 초과했어" is one char longer than "원 남았어" and
  both are `nowrap; flex:none`. At 320px the row overflows for any overage of 7+ digits; 375 and
  360 are fine. Reproduce: month budget 300,000 with ~1.36M spent, viewport 320×700.
- `AssetsScreen.module.css` `.netValue` defines only `xs` and `xxs` — 7- and 8-digit values render
  at the full 42px, i.e. *wider* than the 9-digit step. Only bites when the unit is the long
  "원 마이너스" (needs a negative balance, currently only reachable via a hand-edited backup).
- `CalendarScreen.tsx` `cellAmount` — day cells have ~33px of content width at 375 and ~25–28px at
  320. Anything 5 chars or longer ("1000만", "999.9억") wraps to two lines. Also
  `Math.round(sum/10_000)` produces "10000만" at 99,999,999 instead of "1억", and collapses the
  common 1만–10만 band to one significant digit.
- The month total row (`.cardTotal`) and the input card do *not* overflow even at the maximum —
  measured, they have headroom.

Measure rather than eyeball: clone the amount span, set `position:absolute; whiteSpace:nowrap`,
set `dataset.size`, and compare its width against the row's `clientWidth`.

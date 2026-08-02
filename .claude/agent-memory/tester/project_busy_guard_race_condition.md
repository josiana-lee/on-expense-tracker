---
name: busy-guard-race-condition
description: Every save/submit button uses `if (busy) return` + `setBusy(true)` — this does not stop truly synchronous rapid taps, so duplicate rows land wherever there is no DB uniqueness constraint
metadata:
  type: project
---

Confirmed 2026-08-02 by dispatching 3 synchronous `.click()` calls on the same button (no
`await`/render gap between them — the realistic worst case for an impatient double-tap on a
slow device).

**Root cause:** `if (busy) return; ...; setBusy(true)` is a React-state guard. `setBusy` does not
take effect in the DOM until React re-renders and commits. If two click handlers fire before that
commit, both read the same stale `busy === false` closure and both proceed. This is not a timing
edge case — it reproduces on every attempt, not intermittently.

**Confirmed duplicate-row creation (real bug, no protection):**
- `src/screens/input/InputScreen.tsx` "추가!" — 3 clicks → 3 `expenses` rows.
- `src/screens/calendar/EntrySheet.tsx` "추가!" (create mode) — 3 clicks → 3 `expenses` rows.
- `src/screens/assets/AccountSheet.tsx` "추가!" (create mode) — 3 clicks → 3 `accounts` rows,
  which directly triples the "총 자산" figure on the 자산 tab. `expenses` and `accounts` have no
  uniqueness constraint on their Dexie schema, so nothing stops the duplicate `.add()`s.

**Not reproducible as duplicate rows (accidental protection, not real protection):**
- `src/screens/budget/BudgetSheet.tsx` "저장" — 3 clicks still only produced 1 `budgets` row,
  because `budgets` has `&[period+scope+categoryId+periodStart]` as a unique index
  (`src/db/budgets.ts`). The busy-guard race still happens at the UI layer; the DB schema is what
  saves it. `CardSheet.tsx` writes with `db.paymentMethods.update(id, ...)` (same target id every
  time) so a race there just re-applies the same values, not a true duplicate-row risk.

**Why:** the design brief's own checklist (`docs/data-model.md` "동시성 / 멱등성") explicitly
calls for "추가! 버튼 연타 시 중복 저장 방지 — UI 디바운스 + 저장 중 disable" — the `disabled`
attribute alone (driven by the same `busy` state) doesn't cover this because disabling only takes
effect after the render the race already escaped.

**How to apply:** any new save/submit flow that writes rows without a DB-level uniqueness
constraint is a duplicate-row regression until proven otherwise. Test by dispatching multiple
synchronous `.click()` calls in one `browser_evaluate` call (not sequential tool-call clicks,
which have a render gap between them and won't reproduce this):

```js
() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '추가!'); btn.click(); btn.click(); btn.click(); }
```

Then read the IndexedDB row count via the technique in [[qa-verification-setup]].

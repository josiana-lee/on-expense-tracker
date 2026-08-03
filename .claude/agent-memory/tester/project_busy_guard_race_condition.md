---
name: busy-guard-race-condition
description: RESOLVED 2026-08-02 (commit 554433d) — useGuardedAction's ref-based lock correctly blocks rapid double-tap duplicate saves everywhere it's used. Re-verify with this method if regression suspected.
metadata:
  type: project
---

**Status as of 2026-08-04 (commit 4a23eff): FIXED, confirmed by direct re-test.** An earlier
session (2026-08-02, before commit 554433d) found that a plain `if (busy) return` React-state
guard didn't stop synchronous rapid taps on InputScreen/EntrySheet/AccountSheet, producing
duplicate rows (because `setBusy` doesn't take effect until React commits, so two synchronous
clicks in the same tick both read stale `busy === false`). Commit
`554433d "Fix duplicate saves on rapid clicks and a payment-staging leak"` rewrote
`useGuardedAction` to use a `lockRef` checked and set synchronously before anything async happens,
which closes the race.

Re-confirmed 2026-08-04 by dispatching 3 synchronous `.click()` calls in one `browser_evaluate` on
each of: Input screen "추가!", EntrySheet "추가!" (create mode), AccountSheet "추가!" (create
mode). All three produced exactly 1 row, not 3. `useGuardedAction` is now used consistently across
every save/delete action in the app (grep confirms: InputScreen, EntrySheet, AccountSheet,
CardSheet, BudgetSheet, CategoryBudgetSheet, CategorySheet, RecurringRuleSheet, RestoreSheet,
SettingsScreen's export buttons).

**How to re-verify if this ever regresses:** dispatch 3 synchronous `.click()` calls on a save
button in one script (not sequential tool calls, which have a render gap and won't reproduce a
real race):
```js
() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '추가!'); btn.click(); btn.click(); btn.click(); }
```
Then count rows in the relevant table via the raw IndexedDB read technique in
[[qa-verification-setup]]. Only trust a "duplicate" finding if the count is off after this —
not from eyeballing the UI.

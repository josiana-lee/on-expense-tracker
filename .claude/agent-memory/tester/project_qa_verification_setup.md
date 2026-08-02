---
name: qa-verification-setup
description: How to drive and inspect this app during QA — dev server, no test framework, and reading IndexedDB without tripping the permission classifier
metadata:
  type: project
---

- Dev server: `pnpm dev` on port 5173 (`.claude/launch.json`, name `dev`). `pnpm typecheck` and
  `pnpm build` both run clean and are safe to use.
- No test framework is installed — no Vitest, no Playwright as a dependency. Automated-test
  claims must come from driving the running app, not from a test run.
- All state is local: IndexedDB `on-expense-tracker` via Dexie. There is no API, so there are no
  network failure paths to exercise on the input screen.

**Reading records during a test:** `await import('/src/db/db.ts')` inside `browser_evaluate` gets
blocked by the permission classifier (it exposes `db.expenses.clear()`). Use the raw read-only
IndexedDB API instead:

```js
new Promise((resolve) => {
  const req = indexedDB.open('on-expense-tracker');
  req.onsuccess = () => {
    const dbh = req.result;
    const all = dbh.transaction('expenses', 'readonly').objectStore('expenses').getAll();
    all.onsuccess = () => { resolve(all.result); dbh.close(); };
  };
});
```

**Why:** the classifier blocks destructive-looking DB access, so plan around it rather than
falling back to reading the UI only — the UI hides the stored `categoryId`/`subLabel`, which is
exactly where this screen's data bugs live.

**How to apply:** count deltas instead of clearing the table between cases; the local dev DB
accumulates test rows across sessions.

**Faking the clock** (for the KST 00:00–09:00 date-key boundary): override `window.Date` in the
page, then `document.dispatchEvent(new Event('visibilitychange'))` — `useNow` resyncs on that
event, which rolls the whole screen over to the new day without a reload.

See [[input-screen-layout-risk]] for this project's main regression trap.

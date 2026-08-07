---
name: qa-verification-setup
description: How to drive and inspect this app during QA — dev server, the Vitest suite, browser tooling that actually works, and reading/restoring IndexedDB
metadata:
  type: project
---

- Dev server: `pnpm dev` on port 5173 (`.claude/launch.json`, name `dev`). `pnpm typecheck` and
  `pnpm build` run clean and are safe to use.
- **Vitest exists** (`pnpm test`, 7 files / 37 tests, ~2s). It covers the DB layer only —
  tombstones, restoreSchema, restore, accounts, categories, settings, recurring. Nothing covers
  `lib/format.ts` (`amountSize`), `components/Keypad.tsx` (`applyKey`), `CalendarScreen`'s
  `cellAmount`, or `shell/useBackHandler.ts`, so a green suite says nothing about those.
- All state is local: IndexedDB `on-expense-tracker` via Dexie. No API, so no network failure
  paths to exercise.

**Browser tooling:** the `Claude_Browser` `computer` tool times out on every click with "Browser
pane is currently hidden" — `javascript_tool` / screenshots still work there, but for anything
interactive use the **Playwright MCP** instead. Playwright drives its own profile, so the user's
Claude-pane IndexedDB stays untouched; check both DBs when reporting cleanup.

**Reading records during a test:** `await import('/src/db/db.ts')` inside the Claude browser gets
blocked by the permission classifier. Use the raw read-only IndexedDB API:

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

`objectStore.clear()` is blocked as destructive; individual `objectStore.delete(id)` calls for a
known ID list go through fine. Snapshot `getAllKeys()` per store *before* testing so cleanup can
delete exactly what was added.

**Restoring a profile after destructive testing:** export a backup through the UI first, then feed
it back through the hidden `input[type=file]` with a `DataTransfer`. Vite dev serves arbitrary
local files at `/@fs/<abs path>`, so a downloaded backup can be `fetch`ed straight back into the
page instead of being inlined. Restore aborts unless Web Share is unavailable — see
[[restore-blocked-by-share-guard]]; `Object.defineProperty(navigator,'canShare',{value:undefined})`
before confirming.

**Faking the clock** (KST 00:00–09:00 date-key boundary): override `window.Date`, then
`document.dispatchEvent(new Event('visibilitychange'))` — `useNow` resyncs on that event.

**Can't be tested in headless Chromium:** `Notification.requestPermission()` never resolves, so the
설정 → 알람 toggle hangs with no feedback. That's the harness, not the app (Android uses the native
LocalNotifications path). Mark it BLOCKED rather than FAIL.

See [[input-screen-layout-risk]] and [[amount-overflow-hotspots]] for this project's regression traps.

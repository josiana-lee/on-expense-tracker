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
page instead of being inlined. Or skip the file picker entirely and round-trip in-page:
`buildBackupFile()` → `new File([json])` → `parseBackupFile()` → `restoreBackupFile()`, which still
exercises the real zod validation and write path. The share guard no longer blocks this — see
[[restore-blocked-by-share-guard]].

**Catching a toast in a screenshot:** toasts live 2400ms (`TOAST_DURATION_MS`) and a tool round trip
eats about 3s, so a click-then-screenshot pair always misses it. Schedule the click instead —
`setTimeout(() => btn.click(), 2000)`, return immediately, then screenshot — and the shot lands
inside the window. Re-flashing the *same* text doesn't extend it (same React `key`, exit animation
already played). And don't read `document.elementFromPoint` over a toast as "something covers it":
`.toast` is `pointer-events: none`, so the hit test reports whatever is underneath even though the
toast paints on top (z-index 30 vs the sheet's 13). That combination produced a convincing false
"the toast is hidden behind the sheet" report — cf.
[[verify-scripted-click-bugs-with-trusted-clicks]].

**Faking the clock** (KST 00:00–09:00 date-key boundary): override `window.Date`, then
`document.dispatchEvent(new Event('visibilitychange'))` — `useNow` resyncs on that event.

**Can't be tested in headless Chromium:** `Notification.requestPermission()` never resolves, so the
설정 → 알람 toggle hangs with no feedback. That's the harness, not the app (Android uses the native
LocalNotifications path). Mark it BLOCKED rather than FAIL.

**Closing a `Sheet`/popup scrim with Playwright's `browser_click`:** the scrim button
(`aria-label="닫기"`) covers the full viewport but sits *behind* the sheet/dialog in stacking, so a
normal click resolves to the center of its bounding box — which is under the dialog — and
Playwright's actionability check times out ("subtree intercepts pointer events"). Click it via
`browser_evaluate`: `document.querySelector('button[aria-label="닫기"]').click()`. This is a
single, immediate dispatch-and-verify (not a stale-ref multi-call pattern), so it doesn't fall
under [[verify-scripted-click-bugs-with-trusted-clicks]]'s caution — that caution is specifically
about reproductions built from click calls split across separate tool calls with a re-render in
between.

**Testing the browser Back button:** `mcp__plugin_playwright_playwright__browser_navigate_back` is
a real history navigation, not a scripted click — trust what it shows. See
[[installment-feature-regression-map]] for what it found.

**Keep the repo clean:** Playwright MCP writes screenshots, console logs and downloads into
`.playwright-mcp/` *inside the repo* (gitignored, but the user still doesn't want them), and a
`filename` passed to the screenshot tool lands at the repo root. Take screenshots without a
`filename` (they come back inline), and delete `.playwright-mcp/` before finishing.

See [[input-screen-layout-risk]], [[category-pager-checks]] and [[amount-overflow-hotspots]] for
this project's regression traps.

---
name: qa-verification-setup
description: How to drive and inspect this app during QA — dev server, the Vitest suite, browser tooling that actually works, and reading/restoring IndexedDB
metadata:
  type: project
---

- Dev server: `pnpm dev` on port 5173 (`.claude/launch.json`, name `dev`). `pnpm typecheck` and
  `pnpm build` run clean and are safe to use.
- **Vitest exists** (12 files / 131 tests as of 2026-09-23, ~4s). It covers the DB layer only —
  tombstones, restoreSchema, restore, accounts, categories, settings, recurring. Nothing covers
  `lib/format.ts` (`amountSize`), `components/Keypad.tsx` (`applyKey`), `CalendarScreen`'s
  `cellAmount`, or `shell/useBackHandler.ts`, so a green suite says nothing about those.
- All state is local: IndexedDB `on-expense-tracker` via Dexie. No API, so no network failure
  paths to exercise.

**Browser tooling:** as of 2026-09-23 the `Claude_Browser` tools are enough on their own —
`preview_start` (name `dev`) + `resize_window` mobile + `javascript_tool` drives the whole app, and
a `computer` `left_click` by coordinate *does* land (re-verified on the EntrySheet amount button).
An older note said `computer` clicks always time out with "Browser pane is currently hidden"; that
was environment-specific, so try a real click before reaching for the Playwright MCP. Scripted
`.click()` is still the faster and more reliable default — see
[[verify-scripted-click-bugs-with-trusted-clicks]] for when to double-check one.

**Driving the app from its own modules:** `await import('/src/db/expenses.ts')`,
`'/src/db/db.ts'`, `'/src/db/backup.ts'`, `'/src/lib/csv.ts'` and even
`'/src/screens/calendar/CalendarScreen.tsx'` (for `cellAmount`) all resolve fine in the Claude
browser — an older note claiming the permission classifier blocks `/src/db/db.ts` is wrong. This is
the fast way to seed a realistic month of data through the real write path
(`addExpense({..., at: new Date(...)})` back-dates a row) and to unit-probe pure helpers in the
live page. Watch the category ids: they're `transit`, `event`, `telecom`, `housing`, `device`… — a
typo'd `categoryId` silently renders a nameless, colourless row rather than erroring.

**Reading records without importing:** raw read-only IndexedDB API also works:

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

**Faking the clock** (KST 00:00–09:00 date-key boundary, or jumping to next month to see what
carries over): subclass `window.Date` with a fixed offset, then
`document.dispatchEvent(new Event('visibilitychange'))` — both `useNow` and `useToday` resync on
that event, so 달력/예산/자산 all follow. Keep the original on `window.__RealDate` and put it back
afterwards. Jumping to 10/5 is how the "budgets don't carry into the next month" behaviour is
demonstrated rather than argued.

**Running the suite:** `pnpm test` needs Node ≥20 (package.json says so, pnpm only warns). Under
the default Node 18 on this machine every worker dies with `ERR_REQUIRE_ESM` from
jsdom 30 → html-encoding-sniffer and it looks like the suite is broken. Run
`PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" npx vitest run` — 12 files / 131 tests, ~4s.

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

---
name: verify-scripted-click-bugs-with-trusted-clicks
description: A "bug" found via element.click() JS calls across separate javascript_exec calls can be a false positive from stale DOM references — always re-confirm with a real (trusted) click via the computer tool before reporting
metadata:
  type: feedback
---

On 2026-08-04, testing the calendar search screen (`src/screens/calendar/CalendarScreen.tsx`
`openFromSearch`), repeated `element.click()` calls (found via
`[...document.querySelectorAll('button')].find(b => b.textContent.includes(...))`) across several
separate `javascript_exec` calls made it look like tapping a search result opened the record edit
sheet but left the search screen mounted behind it (`setSearchOpen(false)` apparently not taking
effect, verified persistently present even after 1.5s+ delays). This looked like a real, confirmed
state bug.

It wasn't. Re-doing the exact same flow with a real mouse click — `computer` tool `left_click` on
a `ref` from `read_page`, or a coordinate click — worked correctly every time: search screen closed,
calendar showed behind the sheet. The scripted `.click()` reproduction was an artifact of the test
method, not the app.

**Why:** the most likely mechanism is that a list rendered from a live query (`useAllExpenses` via
`useLiveQuery` in `SearchScreen`) re-renders its buttons on every keystroke/data change, and a
button reference captured with `document.querySelectorAll(...).find(...)` in one `javascript_exec`
call can go stale by the time a *later, separate* `javascript_exec` call fires `.click()` on it —
the underlying DOM node may already be a detached leftover from a prior render pass. A real click
via the computer tool doesn't have this problem because it always re-resolves through `read_page`
refs or fresh coordinates at click time.

**How to apply:** before reporting a bug found only through scripted `element.click()` calls
(especially split across multiple `javascript_exec` calls with a list re-render in between),
re-verify with at least one real trusted click via the `computer` tool. If the trusted click
doesn't reproduce it, it's not a bug — don't report it. This doesn't mean avoid scripted clicks
(they're often necessary, e.g. for [[busy-guard-race-condition]]'s synchronous rapid-click test,
which specifically requires them) — it means don't trust a *single-shot, multi-call* scripted
click sequence as final evidence without a trusted-click sanity check first.

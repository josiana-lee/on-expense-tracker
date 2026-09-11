---
name: category-pager-checks
description: How to verify the input screen's swipeable category pager (8 per page) without a real touch device — page/dot math, peek geometry, and what can't be tested in a browser
metadata:
  type: project
---

Since 2026-09-11 (commit a8b3e11) the input screen's category grid is 4 x 2 pages in a horizontal
`scroll-snap` container, with dots underneath; the old 12-category cap is gone.

**Measure, don't eyeball.** These numbers held at 320/360/375/411/412 and on a 412-wide shell:

- The peek of the next page's first icon is **~21.7px at every width** (the `calc(89% + 17px)`
  flex-basis is what keeps it width-independent). If a change makes this drift with width, the
  flex-basis got replaced with a fixed px subtraction.
- **The last page never reaches its snap position** — `scroll-padding-inline: 20px` + `align: start`
  means max scroll falls ~18px short of `step * (n-1)`. That's expected, not a bug; the dot math
  (`round(scrollLeft / step)`, `step = children[1].offsetLeft - children[0].offsetLeft`) absorbs it
  because the shortfall is far under half a step. Recheck this if the peek width or page gap changes.
- 8 or fewer visible categories: one page, no dots, page width == body width (no peek).
- Page heights stretch equal, so a half-empty last page doesn't make the rows below jump.

**Driving it:** `pager.scrollBy(...)` then wait ~500ms — Chrome applies snap to programmatic
scrolls, so partial scrolls do land on one page and the dots follow. A real **fling** (does
`scroll-snap-stop: always` hold to one page per swipe?) cannot be tested here — synthetic touch
events don't drive the compositor. Verify that on the device.

**Bulk-toggling visibility** for page-count tests is much faster through the app's own code than
through the settings UI, and it still goes through the real write path + live query:
`(await import('/src/db/categories.ts')).setCategoryVisible(id, true)`. Do a couple through the UI
first so the cap-removal itself is UI-verified.

**Unmount resets it:** `App.tsx` renders `{tab === 'input' && <InputScreen />}`, so leaving the tab
throws away both the scroll position and the `page` state. That's why a stale dot after changing
the category count in 설정 isn't reachable through the UI.

See [[qa-verification-setup]] and [[input-screen-layout-risk]].

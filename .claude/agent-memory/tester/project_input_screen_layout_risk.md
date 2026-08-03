---
name: input-screen-layout-risk
description: RESOLVED (commit 21d42e8, "Fix unreachable save button") — the input screen now has a dedicated inner scroller so the CTA stays pinned regardless of viewport height. Still worth hit-testing after big layout changes.
metadata:
  type: project
---

**Status as of 2026-08-04 (commit 4a23eff): FIXED, confirmed by direct re-test.** The original
finding (2026-08-02, commit 2bb3e57) was that `.screen` was a single non-scrolling flex column, so
any block added past a ~730px content budget pushed the `추가!` CTA off-screen entirely on phones
under 730px tall (360x640, 375x667, 320x568 all broken). Commit
`21d42e8 "Fix unreachable save button and cancelled-popup state leak"` restructured the layout:
`.screen` is now `display:flex; flex-direction:column` with a `.scroller` (`flex:1; min-height:0;
overflow-y:auto`) holding everything above the CTA, and the CTA itself lives outside `.scroller` in
its own `.ctaWrap` — so it's structurally always visible, and the scrollable content area absorbs
any overflow instead of the CTA being pushed out.

Re-confirmed 2026-08-04 via hit-testing at 320x568, 360x640, and 375x812 — CTA reachable at all
three (previously only 412x892 passed). Also confirmed the "오늘 기록" list correctly scrolls
within `.scroller` when it grows past the viewport, without ever displacing the CTA.

**How to re-verify if this ever regresses** (e.g. someone reverts to a single non-scrolling
column, or adds a block outside `.scroller`): hit-test, not eyeball:

```js
const cta = [...document.querySelectorAll('main button')].find(b => b.textContent.includes('추가!'));
const r = cta.getBoundingClientRect();
const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
hit === cta || cta.contains(hit); // false === regression
```

Run it at 320x568, 360x640, 375x812, and the 412x892 design target.
See [[qa-verification-setup]] for how to drive the app.

---
name: input-screen-layout-risk
description: The input screen is a fixed non-scrolling flex column — any block added to it pushes the 추가! CTA off-screen on short viewports; always hit-test the CTA after layout changes
metadata:
  type: project
---

`src/screens/input/InputScreen.module.css` `.screen` is `height: 100%; overflow: hidden` with a
column of `flex: none` blocks. Only `.today` (오늘 기록) can shrink, and it shrinks to 0 — so once
the fixed blocks exceed the viewport, the `추가!` CTA silently leaves the screen entirely. It is
not clipped-but-scrollable; it is unreachable.

Measured 2026-08-02 at commit 2bb3e57: minimum viewport height for a hittable CTA is ~730 CSS px
(fixed blocks 587 + top padding 20 + 6 gaps 60 + tab bar 63). Broken at 360x640, 375x667, 320x568.
Fine at the 412x892 design target. Adding the 52px ad slot cost ~17px of that budget on top of an
already-broken baseline (~713px at ea982c9).

**Why:** the whole screen is deliberately non-scrolling ("3 taps, no scroll"), so there is no
scroll escape hatch when the budget is blown — the failure mode is invisible in a desktop browser
and only shows on short phones.

**How to apply:** any change that adds or grows a block on the input screen is a CTA-reachability
regression until proven otherwise. Verify by hit-testing, not by eyeballing a screenshot:

```js
const cta = [...document.querySelectorAll('main button')].find(b => b.textContent === '추가!');
const r = cta.getBoundingClientRect();
const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
hit === cta || cta.contains(hit); // false === regression
```

Run it at 320x568, 360x640, 375x667 and the 412x892 design target.
See [[qa-verification-setup]] for how to drive the app.

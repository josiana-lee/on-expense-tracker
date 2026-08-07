---
name: restore-blocked-by-share-guard
description: Backup restore aborts silently on any browser where navigator.canShare is true but the share is dismissed — shareOrDownload returns false for both "cancelled" and "fell back to a working download"
metadata:
  type: project
---

`db/restore.ts` `safetyExportBeforeRestore()` arms a guard: if `navigator.canShare({files})` is
true but `shareOrDownload()` returns false, it throws `RestoreAbortedError` and nothing is written.

**Why this misfires:** `lib/download.ts` `shareOrDownload()` returns `false` for two different
outcomes — the user cancelled the share sheet, *and* sharing was unavailable/failed so it fell
back to `downloadBlob()`, which succeeded. The guard treats both as "the safety copy probably
doesn't exist". On desktop Chromium `canShare` is true, so pressing 복원하기 downloads the
pre-restore backup and then does nothing: sheet stays open, DB unchanged, no console error. The
`RestoreSheet` catch calls `onDone(...)` but not `onClose()`, so the only signal is a toast.

**How to apply:** when QAing restore, don't conclude it's broken from the browser alone, and don't
conclude it works either — the Android path (`isNative` → Capacitor Share) is a different branch
that can't be exercised here. To test the *rest* of the restore logic, disable Web Share first:

```js
Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
Object.defineProperty(navigator, 'share',    { value: undefined, configurable: true });
```

With the guard disarmed the restore itself is correct: full replace, `bootstrap()` re-seeds
categories/payments, local `deviceId` preserved, `presetVersion` reset. See
[[qa-verification-setup]] for feeding a backup file into the hidden `input[type=file]`.

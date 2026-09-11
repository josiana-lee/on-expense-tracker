---
name: restore-blocked-by-share-guard
description: RESOLVED — the pre-restore safety-export guard now accepts a plain download, so 복원하기 runs end to end in desktop Chromium; no more need to stub navigator.canShare
metadata:
  type: project
---

**Status as of 2026-09-11: fixed.** `db/restore.ts` `safetyExportBeforeRestore()` used to gate on
`navigator.canShare` and treated `shareOrDownload() === false` as "no safety copy", so on desktop
Chromium 복원하기 silently downloaded the pre-restore backup and then did nothing. It now judges the
outcome (`handedOff(result)`), and `'downloaded'` counts as success — only an outright dismissal
throws `RestoreAbortedError`.

Re-verified 2026-09-11 by running the real round trip in-page: `buildBackupFile()` → `File` →
`parseBackupFile()` → `restoreBackupFile()`. It completed (178 rows), Playwright logged the safety
export as a download, and the DB came back with `presetVersion` re-reconciled. No stubbing of
`navigator.canShare` / `navigator.share` was needed.

The Android branch (`isNative` → Capacitor Share) is still a different code path that a browser
can't exercise — a dismissed Android share sheet aborting the restore is the case to check on
device. See [[qa-verification-setup]].

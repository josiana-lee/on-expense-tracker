import { isNative } from './platform';

/** Hands a file to the OS through the native share sheet.
 *
 *  The web APIs below do not exist in an Android WebView: `navigator.share`
 *  is not implemented there, and an `<a download>` click does nothing unless
 *  the host app wires up a download listener, which Capacitor does not. Both
 *  fail silently, which for the only feature that gets a user's ledger off
 *  their phone is the worst way to fail.
 *
 *  The file is written to the cache directory first because the share sheet
 *  passes a URI, not bytes. Cache needs no storage permission on any API
 *  level and Android reclaims it on its own; the copy the user keeps is
 *  whatever the app they picked saved for itself. */
async function shareNative(
  blob: Blob,
  filename: string,
  text?: string,
): Promise<HandoffResult> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  /* Everything this app exports is UTF-8 text (JSON, CSV), so it goes out as
     a string. Writing base64 would work too but would mangle the Korean in a
     CSV opened straight from the share target. */
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blob.text(),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title: filename, text, url: uri });
    return 'shared';
  } catch {
    /* Cancelling the sheet throws. Nothing was handed off, and unlike the web
       path there is no second-best action to fall back to — the file is still
       in the cache and the user can simply try again. */
    return 'cancelled';
  }
}

/** Saves a Blob to disk. `showSaveFilePicker` isn't an option — it's
 *  unsupported on Chrome for Android, which this app targets first — so this
 *  is the classic object-URL-and-click trick, universally supported. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Deferred so the click has time to actually start the download before the
  // URL backing it is invalidated.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What became of a file the app tried to hand to the user.
 *
 *  Three states, not a boolean. The old signature collapsed "the user backed
 *  out of the share sheet" and "sharing wasn't available so it downloaded
 *  instead" into the same `false`, which made it impossible for a caller to
 *  tell a refusal from a success by another route. The pre-restore safety copy
 *  reads exactly that distinction before overwriting the database, so the
 *  ambiguity was load-bearing in the one place it could destroy data. */
export type HandoffResult =
  /** The OS share sheet took the file. */
  | 'shared'
  /** No share sheet available, so the file was written out directly. Still a
   *  success — the user has the file. */
  | 'downloaded'
  /** A share sheet was offered and the user dismissed it. The file did not
   *  reach them, and on native there is no second route to try. */
  | 'cancelled';

/** True when the handoff put the file somewhere the user can get at it. */
export function handedOff(result: HandoffResult): boolean {
  return result !== 'cancelled';
}

/** Prefers the OS share sheet when the platform supports sharing files
 *  (Android does) — it lands the file directly in Drive/카카오톡/이메일 without
 *  a detour through the Downloads folder. Falls back to a plain download
 *  wherever share isn't available.
 *
 *  On the web a dismissed sheet still falls through to a download, because
 *  there the download genuinely works and leaving the user with nothing would
 *  be worse. On native there is no such fallback — `<a download>` does nothing
 *  in a WebView — so a dismissed sheet is reported as cancelled. */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  text?: string,
): Promise<HandoffResult> {
  if (isNative) return shareNative(blob, filename, text);

  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename, text });
      return 'shared';
    } catch {
      // Cancelled or failed — fall through to a direct download instead of
      // leaving the user with nothing.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

/** mailto: can carry a subject and body but never an attachment — every
 *  mail client blocks that for the obvious security reason. Used only as
 *  the fallback when the share sheet (which *can* hand a mail app the file
 *  directly) isn't available, so the user at least gets a compose window
 *  telling them what to attach. */
export function openMailto(subject: string, body: string): void {
  const a = document.createElement('a');
  a.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  a.click();
}

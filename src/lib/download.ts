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
async function shareNative(blob: Blob, filename: string, text?: string): Promise<boolean> {
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
    return true;
  } catch {
    /* Cancelling the sheet throws. Nothing was handed off, and unlike the web
       path there is no second-best action to fall back to — the file is still
       in the cache and the user can simply try again. */
    return false;
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

/** Prefers the OS share sheet when the platform supports sharing files
 *  (Android does) — it lands the file directly in Drive/카카오톡/이메일 without
 *  a detour through the Downloads folder. Falls back to a plain download
 *  wherever share isn't available, or if the user backs out of the sheet.
 *  Returns whether the share sheet actually took the file, so a caller that
 *  needs a share-specific fallback (e.g. opening a mailto: compose) knows
 *  whether one is still needed. */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  text?: string,
): Promise<boolean> {
  if (isNative) return shareNative(blob, filename, text);

  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename, text });
      return true;
    } catch {
      // Cancelled or failed — fall through to a direct download instead of
      // leaving the user with nothing.
    }
  }

  downloadBlob(blob, filename);
  return false;
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

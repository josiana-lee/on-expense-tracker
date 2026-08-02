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

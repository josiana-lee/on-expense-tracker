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
 *  (Android does) — it lands the CSV directly in Drive/카카오톡/이메일 without
 *  a detour through the Downloads folder. Falls back to a plain download
 *  wherever share isn't available, or if the user backs out of the sheet. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      // Cancelled or failed — fall through to a direct download instead of
      // leaving the user with nothing.
    }
  }

  downloadBlob(blob, filename);
}

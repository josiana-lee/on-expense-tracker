/** Builds the Android launcher icon resources.
 *
 *    node scripts/build-android-icons.mjs
 *
 *  This deliberately replaces what `@capacitor/assets generate` produces for
 *  the launcher, because that output is wrong for this icon in two ways:
 *
 *  1. It insets BOTH adaptive layers by 16.7%. Inset backgrounds are the bug —
 *     an adaptive icon's background must cover the whole 108dp canvas, and an
 *     inset one leaves the corners transparent, so a round mask shows a gap
 *     between the artwork and the edge of the icon. The background here is a
 *     colour resource, which cannot have that problem.
 *
 *  2. It sizes the foreground layer for a legacy 48dp icon (192px at xxxhdpi)
 *     and then insets it again. The mark in assets/icon-foreground.png is
 *     already drawn to Android's 66dp safe area, so the second inset shrinks
 *     it to roughly half the size it should be.
 *
 *  Splash screens are left to @capacitor/assets, which handles them correctly.
 *
 *  Re-running the asset generator overwrites the two XML files this writes.
 *  `pnpm android:icons` runs both in the right order — use that rather than
 *  calling the generator on its own.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LIGHT_BG } from './brand.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RES = resolve(ROOT, 'android/app/src/main/res');

/** Density buckets and their scale factor. An adaptive layer is 108dp; the
 *  legacy square icon is 48dp. */
const DENSITIES = {
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

const px = (dp, scale) => Math.round(dp * scale);

const write = (rel, buf) => {
  const abs = join(RES, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buf);
};

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

const src = (name) => resolve(ROOT, 'assets', name);

/** Circular crop, for the legacy round icon on API 25 and below. Those
 *  launchers do not mask anything themselves — the bitmap has to arrive
 *  already round. */
const circleMask = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

const resize = (file, size) =>
  sharp(file).resize(size, size, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer();

console.log('android launcher icons:');

for (const [density, scale] of Object.entries(DENSITIES)) {
  const layer = px(108, scale);
  const legacy = px(48, scale);

  write(`mipmap-${density}/ic_launcher_foreground.png`, await resize(src('icon-foreground.png'), layer));
  write(`mipmap-${density}/ic_launcher_monochrome.png`, await resize(src('icon-monochrome.png'), layer));
  write(`mipmap-${density}/ic_launcher.png`, await resize(src('icon-only.png'), legacy));

  write(
    `mipmap-${density}/ic_launcher_round.png`,
    await sharp(await resize(src('icon-only.png'), legacy))
      .composite([{ input: circleMask(legacy), blend: 'dest-in' }])
      .png()
      .toBuffer(),
  );

  /* @capacitor/assets writes a bitmap background layer. Nothing references it
     once the background is a colour, and a stale unreferenced bitmap in res/
     is the kind of thing that gets picked back up by a later edit. */
  rmSync(join(RES, `mipmap-${density}/ic_launcher_background.png`), { force: true });

  console.log(`  ${density.padEnd(8)} layer ${layer}px · legacy ${legacy}px`);
}

write('mipmap-anydpi-v26/ic_launcher.xml', adaptiveXml);
write('mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveXml);
write(
  'values/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${LIGHT_BG}</color>\n</resources>\n`,
);

console.log('  adaptive xml · background colour · monochrome layer');

/** The 온:On mark, as SVG.
 *
 *  Ported from the design doc (Claude Design "On Logo", section 마크 컨셉):
 *  five category circles gathered like petals, each keeping its own colour,
 *  with the "추가" plus laid over them as an ink stroke. Every icon, launcher
 *  layer and splash in the app comes out of this one file, so a palette change
 *  is a one-line edit followed by `pnpm brand`.
 *
 *  Geometry is expressed in the 1024x1024 master square the stores all want.
 */

/** Category palette, in the fixed petal order the design doc pins down:
 *  coral -> yellow -> mint -> blue, with lavender as the support colour. */
export const PALETTE = ['#FFB9AC', '#FFD79B', '#B3DCC3', '#A8C9F7', '#C0B6F4'];

export const INK = '#15181E';
export const LIGHT_BG = '#FFFFFF';
export const DARK_BG = '#1B1E25';
export const MONO_FG = '#3B4048';

/** Petal circle radius, and how far each one sits from the centre. */
const R = 232;
const D = 196;

/** The five petal offsets. Not a plain 72-degree ring — the design doc's own
 *  numbers, which sit the top petal dead centre and let the lower pair spread
 *  slightly wider so the mark reads as a flower rather than a gear. */
const POS = [
  [0, -D],
  [D * 0.95, -D * 0.31],
  [D * 0.59, D * 0.81],
  [-D * 0.59, D * 0.81],
  [-D * 0.95, -D * 0.31],
];

/** Distance from the centre to the outermost pixel of the mark, at scale 1.
 *  Callers use it to check a scale against a platform's safe area. */
export const MARK_RADIUS = Math.max(...POS.map(([x, y]) => Math.hypot(x, y))) + R;

const PLUS_ARM = 88;
const PLUS_WIDTH = 58;
const PLUS_PATH = `M512 ${512 - PLUS_ARM}v${PLUS_ARM * 2}M${512 - PLUS_ARM} 512h${PLUS_ARM * 2}`;

/** Scales, named for what they are for rather than for their number.
 *
 *  `full` is the flat store icon, which nothing crops: the mark fills the
 *  square with a comfortable margin.
 *
 *  `safe` is for anything a launcher may mask — the Android adaptive layers
 *  and the PWA maskable icon. Android guarantees only the centre 66dp of the
 *  108dp canvas, a circle of radius 313 here, so the mark has to fit inside
 *  it: MARK_RADIUS * s <= 313, i.e. s <= 0.731. This sits just under that so
 *  the mark fills the whole guaranteed area rather than floating in it.
 *
 *  Note `full` is NOT safe for masking. At 0.92 the mark reaches radius 394,
 *  past even the 72dp circle a round mask leaves visible (341), so the outer
 *  petals would be shaved. The two scales exist for exactly that reason. */
export const SCALE = { full: 0.92, safe: 0.72, simple: 1, notification: 0.78, mono: 0.72 };

const transform = (s) => `translate(512 512) scale(${s}) translate(-512 -512)`;

function petals(colors, mono) {
  return POS.map(
    ([x, y], i) =>
      `<circle cx="${(512 + x).toFixed(2)}" cy="${(512 + y).toFixed(2)}" r="${R}" fill="${mono ?? colors[i]}"/>`,
  ).join('');
}

/** The mark itself, without any background.
 *
 *  `plus` paints the centre cross in a solid colour; `knockout` instead cuts
 *  it out so whatever is behind shows through — which is what the Android
 *  monochrome and notification layers need, since the system tints those by
 *  their alpha channel and a painted-on cross would be tinted along with the
 *  petals into one flat blob. */
export function markSvg({
  scale = SCALE.full,
  colors = PALETTE,
  mono,
  plus = INK,
  knockout = false,
  multiply = true,
} = {}) {
  const id = `k${Math.abs(hash(`${scale}${mono}${plus}${knockout}`))}`;
  /* Group-level multiply, not per-circle: the petals stack opaquely among
     themselves and the assembled mark multiplies onto the backdrop. On the
     white master that is a no-op — it exists so the mark can sit on a tinted
     surface without a hard edge.
   *
   *  It has to come off for the dark tile. Multiplying pastels onto #1B1E25
   *  crushes all five petals to near-black and the mark disappears, which is
   *  what the design doc's own dark icon does. Painting them normally on dark
   *  keeps the colours and loses nothing, since the petals never blended with
   *  each other in the first place. */
  const blend = mono || !multiply ? '' : ' style="mix-blend-mode:multiply;isolation:isolate"';
  const body = `<g${blend}>${petals(colors, mono)}</g>`;

  if (knockout) {
    return (
      `<defs><mask id="${id}">` +
      `<rect width="1024" height="1024" fill="#fff"/>` +
      `<path d="${PLUS_PATH}" stroke="#000" stroke-width="${PLUS_WIDTH}" stroke-linecap="round" fill="none"/>` +
      `</mask></defs>` +
      `<g transform="${transform(scale)}" mask="url(#${id})">${body}</g>`
    );
  }

  return (
    `<g transform="${transform(scale)}">${body}` +
    `<path d="${PLUS_PATH}" stroke="${plus}" stroke-width="${PLUS_WIDTH}" stroke-linecap="round" fill="none"/>` +
    `</g>`
  );
}

/** Wraps mark content in a 1024 master square. `bg` omitted leaves it
 *  transparent, which is what the layered Android icons want. */
export function iconSvg(content, bg) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">` +
    (bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : '') +
    content +
    `</svg>`
  );
}

/** Every SVG the app ships, keyed by the filename it is written to. */
export function brandSvgs() {
  return {
    /* Store and home screen. Full bleed, no alpha — iOS masks it itself. */
    'icon-light.svg': iconSvg(markSvg({ scale: SCALE.full }), LIGHT_BG),
    'icon-dark.svg': iconSvg(
      markSvg({ scale: SCALE.full, plus: DARK_BG, multiply: false }),
      DARK_BG,
    ),

    /* Small sizes: the mark grows to fill the tile, because at 40px the
       surrounding white is read as padding rather than as the icon. */
    'icon-simple.svg': iconSvg(markSvg({ scale: SCALE.simple }), LIGHT_BG),

    /* Android adaptive layers. The foreground is drawn small enough to clear
       the 66dp safe circle whatever mask the launcher applies. */
    'icon-foreground.svg': iconSvg(markSvg({ scale: SCALE.safe })),
    'icon-background.svg': iconSvg('', LIGHT_BG),
    'icon-monochrome.svg': iconSvg(markSvg({ scale: SCALE.mono, mono: MONO_FG, knockout: true })),

    /* Notification icon: Android tints by alpha, so this is a silhouette with
       the plus punched out. */
    'icon-notification.svg': iconSvg(
      markSvg({ scale: SCALE.notification, mono: '#FFFFFF', knockout: true }),
    ),

    /* Chrome hands the maskable icon to the same launcher masks as a native
       adaptive icon, so it uses the safe scale, not the store one. */
    'icon-maskable.svg': iconSvg(markSvg({ scale: SCALE.safe }), LIGHT_BG),
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

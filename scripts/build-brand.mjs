/** Regenerates every brand asset from scripts/brand.mjs.
 *
 *    node scripts/build-brand.mjs          # SVG only
 *    node scripts/build-brand.mjs --png    # SVG, then serve the PNG renderer
 *
 *  The PNG step needs a browser. The mark blends its petals with
 *  mix-blend-mode, which command-line rasterisers support unevenly, and the
 *  splash sets its wordmark in Pretendard — rendering in the same engine that
 *  draws the app is the only way to be sure the exported bitmap matches what
 *  the design doc shows. So `--png` starts a small server, and opening the
 *  page it prints renders every bitmap and posts it back here to be written.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandSvgs, LIGHT_BG, MARK_RADIUS, SCALE } from './brand.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4599;

/** Android guarantees only the centre 66dp of the 108dp adaptive canvas.
 *  A palette or geometry edit that pushes the mark past it would ship an
 *  icon with clipped petals on some launchers and not others, which is the
 *  kind of thing nobody notices until a user posts a screenshot. */
const SAFE_RADIUS = 313;
if (MARK_RADIUS * SCALE.safe > SAFE_RADIUS) {
  throw new Error(
    `mark overflows the Android safe circle: ${(MARK_RADIUS * SCALE.safe).toFixed(0)} > ${SAFE_RADIUS}`,
  );
}

const write = (rel, data) => {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  console.log(`  ${rel}  ${(data.length / 1024).toFixed(1)}kB`);
};

/* ---- SVG ---- */
console.log('svg:');
const svgs = brandSvgs();
for (const [name, svg] of Object.entries(svgs)) write(`assets/brand/${name}`, svg);
write('public/favicon.svg', svgs['icon-light.svg']);
/* Served, not bundled: the in-app lockup swaps between these two by theme,
   and Capacitor serves the same paths from the packaged web root. */
write('public/logo-light.svg', svgs['icon-light.svg']);
write('public/logo-dark.svg', svgs['icon-dark.svg']);

if (!process.argv.includes('--png')) process.exit(0);

/* ---- PNG ----
   Each job names a source (an SVG from above, or the splash layout the page
   composes itself), a pixel size, and where the result lands. */
const JOBS = [
  { src: 'icon-light.svg', size: 512, out: 'public/icon-512.png' },
  { src: 'icon-light.svg', size: 192, out: 'public/icon-192.png' },
  { src: 'icon-maskable.svg', size: 512, out: 'public/icon-maskable-512.png' },
  { src: 'icon-light.svg', size: 180, out: 'public/apple-touch-icon.png' },
  { src: 'icon-simple.svg', size: 32, out: 'public/favicon-32.png' },
  { src: 'icon-light.svg', size: 1024, out: 'assets/icon-only.png' },
  { src: 'icon-foreground.svg', size: 1024, out: 'assets/icon-foreground.png' },
  { src: 'icon-background.svg', size: 1024, out: 'assets/icon-background.png' },
  { src: 'icon-monochrome.svg', size: 1024, out: 'assets/icon-monochrome.png' },
  { src: 'icon-notification.svg', size: 96, out: 'assets/icon-notification.png' },
  { splash: 'light', size: 2732, out: 'assets/splash.png' },
  { splash: 'dark', size: 2732, out: 'assets/splash-dark.png' },
];

const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css">
<body style="font:600 13px Pretendard,system-ui;background:#EFEDE8;margin:0;padding:24px">
<h1 style="font-size:15px" id="status">rendering…</h1>
<div id="preview" style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start"></div>
<script type="module">
const JOBS = ${JSON.stringify(JOBS)};
const SVGS = ${JSON.stringify(svgs)};
const THEME = { light: ${JSON.stringify({ bg: LIGHT_BG, name: '#3A3F47', sub: '#8B9199', icon: 'icon-light.svg' })},
                dark: ${JSON.stringify({ bg: '#111318', name: '#B9BDC4', sub: '#878E99', icon: 'icon-dark.svg' })} };

const load = (svg) => new Promise((ok, no) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = no;
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
});

/** The native splash is centre-cropped to every screen aspect, so the lockup
 *  sits in the middle at a size that survives the narrowest crop. */
async function splash(ctx, size, theme) {
  const t = THEME[theme];
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, size, size);
  const u = size / 2732;
  const icon = await load(SVGS[t.icon]);
  const iconSize = 420 * u, r = 116 * u;
  const x = (size - iconSize) / 2, y = size / 2 - 300 * u;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, iconSize, iconSize, r);
  ctx.clip();
  ctx.drawImage(icon, x, y, iconSize, iconSize);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = t.name;
  ctx.font = \`800 \${124 * u}px Pretendard, system-ui\`;
  ctx.fillText('온:On 지출가계부', size / 2, size / 2 + 300 * u);
  ctx.fillStyle = t.sub;
  ctx.font = \`700 \${56 * u}px Pretendard, system-ui\`;
  ctx.fillText('열자마자 3초, 지출 끝', size / 2, size / 2 + 410 * u);
}

const blob = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));

await document.fonts.ready;
const done = [];
for (const job of JOBS) {
  const c = document.createElement('canvas');
  c.width = c.height = job.size;
  const ctx = c.getContext('2d');
  if (job.splash) await splash(ctx, job.size, job.splash);
  else ctx.drawImage(await load(SVGS[job.src]), 0, 0, job.size, job.size);

  const res = await fetch('/write?path=' + encodeURIComponent(job.out), { method: 'POST', body: await blob(c) });
  done.push(job.out + (res.ok ? '' : ' FAILED'));

  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
  const shown = document.createElement('canvas');
  shown.width = shown.height = job.size;
  shown.style.cssText = 'width:110px;height:110px;border:1px solid rgba(0,0,0,.12);border-radius:10px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px';
  shown.getContext('2d').drawImage(c, 0, 0);
  const cap = document.createElement('div');
  cap.style.cssText = 'font:600 10px ui-monospace,Menlo,monospace;color:#555;max-width:120px;text-align:center';
  cap.textContent = job.out.split('/').pop() + ' · ' + job.size;
  cell.append(shown, cap);
  document.getElementById('preview').append(cell);
}
document.getElementById('status').textContent = 'wrote ' + done.length + ' files';
document.title = 'brand-done';
</script>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/write') {
    const rel = normalize(url.searchParams.get('path') ?? '');
    /* The renderer is local and short-lived, but it still only gets to write
       where the job list says. */
    if (rel.startsWith('..') || !JOBS.some((j) => j.out === rel)) {
      res.writeHead(403).end('not a declared output');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      write(rel, Buffer.concat(chunks));
      res.writeHead(200).end('ok');
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
});

server.listen(PORT, () => {
  console.log(`\npng: open http://localhost:${PORT}/ — ctrl-c when it says done\n`);
});

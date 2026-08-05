/** Renders docs/privacy-policy.md into a standalone page to publish.
 *
 *    node scripts/build-policy.mjs
 *
 *  The markdown stays the source of truth — the store listing and the app's
 *  설정 screen both have to point at whatever is published, and a policy that
 *  drifts from the app's actual behaviour is the one document where being out
 *  of date has consequences. So the page is generated, never hand-edited.
 *
 *  The converter only handles what this document uses. It is deliberately not
 *  a general markdown implementation: a dependency here would be a dependency
 *  in the one artefact that has to be reproducible years from now.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/* Node 24 strips the types, so the page's app name and company come from the
   same module the UI reads rather than from a copy that can go stale. */
import { APP_INFO } from '../src/data/appInfo.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'docs/privacy-policy.md');
const OUT = resolve(ROOT, 'docs/privacy-policy.html');

/** The effective date. Passed in so a re-render months later doesn't silently
 *  restamp a policy that has been live all along. */
const effective = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const [y, m, d] = effective.split('-').map(Number);
const effectiveText = `${y}년 ${m}월 ${d}일`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline formatting, applied after escaping so the markup we add survives. */
const inline = (s) =>
  esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

const rawLines = readFileSync(SRC, 'utf8').split('\n');
const out = [];
let i = 0;
let list = null;

const closeList = () => {
  if (list) {
    out.push(`</${list}>`);
    list = null;
  }
};

while (i < rawLines.length) {
  const line = rawLines[i];

  /* The ⚠️ block is a note to ourselves about what to check before going
     live. It says so itself, and it must not reach a reader. */
  if (line.startsWith('>')) {
    closeList();
    while (i < rawLines.length && (rawLines[i].startsWith('>') || rawLines[i].trim() === '')) {
      if (rawLines[i].trim() === '' && !rawLines[i + 1]?.startsWith('>')) break;
      i += 1;
    }
    i += 1;
    continue;
  }

  if (line.trim() === '') {
    closeList();
    i += 1;
    continue;
  }

  if (line.startsWith('---')) {
    closeList();
    out.push('<hr>');
    i += 1;
    continue;
  }

  const heading = /^(#{1,3}) (.*)$/.exec(line);
  if (heading) {
    closeList();
    const level = heading[1].length;
    out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    i += 1;
    continue;
  }

  /* Tables: a header row, a separator, then body rows. */
  if (line.startsWith('|') && /^\|[\s:|-]+\|$/.test(rawLines[i + 1] ?? '')) {
    closeList();
    const cells = (row) =>
      row
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
    const head = cells(line);
    i += 2;
    const body = [];
    while (i < rawLines.length && rawLines[i].startsWith('|')) {
      body.push(cells(rawLines[i]));
      i += 1;
    }
    out.push(
      '<div class="scroll"><table><thead><tr>' +
        head.map((c) => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('') +
        '</tbody></table></div>',
    );
    continue;
  }

  if (line.startsWith('- ')) {
    if (!list) {
      out.push('<ul>');
      list = 'ul';
    }
    out.push(`<li>${inline(line.slice(2))}</li>`);
    i += 1;
    continue;
  }

  closeList();
  out.push(`<p>${inline(line)}</p>`);
  i += 1;
}
closeList();

let body = out.join('\n');
if (!body.includes('시행일')) throw new Error('effective-date line went missing');
body = body.replace(/시행일: [^<]*/, `시행일: ${effectiveText}`);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>개인정보처리방침 — ${APP_INFO.appName}</title>
<meta name="description" content="${APP_INFO.appName} 개인정보처리방침. ${APP_INFO.companyName}">
<meta name="robots" content="index, follow">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css">
<style>
  :root {
    --bg: #f0f2f6; --sf: #ffffff; --tx: #15181e; --tx2: #8b9199;
    --line: #eceff4; --brand: #7b87f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111318; --sf: #1b1e25; --tx: #f1f3f7; --tx2: #878e99;
      --line: #2a2f39; --brand: #8e98ff;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 72px; background: var(--bg); color: var(--tx);
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 15px; line-height: 1.8; word-break: keep-all;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 25px; font-weight: 800; letter-spacing: -0.8px; margin: 0 0 28px; line-height: 1.35; }
  h2 { font-size: 18px; font-weight: 800; letter-spacing: -0.4px; margin: 40px 0 14px; }
  p { margin: 0 0 14px; }
  strong { font-weight: 800; }
  ul { margin: 0 0 16px; padding-left: 20px; }
  li { margin-bottom: 6px; }
  a { color: var(--brand); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 34px 0; }
  /* Tables carry the substance here — what is stored, which permissions, who
     to contact — so they get a card of their own and scroll rather than
     squeeze on a phone. */
  .scroll { overflow-x: auto; margin: 0 0 18px; }
  table {
    width: 100%; border-collapse: collapse; background: var(--sf);
    border-radius: 14px; overflow: hidden; font-size: 14px;
  }
  th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  th { font-weight: 800; font-size: 12.5px; color: var(--tx2); white-space: nowrap; }
  tr:last-child td { border-bottom: 0; }
  footer {
    margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--line);
    font-size: 12.5px; color: var(--tx2);
  }
</style>
</head>
<body>
<main>
${body}
<footer>© ${y} ${APP_INFO.companyName}</footer>
</main>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`wrote docs/privacy-policy.html · 시행일 ${effectiveText}`);

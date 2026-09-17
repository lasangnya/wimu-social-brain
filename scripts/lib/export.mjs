import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

// Renders a wimu-social-brain storybook (the markdown shape illustrate writes) as one
// self-contained HTML file: every panel image is inlined as a data URI, so the
// file can be mailed or zipped on its own and opens in any browser.
//
// This is a converter for the storybook subset of markdown only — headings,
// paragraphs, images on their own line, inline code / bold, list items, and a
// pass-through for the <details> Sources block — not a general markdown parser.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function inline(text) {
  // escape first, then re-introduce the two inline forms the storybook uses
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function dataUri(src, dir) {
  const file = resolve(dir, src);
  const mime = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

const CSS = `
  :root { color-scheme: light; }
  body { margin: 0; background: #fff; color: #111; font: 18px/1.6 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 2.2em; line-height: 1.2; margin: 0 0 .4em; }
  h3 { font-size: 1.45em; line-height: 1.3; margin: .6em 0 .3em; }
  p { margin: 0 0 1em; }
  figure { margin: 2.5em 0 1em; }
  figure img { display: block; width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; background: #f4f4f4; padding: .1em .35em; border-radius: 4px; }
  .remember { margin-top: 2.5em; padding: 1em 1.2em; border-left: 4px solid #D93025; background: #fff5f4; }
  details { margin-top: 2em; color: #555; font-size: .9em; }
  summary { cursor: pointer; }
  ul { padding-left: 1.4em; }
`;

export function renderStorybookHtml(markdown, dir) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = 'Storybook';
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`); list = []; } };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^# (.+)$/))) { flush(); title = m[1].trim(); out.push(`<h1>${esc(title)}</h1>`); continue; }
    if ((m = line.match(/^(#{2,4}) (.+)$/))) {
      flush();
      // A ### right after a panel is its caption, already baked into the image strip — skip it here.
      if (m[1].length === 3 && out.length && out[out.length - 1].startsWith('<figure>')) continue;
      const n = m[1].length; out.push(`<h${n}>${inline(m[2].trim())}</h${n}>`); continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flush();
      out.push(`<figure><img src="${dataUri(m[2], dir)}" alt="${esc(m[1])}"></figure>`);
      continue;
    }
    if ((m = line.match(/^\*\*Remember:\*\*\s*(.+)$/))) { flush(); out.push(`<p class="remember"><strong>Remember:</strong> ${inline(m[1])}</p>`); continue; }
    if ((m = line.match(/^- (.+)$/))) { flushPara(); list.push(m[1]); continue; }
    if (/^<\/?(details|summary)/.test(line)) { flush(); out.push(line.replace(/<summary>(.*)<\/summary>/, (_, t) => `<summary>${esc(t)}</summary>`)); continue; }
    if (/^_Pending:.*_$/.test(line)) { flush(); out.push(`<p><em>${inline(line.slice(1, -1))}</em></p>`); continue; }
    para.push(line.trim());
  }
  flush();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${out.join('\n')}
</main>
</body>
</html>
`;
}

// Writes <slug>.html next to <slug>.md and returns { out }.
export function exportStorybook(docPath) {
  const doc = resolve(docPath);
  const dir = dirname(doc);
  const html = renderStorybookHtml(readFileSync(doc, 'utf8'), dir);
  const out = join(dir, basename(doc, extname(doc)) + '.html');
  writeFileSync(out, html);
  return { out };
}

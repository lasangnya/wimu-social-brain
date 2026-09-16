#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { loadDesign } from './lib/design.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FONT = join(HERE, '..', 'assets', 'fonts', 'Caveat-Regular.ttf');

// wimu-social-brain.md `labels:` is either a family name (rendered from the bundled Caveat file unless the
// family is installed) or a .ttf/.otf path relative to the repo root.
export function resolveFontPath(design, cwd = process.cwd()) {
  const f = design.font.labels;
  return /\.(ttf|otf)$/i.test(f) ? resolve(cwd, f) : DEFAULT_FONT;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function color(kind, colors) {
  return kind === 'flow' ? colors.flow : kind === 'warn' ? colors.warn : kind === 'note' ? colors.note : '#111111';
}

function fontFamily(font) {
  return font && font !== 'in-image' ? font.replace(/\.(ttf|otf)$/i, '').split(/[\\/]/).pop() : 'Caveat';
}

// Family name from a TrueType/OpenType file's `name` table (typographic family 16, else family 1).
// Pango matches on this name, not the file name: `Caveat-Regular.ttf` must be asked for as
// "Caveat" or fontconfig (Linux) / CoreText (macOS) falls back to the default font. Returns null
// for anything it cannot parse (collections, damaged files) so callers can fall back to the name.
const familyCache = new Map();
export function fontFamilyFromFile(fontPath) {
  if (familyCache.has(fontPath)) return familyCache.get(fontPath);
  let family = null;
  try {
    const b = readFileSync(fontPath);
    const numTables = b.readUInt16BE(4);
    let name = null;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (b.toString('latin1', rec, rec + 4) === 'name') { name = { off: b.readUInt32BE(rec + 8), len: b.readUInt32BE(rec + 12) }; break; }
    }
    if (name) {
      const count = b.readUInt16BE(name.off + 2), strings = name.off + b.readUInt16BE(name.off + 4);
      const found = {};
      for (let i = 0; i < count; i++) {
        const r = name.off + 6 + i * 12;
        const platform = b.readUInt16BE(r), nameId = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), off = strings + b.readUInt16BE(r + 10);
        if ((nameId !== 1 && nameId !== 16) || found[nameId]) continue;
        const raw = b.subarray(off, off + len);
        found[nameId] = platform === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le');
      }
      family = found[16] || found[1] || null;
    }
  } catch { family = null; }
  familyCache.set(fontPath, family);
  return family;
}

// The family Pango should be asked for: what the font file says it is, when `font` refers to a
// file (or is the bundled default); otherwise the family name as written in wimu-social-brain.md.
export function labelFamily(font, fontPath) {
  const isFile = !font || font === 'in-image' || /\.(ttf|otf)$/i.test(font);
  return (isFile && fontFamilyFromFile(fontPath)) || fontFamily(font);
}

// deterministic "hand-drawn" wobble so snapshots are stable
function wobblePath(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const w = 0.04 * len * Math.sin(seed * 12.9898);
  const cx = (x1 + x2) / 2 + nx * w, cy = (y1 + y2) / 2 + ny * w;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function arrowHead(x2, y2, x1, y1, size) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (t) => `${(x2 - size * Math.cos(a - t)).toFixed(1)} ${(y2 - size * Math.sin(a - t)).toFixed(1)}`;
  return `M${p(0.5)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${p(-0.5)}`;
}

function arrowParts(spec, width, height) {
  const parts = [];
  (spec.arrows || []).forEach((a, i) => {
    const [x1, y1] = [a.from[0] * width, a.from[1] * height];
    const [x2, y2] = [a.to[0] * width, a.to[1] * height];
    const c = color(a.kind, spec.colors);
    const sw = Math.max(2, Math.round(height * 0.006));
    parts.push(`<path d="${wobblePath(x1, y1, x2, y2, i + 1)}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`);
    parts.push(`<path d="${arrowHead(x2, y2, x1, y1, sw * 4)}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
  });
  return parts;
}

// Full overlay markup: arrows + text labels. Kept as an exported pure function
// so the unit tests can assert on the label layer as a string. It is NOT what
// gets rasterized for the <text> portion -- see the comment above labelImage().
export function renderSvgLayer(spec, width, height) {
  const family = fontFamily(spec.font);
  const base = Math.round(height * 0.06);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`];
  parts.push(...arrowParts(spec, width, height));
  for (const l of spec.labels || []) {
    const size = Math.round(base * (l.size || 1));
    parts.push(`<text x="${(l.x * width).toFixed(1)}" y="${(l.y * height).toFixed(1)}" font-family="${esc(family)}, cursive" font-size="${size}" fill="${color(l.kind, spec.colors)}" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

// --- Font rendering notes (read before touching this file) ---------------
//
// sharp's SVG rasterizer (librsvg, via libvips) resolves <text font-family="…">
// through fontconfig+Pango. On the Windows build (sharp 0.35.3, libvips
// 8.18.3, bundled fontconfig 2.18.1) that lookup could NOT be steered at all:
// setting FONTCONFIG_FILE (absolute path, with and without <cachedir>) or
// FONTCONFIG_PATH before the first `import('sharp')`, even pointing at a
// trivially valid fonts.conf, produced no error (even with deliberately
// malformed/nonexistent config paths -- silence in every case) and no font
// cache was ever written; rasterizing an SVG <text> always fell back to a
// generic system serif, never Caveat. So on Windows, compositing a rasterized
// SVG <text> layer is NOT a viable path to a handwritten label -- regardless
// of env var wiring.
//
// What DOES work on Windows and Linux: libvips' `text` create-operation
// (`sharp({ text: {...} })`) accepts a `fontfile` option that loads a font file
// directly via FcConfigAppFontAddFile into a private, in-process font config --
// bypassing the system/env fontconfig lookup that failed above. Combined with
// a `font: "<Family> <size>"` Pango description and Pango markup
// (`<span foreground="#RRGGBB">…</span>`) for color, this reliably rendered
// Caveat glyphs, verified visually (handwritten strokes, not a fallback
// sans/serif) via a scratchpad PNG.
//
// macOS is the exception (issue #1): sharp's darwin build resolves fonts through
// CoreText, not fontconfig, so `fontfile` is silently ignored and every label
// comes out in Helvetica -- unless the same font is installed in ~/Library/Fonts,
// in which case the family name resolves normally. There is no in-process way
// around that, so fontFileWorks() below detects the fallback by rendering a probe
// string with the font file and comparing it against a deliberately unknown
// family (both hit the same system fallback when `fontfile` is ignored), and
// labelImage() reports a one-line hint instead of shipping Helvetica silently.
// scripts/font.mjs wraps that probe and does the ~/Library/Fonts install.
//
// So: renderSvgLayer() above still emits the full <text>-bearing SVG markup
// (asserted on as a string by tests), but labelImage() below rasterizes arrows
// via a text-free SVG through librsvg and each label via the `fontfile`
// text-create path, then composites both onto the base image.

const PROBE_TEXT = 'Show me how? fjqg';
const PROBE_UNKNOWN_FAMILY = 'ShowMeHowNoSuchFont';

async function defaultMeasure({ family, fontPath }) {
  const text = { text: PROBE_TEXT, font: `${family} 48`, dpi: 72, rgba: true };
  if (fontPath) text.fontfile = fontPath;
  const { info } = await sharp({ text }).png().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

const probeCache = new Map();

// true when rendering with `fontfile` actually uses that file (or an installed font of the same
// family); false when Pango ignored it and fell back to the system default. `measure` is
// injectable for tests.
export async function fontFileWorks(fontPath, family, measure = defaultMeasure) {
  const key = `${fontPath}\u0000${family}`;
  if (measure === defaultMeasure && probeCache.has(key)) return probeCache.get(key);
  // Order matters: the fallback render must come FIRST and the two must not overlap. On the
  // Windows build the first text operation in a process fixes libvips' font map, and if that
  // first operation carried `fontfile`, the loaded font becomes the only font in the private
  // config, so an unknown family resolves to it too and both renders come out identical (a false
  // negative). Rendering the unknown family before any font file is loaded pins the real system
  // fallback. That is also why labelImage() probes before drawing its first label, once per process.
  const fallback = await measure({ family: PROBE_UNKNOWN_FAMILY });
  const withFile = await measure({ family, fontPath });
  const ok = withFile.width !== fallback.width || withFile.height !== fallback.height;
  if (measure === defaultMeasure) probeCache.set(key, ok);
  return ok;
}

// One line the skill can show the user when the probe fails.
export function fontFallbackHint(fontPath, platform = process.platform) {
  const name = basename(fontPath);
  const installCmd = `node "${join(HERE, 'font.mjs')}" install`;
  if (platform === 'darwin') {
    return `Labels were drawn in the system font, not ${name}: sharp on macOS ignores font files (CoreText). ` +
      `Fix once with: cp "${fontPath}" ~/Library/Fonts/   (or: ${installCmd})`;
  }
  return `Labels were drawn in the system font, not ${name}: this sharp build ignored the font file. ` +
    `Install ${name} for your user (${installCmd}) and rerun.`;
}

async function renderLabelPng(text, kind, size, spec, fontPath) {
  const family = fontFamily(spec.font);
  const markup = `<span foreground="${esc(color(kind, spec.colors))}">${esc(text)}</span>`;
  return sharp({
    text: {
      text: markup,
      font: `${family} ${size}`,
      fontfile: fontPath,
      rgba: true,
    },
  }).png().toBuffer();
}

// Caption text is wrapped by Pango to ~80% of the picture width and centred.
async function renderCaptionPng(text, width, height, spec, fontPath) {
  const family = fontFamily(spec.font);
  const size = Math.round(height * 0.055);
  const buf = await sharp({
    text: {
      text: `<span foreground="#111111">${esc(text)}</span>`,
      font: `${family} ${size}`,
      fontfile: fontPath,
      width: Math.round(width * 0.8),
      align: 'center',
      rgba: true,
    },
  }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width, height: meta.height };
}

// Picks the encoder from the extension of `out`. `quality` is wimu-social-brain.md image_quality (1-100).
function encode(pipeline, out, quality) {
  const ext = extname(out).toLowerCase();
  if (ext === '.webp') return pipeline.webp({ quality });
  if (ext === '.jpg' || ext === '.jpeg') return pipeline.jpeg({ quality });
  // palette PNG: a few-colour line-art panel quantizes to about half the size with no visible loss
  return pipeline.png({ palette: true, quality, compressionLevel: 9 });
}

export async function labelImage({ input, spec, out, fontPath = DEFAULT_FONT, quality = 80, probe = fontFileWorks }) {
  // ask Pango for the family the file really carries, then probe it before the first label
  // render -- see the order note inside fontFileWorks()
  spec = { ...spec, font: labelFamily(spec.font, fontPath) };
  const fontOk = await probe(fontPath, spec.font);
  const img = sharp(input);
  const { width, height } = await img.metadata();

  const arrowsSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...arrowParts(spec, width, height),
    '</svg>',
  ].join('\n');

  const overlays = [{ input: Buffer.from(arrowsSvg), top: 0, left: 0 }];

  const base = Math.round(height * 0.06);
  for (const l of spec.labels || []) {
    const size = Math.round(base * (l.size || 1));
    const buf = await renderLabelPng(l.text, l.kind, size, spec, fontPath);
    const meta = await sharp(buf).metadata();
    const left = Math.max(0, Math.min(width - meta.width, Math.round(l.x * width - meta.width / 2)));
    const top = Math.max(0, Math.min(height - meta.height, Math.round(l.y * height - meta.height / 2)));
    overlays.push({ input: buf, left, top });
  }

  // image_gen returns a transparent-background PNG often enough to matter (one in four on the
  // first Flow pass), and a transparent "white" background renders black wherever the doc is dark.
  // Flattening here fixes it once for every backend instead of trusting each prompt to ask nicely.
  //
  // This has to be a SECOND pass. sharp orders its own pipeline, so a flatten() chained onto the
  // same pipeline as composite() cannot win: the label/arrow overlays are RGBA, and compositing
  // them re-adds an alpha channel no matter which side of composite() the flatten() call sits on
  // (verified both orders -- each still yields channels=4). Flattening the finished buffer does
  // strip it, and paints the transparent background white rather than leaving it undefined-black.
  const composited = await img.composite(overlays).png().toBuffer();
  let flat = sharp(composited).flatten({ background: '#ffffff' });

  // Optional storybook caption: a white strip below the picture with the caption in the brand
  // font, so a panel reads on its own (shared, previewed, or embedded) without the doc around it.
  if (spec.caption) {
    const cap = await renderCaptionPng(spec.caption, width, height, spec, fontPath);
    const pad = Math.round(height * 0.04);
    const strip = cap.height + pad * 2;
    flat = sharp(await flat.png().toBuffer())
      .extend({ bottom: strip, background: '#ffffff' })
      .composite([{ input: cap.buf, left: Math.round((width - cap.width) / 2), top: height + pad }]);
    // same second-pass rule as above: the RGBA caption re-adds alpha, so flatten the finished buffer
    flat = sharp(await flat.png().toBuffer()).flatten({ background: '#ffffff' });
  }

  await encode(flat, out, quality).toFile(out);
  const result = { out };
  if (!fontOk) {
    result.fontFallback = true;
    result.hint = fontFallbackHint(fontPath);
    console.error(result.hint);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = {}; const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];
  const design = loadDesign(a['design-cwd'] || process.cwd());
  const spec = JSON.parse(readFileSync(a.labels, 'utf8'));
  spec.font ??= design.font.labels; spec.colors ??= design.colors;
  if (a.caption) spec.caption = a.caption;
  const fontPath = a.font || resolveFontPath(design, a['design-cwd'] || process.cwd());
  const r = await labelImage({ input: a.in, spec, out: a.out, fontPath, quality: design.output.imageQuality });
  console.log(JSON.stringify(r));
}

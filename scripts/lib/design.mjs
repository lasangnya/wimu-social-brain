import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULTS = Object.freeze({
  mascot: {
    name: 'Flow',
    description: 'small solid-black blob, white dot eyes, thin legs, deadpan; a serious operator doing absurd but valid work',
    references: [],
    never: 'cute, sparkly eyes, clothing, standing in the corner watching',
  },
  font: { labels: 'Caveat' },
  colors: { flow: '#F28C28', warn: '#D93025', note: '#1A73E8' },
  tone: 'deadpan, absurd, clean',
  output: { docs: 'docs/wimu-social-brain/', backend: 'auto', codexModel: '', codexReasoning: 'low', imageFormat: 'webp', imageQuality: 80, imageModel: '', imageApiQuality: 'medium' },
});

const HEX = /^#[0-9a-fA-F]{6}$/;
// Formats label.mjs can write. WebP is the default: a labelled line-art panel is ~16x smaller
// than the same picture as PNG (about 45 KB vs 700 KB), which is what keeps the exported HTML
// small enough to mail. PNG stays available for anyone who needs it.
export const IMAGE_FORMATS = ['webp', 'png'];
// Quality tiers accepted by the openai-api backend (gpt-image models). Gemini ignores it.
export const IMAGE_API_QUALITIES = ['low', 'medium', 'high'];

function stripComment(line) {
  // remove "# ..." unless the # is inside quotes
  let out = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    if (ch === '#' && !q) break;
    out += ch;
  }
  return out.trimEnd();
}

function unquote(v) {
  v = v.trim();
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

export function parseDesign(text) {
  const d = structuredClone(DEFAULTS);
  let section = '', lastKey = '';
  for (const raw of text.split(/\r?\n/)) {
    const trimmedRaw = raw.trim();
    if (trimmedRaw.startsWith('##')) {
      const h = trimmedRaw.match(/^##\s+(\w+)/);
      if (h) { section = h[1].toLowerCase(); lastKey = ''; }
      continue;
    }
    const line = stripComment(raw);
    if (!line.trim()) continue;
    if (line.startsWith('#')) continue;
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && section === 'mascot' && lastKey === 'references') { d.mascot.references.push(unquote(item[1])); continue; }
    const kv = line.match(/^\s*([\w-]+):\s*(.*)$/);
    if (kv) {
      const [, k, vRaw] = kv; const v = unquote(vRaw); lastKey = k;
      if (section === 'mascot') {
        if (k === 'references') d.mascot.references = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
        else if (k in d.mascot) d.mascot[k] = v;
      } else if (section === 'font' && k === 'labels') d.font.labels = v;
      else if (section === 'colors' && k in d.colors) {
        if (!HEX.test(v)) throw new Error(`wimu-social-brain.md: color "${k}" must be a 6-digit hex like #F28C28, got "${v}"`);
        d.colors[k] = v.toUpperCase();
      } else if (section === 'output') {
        // snake_case in design.md, camelCase in the parsed object
        const key = { codex_model: 'codexModel', codex_reasoning: 'codexReasoning', image_format: 'imageFormat', image_quality: 'imageQuality', image_model: 'imageModel', image_api_quality: 'imageApiQuality' }[k] ?? k;
        if (key === 'imageFormat') {
          const f = v.toLowerCase();
          if (!IMAGE_FORMATS.includes(f)) throw new Error(`wimu-social-brain.md: image_format must be ${IMAGE_FORMATS.join(' | ')}, got "${v}"`);
          d.output.imageFormat = f;
        } else if (key === 'imageQuality') {
          const q = Number(v);
          if (!Number.isInteger(q) || q < 1 || q > 100) throw new Error(`wimu-social-brain.md: image_quality must be a whole number from 1 to 100, got "${v}"`);
          d.output.imageQuality = q;
        } else if (key === 'imageApiQuality') {
          const q = v.toLowerCase();
          if (!IMAGE_API_QUALITIES.includes(q)) throw new Error(`wimu-social-brain.md: image_api_quality must be ${IMAGE_API_QUALITIES.join(' | ')}, got "${v}"`);
          d.output.imageApiQuality = q;
        } else if (key in d.output) d.output[key] = v;
      }
      continue;
    }
    if (section === 'tone') d.tone = line.trim();
  }
  return d;
}

// The config file is `wimu-social-brain.md` at the repo root. It used to be `design.md`, which collided
// with the very common "our product's design doc" file: /init refused to run because it thought
// the foreign file was ours, and every other command parsed that doc as config (throwing on a
// `flow: teal` colour, or silently adopting its `docs:` folder). A legacy `design.md` is still
// honoured, but only when it starts with the marker line the template has always written.
export const DESIGN_FILE = 'wimu-social-brain.md';
export const LEGACY_DESIGN_FILE = 'design.md';
export const DESIGN_MARKER = '# wimu-social-brain design';

function hasMarker(p) {
  return readFileSync(p, 'utf8').split(/\r?\n/, 1)[0].trim() === DESIGN_MARKER;
}

// Absolute path of the config file in use, or null when the repo has none (a foreign design.md counts as none).
export function findDesignFile(cwd = process.cwd()) {
  const p = join(cwd, DESIGN_FILE);
  if (existsSync(p)) return p;
  const legacy = join(cwd, LEGACY_DESIGN_FILE);
  if (existsSync(legacy) && hasMarker(legacy)) return legacy;
  return null;
}

export function loadDesign(cwd = process.cwd()) {
  const p = findDesignFile(cwd);
  return p ? parseDesign(readFileSync(p, 'utf8')) : structuredClone(DEFAULTS);
}

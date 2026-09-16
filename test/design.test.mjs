import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDesign, loadDesign, findDesignFile, DESIGN_FILE, DEFAULTS } from '../scripts/lib/design.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('template parses to defaults', () => {
  const d = parseDesign(readFileSync(new URL('../templates/wimu-social-brain.md', import.meta.url), 'utf8'));
  assert.deepEqual(d, DEFAULTS);
});

test('custom overrides merge over defaults', () => {
  const d = parseDesign(fx('design-custom.md'));
  assert.equal(d.mascot.name, 'Pip');
  assert.deepEqual(d.mascot.references, ['brand/pip1.png', 'brand/pip2.png']);
  assert.equal(d.font.labels, 'brand/Inter.ttf');
  assert.equal(d.colors.flow, '#00AA00');
  assert.equal(d.colors.warn, DEFAULTS.colors.warn);
  assert.equal(d.output.docs, 'docs/explainers/');
  assert.equal(d.output.backend, 'manual');
  assert.equal(d.tone, DEFAULTS.tone);
});

test('codex model/effort defaults', () => {
  assert.equal(DEFAULTS.output.codexModel, '');
  assert.equal(DEFAULTS.output.codexReasoning, 'low');
});

test('codex_model and codex_reasoning parse from the Output section', () => {
  const d = parseDesign(['## Output', 'codex_model: gpt-5.1-codex-max', 'codex_reasoning: medium', ''].join('\n'));
  assert.equal(d.output.codexModel, 'gpt-5.1-codex-max');
  assert.equal(d.output.codexReasoning, 'medium');
});

test('an empty codex_model keeps the codex default', () => {
  const d = parseDesign(['## Output', 'codex_model:', ''].join('\n'));
  assert.equal(d.output.codexModel, '');
});

test('image_format and image_quality parse from the Output section', () => {
  assert.equal(DEFAULTS.output.imageFormat, 'webp');
  assert.equal(DEFAULTS.output.imageQuality, 80);
  const d = parseDesign(['## Output', 'image_format: PNG', 'image_quality: 90', ''].join('\n'));
  assert.equal(d.output.imageFormat, 'png');
  assert.equal(d.output.imageQuality, 90);
});

test('invalid image_format / image_quality throw clear errors', () => {
  assert.throws(() => parseDesign('## Output\nimage_format: gif\n'), /image_format.*webp \| png/);
  assert.throws(() => parseDesign('## Output\nimage_quality: 150\n'), /image_quality.*1 to 100/);
  assert.throws(() => parseDesign('## Output\nimage_quality: high\n'), /image_quality/);
});

test('invalid color throws a clear error', () => {
  assert.throws(() => parseDesign('## Colors\nflow: red\n'), /flow.*hex/i);
});

test('loadDesign returns defaults when file is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  assert.deepEqual(loadDesign(dir), DEFAULTS);
});

test('loadDesign reads wimu-social-brain.md from cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  writeFileSync(join(dir, DESIGN_FILE), '## Mascot\nname: Zed\n');
  assert.equal(loadDesign(dir).mascot.name, 'Zed');
  assert.equal(findDesignFile(dir), join(dir, DESIGN_FILE));
});

test('loadDesign still reads a legacy design.md that carries the wimu-social-brain marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  writeFileSync(join(dir, 'design.md'), '# wimu-social-brain design\n## Mascot\nname: Zed\n');
  assert.equal(loadDesign(dir).mascot.name, 'Zed');
  assert.equal(findDesignFile(dir), join(dir, 'design.md'));
});

test('loadDesign ignores a foreign design.md (no marker), even one that would not parse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  writeFileSync(join(dir, 'design.md'), '# MyApp design\n## Colors\nflow: teal\n## Tone\nfriendly\n## Output\ndocs: build/\n');
  assert.deepEqual(loadDesign(dir), DEFAULTS);
  assert.equal(findDesignFile(dir), null);
});

test('wimu-social-brain.md wins over a marked legacy design.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  writeFileSync(join(dir, 'design.md'), '# wimu-social-brain design\n## Mascot\nname: Old\n');
  writeFileSync(join(dir, DESIGN_FILE), '## Mascot\nname: New\n');
  assert.equal(loadDesign(dir).mascot.name, 'New');
});

test('output defaults include image_model and image_api_quality', () => {
  assert.equal(DEFAULTS.output.imageModel, '');
  assert.equal(DEFAULTS.output.imageApiQuality, 'medium');
});

test('image_model and image_api_quality parse from ## Output', () => {
  const d = parseDesign('## Output\nimage_model: gpt-image-1-mini\nimage_api_quality: LOW\n');
  assert.equal(d.output.imageModel, 'gpt-image-1-mini');
  assert.equal(d.output.imageApiQuality, 'low');
});

test('image_api_quality rejects values the APIs do not accept', () => {
  assert.throws(() => parseDesign('## Output\nimage_api_quality: ultra\n'), /image_api_quality must be low \| medium \| high, got "ultra"/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECTS, ASPECT_NAMES, DEFAULT_ASPECT, normalizeAspect, aspectPhrase, openaiAspectSize } from '../scripts/lib/aspect.mjs';

test('16:9 is the default aspect and keeps the original wording', () => {
  assert.equal(DEFAULT_ASPECT, '16:9');
  assert.equal(normalizeAspect(undefined), '16:9');
  assert.equal(normalizeAspect(null), '16:9');
  assert.equal(normalizeAspect(''), '16:9');
  assert.equal(aspectPhrase(undefined), 'Landscape 16:9');
  assert.equal(aspectPhrase('16:9'), 'Landscape 16:9');
});

test('the four supported ratios normalize and carry a phrase + openai size', () => {
  assert.deepEqual(ASPECT_NAMES, ['16:9', '1:1', '4:5', '9:16']);
  assert.equal(aspectPhrase('1:1'), 'Square 1:1');
  assert.equal(aspectPhrase('4:5'), 'Portrait 4:5');
  assert.equal(openaiAspectSize('1:1'), '1024x1024');
  assert.equal(openaiAspectSize('4:5'), '1024x1536');
  assert.equal(openaiAspectSize('16:9'), '1536x1024');
});

test('whitespace is trimmed and an unknown ratio throws with the supported list', () => {
  assert.equal(normalizeAspect(' 1:1 '), '1:1');
  assert.throws(() => normalizeAspect('3:2'), /aspect "3:2" is not supported\. Use 16:9 \| 1:1 \| 4:5 \| 9:16/);
});

test('ASPECTS is frozen so a caller cannot mutate the presets', () => {
  assert.ok(Object.isFrozen(ASPECTS));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('plugin manifest is valid', () => {
  const m = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url)));
  assert.equal(m.name, 'wimu-social-brain');
});

test('marketplace manifest lists this plugin from the repo root', () => {
  const plugin = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url)));
  const m = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url)));
  assert.equal(m.name, 'wimu-social-brain');
  assert.ok(m.owner && m.owner.name);
  assert.equal(m.plugins.length, 1);
  assert.equal(m.plugins[0].name, plugin.name);
  assert.equal(m.plugins[0].source, './');
  assert.equal(m.plugins[0].description, plugin.description);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWithTimeout, refsToParts, httpFailure, referencePreamble } from '../scripts/lib/backends/http.mjs';
import * as gemini from '../scripts/lib/backends/gemini.mjs';
import * as openai from '../scripts/lib/backends/openai.mjs';
import * as openrouter from '../scripts/lib/backends/openrouter.mjs';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('refsToParts reads refs relative to cwd and picks mime from the extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-http-'));
  writeFileSync(join(dir, 'a.png'), PNG_1x1);
  writeFileSync(join(dir, 'b.jpg'), PNG_1x1);
  writeFileSync(join(dir, 'c.webp'), PNG_1x1);
  const parts = refsToParts(['a.png', 'b.jpg', 'c.webp'], dir);
  assert.deepEqual(parts.map((p) => p.mime), ['image/png', 'image/jpeg', 'image/webp']);
  assert.equal(parts[0].data, PNG_1x1.toString('base64'));
});

test('httpFailure keeps the body tail and adds a key hint on 401/403 and a retry hint on 429', () => {
  assert.equal(httpFailure(500, 'x'.repeat(600), 'K'), `HTTP 500: ${'x'.repeat(500)}`);
  assert.match(httpFailure(401, '{"error":"bad key"}', 'GEMINI_API_KEY'), /HTTP 401: .*bad key.* — check GEMINI_API_KEY$/);
  assert.match(httpFailure(403, '', 'OPENAI_API_KEY'), /check OPENAI_API_KEY$/);
  assert.match(httpFailure(429, 'slow down', 'K'), /rate limited, retry later$/);
});

test('referencePreamble only mentions references when there are some', () => {
  assert.equal(referencePreamble(0), 'Landscape 16:9. ');
  assert.match(referencePreamble(2), /style references for the mascot character.*Landscape 16:9\. $/);
});

test('referencePreamble follows the requested aspect and rejects an unknown one', () => {
  assert.equal(referencePreamble(0, '1:1'), 'Square 1:1. ');
  assert.equal(referencePreamble(0, '4:5'), 'Portrait 4:5. ');
  assert.match(referencePreamble(1, '9:16'), /style references.*Vertical 9:16\. $/);
  assert.throws(() => referencePreamble(0, '3:2'), /not supported/);
});

test('fetchWithTimeout rejects with a timeout message when the fetch never settles', async () => {
  const never = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(fetchWithTimeout(never, 'https://x', {}, 20), /timeout after 0s/);
});

function fakeFetch(status, body) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body }; };
  f.calls = calls;
  return f;
}
const never = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));

test('gemini generate posts text + inlineData refs, asks for a 16:9 IMAGE, and writes the returned image', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-gem-'));
  writeFileSync(join(dir, 'ref.png'), PNG_1x1);
  const fetch = fakeFetch(200, { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: PNG_1x1.toString('base64') } }] } }] });
  const out = join(dir, 'raw', '01.png');
  const r = await gemini.generate({ prompt: 'blob doing taxes', refs: ['ref.png'], out, cwd: dir, model: 'gemini-3.1-flash-image', env: { GEMINI_API_KEY: 'sekrit' }, fetch });
  assert.equal(r.ok, true);
  assert.ok(existsSync(out));
  assert.deepEqual(readFileSync(out), PNG_1x1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent');
  assert.equal(init.headers['x-goog-api-key'], 'sekrit');
  const body = JSON.parse(init.body);
  assert.match(body.contents[0].parts[0].text, /style references.*Landscape 16:9.*blob doing taxes/s);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.deepEqual(body.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } });
});

test('gemini generate asks for the requested aspect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-gem-'));
  const fetch = fakeFetch(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1x1.toString('base64') } }] } }] });
  await gemini.generate({ prompt: 'blob', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gemini-3.1-flash-image', aspect: '4:5', env: { GEMINI_API_KEY: 'k' }, fetch });
  const body = JSON.parse(fetch.calls[0].init.body);
  assert.equal(body.generationConfig.imageConfig.aspectRatio, '4:5');
  assert.match(body.contents[0].parts[0].text, /^Portrait 4:5\. blob$/);
});

test('gemini generate reports a rejected key with the env var name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-gem-'));
  const r = await gemini.generate({ prompt: 'x', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gemini-3.1-flash-image', env: { GEMINI_API_KEY: 'bad' }, fetch: fakeFetch(403, '{"error":"API key not valid"}') });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /HTTP 403.*API key not valid.*check GEMINI_API_KEY/s);
});

test('gemini generate reports a response with no image using the finishReason or text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-gem-'));
  const r = await gemini.generate({ prompt: 'x', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gemini-3.1-flash-image', env: { GEMINI_API_KEY: 'k' }, fetch: fakeFetch(200, { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'nope' }] } }] }) });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /gemini returned no image: nope/);
});

test('gemini generate maps a timeout to a timeout message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-gem-'));
  const r = await gemini.generate({ prompt: 'x', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gemini-3.1-flash-image', env: { GEMINI_API_KEY: 'k' }, fetch: never, timeoutMs: 10 });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /timeout after 0s/);
});

test('openai generate with refs posts multipart to images/edits with one image[] per ref', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-oai-'));
  writeFileSync(join(dir, 'a.png'), PNG_1x1);
  writeFileSync(join(dir, 'b.png'), PNG_1x1);
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64') }] });
  const out = join(dir, 'raw', '01.png');
  const r = await openai.generate({ prompt: 'blob', refs: ['a.png', 'b.png'], out, cwd: dir, model: 'gpt-image-2', quality: 'low', env: { OPENAI_API_KEY: 'sk' }, fetch });
  assert.equal(r.ok, true);
  assert.deepEqual(readFileSync(out), PNG_1x1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/images/edits');
  assert.equal(init.headers.Authorization, 'Bearer sk');
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.getAll('image[]').length, 2);
  assert.equal(init.body.get('model'), 'gpt-image-2');
  assert.equal(init.body.get('size'), '1536x1024');
  assert.equal(init.body.get('quality'), 'low');
  assert.match(init.body.get('prompt'), /style references.*Landscape 16:9.*blob/s);
});

test('openai generate without refs posts JSON to images/generations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-oai-'));
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64') }] });
  const r = await openai.generate({ prompt: 'blob', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gpt-image-1-mini', quality: 'medium', env: { OPENAI_API_KEY: 'sk' }, fetch });
  assert.equal(r.ok, true);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/images/generations');
  assert.equal(init.headers['content-type'], 'application/json');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'gpt-image-1-mini');
  assert.equal(body.size, '1536x1024');
  assert.equal(body.quality, 'medium');
  assert.equal(body.n, 1);
  assert.match(body.prompt, /^Landscape 16:9\. blob$/);
});

test('openai generate maps the aspect to a supported size', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-oai-'));
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64') }] });
  await openai.generate({ prompt: 'blob', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gpt-image-2', quality: 'low', aspect: '1:1', env: { OPENAI_API_KEY: 'sk' }, fetch });
  const body = JSON.parse(fetch.calls[0].init.body);
  assert.equal(body.size, '1024x1024');
  assert.match(body.prompt, /^Square 1:1\. blob$/);
});

test('openai generate maps a 401 to a key hint and a timeout to a timeout message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-oai-'));
  const bad = await openai.generate({ prompt: 'x', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'gpt-image-2', quality: 'medium', env: { OPENAI_API_KEY: 'sk' }, fetch: fakeFetch(401, 'invalid api key') });
  assert.match(bad.stderr, /HTTP 401: invalid api key — check OPENAI_API_KEY/);
  const slow = await openai.generate({ prompt: 'x', refs: [], out: join(dir, '02.png'), cwd: dir, model: 'gpt-image-2', quality: 'medium', env: { OPENAI_API_KEY: 'sk' }, fetch: never, timeoutMs: 10 });
  assert.equal(slow.ok, false);
  assert.match(slow.stderr, /timeout after 0s/);
});

test('openrouter generate posts JSON to /api/v1/images with data-URL references and 16:9, writes the image, and reports the real cost', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-or-'));
  writeFileSync(join(dir, 'a.png'), PNG_1x1);
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64'), media_type: 'image/png' }], usage: { cost: 0.0412 } });
  const out = join(dir, 'raw', '01.png');
  const r = await openrouter.generate({ prompt: 'blob', refs: ['a.png'], out, cwd: dir, model: 'google/gemini-3.1-flash-image', env: { OPENROUTER_API_KEY: 'or' }, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.usd, 0.0412);
  assert.deepEqual(readFileSync(out), PNG_1x1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://openrouter.ai/api/v1/images');
  assert.equal(init.headers.Authorization, 'Bearer or');
  assert.equal(init.headers['content-type'], 'application/json');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'google/gemini-3.1-flash-image');
  assert.equal(body.aspect_ratio, '16:9');
  assert.equal(body.resolution, '1K');
  assert.equal(body.n, 1);
  assert.match(body.prompt, /style references.*Landscape 16:9.*blob/s);
  assert.deepEqual(body.input_references, [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_1x1.toString('base64')}` } }]);
});

test('openrouter generate sends the requested aspect_ratio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-or-'));
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64') }] });
  await openrouter.generate({ prompt: 'blob', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'google/gemini-3.1-flash-image', aspect: '1:1', env: { OPENROUTER_API_KEY: 'or' }, fetch });
  const body = JSON.parse(fetch.calls[0].init.body);
  assert.equal(body.aspect_ratio, '1:1');
});

test('openrouter generate omits input_references when there are no refs and maps a 401 to a key hint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-or-'));
  const fetch = fakeFetch(200, { data: [{ b64_json: PNG_1x1.toString('base64') }] });
  const r = await openrouter.generate({ prompt: 'blob', refs: [], out: join(dir, '01.png'), cwd: dir, model: 'openai/gpt-image-2', env: { OPENROUTER_API_KEY: 'or' }, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.usd, undefined);
  assert.equal('input_references' in JSON.parse(fetch.calls[0].init.body), false);
  const bad = await openrouter.generate({ prompt: 'x', refs: [], out: join(dir, '02.png'), cwd: dir, model: 'openai/gpt-image-2', env: { OPENROUTER_API_KEY: 'or' }, fetch: fakeFetch(401, '{"error":{"message":"No auth credentials found"}}') });
  assert.equal(bad.ok, false);
  assert.match(bad.stderr, /HTTP 401.*No auth credentials.*check OPENROUTER_API_KEY/s);
});

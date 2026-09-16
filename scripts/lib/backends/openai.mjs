import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fetchWithTimeout, refsToParts, httpFailure, referencePreamble } from './http.mjs';
import { DEFAULT_ASPECT, openaiAspectSize } from '../aspect.mjs';

export const name = 'openai-api';
export const KEY_VAR = 'OPENAI_API_KEY';
export const ENDPOINT = 'https://api.openai.com/v1/images';

// Sync and offline: presence of the key is the whole check. The key is validated by the first
// real request; a 401/403 there is reported as "check OPENAI_API_KEY".
export function detect({ env = process.env } = {}) {
  if (!env[KEY_VAR]) return { ready: false, note: `${KEY_VAR} not set`, problems: [`${KEY_VAR} is not set`] };
  return { ready: true, note: '', problems: [] };
}

// With references the only endpoint that accepts input images is images/edits (multipart);
// without them a plain JSON images/generations call is enough. gpt-image only accepts three fixed
// sizes, so `aspect` is mapped to the closest one (see lib/aspect.mjs); label.mjs positions
// everything as fractions of the real image size, so nothing downstream depends on the exact ratio.
export function buildOpenAIRequest({ prompt, parts, model, quality, apiKey, aspect = DEFAULT_ASPECT }) {
  const fullPrompt = referencePreamble(parts.length, aspect) + prompt;
  const size = openaiAspectSize(aspect);
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (!parts.length) {
    return { url: `${ENDPOINT}/generations`, init: { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt: fullPrompt, size, quality, n: 1 }) } };
  }
  const form = new FormData();
  form.set('model', model); form.set('prompt', fullPrompt); form.set('size', size); form.set('quality', quality); form.set('n', '1');
  for (const p of parts) form.append('image[]', new Blob([Buffer.from(p.data, 'base64')], { type: p.mime }), basename(p.path));
  return { url: `${ENDPOINT}/edits`, init: { method: 'POST', headers, body: form } };
}

export async function generate({ prompt, refs = [], out, cwd, model, quality = 'medium', aspect = DEFAULT_ASPECT, env = process.env, fetch = globalThis.fetch, timeoutMs = 120_000 }) {
  const fail = (stderr) => ({ ok: false, backend: name, out, stderr });
  try {
    const { url, init } = buildOpenAIRequest({ prompt, parts: refsToParts(refs, cwd), model, quality, aspect, apiKey: env[KEY_VAR] });
    const res = await fetchWithTimeout(fetch, url, init, timeoutMs);
    if (!res.ok) return fail(httpFailure(res.status, await res.text(), KEY_VAR));
    const json = await res.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return fail(`openai returned no image: ${JSON.stringify(json).slice(0, 500)}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(b64, 'base64'));
    return { ok: true, backend: name, out };
  } catch (err) {
    return fail(err.message);
  }
}

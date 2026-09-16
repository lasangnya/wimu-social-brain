import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchWithTimeout, refsToParts, httpFailure, referencePreamble } from './http.mjs';
import { DEFAULT_ASPECT, normalizeAspect } from '../aspect.mjs';

export const name = 'openrouter';
export const KEY_VAR = 'OPENROUTER_API_KEY';
// OpenRouter's dedicated image endpoint (not chat/completions): one JSON shape for every vendor,
// references as data URLs, and the response carries the real `usage.cost`.
// Model catalogue: GET https://openrouter.ai/api/v1/images/models
export const ENDPOINT = 'https://openrouter.ai/api/v1/images';

// Sync and offline: presence of the key is the whole check. The key is validated by the first
// real request; a 401/403 there is reported as "check OPENROUTER_API_KEY".
export function detect({ env = process.env } = {}) {
  if (!env[KEY_VAR]) return { ready: false, note: `${KEY_VAR} not set`, problems: [`${KEY_VAR} is not set`] };
  return { ready: true, note: '', problems: [] };
}

export function buildOpenRouterRequest({ prompt, parts, model, apiKey, aspect = DEFAULT_ASPECT }) {
  const body = { model, prompt: referencePreamble(parts.length, aspect) + prompt, aspect_ratio: normalizeAspect(aspect), resolution: '1K', n: 1 };
  if (parts.length) body.input_references = parts.map((p) => ({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}` } }));
  return {
    url: ENDPOINT,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://github.com/ShahriarBijoy/show-me-how', 'X-Title': 'show-me-how' },
      body: JSON.stringify(body),
    },
  };
}

export async function generate({ prompt, refs = [], out, cwd, model, aspect = DEFAULT_ASPECT, env = process.env, fetch = globalThis.fetch, timeoutMs = 120_000 }) {
  const fail = (stderr) => ({ ok: false, backend: name, out, stderr });
  try {
    const { url, init } = buildOpenRouterRequest({ prompt, parts: refsToParts(refs, cwd), model, aspect, apiKey: env[KEY_VAR] });
    const res = await fetchWithTimeout(fetch, url, init, timeoutMs);
    if (!res.ok) return fail(httpFailure(res.status, await res.text(), KEY_VAR));
    const json = await res.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return fail(`openrouter returned no image: ${JSON.stringify(json).slice(0, 500)}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(b64, 'base64'));
    const usd = typeof json.usage?.cost === 'number' ? json.usage.cost : undefined;
    return { ok: true, backend: name, out, usd };
  } catch (err) {
    return fail(err.message);
  }
}

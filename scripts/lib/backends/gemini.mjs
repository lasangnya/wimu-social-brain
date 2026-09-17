import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchWithTimeout, refsToParts, httpFailure, referencePreamble } from './http.mjs';
import { DEFAULT_ASPECT, normalizeAspect } from '../aspect.mjs';

export const name = 'gemini-api';
export const KEY_VAR = 'GEMINI_API_KEY';
export const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Sync and offline: presence of the key is the whole check. The key is validated by the first
// real request; a 401/403 there is reported as "check GEMINI_API_KEY".
export function detect({ env = process.env } = {}) {
  if (!env[KEY_VAR]) return { ready: false, note: `${KEY_VAR} not set`, problems: [`${KEY_VAR} is not set`] };
  return { ready: true, note: '', problems: [] };
}

// Text part first, then every reference as inline image data. `responseModalities: IMAGE` asks
// the model for a picture only; the aspect ratio matches what codex is asked for.
export function buildGeminiRequest({ prompt, parts, model, apiKey, aspect = DEFAULT_ASPECT }) {
  const body = {
    contents: [{ parts: [{ text: referencePreamble(parts.length, aspect) + prompt }, ...parts.map((p) => ({ inlineData: { mimeType: p.mime, data: p.data } }))] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: normalizeAspect(aspect) } },
  };
  return { url: `${ENDPOINT}/${model}:generateContent`, init: { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) } };
}

export async function generate({ prompt, refs = [], out, cwd, model, aspect = DEFAULT_ASPECT, env = process.env, fetch = globalThis.fetch, timeoutMs = 120_000 }) {
  const fail = (stderr) => ({ ok: false, backend: name, out, stderr });
  try {
    const { url, init } = buildGeminiRequest({ prompt, parts: refsToParts(refs, cwd), model, aspect, apiKey: env[KEY_VAR] });
    const res = await fetchWithTimeout(fetch, url, init, timeoutMs);
    if (!res.ok) return fail(httpFailure(res.status, await res.text(), KEY_VAR));
    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((p) => p.inlineData?.data);
    if (!image) {
      const why = parts.find((p) => p.text)?.text ?? json.candidates?.[0]?.finishReason ?? 'empty response';
      return fail(`gemini returned no image: ${String(why).slice(0, 500)}`);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(image.inlineData.data, 'base64'));
    return { ok: true, backend: name, out };
  } catch (err) {
    return fail(err.message);
  }
}

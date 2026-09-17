import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { DEFAULT_ASPECT, aspectPhrase } from '../aspect.mjs';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export function refsToParts(refs = [], cwd = process.cwd()) {
  return refs.map((r) => {
    const path = resolve(cwd, r);
    return { path, mime: MIME[extname(path).toLowerCase()] ?? 'image/png', data: readFileSync(path).toString('base64') };
  });
}

// Same wording codex gets, so a reference is treated as a style anchor, not an edit target.
// `aspect` defaults to 16:9, which is what every pre-social caller asks for; the social post
// skill passes 1:1 / 4:5 instead.
export function referencePreamble(refCount, aspect = DEFAULT_ASPECT) {
  return (refCount ? 'The attached image(s) are style references for the mascot character -- reference role, not edit targets. ' : '') + `${aspectPhrase(aspect)}. `;
}

export function httpFailure(status, bodyText = '', keyVar = '') {
  let msg = `HTTP ${status}: ${String(bodyText).slice(-500)}`;
  if ((status === 401 || status === 403) && keyVar) msg += ` — check ${keyVar}`;
  if (status === 429) msg += ' — rate limited, retry later';
  return msg;
}

// `fetchImpl` is injected so tests never touch the network. A generation can take a minute on a
// busy model, so the default timeout is generous; the message reports whole seconds.
export async function fetchWithTimeout(fetchImpl, url, init = {}, ms = 120_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ac.signal });
  } catch (err) {
    if (ac.signal.aborted) throw new Error(`timeout after ${Math.round(ms / 1000)}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

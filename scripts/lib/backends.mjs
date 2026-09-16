import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeAspect } from './aspect.mjs';
import * as codex from './backends/codex.mjs';
import * as gemini from './backends/gemini.mjs';
import * as openai from './backends/openai.mjs';
import * as openrouter from './backends/openrouter.mjs';
import * as manual from './backends/manual.mjs';

export { defaultWhich, defaultRun, defaultProbe, codexProblems, buildCodexArgs, insideCodexSandbox, CODEX_MIN_VERSION, CODEX_INSTALL_HINT, CODEX_SANDBOX_HINT } from './backends/codex.mjs';

// Detection order for `backend: auto`. Subscription first (no per-image charge), then the APIs.
export const ORDER = ['codex', 'gemini-api', 'openai-api', 'openrouter'];
export const BACKENDS = { codex, 'gemini-api': gemini, 'openai-api': openai, openrouter, manual };

// Single source of truth for model ids and rough cost. Gemini: list price per 1K image.
// OpenAI: token-priced; these are per-image figures at 1536x1024 with 1-3 reference images,
// rounded up so a doc estimate errs high. Every place that shows them says "approx." and
// cites PRICES_AS_OF. See docs/research/image-backends.md for sources.
export const PRICES_AS_OF = '2026-08';
export const MODELS = {
  'gemini-api': [
    { id: 'gemini-3.1-flash-image',      label: 'Nano Banana 2',      usdPerPanel: 0.067, default: true },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', usdPerPanel: 0.034 },
    { id: 'gemini-3-pro-image',          label: 'Nano Banana Pro',    usdPerPanel: 0.134 },
  ],
  'openai-api': [
    { id: 'gpt-image-2',      label: 'GPT Image 2',      usdPerPanel: { low: 0.02, medium: 0.10, high: 0.30 }, default: true },
    { id: 'gpt-image-1.5',    label: 'GPT Image 1.5',    usdPerPanel: { low: 0.02, medium: 0.10, high: 0.30 } },
    { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini', usdPerPanel: { low: 0.01, medium: 0.02, high: 0.05 } },
  ],
  // OpenRouter passes vendor list prices through. Four curated picks (image-edit arena rank,
  // price at 1K, reference limit, 16:9 support -- see docs/research/image-backends.md); any other
  // `vendor/model` id from https://openrouter.ai/api/v1/images/models is accepted, and the
  // response reports the real cost either way.
  openrouter: [
    { id: 'google/gemini-3.1-flash-image',      label: 'Nano Banana 2',      usdPerPanel: 0.067, default: true },
    { id: 'openai/gpt-image-2',                 label: 'GPT Image 2',        usdPerPanel: 0.10 },
    { id: 'bytedance-seed/seedream-5-0-pro',    label: 'Seedream 5.0 Pro',   usdPerPanel: 0.045 },
    { id: 'google/gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', usdPerPanel: 0.034 },
  ],
};

// '' means the backend's default model. Unknown ids are rejected here, at detect time, so a typo
// in wimu-social-brain.md fails before the user has waited on a generation.
export function resolveModel(backend, imageModel = '') {
  const list = MODELS[backend];
  if (!list) return '';
  if (!imageModel) return list.find((m) => m.default).id;
  if (backend === 'openrouter') {
    if (!/^[\w.-]+\/[\w.:-]+$/.test(imageModel)) throw new Error(`wimu-social-brain.md: image_model "${imageModel}" is not an openrouter model id (expected vendor/model, e.g. ${list.map((m) => m.id).slice(0, 2).join(' | ')})`);
    return imageModel;
  }
  if (!list.some((m) => m.id === imageModel)) {
    throw new Error(`wimu-social-brain.md: image_model "${imageModel}" is not a ${backend} model. Use ${list.map((m) => m.id).join(' | ')}`);
  }
  return imageModel;
}

export function estimateUsd(backend, modelId, quality = 'medium') {
  const m = MODELS[backend]?.find((x) => x.id === modelId);
  if (!m) return undefined;
  return typeof m.usdPerPanel === 'number' ? m.usdPerPanel : m.usdPerPanel[quality];
}

function apiNote(backend, modelId, quality) {
  const q = backend === 'openai-api' ? ` ${quality}` : '';
  const usd = estimateUsd(backend, modelId, quality);
  const cost = usd === undefined ? 'cost reported after each panel' : `~$${usd.toFixed(2)}/panel`;
  return `${backend} (${modelId}${q}, ${cost})`;
}

export const NOTES = {
  codex: 'codex (ChatGPT subscription)',
  manual: 'manual (no image CLI found: prompts will be written to files for you to run)',
};

function known(name) { return name === 'auto' || name in BACKENDS; }

export function detectBackend({ pinned = 'auto', model = '', quality = 'medium', env = process.env, which = codex.defaultWhich, probe = codex.defaultProbe } = {}) {
  if (!known(pinned)) throw new Error(`Unknown backend "${pinned}". Use auto | ${Object.keys(BACKENDS).join(' | ')}`);
  if (pinned === 'manual') return { name: 'manual', note: 'manual (pinned in wimu-social-brain.md)' };
  const finish = (name, d) => {
    if (!(name in MODELS)) return { name, note: d.note };
    const id = resolveModel(name, model);
    return { name, note: apiNote(name, id, quality), model: id };
  };
  if (pinned !== 'auto') {
    const d = BACKENDS[pinned].detect({ which, probe, env });
    // A pin normally fails loudly: the user chose a backend and it is not usable, so they must fix
    // config or environment. Inside the Codex sandbox there is nothing to fix -- the harness itself
    // hides codex -- and the skill can still draw with the harness's native image tool, so report
    // the same sandbox note the auto path prints and let the run continue.
    if (!d.ready && d.sandboxed) return { name: 'manual', note: `manual (codex pinned in wimu-social-brain.md, but ${d.note}). Run /wimu-social-brain:init to set up automatic images.` };
    if (!d.ready) throw new Error(`wimu-social-brain.md pins backend: ${pinned} but ${d.problems.join('; ')}`);
    return finish(pinned, d);
  }
  const reasons = [];
  for (const name of ORDER) {
    const d = BACKENDS[name].detect({ which, probe, env });
    if (d.ready) return finish(name, d);
    reasons.push(d.note);
  }
  return { name: 'manual', note: `manual (${reasons.join('; ')}). Run /wimu-social-brain:init to set up automatic images.` };
}

export async function generate({ backend, prompt, refs = [], out, cwd = process.cwd(), aspect, run, codexModel = '', codexReasoning = 'low', imageModel = '', imageApiQuality = 'medium', env = process.env, fetch }) {
  out = resolve(cwd, out);
  mkdirSync(dirname(out), { recursive: true });
  // Validate the ratio here, once, for every backend: an unknown value should fail before a slow
  // generation (and before a manual write), the same way an unknown image_model fails at detect.
  const ratio = normalizeAspect(aspect);
  const b = BACKENDS[backend];
  if (!b) throw new Error(`Unknown backend ${backend}`);
  if (backend in MODELS) {
    const model = resolveModel(backend, imageModel);
    const r = await b.generate({ prompt, refs, out, cwd, model, quality: imageApiQuality, aspect: ratio, env, fetch });
    return { ...r, estimatedUsd: estimateUsd(backend, model, imageApiQuality) };
  }
  return b.generate({ prompt, refs, out, cwd, run, codexModel, codexReasoning, aspect: ratio });
}

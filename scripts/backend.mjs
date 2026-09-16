#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { loadDesign } from './lib/design.mjs';
import { detectBackend, generate } from './lib/backends.mjs';

const [, , cmd, ...rest] = process.argv;
const opt = {}; const refs = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--ref') refs.push(rest[++i]);
  else if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
}
const cwd = opt.cwd || process.cwd();
const design = loadDesign(cwd);

const detectOpts = { pinned: design.output.backend, model: design.output.imageModel, quality: design.output.imageApiQuality };

if (cmd === 'detect') {
  const b = detectBackend(detectOpts);
  console.log(`backend: ${b.note}`);
} else if (cmd === 'generate') {
  // backends.md promises callers "generate always exits 0; read success from the JSON `ok` field".
  // A bad show-me-how.md (unknown backend, unsupported codex_reasoning) throws before generate() can
  // return, which would break that contract and strand the skill with an unparseable crash. Report
  // the failure in the same JSON shape instead. `detect` deliberately keeps throwing -- SKILL.md
  // handles that path and a caller needs the loud failure there.
  let backendName = 'unknown';
  try {
    backendName = detectBackend(detectOpts).name;
    const prompt = readFileSync(opt['prompt-file'], 'utf8');
    const r = await generate({
      backend: backendName, prompt, refs, out: opt.out, cwd, aspect: opt.aspect,
      codexModel: design.output.codexModel, codexReasoning: design.output.codexReasoning,
      imageModel: design.output.imageModel, imageApiQuality: design.output.imageApiQuality,
    });
    console.log(JSON.stringify(r));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, backend: backendName, out: opt.out, stderr: err.message }));
  }
} else {
  console.error('usage: backend.mjs detect | generate --prompt-file P --out OUT [--ref R]... [--aspect 1:1|4:5|9:16|16:9] [--cwd DIR]');
  process.exit(2);
}

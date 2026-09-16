import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { detectBackend, generate, buildCodexArgs, defaultWhich, codexProblems, CODEX_MIN_VERSION, MODELS, resolveModel, estimateUsd } from '../scripts/lib/backends.mjs';

// true when `flag` appears immediately followed by `value` somewhere in argv
const hasPair = (args, flag, value) => args.some((a, i) => a === flag && args[i + 1] === value);

const ready = () => ({ version: CODEX_MIN_VERSION, loggedIn: true });

test('detect prefers codex when present, current and logged in', () => {
  const r = detectBackend({ env: {}, which: (c) => c === 'codex', probe: ready });
  assert.equal(r.name, 'codex');
  assert.match(r.note, /subscription/i);
  assert.ok(r.note.includes(CODEX_MIN_VERSION));
});

test('detect falls back to manual with an install hint when codex is missing', () => {
  const r = detectBackend({ env: {}, which: () => false, probe: () => { throw new Error('must not probe'); } });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /codex not found/);
  assert.match(r.note, /npm i -g @openai\/codex/);
  assert.match(r.note, /paid ChatGPT plan/i);
});

test('detect falls back to manual when codex is installed but not logged in', () => {
  const r = detectBackend({ env: {}, which: () => true, probe: () => ({ version: CODEX_MIN_VERSION, loggedIn: false }) });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /codex found but/);
  assert.match(r.note, /codex login/);
});

test('detect falls back to manual when codex is too old', () => {
  const r = detectBackend({ env: {}, which: () => true, probe: () => ({ version: '0.120.3', loggedIn: true }) });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /0\.120\.3 is too old/);
  assert.match(r.note, /@openai\/codex@latest/);
});

test('codexProblems: newer versions pass, missing version fails', () => {
  assert.deepEqual(codexProblems({ version: '1.2.0', loggedIn: true }), []);
  assert.deepEqual(codexProblems({ version: '0.150.0', loggedIn: true }), []);
  assert.equal(codexProblems({ version: null, loggedIn: true }).length, 1);
  assert.equal(codexProblems({ version: null, loggedIn: false }).length, 2);
});

test('pinned backend wins even if missing (error surfaces)', () => {
  assert.throws(() => detectBackend({ env: {}, pinned: 'codex', which: () => false }), /codex.*not found.*npm i -g @openai\/codex/is);
  assert.throws(() => detectBackend({ env: {}, pinned: 'codex', which: () => true, probe: () => ({ version: CODEX_MIN_VERSION, loggedIn: false }) }), /pins backend: codex but.*codex login/s);
  assert.equal(detectBackend({ env: {}, pinned: 'manual', which: () => true }).name, 'manual');
  assert.match(detectBackend({ env: {}, pinned: 'manual', which: () => true }).note, /pinned/);
  assert.throws(() => detectBackend({ pinned: 'dalle' }), /Unknown backend/);
});

test('buildCodexArgs includes refs and out path in prompt', () => {
  const args = buildCodexArgs({ prompt: 'draw x', refs: ['a.png', 'b.png'], out: 'raw/01.png', cwd: '/w' });
  // -C is the shot's own output folder, not the repo root: `-s workspace-write` makes -C the
  // writable sandbox, so scoping it to raw/ keeps a drawing run out of the rest of the repo.
  assert.deepEqual(args.slice(0, 9), ['exec', '-C', dirname(resolve('/w', 'raw/01.png')), '-s', 'workspace-write', '--skip-git-repo-check', '--enable', 'image_generation', '-i']);
  // ...which in turn means every path handed to codex must be absolute, since it no longer runs
  // from the repo root a relative ref would be resolved against.
  assert.ok(args.includes(resolve('/w', 'a.png')) && args.includes(resolve('/w', 'b.png')));
  // `-i, --image <FILE>...` is greedy: if a ref were the last flag before the positional prompt,
  // clap would swallow the instruction as another filename. Something non-greedy must sit between.
  assert.ok(args.indexOf('-c') > args.lastIndexOf('-i'), 'a -c flag must terminate the -i list');
  assert.ok(args.at(-1).includes(resolve('/w', 'raw/01.png')));
  assert.match(args.at(-1), /draw x/);
});

test('buildCodexArgs enables the image_generation feature, without which codex has no image tool', () => {
  assert.ok(hasPair(buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w' }), '--enable', 'image_generation'));
});

test('buildCodexArgs names the $imagegen skill, forbids code-drawn art, and asks for a copy to out', () => {
  const instruction = buildCodexArgs({ prompt: 'p', out: 'raw/o.png', cwd: '/w' }).at(-1);
  assert.match(instruction, /\$imagegen/);
  // image_gen has no destination argument; it writes under $CODEX_HOME and the agent copies it out
  assert.match(instruction, /generated_images/);
  assert.ok(instruction.includes(`copy that file to exactly this path: "${resolve('/w', 'raw/o.png')}"`));
  assert.match(instruction, /Do not substitute SVG/);
  assert.match(instruction, /Do not use the scripts\/image_gen\.py CLI fallback/);
});

test('buildCodexArgs always sets the reasoning effort and omits -m unless a model is given', () => {
  const noModel = buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w', codexReasoning: 'low' });
  assert.ok(hasPair(noModel, '-c', 'model_reasoning_effort=low'));
  assert.ok(!noModel.includes('-m'));

  const withModel = buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w', codexModel: 'gpt-5.1-codex-max', codexReasoning: 'high' });
  assert.ok(hasPair(withModel, '-m', 'gpt-5.1-codex-max'));
  assert.ok(hasPair(withModel, '-c', 'model_reasoning_effort=high'));
});

test('buildCodexArgs falls back to low for an empty reasoning effort', () => {
  for (const empty of ['', undefined, null]) {
    assert.ok(hasPair(buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w', codexReasoning: empty }), '-c', 'model_reasoning_effort=low'));
  }
});

test('buildCodexArgs rejects a reasoning effort codex would not understand', () => {
  assert.throws(
    () => buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w', codexReasoning: 'extreme' }),
    // A regex is a trap here: `minimal | low | medium | high` parses as alternation, so a pattern
    // meant to demand the whole legal set happily matches any message containing " low ".
    (e) => /codex_reasoning/.test(e.message)
      && e.message.includes('"extreme"')
      && e.message.includes('minimal | low | medium | high'),
  );
});

test('buildCodexArgs accepts every effort codex supports', () => {
  for (const e of ['minimal', 'low', 'medium', 'high']) {
    assert.ok(hasPair(buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w', codexReasoning: e }), '-c', `model_reasoning_effort=${e}`));
  }
});

test('buildCodexArgs defaults the reasoning effort to low', () => {
  assert.ok(hasPair(buildCodexArgs({ prompt: 'p', out: 'o.png', cwd: '/w' }), '-c', 'model_reasoning_effort=low'));
});

test('generate threads codexModel/codexReasoning through to the codex argv', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const out = join(dir, '01.png');
  let seen;
  const run = async (cmd, args) => { seen = args; writeFileSync(out, 'png'); return { code: 0, stdout: '', stderr: '' }; };
  await generate({ backend: 'codex', prompt: 'p', out, cwd: dir, run, codexModel: 'gpt-5.1-codex', codexReasoning: 'medium' });
  assert.ok(hasPair(seen, '-m', 'gpt-5.1-codex'));
  assert.ok(hasPair(seen, '-c', 'model_reasoning_effort=medium'));
});

test('manual generate writes prompt file and returns ok=false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const out = join(dir, '01.png');
  const r = await generate({ backend: 'manual', prompt: 'hello', out, cwd: dir });
  assert.equal(r.ok, false);
  assert.ok(existsSync(out + '.prompt.txt'));
  assert.match(readFileSync(out + '.prompt.txt', 'utf8'), /hello/);
});

test('codex generate runs codex and reports ok when file appears', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const out = join(dir, '01.png');
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, args]); const { writeFileSync } = await import('node:fs'); writeFileSync(out, 'png'); return { code: 0, stdout: '', stderr: '' }; };
  const r = await generate({ backend: 'codex', prompt: 'p', out, cwd: dir, run });
  assert.equal(r.ok, true);
  assert.equal(calls[0][0], 'codex');
});

test('codex generate passes a multi-line prompt containing double quotes intact to run()', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const out = join(dir, '01.png');
  const tricky = 'draw "Flow" the blob\nline two with "quotes" and `backticks` and $vars';
  let seenArgs;
  const run = async (cmd, args) => {
    seenArgs = args;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, 'png');
    return { code: 0, stdout: '', stderr: '' };
  };
  const r = await generate({ backend: 'codex', prompt: tricky, out, cwd: dir, run });
  assert.equal(r.ok, true);
  // the instruction (last arg) must contain the tricky prompt byte-for-byte, unmangled
  assert.ok(seenArgs.at(-1).includes(tricky));
});

test('defaultRun passes a tricky argument (quotes, $vars, backticks, cmd.exe metachars) through a real spawned process', async () => {
  const { defaultRun } = await import('../scripts/lib/backends.mjs');
  const { writeFileSync, mkdtempSync: mkdtemp, readFileSync: readFile } = await import('node:fs');
  const dir = mkdtemp(join(tmpdir(), 'smh-echo-'));
  const echoScript = join(dir, 'echo-argv.mjs');
  // Dumps its argv (everything after the script path) to a JSON file, so we can assert the
  // tricky argument arrived intact through whatever spawn strategy defaultRun uses on this
  // platform (see scripts/lib/backends.mjs for why win32 needs manual cmd.exe escaping).
  writeFileSync(echoScript, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));\n`);
  const tricky = 'line one\nline two with "double quotes" and $vars and `backticks` and 100% done and a & b and ^caret and | pipe';
  const r = await defaultRun(process.execPath, [echoScript, 'exec', tricky], { cwd: dir });
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}, stderr: ${r.stderr}`);
  const recorded = JSON.parse(readFile(join(dir, 'argv.json'), 'utf8'));
  assert.equal(recorded[0], 'exec');
  if (process.platform === 'win32') {
    // cmd.exe cannot carry a literal newline in an argument under any escaping scheme;
    // defaultRun collapses newlines to spaces on win32 as a documented tradeoff. Everything
    // else -- quotes, $vars, backticks, and cmd.exe metacharacters -- must survive exactly.
    assert.equal(recorded[1], tricky.replace(/\r?\n/g, ' '));
  } else {
    assert.equal(recorded[1], tricky);
  }
});

// Shared helper for the backslash-edge-case tests below: spawns a real child process via
// defaultRun and returns the argv it actually received, so these tests exercise the real
// win32 escaping path end-to-end rather than just calling escapeArgForWindowsShell directly.
async function realSpawnArgv(arg) {
  const { defaultRun } = await import('../scripts/lib/backends.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'smh-bs-'));
  const echoScript = join(dir, 'echo-argv.mjs');
  writeFileSync(echoScript, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));\n`);
  const r = await defaultRun(process.execPath, [echoScript, arg], { cwd: dir });
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}, stderr: ${r.stderr}`);
  return JSON.parse(readFileSync(join(dir, 'argv.json'), 'utf8'));
}

// These only exercise defaultRun's win32 escaping path (escapeArgForWindowsShell); on POSIX,
// defaultRun uses plain shell:false argv passing, which cannot mangle backslashes, so there's
// nothing platform-specific to verify there.
test('defaultRun preserves two trailing backslashes (real spawn)', { skip: process.platform !== 'win32' }, async () => {
  const arg = 'C:\\some\\dir\\\\';
  const recorded = await realSpawnArgv(arg);
  assert.deepEqual(recorded, [arg]);
});

test('defaultRun preserves an even run of backslashes immediately before an embedded quote (real spawn)', { skip: process.platform !== 'win32' }, async () => {
  const arg = 'say \\\\"hi\\\\" now'; // two literal backslashes before each embedded quote
  const recorded = await realSpawnArgv(arg);
  assert.deepEqual(recorded, [arg]);
});

test('defaultRun preserves a single trailing backslash, e.g. a Windows dir path (real spawn)', { skip: process.platform !== 'win32' }, async () => {
  const arg = 'C:\\Users\\someone\\';
  const recorded = await realSpawnArgv(arg);
  assert.deepEqual(recorded, [arg]);
});

// Regression test for a silent hang: codex exec reads stdin when stdin is a pipe, and the default
// child stdio leaves that pipe open forever. The child below only exits once its stdin reaches EOF,
// so if defaultRun ever goes back to piping stdin this test hangs instead of failing fast.
test('defaultRun gives the child a closed stdin so a CLI that reads stdin cannot hang', { timeout: 10_000 }, async () => {
  const { defaultRun } = await import('../scripts/lib/backends.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'smh-stdin-'));
  const script = join(dir, 'drain-stdin.mjs');
  writeFileSync(script, [
    "let n = 0;",
    "process.stdin.on('data', (d) => { n += d.length; });",
    "process.stdin.on('end', () => { console.log('EOF after ' + n + ' bytes'); });",
    "process.stdin.resume();",
  ].join('\n'));
  const r = await defaultRun(process.execPath, [script], { cwd: dir });
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}, stderr: ${r.stderr}`);
  assert.match(r.stdout, /EOF after 0 bytes/);
});

test('backend.mjs CLI detect prints codex or manual note', () => {
  const out = execFileSync(process.execPath, ['scripts/backend.mjs', 'detect']).toString();
  assert.match(out, /^backend: (codex \d+\.\d+\.\d+ \(ChatGPT subscription\)|manual \(codex (not found|found but)[^\n]*)\n$/);
});

// Helper: run the generate CLI in a temp cwd carrying the given wimu-social-brain.md, returning parsed JSON.
// execFileSync throws on a non-zero exit, so reaching the JSON.parse at all proves exit code 0.
function runGenerate(designMd, envOverride = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'smh-cli-'));
  writeFileSync(join(dir, 'wimu-social-brain.md'), designMd);
  const promptFile = join(dir, 'p.txt');
  writeFileSync(promptFile, 'a deadpan blob doing taxes');
  const out = join(dir, 'raw', '01.png');
  const stdout = execFileSync(process.execPath, [
    join(process.cwd(), 'scripts/backend.mjs'), 'generate',
    '--prompt-file', promptFile, '--out', out, '--cwd', dir,
  ], { env: { ...process.env, ...envOverride } }).toString();
  return { dir, out, result: JSON.parse(stdout) };
}

test('backend.mjs CLI generate reports an unknown backend as ok:false and still exits 0', () => {
  const { out, result } = runGenerate('## Output\nbackend: bogus\n');
  assert.equal(result.ok, false);
  assert.equal(result.backend, 'unknown'); // detection itself threw, so there is no name to report
  assert.equal(result.out, out);
  assert.match(result.stderr, /Unknown backend "bogus"/);
});

// Needs codex on PATH: the codex_reasoning check lives in buildCodexArgs, which only runs once
// detectBackend has resolved the pinned codex backend.
test('backend.mjs CLI generate reports a bad codex_reasoning as ok:false and still exits 0', { skip: !defaultWhich('codex') && 'codex not on PATH' }, () => {
  const { out, result } = runGenerate('## Output\nbackend: codex\ncodex_reasoning: extreme\n');
  assert.equal(result.ok, false);
  assert.equal(result.backend, 'codex');
  assert.equal(result.out, out);
  assert.match(result.stderr, /codex_reasoning/);
  assert.match(result.stderr, /extreme/);
});

test('backend.mjs CLI generate writes a prompt file and exits 0 when pinned to manual', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-cli-'));
  writeFileSync(join(dir, 'wimu-social-brain.md'), '## Output\nbackend: manual\n');
  const promptFile = join(dir, 'p.txt');
  writeFileSync(promptFile, 'a deadpan blob doing taxes');
  const out = join(dir, 'raw', '01.png');
  const stdout = execFileSync(process.execPath, [
    join(process.cwd(), 'scripts/backend.mjs'), 'generate',
    '--prompt-file', promptFile, '--out', out, '--cwd', dir,
  ]).toString();
  const result = JSON.parse(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.backend, 'manual');
  assert.ok(existsSync(out + '.prompt.txt'));
  assert.match(readFileSync(out + '.prompt.txt', 'utf8'), /deadpan blob doing taxes/);
});

// Manual resume: the user pastes the prompt into their own image tool, saves the result as `out`,
// then re-runs the same slash command. The second pass must recognise the saved shot instead of
// overwriting the prompt file and reporting failure again.
test('manual generate resumes when the image already exists, without rewriting the prompt file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-resume-'));
  const out = join(dir, '01.png');
  writeFileSync(out, 'png the user saved by hand');
  const promptFile = out + '.prompt.txt';
  writeFileSync(promptFile, 'ORIGINAL PROMPT');
  const r = await generate({ backend: 'manual', prompt: 'a different prompt', out, cwd: dir });
  assert.equal(r.ok, true);
  assert.equal(r.resumed, true);
  assert.equal(r.backend, 'manual');
  assert.equal(r.out, out);
  // the prompt file must be left exactly as it was -- not re-written from the new prompt
  assert.equal(readFileSync(promptFile, 'utf8'), 'ORIGINAL PROMPT');
});

// codex is spawned with `-s workspace-write`, which grants write access to the -C directory tree.
// Pointing -C at the repo root would let a drawing run touch any file in the user's repo, so the
// sandbox is scoped to the shot's own output folder instead. `cwd` still spawns from the repo.
test('buildCodexArgs sandboxes codex to the output folder, not the repo root', () => {
  const out = resolve('/w/docs/wimu-social-brain/topic/raw/01.png');
  const args = buildCodexArgs({ prompt: 'p', out, cwd: resolve('/w') });
  assert.equal(args[1], '-C');
  assert.equal(args[2], dirname(out));
  assert.notEqual(args[2], resolve('/w'));
});

const noCodex = { env: {}, which: () => false, probe: () => { throw new Error('must not probe'); } };

test('auto: codex wins over API keys when it is ready', () => {
  const r = detectBackend({ which: (c) => c === 'codex', probe: ready, env: { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' } });
  assert.equal(r.name, 'codex');
});

test('auto: GEMINI_API_KEY beats OPENAI_API_KEY when codex is absent', () => {
  const r = detectBackend({ ...noCodex, env: { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' } });
  assert.equal(r.name, 'gemini-api');
  assert.match(r.note, /gemini-api \(gemini-3\.1-flash-image, ~\$0\.07\/panel\)/);
});

test('auto: OPENAI_API_KEY alone picks openai-api with the configured model and quality', () => {
  const r = detectBackend({ ...noCodex, env: { OPENAI_API_KEY: 'o' }, model: 'gpt-image-1-mini', quality: 'low' });
  assert.equal(r.name, 'openai-api');
  assert.match(r.note, /openai-api \(gpt-image-1-mini low, ~\$0\.01\/panel\)/);
});

test('auto: nothing available lists what each candidate needs and points at /init', () => {
  const r = detectBackend({ ...noCodex, env: {} });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /codex not found/);
  assert.match(r.note, /GEMINI_API_KEY not set/);
  assert.match(r.note, /OPENAI_API_KEY not set/);
  assert.match(r.note, /\/wimu-social-brain:init/);
});

test('pinned API backend without its key throws naming the variable', () => {
  assert.throws(() => detectBackend({ pinned: 'gemini-api', env: {} }), /pins backend: gemini-api but GEMINI_API_KEY is not set/);
  assert.throws(() => detectBackend({ pinned: 'openai-api', env: {} }), /pins backend: openai-api but OPENAI_API_KEY is not set/);
});

test('unknown image_model for the resolved backend throws before any generation', () => {
  assert.throws(() => detectBackend({ pinned: 'gemini-api', env: { GEMINI_API_KEY: 'g' }, model: 'nope' }), /image_model "nope" is not a gemini-api model\. Use gemini-3\.1-flash-image \| gemini-3\.1-flash-lite-image \| gemini-3-pro-image/);
  assert.throws(() => detectBackend({ pinned: 'openai-api', env: { OPENAI_API_KEY: 'o' }, model: 'gemini-3-pro-image' }), /is not a openai-api model/);
});

test('resolveModel and estimateUsd', () => {
  assert.equal(resolveModel('gemini-api', ''), 'gemini-3.1-flash-image');
  assert.equal(resolveModel('openai-api', ''), 'gpt-image-2');
  assert.equal(estimateUsd('gemini-api', 'gemini-3.1-flash-lite-image'), 0.034);
  assert.equal(estimateUsd('openai-api', 'gpt-image-2', 'high'), 0.30);
  assert.equal(estimateUsd('codex', ''), undefined);
  assert.ok(MODELS['gemini-api'].some((m) => m.default));
});

test('generate dispatches to gemini-api with the resolved model and reports estimatedUsd', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }), text: async () => '' }; };
  const r = await generate({ backend: 'gemini-api', prompt: 'p', out: 'raw/01.png', cwd: dir, imageModel: '', env: { GEMINI_API_KEY: 'k' }, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.estimatedUsd, 0.067);
  assert.match(seen.url, /gemini-3\.1-flash-image:generateContent$/);
});

test('generate dispatches to openai-api honouring imageApiQuality and reports estimatedUsd', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AAAA' }] }), text: async () => '' }; };
  const r = await generate({ backend: 'openai-api', prompt: 'p', out: 'raw/01.png', cwd: dir, imageModel: 'gpt-image-1-mini', imageApiQuality: 'low', env: { OPENAI_API_KEY: 'k' }, fetch });
  assert.equal(r.estimatedUsd, 0.01);
  assert.equal(JSON.parse(seen.init.body).quality, 'low');
});

test('codex and manual results carry no estimatedUsd', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const r = await generate({ backend: 'manual', prompt: 'p', out: 'raw/01.png', cwd: dir });
  assert.equal(r.estimatedUsd, undefined);
});

test('backend.mjs CLI generate with a pinned gemini-api backend and no key reports ok:false naming the key, exit 0', () => {
  const { result } = runGenerate('## Output\nbackend: gemini-api\n', { GEMINI_API_KEY: '' });
  assert.equal(result.ok, false);
  assert.match(result.stderr, /GEMINI_API_KEY is not set/);
});

test('auto: OPENROUTER_API_KEY is the last resort before manual, and any vendor/model id is accepted for it', () => {
  const r = detectBackend({ ...noCodex, env: { OPENAI_API_KEY: 'o', OPENROUTER_API_KEY: 'r' } });
  assert.equal(r.name, 'openai-api');
  const o = detectBackend({ ...noCodex, env: { OPENROUTER_API_KEY: 'r' } });
  assert.equal(o.name, 'openrouter');
  assert.match(o.note, /openrouter \(google\/gemini-3\.1-flash-image, ~\$0\.07\/panel\)/);
  assert.equal(resolveModel('openrouter', 'bytedance-seed/seedream-5-0-lite'), 'bytedance-seed/seedream-5-0-lite');
  assert.match(detectBackend({ ...noCodex, env: { OPENROUTER_API_KEY: 'r' }, model: 'bytedance-seed/seedream-5-0-lite' }).note, /seedream-5-0-lite, cost reported after each panel\)/);
  assert.throws(() => detectBackend({ ...noCodex, env: { OPENROUTER_API_KEY: 'r' }, model: 'gpt-image-2' }), /image_model "gpt-image-2" is not an openrouter model id \(expected vendor\/model/);
  assert.match(detectBackend({ ...noCodex, env: {} }).note, /OPENROUTER_API_KEY not set/);
});

test('generate dispatches to openrouter and prefers the real usage cost over the estimate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smh-'));
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AAAA' }], usage: { cost: 0.05 } }), text: async () => '' });
  const r = await generate({ backend: 'openrouter', prompt: 'p', out: 'raw/01.png', cwd: dir, imageModel: '', env: { OPENROUTER_API_KEY: 'k' }, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.estimatedUsd, 0.067);
  assert.equal(r.usd, 0.05);
});

// Inside Codex's default sandbox the network is off and `codex` is stripped from PATH, so a nested
// generate can never work and "codex not found" sends the user to reinstall something they have.
test('detect names the Codex sandbox when running inside it without codex on PATH', () => {
  const r = detectBackend({ which: () => false, probe: () => { throw new Error('must not probe'); }, env: { CODEX_SANDBOX_NETWORK_DISABLED: '1' } });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /Codex sandbox/i);
  assert.match(r.note, /image_gen|approve|network/i);
  assert.doesNotMatch(r.note, /npm i -g @openai\/codex/);
});

test('detect outside the sandbox keeps the plain install hint', () => {
  const r = detectBackend({ which: () => false, probe: () => { throw new Error('must not probe'); }, env: {} });
  assert.match(r.note, /codex not found/);
});

// Pinning codex normally fails loudly, but inside Codex's own sandbox the pin cannot be satisfied by
// any config change and the skill can still draw with the harness's native image tool, so the run
// must continue instead of stopping at step 0.2.
test('pinned codex inside the Codex sandbox reports the sandbox instead of throwing', () => {
  const r = detectBackend({ pinned: 'codex', which: () => false, probe: () => { throw new Error('must not probe'); }, env: { CODEX_SANDBOX_NETWORK_DISABLED: '1' } });
  assert.equal(r.name, 'manual');
  assert.match(r.note, /pinned/);
  assert.match(r.note, /Codex sandbox/i);
  assert.match(r.note, /image_gen/);
});

test('pinned codex outside the sandbox still throws when codex is missing', () => {
  assert.throws(() => detectBackend({ pinned: 'codex', which: () => false, env: {} }), /pins backend: codex but/);
});

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_ASPECT, aspectPhrase } from '../aspect.mjs';

const isWin = process.platform === 'win32';

export function defaultWhich(cmd) {
  const r = spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8', shell: isWin });
  return r.status === 0;
}

// Windows-only. Two things were verified empirically (see task-3-report.md) before landing on
// this shape:
//   1. Spawning a `.cmd`/`.bat` shim (which is what npm-installed CLIs like `codex` are on
//      Windows) with `shell:false` throws EINVAL synchronously -- Node refuses to CreateProcess
//      a batch file directly (post-CVE hardening), so some form of cmd.exe involvement is
//      mandatory to run codex at all on Windows.
//   2. Node's own `shell:true` builds the child's command line by naively quoting each arg
//      (wrap in quotes if it has a space) and does NOT escape cmd.exe metacharacters
//      (& | % ^ ( ) < > !), so an instruction containing e.g. " & " silently splits into two
//      commands. Separately, cmd.exe's own command-line parser cannot carry a literal newline
//      inside a single argument under ANY quoting/escaping scheme -- it truncates the command
//      at the first \n. That is a cmd.exe parser limitation, not a Node bug, so no amount of
//      escaping fixes it; the newline has to be removed before it reaches cmd.exe.
// The fix: build the full command line ourselves with cross-spawn-style escaping (quote the
// arg, backslash-escape embedded quotes, then caret-escape cmd.exe metacharacters) and hand it
// to cmd.exe verbatim via `windowsVerbatimArguments: true`, bypassing Node's own quoting. Long
// instructions with embedded newlines get those newlines collapsed to spaces first, since they
// cannot survive cmd.exe regardless -- an accepted, documented tradeoff for a natural-language
// image prompt where a line break carries no semantic meaning to the model.
function escapeArgForWindowsShell(arg) {
  let a = String(arg).replace(/\r?\n/g, ' ');
  a = a.replace(/(\\*)"/g, '$1$1\\"');
  a = a.replace(/(\\*)$/, '$1$1');
  a = `"${a}"`;
  a = a.replace(/(["^&|<>()%!;, ])/g, '^$1');
  return a;
}

// stdin MUST be 'ignore', not the default 'pipe'. `codex exec` checks whether stdin is a pipe and,
// if it is, blocks reading it for extra prompt input ("Reading additional input from stdin...").
// With the default stdio the parent holds that pipe open forever, so codex waits forever, burning
// no CPU and writing no session -- a silent hang that looks exactly like a slow model. Handing it
// an already-closed stdin makes it skip that path and start immediately.
const STDIO = ['ignore', 'pipe', 'pipe'];

export function defaultRun(cmd, args, { cwd } = {}) {
  return new Promise((res) => {
    let p;
    if (isWin) {
      const commandLine = [escapeArgForWindowsShell(cmd), ...args.map(escapeArgForWindowsShell)].join(' ');
      p = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], { cwd, windowsVerbatimArguments: true, stdio: STDIO });
    } else {
      p = spawn(cmd, args, { cwd, shell: false, stdio: STDIO });
    }
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d); p.stderr.on('data', d => stderr += d);
    p.on('close', code => res({ code: code ?? 1, stdout, stderr }));
    p.on('error', () => res({ code: 1, stdout, stderr: 'spawn failed' }));
  });
}

export const CODEX_MIN_VERSION = '0.149.0';
export const CODEX_INSTALL_HINT =
  'For automatic images install codex: `npm i -g @openai/codex` then `codex login`. ' +
  'Its image tool needs a paid ChatGPT plan (Plus or higher); Free or API-key accounts should keep using manual.';


function parseVersion(s) {
  const m = String(s ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
}
function versionAtLeast(have, min) {
  const a = parseVersion(have), b = parseVersion(min);
  if (!a) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

// Sync because `detect` is sync. Two cheap codex calls: `--version` (a bare binary on PATH is not
// enough -- image_generation needs >= 0.149) and `login status` (installed-but-signed-out is the
// most common "it's there but every panel fails" state). `codex login status` prints
// "Logged in using ChatGPT" / "Not logged in" and mirrors that in its exit code.
export function defaultProbe() {
  const opts = { encoding: 'utf8', shell: isWin, timeout: 15000 };
  const v = spawnSync('codex', ['--version'], opts);
  const version = v.status === 0 ? (parseVersion(v.stdout)?.join('.') ?? null) : null;
  const l = spawnSync('codex', ['login', 'status'], opts);
  const out = `${l.stdout ?? ''}${l.stderr ?? ''}`;
  const loggedIn = l.status === 0 && !/not logged in/i.test(out);
  return { version, loggedIn };
}

// Human-readable reasons codex cannot be used right now; empty when it is ready.
export function codexProblems({ version, loggedIn }) {
  const problems = [];
  if (!version) problems.push('`codex --version` failed');
  else if (!versionAtLeast(version, CODEX_MIN_VERSION)) problems.push(`codex ${version} is too old (need >= ${CODEX_MIN_VERSION}): npm i -g @openai/codex@latest`);
  if (!loggedIn) problems.push('codex is not logged in: run `codex login` (paid ChatGPT plan needed for images)');
  return problems;
}

// codex ships an image tool but does NOT expose it by default: a plain `codex exec` session only
// gets shell/file tools, so asking it for a picture makes it try to *draw one with code*, which is
// both wrong and slow. `--enable image_generation` (verified against codex 0.149.0, see
// task-10-report.md) turns on the real `image_gen` tool plus `view_image`.
const ENABLE_IMAGE_TOOL = ['--enable', 'image_generation'];

// codex accepts exactly these four. A typo in show-me-how.md would otherwise reach codex as an opaque
// config error mid-run, after the user has already waited on a generation, so reject it up front.
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'];

export function buildCodexArgs({ prompt, refs = [], out, cwd, codexModel = '', codexReasoning = 'low', aspect = DEFAULT_ASPECT }) {
  // `-C` sets codex's working directory, and `-s workspace-write` grants write access to that whole
  // tree. Handing it the repo root would let a drawing run modify any file in the user's repo, so
  // the sandbox is scoped to the shot's own output folder -- the only place this run should write.
  // Everything else therefore has to be absolute: once codex is chdir'd into the scratch folder, a relative `out`
  // or `-i` ref would resolve against the wrong directory.
  const absOut = resolve(cwd, out);
  const absRefs = refs.map((r) => resolve(cwd, r));
  const args = ['exec', '-C', dirname(absOut), '-s', 'workspace-write', '--skip-git-repo-check', ...ENABLE_IMAGE_TOOL];
  for (const r of absRefs) args.push('-i', r);
  // Drawing does not need deep reasoning; low effort is faster and cheaper. An empty model
  // means "whatever codex is configured to use", so only pass -m when one was chosen.
  if (codexModel) args.push('-m', codexModel);
  const effort = codexReasoning || 'low';
  if (!REASONING_EFFORTS.includes(effort)) {
    throw new Error(`show-me-how.md: codex_reasoning "${effort}" is not a codex reasoning effort. Use ${REASONING_EFFORTS.join(' | ')}`);
  }
  // Also terminates the greedy `-i <FILE>...` list above, so the instruction below stays positional.
  args.push('-c', `model_reasoning_effort=${effort}`);
  // Three things this instruction has to get right, all learned the hard way (task-10-report.md):
  //   1. Name the `$imagegen` skill explicitly. "Create an image" on its own reads as an ordinary
  //      coding task and codex answers it by *drawing with code* (SVG/PIL), which is not what we want.
  //   2. `image_gen` takes no destination argument -- it writes under the codex home and reports
  //      the path back. The agent has to copy that file to `out`, so we ask for it in words.
  //   3. Forbid the scripts/image_gen.py CLI fallback: it needs an OPENAI_API_KEY, which a
  //      subscription user does not have, so falling back to it just burns a run.
  const instruction =
    `Use the $imagegen skill to generate exactly ONE image with its built-in image_gen tool. ` +
    `The image_gen tool takes no destination argument. It reports the path it wrote (under the codex ` +
    `home, e.g. ~/.codex/generated_images/); copy that file to exactly this path: "${absOut}" ` +
    `(create parent folders if needed), then report that path. ${aspectPhrase(aspect)}. ` +
    (absRefs.length ? `The attached image(s) are style references for the mascot character -- reference role, not edit targets. ` : '') +
    `Do not use the scripts/image_gen.py CLI fallback. Do not substitute SVG, HTML/CSS, canvas, ` +
    `Python/PIL or any other code-drawn placeholder art; if image_gen is unavailable, stop and say so. ` +
    `Do not write any other files. Do not ask questions. Image prompt follows.\n\n${prompt}`;
  args.push(instruction);
  return args;
}


export const name = 'codex';

// Sync. `problems` is empty when codex is ready; `note` is what `backend.mjs detect` prints.
// Codex's default sandbox (workspace-write) turns the network off and strips `codex` from PATH,
// so a nested `codex exec` cannot run from inside a Codex session. Telling that user to reinstall
// codex is wrong; they need the outer session to either approve network for the command or use its
// own native `image_gen` tool (the illustrate skill prefers that when it is available).
export const CODEX_SANDBOX_HINT =
  'running inside the Codex sandbox, which blocks network and hides `codex` from nested commands. ' +
  'Use the native `image_gen` tool (start codex with `--enable image_generation`), or approve running the generate command outside the sandbox.';

export function insideCodexSandbox(env = process.env) {
  return env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
}

export function detect({ which = defaultWhich, probe = defaultProbe, env = process.env } = {}) {
  if (!which('codex')) {
    if (insideCodexSandbox(env)) return { ready: false, sandboxed: true, note: `codex unavailable: ${CODEX_SANDBOX_HINT}`, problems: [CODEX_SANDBOX_HINT] };
    return { ready: false, note: `codex not found. ${CODEX_INSTALL_HINT}`, problems: [`\`codex\` was not found on PATH. ${CODEX_INSTALL_HINT}`] };
  }
  const p = probe();
  const problems = codexProblems(p);
  if (problems.length) return { ready: false, note: `codex found but ${problems.join('; ')}`, problems };
  return { ready: true, note: `codex ${p.version} (ChatGPT subscription)`, problems: [] };
}

export async function generate({ prompt, refs = [], out, cwd, run = defaultRun, codexModel = '', codexReasoning = 'low', aspect = DEFAULT_ASPECT }) {
  const r = await run('codex', buildCodexArgs({ prompt, refs, out, cwd, codexModel, codexReasoning, aspect }), { cwd });
  const ok = r.code === 0 && existsSync(out);
  return { ok, backend: name, out, stderr: ok ? undefined : (r.stderr || r.stdout).slice(-2000) };
}

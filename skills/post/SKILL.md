---
name: post
description: Generate an on-brand social media post kit for Instagram and/or LinkedIn — one focal image per platform drawn in the brand style, an optional baked-on headline, ready-to-paste captions with hashtags, and a posts.json — saved under <docs>/<slug>/. Never posts anything anywhere.
disable-model-invocation: true
---

# /wimu-social-brain:post $ARGUMENTS

Parse `$ARGUMENTS`: PLATFORM = a trailing `instagram`, `linkedin` or `both` (default `both`); TOPIC = the rest. If TOPIC is empty, ask the user for a topic and stop — do not guess one.

`REPO` = absolute path of the git root (`git rev-parse --show-toplevel`). Run every command from there. Never stop the run because one platform failed — mark it pending and keep going.

`PLUGIN` = the plugin's install folder (the one holding `scripts/`, `assets/`, `skills/`). Resolve it once: if the `CLAUDE_PLUGIN_ROOT` environment variable is set (Claude Code), use that; otherwise it is two directories above this SKILL.md file (Codex, OpenCode and other harnesses). Shell note: on Windows your shell may be PowerShell — every command below is a plain `node ...` invocation that works in bash and PowerShell alike; where a loop is shown, both forms are given.

Read once, before planning: `references/platform-formats.md`, `references/post-prompt-template.md`, `references/caption-guide.md` (relative to this skill's folder).

Never post to any social platform, never run `git commit` or `git add`, never edit `.gitignore`. This command writes only under the docs folder and the scratch folder.

## 0. Resolve brand, backend, folders

Before any script call below: if `$PLUGIN/node_modules/sharp` is missing, run `npm install --silent` with cwd `$PLUGIN` first.

1. `node "$PLUGIN/scripts/design.mjs" "REPO"` -> JSON (`file`, `mascot`, `font`, `colors`, `tone`, `output.docs`, `output.backend`, `output.imageFormat`). `EXT` = `output.imageFormat` (`webp` by default; `png` if the user set it). If `file` is `null`, say once: "No wimu-social-brain.md found; using Flow + Caveat defaults. Run /wimu-social-brain:init to customize."
2. Read `REPO/brand.md`. If it is missing, stop and tell the user: "No brand.md found — run /wimu-social-brain:brand-init first. Posts are never written without a brand." Never invent a brand from the topic.
3. `node "$PLUGIN/scripts/backend.mjs" detect --cwd "REPO"` -> prints `backend: ...`. Echo that line to the user verbatim; it already carries the install / login hints, so do not add advice of your own. If the line contains `running inside the Codex sandbox`, that is expected inside Codex: continue, and draw with the native image tool in step 3(a). If the command errors instead of printing `backend:`, show the error, ask the user to fix it or set `backend: auto` in wimu-social-brain.md, then stop.
4. `node "$PLUGIN/scripts/slug.mjs" "<TOPIC>"` -> `SLUG`.
   - `DIR` = `<design.output.docs>` joined with `SLUG` with exactly one `/` between them (e.g. `docs/wimu-social-brain/spring-launch`).
   - `SCRATCH` = `REPO/.wimu-social-brain/SLUG`. Create `DIR` and `SCRATCH` (`mkdir -p`).
5. Platforms and numbers: `instagram` = aspect `4:5` (1080x1350), `linkedin` = aspect `1:1` (1080x1080). With `both`, instagram is `NN=01` and linkedin `NN=02`; a single platform is `NN=01`.
6. Style refs: the `style references:` list under `## Visual style` in brand.md (repo-root-relative paths). Drop any path that does not exist; if none exist, pass no `--ref` at all — the brand look still comes from the prompt text.

## 1. Plan one post per platform (show it, do not ask)

For each platform, plan ONE post: a single focal visual idea, a headline (<=6 words, baked on the image by default), and a caption (hook -> value -> CTA per `references/caption-guide.md`, hashtags mixed from brand.md's brand tags and the topic). Print this, then continue without waiting for approval:

```
NN  <platform>  <aspect>   "<headline>"
    Visual: <the one focal idea, one sentence>
    Hook: <the first caption line>
    CTA: <the primary or secondary call to action from brand.md>
```

## 2. Prompt files

For every platform, fill every `{slot}` of `references/post-prompt-template.md` — brand voice and visual style from brand.md, mascot from the design config, the focal idea, the aspect, the empty headline zone — and write the result to `SCRATCH/NN.prompt.txt`. Skip any platform whose `SCRATCH/NN.png` already exists (saved by hand after a manual run); it goes straight to step 4.

## 3. Launch every generation at once

Pick **one** of these two ways to draw, for the whole run:

**(a) Native image tool.** If your harness gives you an image-generation tool directly (Codex: `image_gen` / `image_gen__imagegen`, present when codex runs with `--enable image_generation`), use it — no subprocess, no sandbox trouble. For each remaining platform: call the tool with the full text of `SCRATCH/NN.prompt.txt` as the prompt and the style refs from step 0.6 as reference images (if the tool accepts them), in the platform's orientation (portrait 4:5, about 1080x1350, for instagram; square 1:1, 1080x1080, for linkedin). Save or copy the returned image to `SCRATCH/NN.png`, then write `SCRATCH/NN.result.json` yourself with exactly `{"ok":true,"backend":"image_gen","out":"<absolute path of NN.png>"}`. If the tool fails for a platform, write `{"ok":false,"backend":"image_gen","out":"...","stderr":"<the error, one line>"}` instead. Run the platforms concurrently if the harness allows; sequentially is fine. Tell the user the backend is `image_gen (native)`.

**(b) The script.** Otherwise start the generate commands **in the same turn, all concurrently, in the background** (Claude Code: Bash with `run_in_background: true`; other harnesses: your background-command feature, or in bash append `&` to each and launch them from one shell call). Redirect each one's stdout to its own result file:

```
node "$PLUGIN/scripts/backend.mjs" generate --prompt-file "SCRATCH/NN.prompt.txt" --out "SCRATCH/NN.png" --ref "<ref1>" --ref "<ref2>" --aspect "<ratio>" --cwd "REPO" > "SCRATCH/NN.result.json"
```

`<ratio>` is `4:5` or `1:1` from step 0.5. Each command always exits 0. Read success from the JSON `ok` field in `SCRATCH/NN.result.json`, never from the exit code. Tell the user how many generations are running. If step 0.3 said `codex unavailable: running inside the Codex sandbox`, the script cannot reach codex from here: use (a) if you have the tool; if not, ask the user to approve running the generate command outside the sandbox (network on), or fall through to manual.

**Do not end your turn while any generation is running.** Completion notifications for background shells are not guaranteed to reach you (they never reach a subagent), so never rely on them. Instead, poll: read every `SCRATCH/NN.result.json` that is still missing or empty — one shell call can check all of them:

- bash: `for f in SCRATCH/*.result.json; do echo "$f: $(cat "$f")"; done`
- PowerShell: `Get-ChildItem SCRATCH/*.result.json | ForEach-Object { "$($_.Name): $(Get-Content $_ -Raw)" }`

Handle any that now contain a JSON line (step 3b), then check again. A generation takes 1-3 minutes; keep checking, as many times as it takes, until every platform has its JSON line. An empty or missing file means it is still running — never treat it as a failure, and never stop and say you are "waiting".

## 3b. Collect, QA, one retry

Handle each result as its shell exits; do not wait for all of them before starting QA on the first.

1. `ok:false` with `promptFile` (manual backend) — collect all such platforms, then tell the user once: "Prompts saved to `<promptFile>` (one per platform). Paste each into ChatGPT/Gemini, save the image as `SCRATCH/NN.png`, then re-run the same slash command; saved images are picked up and finished." Mark each **pending**.
2. `ok:false` with `stderr` (the backend failed) — show the last 5 lines of `stderr`, then point the user at `SCRATCH/NN.prompt.txt` and the same save path with the same re-run line. Mark **pending**.
3. `ok:true` — view `SCRATCH/NN.png` with the Read tool and check every item: correct aspect and orientation; one focal idea, readable at feed-scroll size; on-brand look (brand.md visual style, consistent with the style refs); subject fills 40-60% of the canvas with a clear empty headline zone; no text, letters or numbers anywhere in the image (the headline is baked in step 4). If any fails, regenerate exactly once, in the background, without blocking the other platform: append the failed rule as an instruction to the end of `SCRATCH/NN.prompt.txt` (for text in the image, append a stronger no-text instruction), delete `SCRATCH/NN.png` and `SCRATCH/NN.result.json` first, then draw that platform again the same way as in step 3 and poll its result file. If the retry is `ok:false`, handle it exactly like 3b.1/3b.2. Accept whatever the retry gives you. One retry per platform.
4. As soon as a platform's PNG is accepted, bake its headline (step 4) — do not wait for the other.

## 4. Bake the headline (default; skip only for a clean image)

1. Look at the PNG and write `SCRATCH/NN.labels.json`, reusing illustrate's label shape:
   ```json
   { "labels": [{ "text": "", "x": 0.0, "y": 0.0, "kind": "black" }] }
   ```
   `x`/`y` are 0-1 fractions of width/height; the canvas is 1080x1350 (instagram) or 1080x1080 (linkedin) and a label is centred on its `x`/`y`, so keep every centre within x 0.12-0.88 and y 0.08-0.94. The headline is one large `black` label (`"size": 1.6`) placed in the empty zone the prompt reserved; an optional baked CTA is one smaller `flow` label below it. Max 3 labels, no arrows. `kind`: `black` (the headline), `flow` (CTA), `warn` (the one number or warning), `note` (side info). Omit `colors`/`font` — the script fills them from wimu-social-brain.md.
2. Overlay:
   ```
   node "$PLUGIN/scripts/label.mjs" --in "SCRATCH/NN.png" --labels "SCRATCH/NN.labels.json" --out "DIR/NN-<platform>.EXT" --design-cwd "REPO"
   ```
   The output format follows the `--out` extension (`EXT` from step 0.1). The result is a JSON line; if it carries a `hint` field, the labels were drawn in the system font instead of the brand font (macOS until the font is installed for the user — see `scripts/font.mjs`). Show that `hint` line to the user **once** per run, keep going, and do not try to fix it yourself.
   Skip the baking only when the user asked for a clean image: then write `{"labels":[]}` and run the same command — it just converts the format.
3. View `DIR/NN-<platform>.EXT` once. If a label sits on the focal subject or runs off the edge, nudge its `x`/`y` and rerun 4.2. At most one nudge per platform.

## 5. Post kit

Only after every platform is either finished or pending. Write into `DIR`:

1. `NN-<platform>.EXT` — already written by step 4 (e.g. `01-instagram.webp`, `02-linkedin.webp`).
2. `captions.md` — one `## <Platform>` section per platform with the ready-to-paste caption, hashtags included at the end under a blank line. For a pending platform, write the caption anyway and add one line: `_Pending: prompt at <prompt file>._`
3. `posts.json` — an array with one object per platform, exactly this shape:
   ```json
   [{ "platform": "instagram", "aspect": "4:5", "image": "01-instagram.webp", "headline": "...", "caption": "...full caption, hashtags included...", "hashtags": ["#brand", "#topic"], "cta": "...", "altText": "..." }]
   ```
   `image` is relative to `DIR`. `altText` follows `references/caption-guide.md`. For a pending platform, set `image` to the repo-root-relative scratch path (`.wimu-social-brain/SLUG/NN.png`).
4. If **no** platform is pending: delete `SCRATCH` (only `REPO/.wimu-social-brain/SLUG`, never `.wimu-social-brain` itself). If deleting fails, say so in one line and continue. If any platform is pending, keep `SCRATCH` and say it is kept for the re-run.

## 6. Report

Print exactly: the platform(s) produced, each image path and the `captions.md` and `posts.json` paths, which backend was used (`image_gen (native)` for step 3(a)), and which platforms are pending with each one's prompt file — or "none pending". Then suggest, without editing anything: "Add `.wimu-social-brain/` to your `.gitignore` to keep prompts and unbaked generations out of the repo." Never post, never commit.

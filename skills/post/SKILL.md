---
name: post
description: Generate an on-brand social media post kit for Instagram, LinkedIn and/or Instagram Stories/Reels — one focal image per platform, or a carousel of slides, drawn in the brand style with an optional baked-on headline, plus ready-to-paste captions with hashtags and a posts.json — saved under <docs>/<slug>/. Never posts anything anywhere.
disable-model-invocation: true
---

# /wimu-social-brain:post $ARGUMENTS

Parse `$ARGUMENTS`: PLATFORM = a trailing `instagram`, `linkedin`, `stories`, `both` or `all` (default `both`); `--carousel N` anywhere in the arguments asks for an N-slide carousel per platform instead of a single image; TOPIC = the rest. The platform grammar: `instagram` = Instagram feed (4:5), `linkedin` = LinkedIn (1:1), `stories` = Instagram Stories/Reels (9:16), `both` = instagram + linkedin, `all` = instagram + linkedin + stories. Carousel limits: 2-10 slides for instagram, 2-20 for linkedin and stories; if `--carousel` has no N, or N is not a whole number or is out of range for a requested platform, say so and stop. `--carousel` is a skill-level flag — never pass it to `scripts/backend.mjs`. If TOPIC is empty, ask the user for a topic and stop — do not guess one.

`REPO` = absolute path of the git root (`git rev-parse --show-toplevel`). Run every command from there. Never stop the run because one image failed — mark it pending and keep going.

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
5. Platforms and numbers: `instagram` = aspect `4:5` (1080x1350), `linkedin` = aspect `1:1` (1080x1080), `stories` = aspect `9:16` (1080x1920). With `both`, instagram is `NN=01` and linkedin `NN=02`; with `all`, instagram `NN=01`, linkedin `NN=02`, stories `NN=03`; a single platform is `NN=01`. Every image gets two names: `STEM` = `NN` for a single-image post or `NN-SS` for slide `SS` (zero-padded, `01`..N) of a carousel — it names the scratch files (`SCRATCH/STEM.prompt.txt`, `STEM.png`, `STEM.result.json`, `STEM.labels.json`); `OUTNAME` = `NN-<platform>` or `NN-<platform>-SS` — the finished file is `DIR/OUTNAME.EXT` (e.g. `01-instagram.webp`, `01-instagram-01.webp`).
6. Style refs: the `style references:` list under `## Visual style` in brand.md (repo-root-relative paths). Drop any path that does not exist; if none exist, pass no `--ref` at all — the brand look still comes from the prompt text.

## 1. Plan the posts (show it, do not ask)

For each platform, plan ONE post: a focal visual idea, a headline (<=6 words, baked on the image by default), and a caption (hook -> value -> CTA per `references/caption-guide.md`, hashtags mixed from brand.md's brand tags and the topic).

Without `--carousel` the post is a single image. With `--carousel N`, plan N slides for the platform instead, one beat each: slide 1 is the hook — the only slide guaranteed to be seen — the last slide is the CTA, and the slides between carry the value. Each slide gets its own focal visual idea and its own baked headline. The caption stays ONE caption for the whole carousel: Instagram and LinkedIn carousels have a single caption, never one per slide.

Print this, then continue without waiting for approval:

Single image:

```
NN  <platform>  <aspect>   "<headline>"
    Visual: <the one focal idea, one sentence>
    Hook: <the first caption line>
    CTA: <the primary or secondary call to action from brand.md>
```

Carousel:

```
NN  <platform>  <aspect>   carousel of N
    01  "<headline>" — <one focal idea>   (the hook)
    02  "<headline>" — <one focal idea>
    ...
    N   "<headline>" — <one focal idea>   (the CTA)
    Caption: hook <the first caption line> -> value -> CTA <the call to action from brand.md the last slide points at>
```

## 2. Prompt files

For every image — one per platform, or one per slide per platform for a carousel — fill every `{slot}` of `references/post-prompt-template.md`: brand voice and visual style from brand.md, mascot from the design config, the focal idea, the aspect with its orientation and dimensions, the empty headline zone (the top quarter for instagram/linkedin; mid-frame for stories — the top ~14% and bottom ~20% of a 9:16 frame sit under platform UI), and, for a carousel slide, the `{slide N of M}` continuity slot. Write the result to `SCRATCH/STEM.prompt.txt`. Skip any image whose `SCRATCH/STEM.png` already exists (saved by hand after a manual run); it goes straight to step 4.

## 3. Launch every generation at once

Pick **one** of these two ways to draw, for the whole run:

**(a) Native image tool.** If your harness gives you an image-generation tool directly (Codex: `image_gen` / `image_gen__imagegen`, present when codex runs with `--enable image_generation`), use it — no subprocess, no sandbox trouble. For each remaining image: call the tool with the full text of `SCRATCH/STEM.prompt.txt` as the prompt and the style refs from step 0.6 as reference images (if the tool accepts them), in the platform's orientation (portrait 4:5, about 1080x1350, for instagram; square 1:1, 1080x1080, for linkedin; vertical 9:16, 1080x1920, for stories). Save or copy the returned image to `SCRATCH/STEM.png`, then write `SCRATCH/STEM.result.json` yourself with exactly `{"ok":true,"backend":"image_gen","out":"<absolute path of STEM.png>"}`. If the tool fails for an image, write `{"ok":false,"backend":"image_gen","out":"...","stderr":"<the error, one line>"}` instead. Run the images concurrently if the harness allows; sequentially is fine. Tell the user the backend is `image_gen (native)`.

**(b) The script.** Otherwise start the generate commands **in the same turn, all concurrently, in the background** (Claude Code: Bash with `run_in_background: true`; other harnesses: your background-command feature, or in bash append `&` to each and launch them from one shell call). Redirect each one's stdout to its own result file:

```
node "$PLUGIN/scripts/backend.mjs" generate --prompt-file "SCRATCH/STEM.prompt.txt" --out "SCRATCH/STEM.png" --ref "<ref1>" --ref "<ref2>" --aspect "<ratio>" --cwd "REPO" > "SCRATCH/STEM.result.json"
```

`<ratio>` is `4:5`, `1:1` or `9:16` from step 0.5 — `--aspect` is the only per-platform flag the script sees; never pass `--carousel` to it. Each command always exits 0. Read success from the JSON `ok` field in `SCRATCH/STEM.result.json`, never from the exit code. Tell the user how many generations are running. If step 0.3 said `codex unavailable: running inside the Codex sandbox`, the script cannot reach codex from here: use (a) if you have the tool; if not, ask the user to approve running the generate command outside the sandbox (network on), or fall through to manual.

**Do not end your turn while any generation is running.** Completion notifications for background shells are not guaranteed to reach you (they never reach a subagent), so never rely on them. Instead, poll: read every `SCRATCH/*.result.json` that is still missing or empty — one shell call can check all of them:

- bash: `for f in SCRATCH/*.result.json; do echo "$f: $(cat "$f")"; done`
- PowerShell: `Get-ChildItem SCRATCH/*.result.json | ForEach-Object { "$($_.Name): $(Get-Content $_ -Raw)" }`

Handle any that now contain a JSON line (step 3b), then check again. A generation takes 1-3 minutes; keep checking, as many times as it takes, until every image has its JSON line. An empty or missing file means it is still running — never treat it as a failure, and never stop and say you are "waiting".

## 3b. Collect, QA, one retry

Handle each result as its shell exits; do not wait for all of them before starting QA on the first.

1. `ok:false` with `promptFile` (manual backend) — collect all such images, then tell the user once: "Prompts saved to `<promptFile>` (one per image). Paste each into ChatGPT/Gemini, save the image as `SCRATCH/STEM.png`, then re-run the same slash command; saved images are picked up and finished." Mark each **pending**.
2. `ok:false` with `stderr` (the backend failed) — show the last 5 lines of `stderr`, then point the user at `SCRATCH/STEM.prompt.txt` and the same save path with the same re-run line. Mark **pending**.
3. `ok:true` — view `SCRATCH/STEM.png` with the Read tool and check every item: correct aspect and orientation; one focal idea, readable at feed-scroll size; on-brand look (brand.md visual style, consistent with the style refs); subject fills 40-60% of the canvas with a clear empty headline zone (for stories: mid-frame, clear of the top ~14% and bottom ~20% that platform UI covers); no text, letters or numbers anywhere in the image (the headline is baked in step 4). For a carousel slide also check the continuity: same palette, same character, and the slide advances the set's visual progression. If any fails, regenerate exactly once, in the background, without blocking the other images: append the failed rule as an instruction to the end of `SCRATCH/STEM.prompt.txt` (for text in the image, append a stronger no-text instruction), delete `SCRATCH/STEM.png` and `SCRATCH/STEM.result.json` first, then draw that image again the same way as in step 3 and poll its result file. If the retry is `ok:false`, handle it exactly like 3b.1/3b.2. Accept whatever the retry gives you. One retry per image.
4. As soon as an image's PNG is accepted, bake its headline (step 4) — do not wait for the others.

## 4. Bake the headline (default; skip only for a clean image)

1. Look at the PNG and write `SCRATCH/STEM.labels.json`, reusing illustrate's label shape:
   ```json
   { "labels": [{ "text": "", "x": 0.0, "y": 0.0, "kind": "black" }] }
   ```
   `x`/`y` are 0-1 fractions of width/height; the canvas is 1080x1350 (instagram), 1080x1080 (linkedin) or 1080x1920 (stories) and a label is centred on its `x`/`y`. Keep every centre within x 0.12-0.88 and y 0.08-0.94 — except stories, where the platform UI (avatar, progress bar, reply field) covers the top ~14% and bottom ~20% of the frame: there keep every centre within y 0.16-0.78, with the headline mid-frame, never at the top. The headline is one large `black` label (`"size": 1.6`) placed in the empty zone the prompt reserved; an optional baked CTA is one smaller `flow` label below it. Max 3 labels, no arrows. `kind`: `black` (the headline), `flow` (CTA), `warn` (the one number or warning), `note` (side info). Omit `colors`/`font` — the script fills them from wimu-social-brain.md.
2. Overlay:
   ```
   node "$PLUGIN/scripts/label.mjs" --in "SCRATCH/STEM.png" --labels "SCRATCH/STEM.labels.json" --out "DIR/OUTNAME.EXT" --design-cwd "REPO"
   ```
   The output format follows the `--out` extension (`EXT` from step 0.1). The result is a JSON line; if it carries a `hint` field, the labels were drawn in the system font instead of the brand font (macOS until the font is installed for the user — see `scripts/font.mjs`). Show that `hint` line to the user **once** per run, keep going, and do not try to fix it yourself.
   Skip the baking only when the user asked for a clean image: then write `{"labels":[]}` and run the same command — it just converts the format.
3. View `DIR/OUTNAME.EXT` once. If a label sits on the focal subject or runs off the edge, nudge its `x`/`y` and rerun 4.2. At most one nudge per image.

## 5. Post kit

Only after every image is either finished or pending. Write into `DIR`:

1. `OUTNAME.EXT` — already written by step 4 (e.g. `01-instagram.webp`, `02-linkedin.webp`; carousel slides `01-instagram-01.webp`, `01-instagram-02.webp`, ...).
2. `captions.md` — one `## <Platform>` section per platform. For a carousel, list the slide headlines in order first (numbered, one per line), then the single ready-to-paste caption — one caption for the whole carousel, hashtags included at the end under a blank line. For a pending platform, write the caption anyway and add one line per pending image: `_Pending: prompt at <prompt file>._`
3. `posts.json` — an array with one object per platform, exactly this shape:
   ```json
   [{ "platform": "instagram", "aspect": "4:5", "image": "01-instagram.webp", "headline": "...", "caption": "...full caption, hashtags included...", "hashtags": ["#brand", "#topic"], "cta": "...", "altText": "..." }]
   ```
   For a carousel the top-level fields keep their meaning — `image` is the first slide, `headline` is slide 1's headline, `caption` is the ONE post-level caption — and the object gets an extra `slides` array with one entry per slide, in order:
   ```json
   [{ "platform": "instagram", "aspect": "4:5", "image": "01-instagram-01.webp", "headline": "...slide 1 headline...", "caption": "...one caption for the whole carousel...", "hashtags": ["#brand", "#topic"], "cta": "...", "altText": "...", "slides": [{ "image": "01-instagram-01.webp", "headline": "...", "altText": "..." }, { "image": "01-instagram-02.webp", "headline": "...", "altText": "..." }] }]
   ```
   `image` is relative to `DIR`. `altText` follows `references/caption-guide.md` (one per slide inside `slides`). For a pending platform, set `image` to the repo-root-relative scratch path (`.wimu-social-brain/SLUG/STEM.png` — the first pending image, if several).
4. If **no** image is pending: delete `SCRATCH` (only `REPO/.wimu-social-brain/SLUG`, never `.wimu-social-brain` itself). If deleting fails, say so in one line and continue. If any image is pending, keep `SCRATCH` and say it is kept for the re-run.

## 6. Report

Print exactly: the platform(s) produced (for a carousel, how many slides per platform), each image path and the `captions.md` and `posts.json` paths, which backend was used (`image_gen (native)` for step 3(a)), and which images are pending with each one's prompt file — or "none pending". Then suggest, without editing anything: "Add `.wimu-social-brain/` to your `.gitignore` to keep prompts and unbaked generations out of the repo." Never post, never commit.

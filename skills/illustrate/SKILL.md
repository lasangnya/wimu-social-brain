---
name: illustrate
description: Illustration engine. Plans as many mascot panels as the story needs (typically 3-6, max 8) for a brief as a short storybook, generates them in parallel via an image backend, overlays labels in the brand font, and writes one doc with the panels in sequence. Usable when the user asks to "illustrate", "draw how X works", or "make an explainer image"; also draws the test image in /wimu-social-brain:init.
---

# illustrate

Input is a brief block:

```
MODE: explain | doc
TOPIC: <text>
SOURCES: <list of files/commits read>
BRIEF: <=200 words
MAX_IMAGES: n   (hard cap; the beat sheet decides the real count)
OUTDIR: <optional, overrides DIR>
```

If you were not given one, build it first: read the files the user points at, write BRIEF (<=200 words: what it is, who it is for, the 3-6 ideas a reader must get, the one gotcha), set `MODE=explain`, `MAX_IMAGES=8`.

`MODE` changes only one thing: `explain` echoes the finished doc in chat (step 6); `doc` prints its path. Both always save the file.

Read once, before drawing: `references/style-dna.md`, `references/composition-patterns.md`, `references/prompt-template.md`. Read `references/qa-checklist.md` after the first image lands. Read `references/mascot-flow.md` only if `wimu-social-brain.md` has no `## Mascot` section. Read `references/backends.md` whenever a generate call returns `ok:false`.

`REPO` below is the absolute path of the git root (`git rev-parse --show-toplevel`). Run every command from there. Never stop the run because one panel failed — mark it pending and keep going.

`PLUGIN` is the plugin's install folder (the one holding `scripts/`, `assets/`, `skills/`). Resolve it once: if the `CLAUDE_PLUGIN_ROOT` environment variable is set (Claude Code), use that; otherwise it is two directories above this SKILL.md file (Codex, OpenCode and other harnesses). Shell note: on Windows your shell may be PowerShell — every command below is a plain `node ...` invocation that works in bash and PowerShell alike; where a loop is shown, both forms are given.

## 0. Resolve brand, backend, folders

Before any script call below: if `$PLUGIN/node_modules/sharp` is missing, run `npm install --silent` with cwd `$PLUGIN` first.

1. `node "$PLUGIN/scripts/design.mjs" "REPO"` -> JSON (`file`, `mascot`, `font`, `colors`, `tone`, `output.docs`, `output.backend`, `output.imageFormat`). `EXT` = `output.imageFormat` (`webp` by default; `png` if the user set it). If `file` is `null`, say once: "No wimu-social-brain.md found; using Flow + Caveat defaults. Run /wimu-social-brain:init to customize." Trust `file`, not the disk: a repo's own unrelated `design.md` is not our config.
2. `node "$PLUGIN/scripts/backend.mjs" detect --cwd "REPO"` -> prints `backend: ...`. Echo that line to the user verbatim; it already carries the install / login hint when codex is missing, outdated or signed out, so do not add advice of your own. If the line contains `running inside the Codex sandbox` (pinned or not), that is expected inside Codex: continue, and draw with the native image tool in step 3a.3(a). If the command errors instead of printing `backend:`, show the error; it means `wimu-social-brain.md` pins a backend that is not usable (codex not installed / too old / signed out, an API key variable not set, or an unknown `image_model`). Show the error, ask them to fix it or set `backend: auto`, then stop.
3. `node "$PLUGIN/scripts/slug.mjs" "<TOPIC>"` -> `SLUG`.
   - `DIR` = `<design.output.docs>` joined with `SLUG` with exactly one `/` between them (`output.docs` may end in `/`) (e.g. `docs/wimu-social-brain/label-overlay`), or `OUTDIR` if the brief block has one.
   - `DOC` = `DIR/SLUG.md` (e.g. `docs/wimu-social-brain/label-overlay/label-overlay.md`).
   - `SCRATCH` = `REPO/.wimu-social-brain/SLUG`. Create `DIR` and `SCRATCH` (`mkdir -p`).
4. Mascot refs: `design.mascot.references` (repo-root-relative) if non-empty, else `$PLUGIN/assets/flow/front.png`, `.../working.png`, `.../stuck.png`. Drop any path that does not exist; if none exist, pass no `--ref` at all — the character still comes from the prompt text.

## 1. Beats

Turn BRIEF into a beat sheet using "Beat sheet" in `references/composition-patterns.md`. There is no target number: use as many panels as the story needs, one beat each — a small helper needs 2-3, a multi-step feature 5-6. Never pad to fill and never squeeze two beats into one panel. `MAX_IMAGES` is only a hard cap. Panels form one continuous scene: same mascot, main object may carry over, the mascot's action must change every panel. One panel = one beat.

## 2. Panel list (show it, do not ask)

Print this, then continue without waiting for approval:

```
NN  <beat>  <structure>   "<title>"
    <mascot>: <what it physically does>
    Labels: <2-5 short labels, <=4 words each>
    Caption: <one line, <=12 words — baked into the panel in the brand font>
    Text: <1-2 sentences, <=40 words — the description under the panel in the doc>
```

`NN` is the zero-padded panel number (`01`, `02`, ...). `<beat>` is setup / action / twist / payoff.

## 3a. Launch every generation at once

1. For every panel, fill every `{slot}` of the template in `references/prompt-template.md` (including `{previous_panel}`) and write the result to `SCRATCH/NN.prompt.txt`.
2. Skip any panel whose `SCRATCH/NN.png` already exists (the user saved it by hand after a manual run); it goes straight to step 4.
3. Pick **one** of these two ways to draw, for the whole run:

   **(a) Native image tool.** If your harness gives you an image-generation tool directly (Codex: `image_gen` / `image_gen__imagegen`, present when codex runs with `--enable image_generation`), use it — no subprocess, no sandbox trouble. For each remaining panel: call the tool with the full text of `SCRATCH/NN.prompt.txt` as the prompt and the mascot refs from step 0.4 as reference images (if the tool accepts them), landscape 16:9 (about 1536x1024). Save or copy the returned image to `SCRATCH/NN.png`, then write `SCRATCH/NN.result.json` yourself with exactly `{"ok":true,"backend":"image_gen","out":"<absolute path of NN.png>"}`. If the tool fails for a panel, write `{"ok":false,"backend":"image_gen","out":"...","stderr":"<the error, one line>"}` instead. Run the panels concurrently if the harness allows; sequentially is fine. Tell the user the backend is `image_gen (native)`.

   **(b) The script.** Otherwise start the generate commands **in the same turn, all concurrently, in the background** (Claude Code: Bash with `run_in_background: true`; other harnesses: your background-command feature, or in bash append `&` to each and launch them from one shell call). Redirect each one's stdout to its own result file:
   ```
   node "$PLUGIN/scripts/backend.mjs" generate --prompt-file "SCRATCH/NN.prompt.txt" --out "SCRATCH/NN.png" --ref "<ref1>" --ref "<ref2>" --cwd "REPO" > "SCRATCH/NN.result.json"
   ```
   Each command always exits 0. Read success from the JSON `ok` field in `SCRATCH/NN.result.json`, never from the exit code. Tell the user how many generations are running. If step 0.2 said `codex unavailable: running inside the Codex sandbox`, the script cannot reach codex from here: use (a) if you have the tool; if not, ask the user to approve running the generate command outside the sandbox (network on), or fall through to manual.
4. **Do not end your turn while any generation is running.** Completion notifications for background shells are not guaranteed to reach you (they never reach a subagent), so never rely on them. Instead, poll: read every `SCRATCH/NN.result.json` that is still missing or empty — one shell call can check all of them:
   - bash: `for f in SCRATCH/*.result.json; do echo "$f: $(cat "$f")"; done`
   - PowerShell: `Get-ChildItem SCRATCH/*.result.json | ForEach-Object { "$($_.Name): $(Get-Content $_ -Raw)" }`

   Handle any that now contain a JSON line (step 3b), then check again. A generation takes 1-3 minutes; keep checking, as many times as it takes, until every panel has its JSON line. An empty or missing file means it is still running — never treat it as a failure, and never stop and say you are "waiting".

## 3b. Collect, in whatever order they finish

Handle each result as its shell exits; do not wait for all of them before starting QA on the first.

1. `ok:false` with `promptFile` (manual backend) — collect all such panels, then tell the user once: "Prompts saved to `<promptFile>` (one per panel). Paste each into ChatGPT/Gemini, save the image as `SCRATCH/NN.png`, then re-run the same slash command; saved panels are picked up and labelled." Mark each **pending**.
2. `ok:false` with `stderr` (the backend failed) — show the last 5 lines of `stderr`, then point the user at `SCRATCH/NN.prompt.txt` and the same save path with the same re-run line. Mark **pending**.
3. `ok:true` — view `SCRATCH/NN.png` with the Read tool and check it against every "Must pass" item in `references/qa-checklist.md`. If any fails, regenerate exactly once, in the background, without blocking other panels:
   - Append the matching line from "Iteration moves" in `references/qa-checklist.md` to the end of `SCRATCH/NN.prompt.txt`. For a decorative mascot, append the retry prompt from `references/prompt-template.md`. For text in the image, append a stronger no-text instruction — never the mascot-central retry text. If no move matches, append the failed "Must pass" line itself as an instruction.
   - The retry text is only ever **appended** to the original filled prompt; never sent alone.
   - Delete `SCRATCH/NN.png` and `SCRATCH/NN.result.json` first, so a failed retry cannot be reported as `ok:true` on the stale file, then draw that panel again the same way as in step 3a.3 (native tool or script) and poll its result file as in 3a.4. If the retry is `ok:false`, handle it exactly like 3b.1/3b.2. Accept whatever the retry gives you. One retry per panel.
4. As soon as a panel's PNG is accepted, label it (step 4) — do not wait for the others.

## 4. Label (once per accepted panel)

1. Look at the PNG and write `SCRATCH/NN.labels.json`:
   ```json
   { "labels": [{ "text": "", "x": 0.0, "y": 0.0, "kind": "black" }],
     "arrows": [{ "from": [0.0, 0.0], "to": [0.0, 0.0], "kind": "flow" }] }
   ```
   `x`/`y` are 0-1 fractions of width/height, placed in empty space next to the object they describe. The canvas is about 1672x941 and a label is centred on its `x`/`y`, so keep every centre within x 0.12-0.88 and y 0.08-0.94. `kind`: `black` (names), `flow` (movement), `warn` (the gotcha or result), `note` (side info). Max 5 labels, 2 arrows. Omit `colors`/`font` — the script fills them from `wimu-social-brain.md`.
2. Overlay:
   ```
   node "$PLUGIN/scripts/label.mjs" --in "SCRATCH/NN.png" --labels "SCRATCH/NN.labels.json" --caption "<caption>" --out "DIR/NN.EXT" --design-cwd "REPO"
   ```
   `--caption` is the panel's one-line caption from step 2; the script adds a white strip below the picture with that line in the brand font. Pass it for every panel. The output format follows the `--out` extension (`EXT` from step 0.1); the finished panel is written in that format at the generated size (a WebP panel is ~45 KB against ~700 KB as PNG).
   The result is a JSON line. If it carries a `hint` field, the labels were drawn in the system font instead of the brand font (this happens on macOS until the font is installed for the user — see `scripts/font.mjs`). Show that `hint` line to the user **once** per run, keep going, and do not try to fix it yourself.
3. View `DIR/NN.EXT` once. If a label sits on line art or runs off the edge, nudge its `x`/`y` and rerun 4.2. At most one nudge per panel.

## 5. Write the storybook

Only after every panel is either labelled or pending. Write `DOC` exactly in this shape — no `##` section headings; each panel is the image, then its caption as a `###` line (so it reads large), then its text:

```
# <Title>

<hook: 1-2 sentences — what this is and why the reader cares>

![<panel 1 title>](01.EXT)

### <caption 1>

<text 1>

![<panel 2 title>](02.EXT)

### <caption 2>

<text 2>

**Remember:** <the one gotcha, one sentence>

<details><summary>Sources</summary>

- <each file/commit from SOURCES, one per line>
</details>
```

Word budget: caption <=12 words, text <=40 words per panel; hook + Remember <=60 words together. Every panel gets a caption and a text — an image alone is not a beat. Plain language, no jargon dumps. Image links are relative to `DIR`, so no folder prefix, and use the real extension (`01.webp` by default).

For a pending panel, write `![<title> — pending](<REL>/.wimu-social-brain/SLUG/NN.png)` where `<REL>` is one `..` per path segment of `DIR` relative to `REPO` (default `docs/wimu-social-brain/<slug>` → `../../..`), followed by one line: `_Pending: prompt at <prompt file>._`

## 6. Export, clean up, finish

0. Export a shareable copy: `node "$PLUGIN/scripts/export.mjs" --doc "DOC"` writes `DIR/SLUG.html` with every panel inlined, so the storybook can be sent as one file and opened in any browser. Run it after every write of `DOC`, including re-runs.
1. If **no** panel is pending: delete `SCRATCH` (only `REPO/.wimu-social-brain/SLUG`, never `.wimu-social-brain` itself). If deleting fails, say so in one line and continue. If any panel is pending, keep `SCRATCH` and say it is kept for the re-run.
2. `DIR` must now contain only `SLUG.md`, `SLUG.html` and `NN.EXT` files. List it. Delete only leftovers this plugin itself produces — `NN-*.png`, `NN-*.svg`, `README.md`, and a `raw/` folder from a v0.1 run. Anything else (other files, other folders) is the user's: leave it and tell them it is there.
3. `MODE=explain`: print the full contents of `DOC` in chat. `MODE=doc`: do not.
4. Print exactly: how many panels were produced, which backend was used (`image_gen (native)` for 3a.3a) and, when any result carried `usd` or `estimatedUsd`, the sum as `~$X.XX` (say `charged` when every panel had `usd`, else `estimated, approx. list prices 2026-08`), the path to `DOC` and to `SLUG.html` ("send this one to share"), and which panel numbers are pending with each one's prompt file — or "none pending". Then suggest, without editing anything: "Add `.wimu-social-brain/` to your `.gitignore` to keep prompts and unlabelled generations out of the repo." Do not commit anything.

---
name: init
description: Set up wimu-social-brain for this repo: creates wimu-social-brain.md (mascot, font, colors, tone, output folder) and generates one test image.
disable-model-invocation: true
---

# /wimu-social-brain:init

`REPO` = absolute path of the git root (`git rev-parse --show-toplevel`). Run every command from there.

`PLUGIN` = the plugin's install folder: the `CLAUDE_PLUGIN_ROOT` environment variable if set (Claude Code), otherwise two directories above this SKILL.md (Codex, OpenCode, others).

Questions below: use your harness's question tool when it has one (Claude Code: `AskUserQuestion`; Codex: `request_user_input`); otherwise ask in plain text and wait for the reply before continuing.

## 0. Existing config

Run `node "$PLUGIN/scripts/design.mjs" "REPO"` and read its `file` field. Do not look for the file yourself: a repo may have its own unrelated `design.md` (a product design doc), and that is not ours -- `file` is `null` in that case and you proceed as if no config exists. Never read, edit or overwrite a `design.md` that `file` does not point at.

- `file` is `null`: continue to step 1.
- `file` ends in `wimu-social-brain.md`: say so and ask one question: overwrite, or edit by hand? If they choose edit, stop. Only proceed on an explicit "overwrite" answer.
- `file` ends in `design.md` (a legacy wimu-social-brain config, recognised by its `# wimu-social-brain design` first line): say that the config file is now called `wimu-social-brain.md` and ask the same overwrite-or-edit question. On "overwrite", write `REPO/wimu-social-brain.md` in step 2 and tell the user the old `design.md` can be deleted; do not delete it yourself.

## 1. Ask (one at a time)

1. Mascot: (a) Use Flow, the default (b) Describe your own (c) I have 1-3 reference images. For (b) ask for 1-2 sentences describing shape, eyes, limbs, expression. For (c) ask for the paths, then still ask for the one-line description.
2. Font for labels: (a) Caveat, handwritten default (b) a local `.ttf`/`.otf` path.
3. Colors: (a) defaults orange/red/blue (b) three hex values for flow / warn / note.
4. Tone, 2-3 words (default "deadpan, absurd, clean").
5. Docs folder (default `docs/wimu-social-brain/`).

## 2. Write wimu-social-brain.md

Copy `$PLUGIN/templates/wimu-social-brain.md` to `REPO/wimu-social-brain.md` and edit in the answered fields; keep all comments and every field the user did not change.

## 3. Dependencies and backend

1. If `$PLUGIN/node_modules/sharp` is missing, run `npm install --silent` with cwd `$PLUGIN`.
2. `node "$PLUGIN/scripts/backend.mjs" detect --cwd "REPO"` -> prints `backend: ...`. Show that line to the user verbatim.
3. If the line starts with `backend: codex`, `backend: gemini-api`, `backend: openai-api` or `backend: openrouter`, continue to step 4. Otherwise it starts with `backend: manual (...)`; ask **one** question:

   "Automatic images need one of: (a) the Codex CLI signed in with a **paid ChatGPT plan** (Plus or higher) -- no per-image cost; (b) a **Gemini API key** -- about $0.03-0.13 per panel; (c) an **OpenAI API key** -- about $0.01-0.30 per panel; (d) an **OpenRouter key** -- one key for Gemini, GPT Image, FLUX, Seedream and more at vendor prices; (e) none / not now -- I write prompt files you paste into ChatGPT or Gemini yourself (manual). Prices are approximate list prices as of 2026-08."

   - (a): fix only what the detect line said is missing, in this order, then rerun detect and show the new line:
     - not found -> run `npm i -g @openai/codex` yourself (ask permission first), then re-check.
     - too old -> run `npm i -g @openai/codex@latest` yourself (ask permission first), then re-check.
     - not logged in -> `codex login` is interactive and opens a browser, so you cannot run it. Tell the user to run it in their terminal (Claude Code: `! codex login`; Codex: a second terminal), wait for them to say it is done, then re-check.
     If detect still does not say `backend: codex` after one round, say so, leave `backend: auto` in `wimu-social-brain.md` (codex is picked up whenever it becomes ready) and continue with manual for the test image.
   - (b): ask one more question, the model: "Nano Banana 2 (`gemini-3.1-flash-image`, ~$0.07/panel, ~$0.35 per 5-panel doc; best character consistency) / Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`, ~$0.03/panel, ~$0.17 per doc) / Nano Banana Pro (`gemini-3-pro-image`, ~$0.13/panel, ~$0.67 per doc)". Write `backend: gemini-api` and `image_model: <id>` into `## Output` of `REPO/wimu-social-brain.md`. Then say: get a key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY` in the environment (the agent must be restarted from a shell where it is exported). Re-run detect. If it now says `backend: gemini-api`, continue to step 4; otherwise say the key is not visible yet, leave the pin in place, and skip the test image (step 4) -- the next run picks it up.
   - (c): ask one more question, the model and quality: "GPT Image 2 (`gpt-image-2`; medium ~$0.10/panel, low ~$0.02, high ~$0.30) / GPT Image 1.5 (`gpt-image-1.5`; same tiers) / GPT Image 1 mini (`gpt-image-1-mini`; medium ~$0.02/panel, low ~$0.01, high ~$0.05)". Write `backend: openai-api`, `image_model: <id>` and `image_api_quality: <tier>` into `## Output`. Then say: get a key at https://platform.openai.com/api-keys and set `OPENAI_API_KEY` (same restart note). Re-run detect and proceed exactly as in (b).
   - (d): ask one more question, the model: "Nano Banana 2 (`google/gemini-3.1-flash-image`, ~$0.07/panel, ~$0.35 per 5-panel doc; best character consistency per dollar, recommended) / GPT Image 2 (`openai/gpt-image-2`, ~$0.10/panel, ~$0.50 per doc; top of the image-edit arena) / Seedream 5.0 Pro (`bytedance-seed/seedream-5-0-pro`, ~$0.05/panel, ~$0.23 per doc; best price-to-quality) / Nano Banana 2 Lite (`google/gemini-3.1-flash-lite-image`, ~$0.03/panel, ~$0.17 per doc; budget) / another id from https://openrouter.ai/api/v1/images/models". Write `backend: openrouter` and `image_model: <id>` into `## Output`. Then say: get a key at https://openrouter.ai/keys and set `OPENROUTER_API_KEY` (same restart note). Re-run detect and proceed exactly as in (b). Each panel reports the real charge.
   - (e): set `backend: manual` in `## Output` so later runs stop repeating the hint. They can change it back to `auto` any time.

   Never ask for, echo, or write the key itself anywhere.
4. Label font: `node "$PLUGIN/scripts/font.mjs" check --design-cwd "REPO"` -> one JSON line. `ok:true` -> nothing to do. `ok:false` means sharp cannot use the font file on this machine (macOS: it resolves fonts through CoreText and ignores font files, so every label would come out in Helvetica). Then:
   - If `installDir` is non-null, ask one question: "The label font (`<font>`) has to be installed for your user on this machine, or labels will render in the system font. Copy it into `<installDir>` now? (a) Yes (b) No, I'll do it myself." On (a) run `node "$PLUGIN/scripts/font.mjs" install --design-cwd "REPO"` and show its `ok` result; if still `ok:false`, show the `hint` line. On (b) show the `hint` line and continue.
   - If `installDir` is null, show the `hint` line and continue.

## 4. Test image

`<docs>` is the `docs:` folder from the wimu-social-brain.md just written (step 2). OUTDIR = `<docs>` with any trailing slash removed, plus `/_test` (no trailing slash, matching illustrate's DIR convention).

Invoke the `illustrate` skill (`skills/illustrate/SKILL.md`) from its step 0, with this brief block:

```
MODE: explain
TOPIC: wimu-social-brain test
SOURCES: (none)
BRIEF: A mascot hands a reader one clear picture instead of three paragraphs.
MAX_IMAGES: 1
OUTDIR: <that value>
```

Per illustrate step 0.3, OUTDIR is used as DIR instead of the slug-derived path.

## 5. Report

Print exactly: the `wimu-social-brain.md` path, the backend line from step 3.2, the test image path (or the pending prompt file, if generation fell back to manual), and these next commands:

```
/wimu-social-brain:brand-init        (write the brand guide posts are made from)
/wimu-social-brain:post <topic>      (generate an on-brand post)
/wimu-social-brain:init              (rerun any time to change wimu-social-brain.md)
```

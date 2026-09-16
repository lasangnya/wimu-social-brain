# wimu-social-brain

[![Release](https://img.shields.io/github/v/release/lasangnya/wimu-social-brain?display_name=tag&sort=semver)](https://github.com/lasangnya/wimu-social-brain/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >=20.9](https://img.shields.io/badge/node-%3E%3D20.9-brightgreen.svg)](package.json)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](https://code.claude.com/docs/en/plugins)
[![Tests](https://img.shields.io/badge/tests-node%3Atest-informational.svg)](test)
[![Image backends](https://img.shields.io/badge/backends-codex%20%7C%20gemini--api%20%7C%20openai--api%20%7C%20openrouter%20%7C%20manual-lightgrey.svg)](skills/illustrate/references/backends.md)

Turn a brand guide and a topic into on-brand social media posts — images and captions for Instagram and LinkedIn, including Stories/Reels and carousels. Your colors, your font, your style.

## Why

On-brand social posts are slow to make by hand. Each one means re-opening the brand doc, re-writing the same voice from memory, fighting a design tool for the image, then reformatting the caption per platform. So the posts slip, or they ship off-brand.

wimu-social-brain flips the work: write the brand **once** — voice, offers, CTAs, hashtags, look — then hand it a topic and get a ready-to-publish post kit back. One command, every platform, nothing posted without you.

## Install

One plugin, three harnesses. The skills and scripts are shared; only the install line differs.

**Claude Code**

```
/plugin marketplace add lasangnya/wimu-social-brain
/plugin install wimu-social-brain@wimu-social-brain
```

**Codex CLI** (>= 0.149)

```
codex plugin marketplace add lasangnya/wimu-social-brain
codex plugin add wimu-social-brain@wimu-social-brain
```

Or by hand in `~/.codex/config.toml`:

```toml
[marketplaces.wimu-social-brain]
source_type = "git"
source = "https://github.com/lasangnya/wimu-social-brain.git"

[plugins."wimu-social-brain@wimu-social-brain"]
enabled = true
```

In Codex, skills are called with `$`, not `/`: `$wimu-social-brain:init`, `$wimu-social-brain:post spring launch`, or just say it in plain words. Codex draws with its own `image_gen` tool when you start it with `codex --enable image_generation`; without that flag it runs the same image script as Claude Code, which needs network approval from inside Codex's sandbox (see [Backends](#backends)).

Two Codex-specific notes: it asks once per run to approve writing under the docs folder — say yes. And its `image_gen` tool keeps a PNG copy of every image it makes under `~/.codex/generated_images/` (Codex's own folder, not touched by this plugin); the finished images in your docs folder are still WebP, so clear that folder whenever you like.

**OpenCode, Cursor, and any other agent that reads `SKILL.md`**

```
npx skills add lasangnya/wimu-social-brain
```

This copies the `skills/` folder into the agent's skills directory; the scripts resolve their own location, so nothing else is needed.

Needs Node >=20.9; `sharp` installs itself on first run. From a clone: `git clone https://github.com/lasangnya/wimu-social-brain.git && cd wimu-social-brain && npm install && claude --plugin-dir .`

## Commands

| Command | Does | Example |
|---|---|---|
| `/wimu-social-brain:init` | Sets up the machine config `wimu-social-brain.md` (mascot, font, colors, backend) and draws one test image. | `/wimu-social-brain:init` |
| `/wimu-social-brain:brand-init` | Interviews you once and writes `brand.md`, the brand guide posts are made from. | `/wimu-social-brain:brand-init` |
| `/wimu-social-brain:post <topic> [instagram\|linkedin\|stories\|both\|all] [--carousel N]` | Writes an on-brand post kit for the topic: images, captions, `posts.json`. Never posts. | `/wimu-social-brain:post spring launch both` |

## Social posts

Two files drive everything, each written once:

- **`brand.md`** (run `/wimu-social-brain:brand-init`) — the brand as prose, plus 1-3 **style reference images** used as the visual anchor.
- **`wimu-social-brain.md`** (run `/wimu-social-brain:init`) — the machine config: colors, font, mascot, backend.

Then a topic is all it takes:

```
/wimu-social-brain:post spring launch both
```

It plans one post per platform, draws the focal image in your brand style through the same [backends](#backends), bakes the headline in your font, writes the caption in your voice, and leaves a **post kit**:

```
docs/wimu-social-brain/spring-launch/
  01-instagram.webp   02-linkedin.webp
  captions.md         # one ready-to-paste caption per platform, hashtags included
  posts.json          # platform, aspect, image, headline, caption, hashtags, cta, altText
```

## Formats

| Format | Aspect | Size |
|---|---|---|
| Instagram feed | 4:5 | 1080x1350 |
| Instagram Stories / Reels | 9:16 | 1080x1920 |
| LinkedIn | 1:1 | 1080x1080 |

Carousels (`--carousel N`): up to 10 slides on Instagram, up to 20 on LinkedIn. One caption per post; a slide headline is baked onto each slide.

## Your brand's look

`brand.md` is read as prose on every run. It holds positioning, audience, voice with example lines (the AI imitates these more than the adjectives), offerings, proof points, CTAs, brand hashtags, platform handles, the visual style in prose, and 1-3 **style reference images** — paths inside the repo, passed to the image backend as style anchors — plus an avoid list of what the brand never touches.

`wimu-social-brain.md` is the machine config the engine reads: mascot, label font, brand colors, output folder, backend. It lives at the repo root; `/wimu-social-brain:init` writes it, or write it by hand:

```markdown
## Mascot
name: Pixel
description: a squat grey robot on tank treads, one big round lens for an eye, stubby claw arms; calm, methodical
references:
  - brand/pixel-front.png
never: smiling, humanoid face, wheels instead of treads, standing idle
```

The mascot's `description` and `never` go into every prompt, so the same character shows up in every post. A silhouette that reads small (blob, box, simple robot) works best. Fonts, colors and the output folder live in the same file.

## Backends

`auto` picks the first one that works, top to bottom:

| Backend | Needs | ~Cost per image |
|---|---|---|
| `codex` | `npm i -g @openai/codex && codex login` with a **paid ChatGPT plan** | included in the plan |
| `gemini-api` | `GEMINI_API_KEY` ([key](https://aistudio.google.com/apikey)) | $0.03–0.13 · Nano Banana 2 |
| `openai-api` | `OPENAI_API_KEY` ([key](https://platform.openai.com/api-keys)) | $0.01–0.30 · GPT Image 2 |
| `openrouter` | `OPENROUTER_API_KEY` ([key](https://openrouter.ai/keys)) | $0.03–0.10 · Nano Banana 2, GPT Image 2, Seedream 5.0 Pro, 40+ more; real charge reported |
| `manual` | nothing | free · paste the prompt file into any image tool, save the result back |

Pin one with `backend:` in `wimu-social-brain.md`; `image_model:` picks the model. `/wimu-social-brain:init` shows the cost of each choice. Prices are list prices as of 2026-08.

**Inside Codex:** its default sandbox blocks network and hides the `codex` binary from nested commands, so the `codex` backend cannot be nested. Start Codex with `--enable image_generation` and the skill uses the native `image_gen` tool directly (same paid ChatGPT plan); otherwise approve running the generate command outside the sandbox when asked, or use `manual`.

## Output

The post kit is written under `docs/wimu-social-brain/<topic>/` and is **not** gitignored — posts can be committed like any other doc. Only the scratch folder `.wimu-social-brain/` (prompt files, unbaked generations) is ignored.

Nothing is ever posted automatically, and nothing is committed by the plugin. You paste the caption and upload the image yourself.

## Troubleshooting

**macOS labels render in Helvetica instead of Caveat** — sharp resolves fonts through CoreText, so the font must be installed once for your user. `/wimu-social-brain:init` offers to; by hand: `node "<plugin dir>/scripts/font.mjs" install`.

## Credits

The illustration method is adapted from **Ian Xiaohei Illustrations** by Ian (伊恩): https://github.com/helloianneo/ian-xiaohei-illustrations (MIT). Flow, the default mascot, is original to show-me-how. This project is a fork of show-me-how, MIT licensed; see [NOTICE.md](NOTICE.md).

# show-me-how

[![Release](https://img.shields.io/github/v/release/ShahriarBijoy/show-me-how?display_name=tag&sort=semver)](https://github.com/ShahriarBijoy/show-me-how/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >=20.9](https://img.shields.io/badge/node-%3E%3D20.9-brightgreen.svg)](package.json)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](https://code.claude.com/docs/en/plugins)
[![Tests](https://img.shields.io/badge/tests-node%3Atest-informational.svg)](test)
[![Image backends](https://img.shields.io/badge/backends-codex%20%7C%20gemini--api%20%7C%20openai--api%20%7C%20openrouter%20%7C%20manual-lightgrey.svg)](skills/illustrate/references/backends.md)

A Claude Code plugin that explains code, features and PRs as short mascot comics instead of walls of text — and turns your brand into on-brand social posts. This README is one.

![example](examples/hero.png)

## Why

I have a bit of ADHD. A long design doc or a dense README is hard for me to get through, even when I care about what's in it; the attention runs out before the paragraphs do.

![Flow buried under an endless scroll of paragraphs](assets/readme/why/01.webp)
Long docs lose the reader before the paragraph ends.

A picture of the idea, with a mascot acting it out, works for me like nothing else: I get it in one glance and it sticks. That's what this tool is for — dev teams handing knowledge to each other: the teammate who joins next week, the reviewer with 10 minutes, and anyone who reads the way I do. Instead of a long document nobody finishes, you share a short storyboard.

![Flow hands a teammate a four-panel strip; the teammate gets it](assets/readme/why/02.webp)
A short storyboard instead: the teammate gets it in one glance, and it sticks.

## Install

One plugin, three harnesses. The skills and scripts are shared; only the install line differs.

**Claude Code**

```
/plugin marketplace add ShahriarBijoy/show-me-how
/plugin install show-me-how@show-me-how
```

**Codex CLI** (>= 0.149)

```
codex plugin marketplace add ShahriarBijoy/show-me-how
codex plugin add show-me-how@show-me-how
```

Or by hand in `~/.codex/config.toml`:

```toml
[marketplaces.show-me-how]
source_type = "git"
source = "https://github.com/ShahriarBijoy/show-me-how.git"

[plugins."show-me-how@show-me-how"]
enabled = true
```

In Codex, skills are called with `$`, not `/`: `$show-me-how:init`, `$show-me-how:explain label overlay`, or just say it in plain words. Codex draws with its own `image_gen` tool when you start it with `codex --enable image_generation`; without that flag it runs the same image script as Claude Code, which needs network approval from inside Codex's sandbox (see [Backends](#backends)).

Two Codex-specific notes: it asks once per run to approve writing under the docs folder — say yes. And its `image_gen` tool keeps a PNG copy of every image it makes under `~/.codex/generated_images/` (Codex's own folder, not touched by this plugin); the finished panels in your docs folder are still WebP, so clear that folder whenever you like.

**OpenCode, Cursor, and any other agent that reads `SKILL.md`**

```
npx skills add ShahriarBijoy/show-me-how
```

This copies the `skills/` folder into the agent's skills directory; the scripts resolve their own location, so nothing else is needed.

Needs Node >=20.9; `sharp` installs itself on first run. From a clone: `git clone https://github.com/ShahriarBijoy/show-me-how.git && cd show-me-how && npm install && claude --plugin-dir .`

## Commands

| Command | Does | Example |
|---|---|---|
| `/show-me-how:init` | Sets up `show-me-how.md` (mascot, font, colors, backend) and draws one test image. | `/show-me-how:init` |
| `/show-me-how:explain <topic>` | Explains a feature or concept as a storybook, in chat and on disk. | `/show-me-how:explain label overlay` |
| `/show-me-how:write-doc [path\|folder\|topic]` | Writes the storybook to `docs/show-me-how/<topic>/`. | `/show-me-how:write-doc scripts/` |
| `/show-me-how:pr-review [pr\|url]` | Draws what a PR does. Never posts or commits. | `/show-me-how:pr-review 412` |
| `/show-me-how:brand-init` | Interviews you once and writes `brand.md`, the brand guide posts are written from. | `/show-me-how:brand-init` |
| `/show-me-how:post <topic> [instagram\|linkedin\|both]` | Writes an on-brand post kit (image + caption per platform). Never posts. | `/show-me-how:post spring launch both` |

## Social posts

Same engine, a different job: instead of a storybook, `/show-me-how:post` writes an on-brand social post for Instagram and/or LinkedIn.

Two files drive it, both edited once:

- **`brand.md`** (run `/show-me-how:brand-init`) — the brand as prose: positioning, audience, voice with example lines, offerings, proof points, CTAs, hashtags and visual style, plus 1-3 **style reference images** used as the visual anchor.
- **`show-me-how.md`** — the machine config the storybook skills already use (colors, font, backend).

```
/show-me-how:post spring launch both
```

It plans one post per platform (Instagram 4:5 · 1080x1350, LinkedIn 1:1 · 1080x1080), draws the focal image in your brand style through the same [backends](#backends), bakes the headline in your font, and leaves a post kit:

```
docs/show-me-how/spring-launch/
  01-instagram.webp   02-linkedin.webp
  captions.md         # one ready-to-paste caption per platform, hashtags included
  posts.json          # platform, aspect, image, headline, caption, hashtags, cta, altText
```

Nothing is posted automatically and nothing is committed. The default `docs/show-me-how/` folder is gitignored, so set `docs:` in `show-me-how.md` to a tracked folder (e.g. `social/`) if you want the kits in version control.

## How it works

![Flow reads a stack of source files with a magnifying glass and writes a tiny brief](assets/readme/how/01.webp)
1. Reads the files or commits you point at and writes a brief under 200 words.

![Flow pins four sticky notes on a wall: setup, action, twist, payoff](assets/readme/how/02.webp)
2. Turns the brief into beats — setup, action, twist, payoff — one panel each, no padding.

![Flow paints four easels at once](assets/readme/how/03.webp)
3. Generates every panel in parallel through the image backend, text-free.

![Flow staples the labelled panels into one doc and posts a single HTML file](assets/readme/how/04.webp)
4. Overlays labels and a caption in your brand font, then writes one markdown doc plus one self-contained HTML file.

Output: `docs/show-me-how/<topic>/<topic>.md` with `01.webp`, `02.webp`… inline, plus `<topic>.html` with the panels embedded — one file you can send to anyone.

## Backends

![Flow at a signpost with four roads: ChatGPT plan, API key, OpenRouter, by hand](assets/readme/setup/01.webp)
Four ways to make pictures; `auto` takes the first road that is open.

`auto` picks the first one that works, top to bottom:

| Backend | Needs | ~Cost per panel |
|---|---|---|
| `codex` | `npm i -g @openai/codex && codex login` with a **paid ChatGPT plan** | included in the plan |
| `gemini-api` | `GEMINI_API_KEY` ([key](https://aistudio.google.com/apikey)) | $0.03–0.13 · Nano Banana 2 |
| `openai-api` | `OPENAI_API_KEY` ([key](https://platform.openai.com/api-keys)) | $0.01–0.30 · GPT Image 2 |
| `openrouter` | `OPENROUTER_API_KEY` ([key](https://openrouter.ai/keys)) | $0.03–0.10 · Nano Banana 2, GPT Image 2, Seedream 5.0 Pro, 40+ more; real charge reported |
| `manual` | nothing | free · paste the prompt file into any image tool, save the result back |

Pin one with `backend:` in `show-me-how.md`; `image_model:` picks the model. `/show-me-how:init` shows the cost of each choice. Prices are list prices as of 2026-08.

**Inside Codex:** its default sandbox blocks network and hides the `codex` binary from nested commands, so the `codex` backend cannot be nested. Start Codex with `--enable image_generation` and the skill uses the native `image_gen` tool directly (same paid ChatGPT plan); otherwise approve running the generate command outside the sandbox when asked, or use `manual`.

## Your own mascot

![Flow swaps its own silhouette for a robot on a mascot sheet](assets/readme/setup/02.webp)
Describe your character once; every panel from then on stars it instead of Flow.

`show-me-how.md` at the repo root (run `/show-me-how:init`, or write it by hand):

```markdown
## Mascot
name: Pixel
description: a squat grey robot on tank treads, one big round lens for an eye, stubby claw arms; calm, methodical
references:
  - brand/pixel-front.png
never: smiling, humanoid face, wheels instead of treads, standing idle
```

`description` and `never` go into every prompt; `references` are optional images used as style anchors. A silhouette that reads small (blob, box, simple robot) works best. Fonts, colors and the output folder live in the same file. (Before 0.5 this file was `design.md`; a legacy one starting with `# show-me-how design` still loads, and any other `design.md` is ignored.)

## Troubleshooting

**macOS labels render in Helvetica instead of Caveat** — sharp resolves fonts through CoreText, so the font must be installed once for your user. `/show-me-how:init` offers to; by hand: `node "<plugin dir>/scripts/font.mjs" install`.

## Credits

The illustration method is adapted from **Ian Xiaohei Illustrations** by Ian (伊恩): https://github.com/helloianneo/ian-xiaohei-illustrations (MIT). Flow, the default mascot, is original to show-me-how. MIT licensed; see [NOTICE.md](NOTICE.md).

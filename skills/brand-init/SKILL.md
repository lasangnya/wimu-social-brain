---
name: brand-init
description: Set up the brand guide for social posts — interviews you once and writes brand.md (positioning, voice, offerings, CTAs, hashtags, visual style, style reference images) at the repo root. Run before /show-me-how:post.
disable-model-invocation: true
---

# /show-me-how:brand-init

`REPO` = absolute path of the git root (`git rev-parse --show-toplevel`). Run every command from there.

`PLUGIN` = the plugin's install folder: the `CLAUDE_PLUGIN_ROOT` environment variable if set (Claude Code), otherwise two directories above this SKILL.md (Codex, OpenCode, others).

Questions below: use your harness's question tool when it has one (Claude Code: `AskUserQuestion`; Codex: `request_user_input`); otherwise ask in plain text and wait for the reply before continuing. Ask one question at a time.

## 0. Existing brand.md

If `REPO/brand.md` exists, say so and ask one question: overwrite, or edit by hand? If they choose edit, stop. Only proceed on an explicit "overwrite" answer; read the existing file first, so a "keep" answer below leaves its values in place.

## 1. Ask (one at a time)

1. Positioning: the one-liner — what you make, for whom, in one sentence.
2. Audience: who you are talking to; their role, their day, their pain.
3. Voice: 3-5 adjectives, then 2-3 example lines that sound like the brand, then one "do" and one "don't".
4. Offerings or products: name + one-line promise each.
5. Proof points: numbers, names, results.
6. Calls to action: the primary one (with its URL) and a softer secondary.
7. Brand hashtags: 3-8 tags to rotate through.
8. Platform handles: instagram, linkedin.
9. Visual style: colors, fonts, imagery direction in one or two sentences of prose.
10. Style reference images: ask the user to place 1-3 images somewhere in the repo (e.g. under `brand/`) and give you the paths; they are passed to the image backend as style anchors and listed under `style references:` in brand.md.
11. Avoid list: content and visuals the brand never touches.
12. Platform notes (optional): cadence, link policy, anything platform-specific.

Every field the user skips or answers "keep" stays as the template has it.

## 2. Write brand.md

Copy `$PLUGIN/templates/brand.md` to `REPO/brand.md` and edit in the answered fields; keep all comments and every field the user did not change. If a `style references:` image path does not exist on disk yet, say so once and keep the line anyway — the post skill drops missing refs at generate time.

## 3. Report

Print exactly: the `brand.md` path, one line reminding the user that style reference images must live inside the repo, and the next command:

```
/show-me-how:post <topic> [instagram|linkedin|both]
```

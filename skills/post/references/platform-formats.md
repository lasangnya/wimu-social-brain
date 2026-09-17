# Platform formats

Compact specs for the three formats `/wimu-social-brain:post` supports: Instagram feed, Instagram Stories/Reels, and LinkedIn.

| | Instagram feed | Instagram Stories/Reels | LinkedIn |
|---|---|---|---|
| Platform word | `instagram` | `stories` | `linkedin` |
| Aspect (this skill) | 4:5 portrait, 1080x1350 | 9:16 vertical, 1080x1920 | 1:1 square, 1080x1080 |
| Also supported | 1:1 square, 1080x1080 | — | 1.91:1 landscape, 1200x627 (link posts) |
| Safe margins for baked text | label centres within x 0.12-0.88, y 0.08-0.94 | x 0.12-0.88, y 0.16-0.78 (safe area below) | x 0.12-0.88, y 0.08-0.94 |
| Carousel limit | up to 10 slides | up to 20 slides | up to 20 slides |
| Caption limit | 2,200 chars | 2,200 chars (Reels) | ~3,000 chars |
| Visible before the fold | first ~125 chars | first ~125 chars | first ~210 chars |
| Hashtags | up to 30, mixed broad-reach + niche | up to 30, same mix as feed | 3-5, professional |
| Tone | visual-first, warmer, looser | visual-first, faster, punchier | professional, direct |

Notes:

- 4:5 takes the most feed height on Instagram; prefer it over 1:1 for reach. The profile grid crops 4:5 to a 1:1 centre square, so keep the focal subject and baked headline centre-safe.
- LinkedIn truncates early: the hook must land in the first two lines.
- Stories safe area: on a 9:16 frame the platform UI — avatar and name, the progress bar, the reply field — covers roughly the top 14% and the bottom 20%. Keep all baked text clear of those bands: label centres stay within y 0.16-0.78 and the headline zone is mid-frame, never at the top.
- Carousels are ONE post with ONE caption, not N posts: slide 1 is the hook — the only slide guaranteed to be seen — the last slide carries the CTA, and the slides between carry the value. The per-slide headlines are listed in `captions.md` for reference; they are not separate captions.
- LinkedIn carousels are "document posts" (a PDF upload). There is no PDF assembly here — the skill writes each slide as its own image; upload them in order, or stitch them into a PDF by hand first.
- One focal idea per image. A post is read in under a second while scrolling; if the idea needs several pictures, that is a carousel — and even then, one focal idea per slide.

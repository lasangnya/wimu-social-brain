# Social post image prompt template (no text in image)

Fill every {slot}. One prompt per image — one per platform, or one per slide per platform for a carousel. Send via `scripts/backend.mjs generate` with the platform's `--aspect` (`4:5` instagram, `9:16` stories, `1:1` linkedin), and the brand's style reference images as `--ref`.

Aspect, orientation and dimensions per platform: instagram `4:5` `portrait` `1080x1350` · stories `9:16` `vertical` `1080x1920` · linkedin `1:1` `square` `1080x1080`.

```text
One standalone {aspect} {orientation} illustration, {WxH}.

Brand style: {the "look" prose from brand.md ## Visual style — colors, line quality, imagery direction}. Match the style reference images passed with this prompt.

Brand voice: {the voice adjectives from brand.md}. The image should feel the way the brand sounds.

Recurring character (only when wimu-social-brain.md defines one): {mascot.name}: {mascot.description}. Never: {mascot.never}. {mascot.name} must PERFORM the post's idea, not stand beside it.

Carousel continuity (only when this image is one slide of a carousel — delete the whole paragraph for a single-image post): this is {slide N of M — e.g. "slide 2 of 5"} in one carousel. Every slide shares the same palette, the same character and the same world; the set reads as one deliberate visual progression. {Where this slide sits in that progression: what carries over from the slide before and what changes now.}

Focal idea: {the ONE visual idea of this image, one sentence}.
Scene: {what is physically happening; 1-2 low-tech objects; the single action that carries the idea}.
Composition: one clear focal point, readable at feed-scroll size; the subject fills 40-60% of the canvas; leave {headline zone — "the top quarter" for instagram/linkedin; for stories the vertical middle of the frame, clear of the top ~14% and bottom ~20% that platform UI covers} as clear empty space, because the headline is baked in there later.

Accent color (sparingly, only for the main movement or emphasis): {colors.flow}. Everything else in the brand's neutral palette.

ABSOLUTELY NO TEXT, LETTERS, NUMBERS OR LABELS anywhere in the image. The headline and any other words are added afterwards by the label script. Leave clear empty space where the headline will sit.
```

Keep the NO TEXT paragraph whenever the headline is baked on the image (the default). Remove it only when the user explicitly asked for words rendered inside the generation — and then still ban everything except the exact headline string.

Retry prompt (a QA check failed):

```text
Regenerate with the same idea, aspect and layout, but {the failed QA rule as an instruction}. Keep the brand style, the empty headline zone, no text.
```

// Aspect ratios the image backends can be asked for, and the closest size each API accepts.
//
// Gemini and OpenRouter take the ratio string directly. The gpt-image models (openai-api) only
// accept three fixed sizes -- 1024x1024 (1:1), 1024x1536 (2:3 portrait) and 1536x1024 (3:2
// landscape) -- so 4:5 and 9:16 both map to the portrait size and 16:9 maps to the landscape size.
// `label.mjs` positions every overlay as a fraction of the real image, so nothing downstream
// depends on the exact ratio the model actually returns.
//
// 16:9 is the default: every pre-social caller (the storybook skills) expects a landscape panel,
// so keeping it the default is what lets `--aspect` stay purely additive.
export const ASPECTS = Object.freeze({
  '16:9': { phrase: 'Landscape 16:9', openaiSize: '1536x1024' },
  '1:1': { phrase: 'Square 1:1', openaiSize: '1024x1024' },
  '4:5': { phrase: 'Portrait 4:5', openaiSize: '1024x1536' },
  '9:16': { phrase: 'Vertical 9:16', openaiSize: '1024x1536' },
});

export const DEFAULT_ASPECT = '16:9';
export const ASPECT_NAMES = Object.freeze(Object.keys(ASPECTS));

// '' / undefined mean "use the default", so an unset config or CLI flag behaves like today.
// Anything else must be a known ratio: a typo should fail before a slow generation, the same way
// an unknown image_model does in lib/backends.mjs.
export function normalizeAspect(aspect) {
  if (aspect === undefined || aspect === null || aspect === '') return DEFAULT_ASPECT;
  const key = String(aspect).trim();
  if (!Object.prototype.hasOwnProperty.call(ASPECTS, key)) {
    throw new Error(`aspect "${aspect}" is not supported. Use ${ASPECT_NAMES.join(' | ')}`);
  }
  return key;
}

// Human phrase that goes into the text prompt, e.g. "Portrait 4:5".
export function aspectPhrase(aspect) {
  return ASPECTS[normalizeAspect(aspect)].phrase;
}

// The size string the openai-api images endpoints accept for this ratio.
export function openaiAspectSize(aspect) {
  return ASPECTS[normalizeAspect(aspect)].openaiSize;
}

export const LONG_TEXT_THRESHOLD = 200
export const LONG_TEXT_PREVIEW_LEN = 140

export function splitLongText(text, threshold = LONG_TEXT_THRESHOLD, previewLen = LONG_TEXT_PREVIEW_LEN) {
  const s = typeof text === 'string' ? text : ''
  const chars = Array.from(s)
  if (chars.length <= threshold) return { isLong: false, length: chars.length, preview: s }
  return { isLong: true, length: chars.length, preview: chars.slice(0, previewLen).join('') }
}

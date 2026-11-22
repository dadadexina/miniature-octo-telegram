const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export function splitGraphemes(value) {
  const text = String(value ?? '')
  if (!text) return []
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment)
  return Array.from(text)
}

export function charLength(value) {
  return splitGraphemes(value).length
}

export function truncateChars(value, max) {
  const parts = splitGraphemes(value)
  const limit = Math.max(0, Number(max) || 0)
  if (parts.length <= limit) return parts.join('')
  return parts.slice(0, limit).join('')
}

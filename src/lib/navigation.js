export function canGoBack(historyState = globalThis.history?.state) {
  const idx = historyState?.idx
  if (typeof idx === 'number') return idx > 0
  return Number(globalThis.history?.length || 1) > 1
}

export function goBackOr(navigate, fallback, { replace = true } = {}) {
  if (canGoBack()) {
    navigate(-1)
    return
  }
  navigate(fallback, { replace })
}

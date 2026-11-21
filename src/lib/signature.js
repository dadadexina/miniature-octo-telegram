export const SIGNATURE_MAX = 30

const KEY_PREFIX = 'eink:signature:v1:'

function storageKey(userId) {
  return `${KEY_PREFIX}${userId || 'guest'}`
}

export function normalizeSignature(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIGNATURE_MAX)
}

export function loadLocalSignature(userId) {
  if (!userId) return ''
  try {
    return normalizeSignature(globalThis.localStorage?.getItem(storageKey(userId)) || '')
  } catch {
    return ''
  }
}

export function saveLocalSignature(userId, value) {
  const next = normalizeSignature(value)
  if (!userId) return next
  try {
    if (next) globalThis.localStorage?.setItem(storageKey(userId), next)
    else globalThis.localStorage?.removeItem(storageKey(userId))
  } catch {
    // 存储不可用时仅保留内存状态
  }
  return next
}

export const DIGEST_STORAGE_KEY = 'eink:notification-digest:v1'
export const DIGEST_MAX_ITEMS = 100

function storageKey(userId) {
  return `${DIGEST_STORAGE_KEY}:${userId || 'anon'}`
}

export function readDigestQueue(userId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.fromId === 'string' && item.fromId)
  } catch {
    return []
  }
}

export function writeDigestQueue(userId, items, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey(userId), JSON.stringify(items))
  } catch {
    // 存储不可用时摘要仅在内存中流转
  }
}

export function queueDigestItem(userId, { fromId, fromName = '' }, { storage, now = Date.now() } = {}) {
  if (!fromId) return readDigestQueue(userId, storage).length
  const items = readDigestQueue(userId, storage)
  items.push({ fromId, fromName: String(fromName || ''), at: new Date(now).toISOString() })
  const capped = items.slice(-DIGEST_MAX_ITEMS)
  writeDigestQueue(userId, capped, storage)
  return capped.length
}

export function clearDigestQueue(userId, storage = globalThis.localStorage) {
  try {
    storage?.removeItem(storageKey(userId))
  } catch {
    // 清理失败时下次写入会覆盖
  }
}

export function summarizeDigest(items) {
  const list = Array.isArray(items) ? items.filter((item) => item?.fromId) : []
  if (!list.length) return null
  const senders = new Map()
  for (const item of list) {
    if (!senders.has(item.fromId) || (!senders.get(item.fromId) && item.fromName)) {
      senders.set(item.fromId, item.fromName || '')
    }
  }
  const names = [...senders.values()].filter(Boolean)
  const shown = names.slice(0, 3)
  const suffix = names.length > 3 ? ' 等' : ''
  const body = shown.length
    ? `你有 ${list.length} 条未读，来自 ${senders.size} 人：${shown.join('、')}${suffix}`
    : `你有 ${list.length} 条未读，来自 ${senders.size} 人`
  return { total: list.length, senders: senders.size, title: '收件摘要', body }
}

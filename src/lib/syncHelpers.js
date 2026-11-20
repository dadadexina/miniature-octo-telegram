export function mergeReadAtMaps(base, incoming) {
  const out = { ...(base || {}) }
  Object.keys(incoming || {}).forEach((key) => {
    out[key] = Math.max(out[key] || 0, incoming[key] || 0)
  })
  return out
}

export function recomputeUnreadCounts({ messages, meId, readAtMap = {}, activePeerId = null }) {
  const counts = {}
  ;(messages || []).forEach((msg) => {
    if (!msg || msg.toId !== meId || msg.recalledAt) return
    const peer = msg.fromId
    if (!peer || peer === meId || peer === activePeerId) return
    if ((msg.time || 0) > (readAtMap[peer] || 0)) counts[peer] = (counts[peer] || 0) + 1
  })
  return counts
}

export function friendlyInsertError(errorMsg = '', permission = false) {
  const msg = String(errorMsg || '').toLowerCase()
  if (permission || msg.includes('row-level security') || msg.includes('42501')) {
    return '消息发送失败：对方可能已将你拉黑，或你们还不是好友'
  }
  return errorMsg || '发送失败'
}

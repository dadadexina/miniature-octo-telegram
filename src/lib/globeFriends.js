function validPair(pair) {
  return Array.isArray(pair) && pair.length === 2 && pair[0] && pair[1]
}

export function focusLinks(links, focusId) {
  if (!focusId) return Array.isArray(links) ? links : []
  return (Array.isArray(links) ? links : []).filter(
    (pair) => validPair(pair) && (pair[0] === focusId || pair[1] === focusId)
  )
}

export function mutualFriendIds(links, meId, friendId) {
  if (!friendId) return []
  const ids = new Set()
  for (const pair of focusLinks(links, friendId)) {
    const other = pair[0] === friendId ? pair[1] : pair[0]
    if (!other || other === meId || other === friendId) continue
    ids.add(other)
  }
  return [...ids]
}

export function locationAgeLabel(updatedAt, now = Date.now()) {
  const timestamp = Date.parse(updatedAt || '')
  if (!Number.isFinite(timestamp)) return ''
  const diff = Math.max(0, now - timestamp)
  if (diff < 60 * 1000) return '刚刚更新'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前更新`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前更新`
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前更新`
  }
  return `${new Date(timestamp).toLocaleDateString('zh-CN')} 更新`
}

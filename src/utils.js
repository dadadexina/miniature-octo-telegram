export function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return `昨天 ${hh}:${mm}`
  const mon = d.getMonth() + 1
  const day = d.getDate()
  if (d.getFullYear() === now.getFullYear()) return `${mon}月${day}日 ${hh}:${mm}`
  return `${d.getFullYear()}/${mon}/${day}`
}

export function formatRelativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`
  return formatTime(ts)
}

export function formatChatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function shortId(id = '') {
  if (id.startsWith('u_demo_')) return id.replace('u_demo_', '')
  return id
}

export function displayId(user) {
  if (!user) return ''
  return user.publicId || shortId(user.id)
}

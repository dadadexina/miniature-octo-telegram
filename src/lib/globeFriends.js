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

export function groupCities(people = []) {
  const groups = new Map()
  for (const person of people) {
    if (!person?.id || person.located !== true || !person.place) continue
    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) continue
    const current = groups.get(person.place) || {
      name: person.place,
      count: 0,
      lat: 0,
      lng: 0,
      people: [],
    }
    current.count += 1
    current.lat += person.lat
    current.lng += person.lng
    current.people.push(person)
    groups.set(person.place, current)
  }
  return [...groups.values()]
    .map((city) => ({
      ...city,
      lat: city.lat / city.count,
      lng: city.lng / city.count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
}

export function linksForCity(links = [], nodes = [], city = '') {
  if (!city) return Array.isArray(links) ? links : []
  const cityIds = new Set(
    (Array.isArray(nodes) ? nodes : [])
      .filter((node) => node?.place === city)
      .map((node) => node.id)
  )
  if (!cityIds.size) return []
  return (Array.isArray(links) ? links : []).filter(
    (pair) => validPair(pair) && (cityIds.has(pair[0]) || cityIds.has(pair[1]))
  )
}

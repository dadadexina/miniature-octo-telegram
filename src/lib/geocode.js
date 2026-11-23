const ENDPOINT = 'https://photon.komoot.io/api/'
const CACHE_LIMIT = 48
const cache = new Map()

const COUNTRY_KINDS = new Set(['country'])
const REGION_KINDS = new Set(['state', 'region', 'province'])
const CITY_KINDS = new Set(['city'])
const COUNTY_KINDS = new Set(['county', 'district', 'suburb', 'borough'])
const TOWN_KINDS = new Set(['town'])
const VILLAGE_KINDS = new Set(['village', 'hamlet', 'locality', 'neighbourhood'])

export function searchAltitude(kind, type = '') {
  const value = String(kind || type || '').toLowerCase()
  if (COUNTRY_KINDS.has(value)) return 0.08
  if (REGION_KINDS.has(value)) return 0.05
  if (CITY_KINDS.has(value)) return 0.008
  if (COUNTY_KINDS.has(value)) return 0.004
  if (TOWN_KINDS.has(value)) return 0.003
  if (VILLAGE_KINDS.has(value)) return 0.0015
  return 0.001
}

function uniqueParts(values) {
  const seen = new Set()
  return values.filter((value) => {
    const text = String(value || '').trim()
    if (!text || seen.has(text)) return false
    seen.add(text)
    return true
  })
}

export function mapPhotonFeature(feature, index = 0) {
  if (!feature || feature.type !== 'Feature') return null
  const coordinates = feature.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const lng = Number(coordinates[0])
  const lat = Number(coordinates[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const props = feature.properties || {}
  const name =
    String(props.name || '').trim() ||
    [props.street, props.housenumber].filter(Boolean).join(' ').trim() ||
    String(props.city || props.county || props.state || '').trim()
  if (!name) return null
  const detail = uniqueParts([props.district, props.city, props.county, props.state, props.country])
    .filter((part) => part !== name)
    .slice(0, 3)
    .join(' · ')
  const kind = String(props.osm_value || props.type || '').toLowerCase()
  return {
    id: `${props.osm_type || props.type || 'geo'}:${props.osm_id || `${lat},${lng},${index}`}`,
    name,
    detail,
    lat,
    lng,
    kind,
    altitude: searchAltitude(kind, props.type),
    source: 'osm',
  }
}

export function mergePlaceResults(online = [], local = []) {
  const merged = []
  const seen = new Set()
  const add = (place) => {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return
    const key = `${String(place.name).trim().toLowerCase()}|${place.lat.toFixed(3)}|${place.lng.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    merged.push(place)
  }
  online.forEach(add)
  local.forEach(add)
  return merged
}

function buildUrl(query, { lat, lng, limit }) {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
  }
  return url.toString()
}

export async function searchPlacesOnline(query, options = {}) {
  const text = String(query || '').trim()
  if (text.length < 2) return { ok: true, places: [] }
  const lat = Number(options.lat)
  const lng = Number(options.lng)
  const limit = Math.min(12, Math.max(1, Number(options.limit) || 8))
  const key = `${text.toLowerCase()}|${Number.isFinite(lat) ? lat.toFixed(2) : ''}|${Number.isFinite(lng) ? lng.toFixed(2) : ''}|${limit}`
  if (cache.has(key)) return { ok: true, places: cache.get(key) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const forwardAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', forwardAbort, { once: true })
  }
  try {
    const response = await fetch(buildUrl(text, { lat, lng, limit }), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('地名搜索暂不可用')
    const payload = await response.json()
    const places = (payload.features || [])
      .map((feature, index) => mapPhotonFeature(feature, index))
      .filter(Boolean)
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
    cache.set(key, places)
    return { ok: true, places }
  } catch (error) {
    if (options.signal?.aborted) return { ok: false, aborted: true, error: '', places: [] }
    return { ok: false, error: error?.name === 'AbortError' ? '地名搜索超时' : error?.message || '地名搜索失败', places: [] }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}

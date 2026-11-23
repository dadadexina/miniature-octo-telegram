import { haversineKm } from './geo'

const ENDPOINT = 'https://photon.komoot.io/api/'
const DEMOTED_KINDS = new Set([
  'bus_stop',
  'bicycle_rental',
  'parking',
  'taxi',
  'fuel',
  'service',
  'residential',
  'unclassified',
  'footway',
  'path',
  'primary',
  'secondary',
  'tertiary',
  'trunk',
  'motorway',
])
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

const STATION_SUFFIXES = ['地铁站', '轻轨站', '火车站', '站']

function stripStationSuffix(text) {
  for (const suffix of STATION_SUFFIXES) {
    if (text.endsWith(suffix)) return text.slice(0, text.length - suffix.length).trim()
  }
  return ''
}

export function buildQueryVariants(query) {
  const base = String(query || '').trim()
  if (!base) return []
  const variants = []
  const add = (value) => {
    const text = String(value || '').trim()
    if (text.length < 2 || text === base || variants.includes(text)) return
    variants.push(text)
  }
  const withoutCityMetro = base.replace(/^[\u4e00-\u9fa5]{2,6}地铁/, '')
  if (withoutCityMetro !== base) add(withoutCityMetro)
  const core = stripStationSuffix(withoutCityMetro)
  if (core) add(core)
  const withoutMetro = base.replace(/地铁|轨道交通/g, '').trim()
  if (withoutMetro !== base) add(withoutMetro)
  add(stripStationSuffix(withoutMetro))
  add(stripStationSuffix(base))
  return [base, ...variants].slice(0, 3)
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

async function requestPlaces(text, { lat, lng, limit, signal }) {
  const response = await fetch(buildUrl(text, { lat, lng, limit }), {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error('地名搜索暂不可用')
  const payload = await response.json()
  return (payload.features || [])
    .map((feature, index) => mapPhotonFeature(feature, index))
    .filter(Boolean)
}

export async function searchPlacesOnline(query, options = {}) {
  const text = String(query || '').trim()
  if (text.length < 2) return { ok: true, places: [] }
  const lat = Number(options.lat)
  const lng = Number(options.lng)
  const limit = Math.min(12, Math.max(1, Number(options.limit) || 8))
  const key = `${text.toLowerCase()}|${Number.isFinite(lat) ? lat.toFixed(2) : ''}|${Number.isFinite(lng) ? lng.toFixed(2) : ''}|${limit}`
  if (cache.has(key)) return { ok: true, places: cache.get(key) }
  const variants = buildQueryVariants(text)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const forwardAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', forwardAbort, { once: true })
  }
  try {
    const settled = await Promise.allSettled(
      variants.map((variant) =>
        requestPlaces(variant, {
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
          limit,
          signal: controller.signal,
        })
      )
    )
    const seen = new Set()
    const candidates = []
    settled.forEach((result, variantIndex) => {
      if (result.status !== 'fulfilled') return
      result.value.forEach((place) => {
        const placeKey = `${place.name}|${place.lat.toFixed(3)}|${place.lng.toFixed(3)}`
        if (seen.has(placeKey)) return
        seen.add(placeKey)
        candidates.push({ place, variantIndex })
      })
    })
    if (!candidates.length) {
      const failure = settled.find((result) => result.status === 'rejected')
      throw failure?.reason || new Error('没有找到匹配地点')
    }
    const hasBias = Number.isFinite(lat) && Number.isFinite(lng)
    const normalizedVariants = variants.map((variant) => variant.replace(/\s+/g, ''))
    const matchRankOf = (place) => {
      const name = String(place.name || '').replace(/\s+/g, '')
      if (!name) return 3
      if (normalizedVariants.includes(name)) return 0
      if (normalizedVariants.some((variant) => variant.includes(name) || name.includes(variant))) {
        return 1
      }
      return 2
    }
    const rankOf = (place) => (DEMOTED_KINDS.has(place.kind) ? 1 : 0)
    const distanceOf = (place) => (hasBias ? haversineKm({ lat, lng }, place) : 0)
    candidates.sort((a, b) => {
      const match = matchRankOf(a.place) - matchRankOf(b.place)
      if (match !== 0) return match
      const rank = rankOf(a.place) - rankOf(b.place)
      if (rank !== 0) return rank
      if (hasBias) {
        const distance = distanceOf(a.place) - distanceOf(b.place)
        if (Math.abs(distance) > 0.0001) return distance
      }
      return a.variantIndex - b.variantIndex
    })
    const places = candidates.slice(0, limit).map((item) => item.place)
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

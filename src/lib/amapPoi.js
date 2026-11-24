const AMAP_AROUND_URL = 'https://restapi.amap.com/v5/place/around'
const CACHE_TTL = 10 * 60 * 1000

export const AMAP_POI_MIN_ZOOM = 13.5

export const AMAP_POI_CATEGORIES = {
  food: { types: '050000', label: '餐饮' },
  lodging: { types: '100000', label: '酒店' },
  shopping: { types: '060000', label: '购物' },
  attraction: { types: '110000', label: '景点' },
  transit: { types: '150100|150200|150500|150600|150700', label: '交通' },
  community: { types: '120300', label: '小区' },
}

const ALL_TYPES = Object.values(AMAP_POI_CATEGORIES)
  .map((category) => category.types)
  .join('|')

const cache = new Map()

function envKey() {
  try {
    return String(import.meta.env?.VITE_AMAP_KEY || '').trim()
  } catch {
    return ''
  }
}

export function amapPoiKey() {
  return envKey()
}

export function hasAmapPoiKey() {
  return Boolean(envKey())
}

export function amapPoiTypes(categoryId) {
  if (categoryId === 'all') return ALL_TYPES
  return AMAP_POI_CATEGORIES[categoryId]?.types || ''
}

export function amapRadiusForZoom(zoom) {
  if (!Number.isFinite(zoom)) return 4000
  if (zoom >= 18) return 300
  if (zoom >= 17) return 500
  if (zoom >= 16) return 1000
  if (zoom >= 15) return 2000
  if (zoom >= 14) return 4000
  if (zoom >= 13.5) return 8000
  return 12000
}

const PI = Math.PI
const A = 6378245
const EE = 0.006693421622965943

export function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return ret
}

function transformLng(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return ret
}

export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng }
  const dLat = transformLat(lng - 105, lat - 35)
  const dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const deltaLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  const deltaLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lat: lat + deltaLat, lng: lng + deltaLng }
}

export function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng }
  let wLat = lat
  let wLng = lng
  for (let i = 0; i < 3; i += 1) {
    const gcj = wgs84ToGcj02(wLat, wLng)
    wLat += lat - gcj.lat
    wLng += lng - gcj.lng
  }
  return { lat: wLat, lng: wLng }
}

export function amapPoiCategoryOf(typecode) {
  const code = String(typecode || '')
  if (code.startsWith('05')) return 'food'
  if (code.startsWith('10')) return 'lodging'
  if (code.startsWith('06')) return 'shopping'
  if (code.startsWith('11')) return 'attraction'
  if (code.startsWith('15')) return 'transit'
  if (code.startsWith('12')) return 'community'
  return 'other'
}

function parseLocation(location) {
  if (typeof location !== 'string') return null
  const [lng, lat] = location.split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function textOf(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ')
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? value : ''
}

export function amapPoiToPlace(poi) {
  if (!poi || typeof poi !== 'object') return null
  const gcj = parseLocation(poi.location)
  if (!gcj) return null
  const wgs = gcj02ToWgs84(gcj.lat, gcj.lng)
  const business = poi.business && typeof poi.business === 'object' ? poi.business : {}
  const category = amapPoiCategoryOf(poi.typecode)
  return {
    id: `amap:${poi.id || `${gcj.lng},${gcj.lat}:${poi.name || ''}`}`,
    source: 'amap',
    kind: 'poi',
    name: textOf(poi.name) || '未命名地点',
    category,
    lat: wgs.lat,
    lng: wgs.lng,
    coordSystem: 'WGS84',
    address: textOf(poi.address),
    city: textOf(poi.cityname),
    district: textOf(poi.adname),
    rating: textOf(business.rating),
    openHours: textOf(business.opentime_week || business.opentime2 || business.opentime),
  }
}

export function amapPoisToGeoJSON(places) {
  return {
    type: 'FeatureCollection',
    features: (Array.isArray(places) ? places : [])
      .filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng))
      .map((place) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
        properties: {
          id: place.id,
          name: place.name,
          category: place.category,
          address: place.address || '',
          city: place.city || '',
          district: place.district || '',
          rating: place.rating || '',
          openHours: place.openHours || '',
          source: 'amap',
        },
      })),
  }
}

export function buildAmapPoiUrl({ key, lat, lng, zoom, category }) {
  const center = wgs84ToGcj02(lat, lng)
  const params = new URLSearchParams({
    key,
    location: `${center.lng.toFixed(6)},${center.lat.toFixed(6)}`,
    radius: String(amapRadiusForZoom(zoom)),
    types: amapPoiTypes(category),
    page_size: '25',
    page_num: '1',
    show_fields: 'business',
  })
  return `${AMAP_AROUND_URL}?${params.toString()}`
}

function cacheKey({ lat, lng, zoom, category }) {
  const radius = amapRadiusForZoom(zoom)
  return `${category}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`
}

export function clearAmapPoiCache() {
  cache.clear()
}

export async function fetchAmapPois({ lat, lng, zoom, category = 'all', signal, key }) {
  const apiKey = String(key || envKey()).trim()
  if (!apiKey) throw new Error('未配置高德 Key')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('无效的地图中心')
  if (outOfChina(lat, lng)) return []
  if (!amapPoiTypes(category)) return []

  const id = cacheKey({ lat, lng, zoom, category })
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.places

  const url = buildAmapPoiUrl({ key: apiKey, lat, lng, zoom, category })
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`高德接口 ${response.status}`)
  const data = await response.json()
  if (String(data.status) !== '1') {
    throw new Error(textOf(data.info) || `高德错误 ${data.infocode || ''}`.trim())
  }
  const places = (Array.isArray(data.pois) ? data.pois : [])
    .map(amapPoiToPlace)
    .filter(Boolean)
  cache.set(id, { at: Date.now(), places })
  return places
}

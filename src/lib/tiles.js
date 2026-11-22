const RAD = Math.PI / 180
const EQUATOR_METERS = 40075016.686

export const TILE_PX = 256
export const TILE_SPAN = 4
export const TILE_MARGIN = 1.4
export const MIN_TILE_ZOOM = 3
export const MAX_TILE_ZOOM = 19

export const EARTH_RADIUS_KM = 6371.0088
export const MIN_ALTITUDE_WORLD = 0.000005
export const MAX_ALTITUDE_WORLD = 14

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function tileX(lng, zoom) {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom)
}

export function tileY(lat, zoom) {
  const safe = clamp(lat, -85.05112878, 85.05112878)
  const sin = Math.sin(safe * RAD)
  return Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** zoom)
}

export function tileToLng(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180
}

export function tileToLat(y, zoom) {
  const n = Math.PI * (1 - (2 * y) / 2 ** zoom)
  return Math.atan(Math.sinh(n)) / RAD
}

export function tileBlock(lat, lng, zoom, span = TILE_SPAN) {
  const count = 2 ** zoom
  const half = span / 2
  const x = ((lng + 180) / 360) * count
  const sin = Math.sin(clamp(lat, -85.05112878, 85.05112878) * RAD)
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * count
  const anchorX = Math.floor(x + 0.5)
  const anchorY = clamp(Math.floor(y + 0.5), Math.ceil(half), count - Math.ceil(half))
  return {
    zoom,
    span,
    originX: anchorX - half,
    originY: anchorY - half,
    centerLat: lat,
    centerLng: lng,
  }
}

export function altitudeMeters(altitudeWorld) {
  return altitudeWorld * EARTH_RADIUS_KM * 1000
}

export function altitudeLabel(altitudeWorld) {
  const meters = altitudeMeters(altitudeWorld)
  if (meters >= 10000) return `${Math.round(meters / 1000)} km`
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.max(1, Math.round(meters))} m`
}

export function tileZoomFor({ altitudeWorld, lat, fovDeg = 45, span = TILE_SPAN, margin = TILE_MARGIN }) {
  const view = 2 * altitudeMeters(altitudeWorld) * Math.tan((fovDeg * RAD) / 2)
  if (!(view > 0)) return MAX_TILE_ZOOM
  const cos = Math.max(Math.cos(clamp(lat, -85, 85) * RAD), 0.08)
  const levels = (span * EQUATOR_METERS * cos) / (view * margin)
  if (!(levels > 0)) return MAX_TILE_ZOOM
  return clamp(Math.floor(Math.log2(levels)), MIN_TILE_ZOOM, MAX_TILE_ZOOM)
}

export function latLngFromUnit(unit) {
  const length = Math.hypot(unit.x, unit.y, unit.z)
  if (!length) return { lat: 0, lng: 0 }
  const x = unit.x / length
  const y = unit.y / length
  const z = unit.z / length
  return {
    lat: Math.asin(clamp(y, -1, 1)) / RAD,
    lng: Math.atan2(-z, x) / RAD,
  }
}

export function formatCoords(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${ns} ${Math.abs(lat).toFixed(2)}°  ${ew} ${Math.abs(lng).toFixed(2)}°`
}

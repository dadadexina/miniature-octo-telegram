const EARTH_RADIUS_KM = 6371.0088
const DEG = Math.PI / 180

export function geolocationSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation?.getCurrentPosition)
}

export function normalizePosition(position) {
  const lat = Number(position?.coords?.latitude)
  const lng = Number(position?.coords?.longitude)
  const accuracy = Number(position?.coords?.accuracy)
  const timestamp = Number(position?.timestamp) || Date.now()
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null,
    timestamp,
  }
}

export function geoErrorMessage(error) {
  const code = error?.code
  if (code === 1) return '定位权限被拒绝，请在浏览器设置中允许后重试'
  if (code === 2) return '暂时无法获取位置，请靠近窗口或开启 GPS'
  if (code === 3) return '定位超时，请重试'
  return error?.message || '定位失败'
}

export function getCurrentLocation(options = {}) {
  return new Promise((resolve) => {
    if (!geolocationSupported()) {
      resolve({ ok: false, code: -1, error: '当前设备不支持定位' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = normalizePosition(position)
        if (!location) {
          resolve({ ok: false, code: 2, error: '定位结果无效' })
          return
        }
        resolve({ ok: true, location })
      },
      (error) => resolve({ ok: false, code: error?.code ?? -1, error: geoErrorMessage(error) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    )
  })
}

export function watchLocation(onUpdate, onError, options = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) {
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (position) => {
      const location = normalizePosition(position)
      if (location) onUpdate?.(location)
    },
    (error) => onError?.({ code: error?.code ?? -1, error: geoErrorMessage(error) }),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000, ...options }
  )
  return () => {
    try {
      navigator.geolocation.clearWatch(id)
    } catch {
      // 清理失败时忽略
    }
  }
}

export async function locationPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function haversineKm(a, b) {
  if (!a || !b) return 0
  const lat1 = Number(a.lat) * DEG
  const lng1 = Number(a.lng) * DEG
  const lat2 = Number(b.lat) * DEG
  const lng2 = Number(b.lng) * DEG
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km) {
  const value = Number(km)
  if (!Number.isFinite(value) || value <= 0) return '0 m'
  if (value < 1) return `${Math.max(1, Math.round(value * 1000))} m`
  if (value < 10) return `${value.toFixed(1)} km`
  return `${Math.round(value)} km`
}

export function formatAccuracy(meters) {
  const value = Number(meters)
  if (!Number.isFinite(value) || value <= 0) return ''
  return `±${value < 10 ? value.toFixed(1) : Math.round(value)} m`
}

const COORD_PATTERN = /^([NnSs])?\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*([EeWw])?\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?$/

function axisSign(prefix, suffix, positive, negative) {
  const mark = String(prefix || suffix || '').toUpperCase()
  if (mark === positive) return 1
  if (mark === negative) return -1
  return 0
}

export function parseLatLngQuery(input) {
  const text = String(input || '').trim().replace(/，/g, ',').replace(/\s+/g, ' ')
  if (!text) return null
  const match = text.match(COORD_PATTERN)
  if (!match) return null
  const latSign = axisSign(match[1], match[3], 'N', 'S')
  const lngSign = axisSign(match[4], match[6], 'E', 'W')
  let lat = Math.abs(Number(match[2])) * (latSign || 1)
  let lng = Math.abs(Number(match[5])) * (lngSign || 1)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const swap = lat
    lat = lng
    lng = swap
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (!match[1] && match[2].startsWith('-')) lat = -Math.abs(lat)
  if (!match[4] && match[5].startsWith('-')) lng = -Math.abs(lng)
  return { lat, lng }
}

export function coordPlace(lat, lng, digits = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const label = `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`
  return {
    id: `coords:${label}`,
    name: `坐标 ${label}`,
    detail: '经纬度定位',
    lat,
    lng,
    kind: 'coords',
    source: 'coords',
  }
}

export function bearingDegrees(a, b) {
  if (!a || !b) return 0
  const lat1 = Number(a.lat) * DEG
  const lat2 = Number(b.lat) * DEG
  const dLng = (Number(b.lng) - Number(a.lng)) * DEG
  if (![lat1, lat2, dLng].every(Number.isFinite)) return 0
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) / DEG + 360) % 360
}

const COMPASS_LABELS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

export function compassLabel(degrees) {
  const value = Number(degrees)
  if (!Number.isFinite(value)) return ''
  return COMPASS_LABELS[Math.round(((value % 360) + 360) % 360 / 45) % 8]
}

export function walkMinutes(km, speedKmh = 4.8) {
  const value = Number(km)
  const speed = Number(speedKmh)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(speed) || speed <= 0) return 0
  return Math.max(1, Math.round((value / speed) * 60))
}

export function navigationUrl(destination, mode = 'walking') {
  if (!destination || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
    return ''
  }
  const lng = Number(destination.lng).toFixed(6)
  const lat = Number(destination.lat).toFixed(6)
  const name = encodeURIComponent(String(destination.name || '目的地'))
  const amapMode = mode === 'driving' ? 'car' : 'walk'
  return `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=${amapMode}&policy=1&callnative=1&src=zhimo`
}

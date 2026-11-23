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

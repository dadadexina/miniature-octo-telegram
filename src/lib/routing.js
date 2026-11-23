import { haversineKm, walkMinutes } from './geo'

const ROUTE_ENDPOINTS = {
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
}

const DRIVING_SPEED_KMH = 30

export const ROUTE_MODES = ['driving', 'walking']

export function routeModeLabel(mode) {
  return mode === 'driving' ? '开车' : '步行'
}

function validPoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  )
}

function validCoord(coord) {
  return Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1])
}

export function straightRoute(from, to, mode = 'walking') {
  if (!validPoint(from) || !validPoint(to)) return null
  const safeMode = ROUTE_MODES.includes(mode) ? mode : 'walking'
  const distanceKm = haversineKm(
    { lat: Number(from.lat), lng: Number(from.lng) },
    { lat: Number(to.lat), lng: Number(to.lng) }
  )
  const durationMin =
    safeMode === 'driving'
      ? Math.max(1, Math.round((distanceKm / DRIVING_SPEED_KMH) * 60))
      : walkMinutes(distanceKm)
  return {
    mode: safeMode,
    distanceKm,
    durationMin,
    coordinates: [
      [Number(from.lng), Number(from.lat)],
      [Number(to.lng), Number(to.lat)],
    ],
    fallback: true,
    source: 'straight',
  }
}

function routeUrl(from, to, mode) {
  const coords = [
    `${Number(from.lng).toFixed(6)},${Number(from.lat).toFixed(6)}`,
    `${Number(to.lng).toFixed(6)},${Number(to.lat).toFixed(6)}`,
  ].join(';')
  return `${ROUTE_ENDPOINTS[mode]}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`
}

export async function fetchRoute({ from, to, mode = 'walking', signal, timeoutMs = 12000 }) {
  if (!ROUTE_ENDPOINTS[mode]) throw new Error('不支持的出行方式')
  if (!validPoint(from) || !validPoint(to)) throw new Error('缺少起终点坐标')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort)
  }

  try {
    const res = await fetch(routeUrl(from, to, mode), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`路线服务返回 ${res.status}`)
    const data = await res.json()
    if (data?.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
      throw new Error('未找到可行路线')
    }
    const route = data.routes[0]
    const coordinates = (route.geometry?.coordinates || []).filter(validCoord)
    if (coordinates.length < 2) throw new Error('路线数据不完整')
    if (!(Number(route.distance) > 0)) throw new Error('路线距离无效')
    return {
      mode,
      coordinates,
      distanceKm: Number(route.distance) / 1000,
      durationMin: Math.max(1, Math.round(Number(route.duration) / 60)),
      fallback: false,
      source: 'osrm',
    }
  } catch (err) {
    if (signal?.aborted) {
      const abort = new Error('已取消路线规划')
      abort.name = 'AbortError'
      throw abort
    }
    if (timedOut) throw new Error('路线规划超时', { cause: err })
    throw err
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

export async function planRoute({ from, to, mode = 'walking', signal, timeoutMs }) {
  try {
    return await fetchRoute({ from, to, mode, signal, timeoutMs })
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err
    const fallback = straightRoute(from, to, mode)
    if (!fallback) throw err
    return { ...fallback, error: err?.message || '路线服务暂不可用' }
  }
}

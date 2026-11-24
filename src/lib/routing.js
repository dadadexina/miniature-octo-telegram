const ROUTE_ENDPOINTS = {
  driving: [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    'https://router.project-osrm.org/route/v1/driving',
  ],
  walking: [
    'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    'https://router.project-osrm.org/route/v1/foot',
  ],
}

const DEFAULT_ROUTE_TIMEOUT_MS = 4500

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

function routeUrl(base, from, to) {
  const coords = [
    `${Number(from.lng).toFixed(6)},${Number(from.lat).toFixed(6)}`,
    `${Number(to.lng).toFixed(6)},${Number(to.lat).toFixed(6)}`,
  ].join(';')
  return `${base}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`
}

function parseRoute(data, mode) {
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
    source: 'osrm',
  }
}

async function requestRoute(url, mode, signal) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`路线服务返回 ${res.status}`)
  return parseRoute(await res.json(), mode)
}

function withDeadline(promise, timeoutMs) {
  let timer = null
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('路线规划超时')), timeoutMs)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

function abortError() {
  const error = new Error('已取消路线规划')
  error.name = 'AbortError'
  return error
}

export async function fetchRoute({
  from,
  to,
  mode = 'walking',
  signal,
  timeoutMs = DEFAULT_ROUTE_TIMEOUT_MS,
}) {
  const endpoints = ROUTE_ENDPOINTS[mode]
  if (!endpoints) throw new Error('不支持的出行方式')
  if (!validPoint(from) || !validPoint(to)) throw new Error('缺少起终点坐标')

  const controllers = endpoints.map(() => new AbortController())
  const abortAll = () => controllers.forEach((controller) => controller.abort())
  const forwardAbort = () => abortAll()
  let timedOut = false
  if (signal) {
    if (signal.aborted) abortAll()
    else signal.addEventListener('abort', forwardAbort)
  }
  const timer = setTimeout(() => {
    timedOut = true
    abortAll()
  }, timeoutMs)

  try {
    return await Promise.any(
      endpoints.map((base, index) =>
        withDeadline(
          requestRoute(routeUrl(base, from, to), mode, controllers[index].signal),
          timeoutMs
        )
      )
    )
  } catch (err) {
    if (signal?.aborted) throw abortError()
    if (timedOut) throw new Error('路线规划超时', { cause: err })
    const errors = err?.errors || [err]
    const first = errors.find((item) => item?.name !== 'AbortError') || errors[0]
    const message = first instanceof Error ? first.message : '路线服务暂不可用'
    throw new Error(message, { cause: err })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
    abortAll()
  }
}

export async function planRoute({
  from,
  to,
  mode = 'walking',
  signal,
  timeoutMs = DEFAULT_ROUTE_TIMEOUT_MS,
}) {
  let timer = null
  try {
    return await Promise.race([
      fetchRoute({ from, to, mode, signal, timeoutMs }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('路线规划超时')), timeoutMs + 300)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

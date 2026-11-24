const ENDPOINTS = {
  driving: [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    'https://router.project-osrm.org/route/v1/driving',
  ],
  walking: [
    'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    'https://router.project-osrm.org/route/v1/foot',
  ],
}

const ROUTE_TIMEOUT_MS = 9000

function parsePoint(value) {
  const [lng, lat] = String(value || '')
    .split(',')
    .map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function routeUrl(base, from, to) {
  const coords = [
    `${from.lng.toFixed(6)},${from.lat.toFixed(6)}`,
    `${to.lng.toFixed(6)},${to.lat.toFixed(6)}`,
  ].join(';')
  return `${base}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`
}

function withDeadline(promise, timeoutMs) {
  let timer = null
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('route_timeout')), timeoutMs)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

function validPoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 &&
    Math.abs(Number(point.lng)) <= 180
  )
}

async function requestRoute(base, from, to, fetchImpl, signal) {
  const res = await fetchImpl(routeUrl(base, from, to), {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`route_status_${res.status}`)
  const data = await res.json()
  if (data?.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
    throw new Error('route_unavailable')
  }
  return data
}

export async function resolveRoute({ from, to, mode, fetchImpl = fetch }) {
  const endpoints = ENDPOINTS[mode]
  if (!endpoints) throw new Error('unsupported_mode')
  if (!validPoint(from) || !validPoint(to)) throw new Error('bad_coordinates')
  const controllers = endpoints.map(() => new AbortController())
  try {
    return await Promise.any(
      endpoints.map((base, index) =>
        withDeadline(
          requestRoute(base, from, to, fetchImpl, controllers[index].signal),
          ROUTE_TIMEOUT_MS
        )
      )
    )
  } finally {
    controllers.forEach((controller) => controller.abort())
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
  }
  res.end(JSON.stringify(body))
}

export async function handleRouteRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const from = parsePoint(url.searchParams.get('from'))
  const to = parsePoint(url.searchParams.get('to'))
  const mode = url.searchParams.get('mode') || 'walking'
  if (!from || !to) return sendJson(res, 400, { error: 'bad_coordinates' })
  if (!ENDPOINTS[mode]) return sendJson(res, 400, { error: 'unsupported_mode' })
  try {
    const data = await resolveRoute({ from, to, mode })
    return sendJson(res, 200, data)
  } catch {
    return sendJson(res, 502, { error: 'route_unavailable' })
  }
}

export function createRouteApiMiddleware() {
  return (req, res, next) => {
    const path = String(req.url || '').split('?')[0]
    if (path !== '/api/route') return next()
    handleRouteRequest(req, res).catch(() => sendJson(res, 502, { error: 'route_unavailable' }))
  }
}

export default function handler(req, res) {
  return handleRouteRequest(req, res)
}

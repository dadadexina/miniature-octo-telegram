const CACHE_KEY = 'weather-cache-v2'
const CACHE_TTL = 15 * 60 * 1000
const TIMEOUT = 8000

export function weatherText(code) {
  if (code === null || code === undefined) return '天气未知'
  if (code === 0) return '晴'
  if (code === 1) return '晴间多云'
  if (code === 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code >= 61 && code <= 67) return '雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code >= 95) return '雷雨'
  return '多云'
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Date.now() - parsed.ts > CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(byId) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), byId }))
  } catch {
    // 忽略隐私模式下的存储失败
  }
}

export async function fetchWeather(points) {
  if (!points?.length) return { ok: false, byId: {} }

  const cached = readCache()
  if (cached && points.every((point) => cached.byId?.[point.id])) {
    return { ok: true, byId: Object.fromEntries(points.map((point) => [point.id, cached.byId[point.id]])) }
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT) : null

  try {
    const latitude = points.map((point) => point.lat.toFixed(2)).join(',')
    const longitude = points.map((point) => point.lng.toFixed(2)).join(',')
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude}&longitude=${longitude}` +
      '&current=temperature_2m,weather_code,cloud_cover&timezone=UTC'
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined)
    if (!response.ok) throw new Error(`weather ${response.status}`)
    const json = await response.json()
    const rows = Array.isArray(json) ? json : [json]
    const byId = {}
    rows.forEach((row, index) => {
      const point = points[index]
      if (!point) return
      const current = row?.current || {}
      byId[point.id] = {
        temp: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
        code: current.weather_code ?? null,
        cloud: typeof current.cloud_cover === 'number' ? current.cloud_cover : null,
        label: weatherText(current.weather_code),
      }
    })
    if (!Object.keys(byId).length) throw new Error('weather empty')
    writeCache(byId)
    return { ok: true, byId }
  } catch {
    return { ok: false, byId: {} }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

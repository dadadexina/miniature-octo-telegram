const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL = 10 * 60 * 1000
const CACHE_LIMIT = 32
const cache = new Map()

const WEATHER_LABELS = {
  0: '晴',
  1: '大部晴朗',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '毛毛雨',
  55: '毛毛雨',
  56: '冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '米雪',
  80: '阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '阵雪',
  95: '雷阵雨',
  96: '雷暴伴冰雹',
  99: '雷暴伴冰雹',
}

export function weatherLabel(code) {
  const value = Number(code)
  return WEATHER_LABELS[value] || '天气未知'
}

export function mapWeather(payload) {
  const current = payload?.current
  if (!current) return null
  const temperature = Number(current.temperature_2m)
  const humidity = Number(current.relative_humidity_2m)
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) return null
  const code = Number(current.weather_code)
  const dailyMax = Number(payload?.daily?.temperature_2m_max?.[0])
  const dailyMin = Number(payload?.daily?.temperature_2m_min?.[0])
  return {
    temperature,
    high: Number.isFinite(dailyMax) ? dailyMax : null,
    low: Number.isFinite(dailyMin) ? dailyMin : null,
    feelsLike: Number.isFinite(Number(current.apparent_temperature))
      ? Number(current.apparent_temperature)
      : temperature,
    humidity,
    windSpeed: Number.isFinite(Number(current.wind_speed_10m))
      ? Number(current.wind_speed_10m)
      : 0,
    isDay: Number(current.is_day) === 1,
    code,
    label: weatherLabel(code),
    time: String(current.time || ''),
    timezone: String(payload.timezone || ''),
  }
}

function buildUrl(lat, lng) {
  const url = new URL(ENDPOINT)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m'
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('timezone', 'auto')
  return url.toString()
}

export async function fetchWeather({ lat, lng, signal, timeoutMs = 8000 } = {}) {
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('缺少天气查询坐标')
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('天气查询坐标越界')
  }
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }

  try {
    const response = await fetch(buildUrl(latitude, longitude), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`天气服务返回 ${response.status}`)
    const payload = await response.json()
    const weather = mapWeather(payload)
    if (!weather) throw new Error('天气数据不完整')
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
    cache.set(key, { at: Date.now(), value: weather })
    return weather
  } catch (error) {
    if (signal?.aborted) {
      const abort = new Error('已取消天气查询')
      abort.name = 'AbortError'
      throw abort
    }
    if (timedOut) throw new Error('天气查询超时', { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWeather, mapWeather, weatherLabel } from './weather'

const payload = {
  timezone: 'Asia/Shanghai',
  daily: { temperature_2m_max: [14.2], temperature_2m_min: [5.8], weather_code: [0] },
  current: {
    time: '2026-11-24T06:30',
    temperature_2m: 9.0,
    relative_humidity_2m: 69,
    apparent_temperature: 5.5,
    is_day: 1,
    weather_code: 0,
    wind_speed_10m: 13.6,
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('weather', () => {
  it('maps WMO codes to readable labels', () => {
    expect(weatherLabel(0)).toBe('晴')
    expect(weatherLabel(3)).toBe('阴')
    expect(weatherLabel(61)).toBe('小雨')
    expect(weatherLabel(95)).toBe('雷阵雨')
    expect(weatherLabel(999)).toBe('天气未知')
  })

  it('maps current weather payload', () => {
    const weather = mapWeather(payload)
    expect(weather).toMatchObject({
      temperature: 9,
      high: 14.2,
      low: 5.8,
      feelsLike: 5.5,
      humidity: 69,
      windSpeed: 13.6,
      isDay: true,
      code: 0,
      label: '晴',
      timezone: 'Asia/Shanghai',
    })
    expect(mapWeather({})).toBeNull()
    expect(mapWeather({ current: { temperature_2m: 'x' } })).toBeNull()
  })

  it('fetches current weather and caches per area', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
    vi.stubGlobal('fetch', fetchMock)
    const first = await fetchWeather({ lat: 31.2304, lng: 121.4737 })
    expect(first.label).toBe('晴')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('latitude')).toBe('31.2304')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('current')).toContain('weather_code')
    expect(url.searchParams.get('daily')).toContain('temperature_2m_max')
    await fetchWeather({ lat: 31.2304, lng: 121.4737 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on invalid coordinates and service failure', async () => {
    await expect(fetchWeather({ lat: NaN, lng: 1 })).rejects.toThrow('缺少天气查询坐标')
    await expect(fetchWeather({ lat: 0, lng: 200 })).rejects.toThrow('天气查询坐标越界')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchWeather({ lat: 22.5, lng: 114.1 })).rejects.toThrow('天气服务返回 503')
  })
})

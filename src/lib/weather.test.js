// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWeather, weatherText } from './weather'

const POINTS = [
  { id: 'a', lat: 31.2, lng: 121.5 },
  { id: 'b', lat: 51.5, lng: -0.13 },
]

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('weatherText', () => {
  it('按 WMO 编码返回中文描述', () => {
    expect(weatherText(0)).toBe('晴')
    expect(weatherText(3)).toBe('阴')
    expect(weatherText(61)).toBe('雨')
    expect(weatherText(75)).toBe('雪')
    expect(weatherText(95)).toBe('雷雨')
    expect(weatherText(null)).toBe('天气未知')
  })
})

describe('fetchWeather', () => {
  it('批量请求并映射到每位好友', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { current: { temperature_2m: 18.4, weather_code: 61, cloud_cover: 90 } },
        { current: { temperature_2m: 7.2, weather_code: 3, cloud_cover: 75 } },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchWeather(POINTS)
    expect(result.ok).toBe(true)
    expect(result.byId.a).toMatchObject({ temp: 18.4, label: '雨', cloud: 90 })
    expect(result.byId.b).toMatchObject({ temp: 7.2, label: '阴', cloud: 75 })
    expect(fetchMock.mock.calls[0][0]).toContain('latitude=31.20,51.50')
    expect(fetchMock.mock.calls[0][0]).toContain('longitude=121.50,-0.13')
  })

  it('命中缓存时不再请求', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { current: { temperature_2m: 20, weather_code: 0, cloud_cover: 10 } },
        { current: { temperature_2m: 10, weather_code: 2, cloud_cover: 40 } },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchWeather(POINTS)
    await fetchWeather(POINTS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('不同批次的结果会合并缓存', async () => {
    const fetchMock = vi.fn(async (url) => {
      const isCity = String(url).includes('latitude=31.20') && !String(url).includes('51.50')
      return {
        ok: true,
        json: async () =>
          isCity
            ? [{ current: { temperature_2m: 21, weather_code: 0, cloud_cover: 5 } }]
            : [{ current: { temperature_2m: 9, weather_code: 3, cloud_cover: 80 } }],
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchWeather([POINTS[0]])
    await fetchWeather([POINTS[1]])
    const merged = await fetchWeather(POINTS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(merged.byId.a.temp).toBe(21)
    expect(merged.byId.b.temp).toBe(9)
  })

  it('请求失败时静默返回', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const result = await fetchWeather(POINTS)
    expect(result).toEqual({ ok: false, byId: {} })
  })
})

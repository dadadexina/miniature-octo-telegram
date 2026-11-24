import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute, planRoute, routeModeLabel } from './routing'

const FROM = { lat: 31.2304, lng: 121.4737 }
const TO = { lat: 31.24, lng: 121.49 }

function osrmBody(distance = 4884.8, duration = 332.1) {
  return {
    code: 'Ok',
    routes: [
      {
        distance,
        duration,
        geometry: {
          coordinates: [
            [121.4737, 31.2304],
            [121.48, 31.235],
            [121.49, 31.24],
          ],
        },
      },
    ],
  }
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('routing', () => {
  it('按出行方式请求对应路线服务并解析路径', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(osrmBody())))
    vi.stubGlobal('fetch', fetchMock)

    const driving = await fetchRoute({ from: FROM, to: TO, mode: 'driving' })
    const urls = fetchMock.mock.calls.map((call) => call[0])
    expect(urls.some((url) => url.startsWith('/api/route?'))).toBe(true)
    const proxyUrl = urls.find((url) => url.startsWith('/api/route?'))
    expect(decodeURIComponent(proxyUrl)).toContain('from=121.473700,31.230400')
    expect(decodeURIComponent(proxyUrl)).toContain('to=121.490000,31.240000')
    expect(proxyUrl).toContain('mode=driving')
    expect(urls).toContain(
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/121.473700,31.230400;121.490000,31.240000?overview=full&geometries=geojson&alternatives=false&steps=false'
    )
    expect(urls).toContain(
      'https://router.project-osrm.org/route/v1/driving/121.473700,31.230400;121.490000,31.240000?overview=full&geometries=geojson&alternatives=false&steps=false'
    )
    expect(driving.distanceKm).toBeCloseTo(4.8848)
    expect(driving.durationMin).toBe(6)
    expect(driving.coordinates).toHaveLength(3)

    const walking = await fetchRoute({ from: FROM, to: TO, mode: 'walking' })
    const walkingUrls = fetchMock.mock.calls.slice(urls.length).map((call) => call[0])
    expect(walkingUrls.some((url) => url.startsWith('/api/route?'))).toBe(true)
    expect(walkingUrls.some((url) => url.includes('routed-foot/route/v1/driving/'))).toBe(true)
    expect(walkingUrls.some((url) => url.includes('router.project-osrm.org/route/v1/foot/'))).toBe(true)
    expect(walking.durationMin).toBe(6)
    expect(routeModeLabel('driving')).toBe('开车')
    expect(routeModeLabel('walking')).toBe('步行')
  })

  it('代理和首选路线服务不可用时自动改用备用服务', async () => {
    const fetchMock = vi.fn((url) =>
      url.startsWith('/api/route') || url.includes('routing.openstreetmap.de')
        ? Promise.reject(new Error('网络不可达'))
        : Promise.resolve(jsonResponse(osrmBody()))
    )
    vi.stubGlobal('fetch', fetchMock)
    const route = await fetchRoute({ from: FROM, to: TO, mode: 'driving' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(route.distanceKm).toBeCloseTo(4.8848)
  })

  it('所有服务网络异常时给出网络提示', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(planRoute({ from: FROM, to: TO, mode: 'walking' })).rejects.toThrow(
      '网络连接异常'
    )
  })

  it('所有路线服务失败时抛出错误，不返回直线路线', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ code: 'NoRoute' }))))
    await expect(planRoute({ from: FROM, to: TO, mode: 'walking' })).rejects.toThrow(
      '未找到可行路线'
    )
  })

  it('路线服务不响应时按时抛错而不是生成直线路线', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    await expect(
      planRoute({ from: FROM, to: TO, mode: 'walking', timeoutMs: 20 })
    ).rejects.toThrow('超时')
  })

  it('出行方式名称可回退为步行', () => {
    expect(routeModeLabel('other')).toBe('步行')
  })

  it('主动取消时抛出 AbortError 而不是回退', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      )
    )
    const controller = new AbortController()
    const pending = planRoute({ from: FROM, to: TO, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

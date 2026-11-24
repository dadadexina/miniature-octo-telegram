import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRouteRequest, resolveRoute } from '../../api/route.js'

const FROM = { lat: 31.2304, lng: 121.4737 }
const TO = { lat: 31.24, lng: 121.49 }

function osrmBody() {
  return {
    code: 'Ok',
    routes: [{ distance: 4884.8, duration: 332.1, geometry: { coordinates: [] } }],
  }
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) }
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('route api', () => {
  it('从备用路线服务取回数据', async () => {
    const fetchMock = vi.fn((url) =>
      url.includes('routing.openstreetmap.de')
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve(jsonResponse(osrmBody()))
    )
    const data = await resolveRoute({
      from: FROM,
      to: TO,
      mode: 'driving',
      fetchImpl: fetchMock,
    })
    expect(data.code).toBe('Ok')
    expect(fetchMock.mock.calls[0][0]).toContain(
      'routed-car/route/v1/driving/121.473700,31.230400;121.490000,31.240000'
    )
  })

  it('参数缺失时返回 400', async () => {
    const res = createResponse()
    await handleRouteRequest({ url: '/api/route?mode=driving' }, res)
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('bad_coordinates')
  })

  it('不支持的出行方式返回 400', async () => {
    const res = createResponse()
    await handleRouteRequest(
      { url: '/api/route?from=121.47,31.23&to=121.49,31.24&mode=flying' },
      res
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('unsupported_mode')
  })

  it('上游不可用时返回 502', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unreachable'))))
    const res = createResponse()
    await handleRouteRequest(
      { url: '/api/route?from=121.47,31.23&to=121.49,31.24&mode=walking' },
      res
    )
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body).error).toBe('route_unavailable')
  })

  it('成功时返回路线数据', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(osrmBody()))))
    const res = createResponse()
    await handleRouteRequest(
      { url: '/api/route?from=121.47,31.23&to=121.49,31.24&mode=driving' },
      res
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).code).toBe('Ok')
  })
})

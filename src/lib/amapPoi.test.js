import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  amapPoiCategoryOf,
  amapPoiToPlace,
  amapPoisToGeoJSON,
  amapPoiTypes,
  amapRadiusForZoom,
  buildAmapPoiUrl,
  clearAmapPoiCache,
  fetchAmapPois,
  gcj02ToWgs84,
  outOfChina,
  wgs84ToGcj02,
} from './amapPoi'

const BEIJING = { lat: 39.9042, lng: 116.4074 }

describe('高德 POI 适配层', () => {
  beforeEach(() => {
    clearAmapPoiCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('经纬度在 WGS84 与 GCJ-02 之间往返误差小于 1 米', () => {
    const gcj = wgs84ToGcj02(BEIJING.lat, BEIJING.lng)
    expect(gcj.lat - BEIJING.lat).toBeGreaterThan(0.0005)
    expect(gcj.lng - BEIJING.lng).toBeGreaterThan(0.0005)
    const back = gcj02ToWgs84(gcj.lat, gcj.lng)
    expect(Math.abs(back.lat - BEIJING.lat)).toBeLessThan(0.00001)
    expect(Math.abs(back.lng - BEIJING.lng)).toBeLessThan(0.00001)
  })

  it('境外坐标不做偏移', () => {
    expect(outOfChina(48.8566, 2.3522)).toBe(true)
    expect(wgs84ToGcj02(48.8566, 2.3522)).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('分类类型与缩放半径符合预期', () => {
    expect(amapPoiTypes('food')).toBe('050000')
    expect(amapPoiTypes('community')).toBe('120300')
    expect(amapPoiTypes('transit')).toContain('150500')
    expect(amapPoiTypes('all')).toContain('050000')
    expect(amapPoiTypes('missing')).toBe('')
    expect(amapRadiusForZoom(16)).toBe(1000)
    expect(amapRadiusForZoom(13.5)).toBe(8000)
  })

  it('按 typecode 归类', () => {
    expect(amapPoiCategoryOf('050102')).toBe('food')
    expect(amapPoiCategoryOf('100102')).toBe('lodging')
    expect(amapPoiCategoryOf('060101')).toBe('shopping')
    expect(amapPoiCategoryOf('110202')).toBe('attraction')
    expect(amapPoiCategoryOf('150500')).toBe('transit')
    expect(amapPoiCategoryOf('120302')).toBe('community')
    expect(amapPoiCategoryOf('190000')).toBe('other')
  })

  it('把高德 POI 转成 WGS84 统一地点', () => {
    const gcj = wgs84ToGcj02(BEIJING.lat, BEIJING.lng)
    const place = amapPoiToPlace({
      id: 'B000A7',
      name: '测试小区',
      location: `${gcj.lng},${gcj.lat}`,
      typecode: '120302',
      address: '测试路 1 号',
      cityname: '北京市',
      adname: '东城区',
      business: { rating: '4.6', opentime_week: '全天' },
    })
    expect(place.source).toBe('amap')
    expect(place.category).toBe('community')
    expect(place.name).toBe('测试小区')
    expect(Math.abs(place.lat - BEIJING.lat)).toBeLessThan(0.00001)
    expect(Math.abs(place.lng - BEIJING.lng)).toBeLessThan(0.00001)
    expect(place.rating).toBe('4.6')
    expect(place.district).toBe('东城区')
  })

  it('生成 GeoJSON 时保留展示字段', () => {
    const fc = amapPoisToGeoJSON([
      { id: 'a', name: 'A', category: 'food', lat: 1, lng: 2, address: '街' },
      { id: 'b', name: 'B', category: 'food', lat: NaN, lng: 2 },
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.coordinates).toEqual([2, 1])
    expect(fc.features[0].properties.name).toBe('A')
  })

  it('构造请求时把中心点转换为 GCJ-02', () => {
    const url = new URL(
      buildAmapPoiUrl({ key: 'k', lat: BEIJING.lat, lng: BEIJING.lng, zoom: 16, category: 'food' })
    )
    const [lng, lat] = url.searchParams.get('location').split(',').map(Number)
    expect(lat).toBeGreaterThan(BEIJING.lat)
    expect(lng).toBeGreaterThan(BEIJING.lng)
    expect(url.searchParams.get('radius')).toBe('1000')
    expect(url.searchParams.get('types')).toBe('050000')
    expect(url.searchParams.get('page_size')).toBe('25')
  })

  it('解析成功响应并缓存结果', async () => {
    const gcj = wgs84ToGcj02(BEIJING.lat, BEIJING.lng)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        info: 'OK',
        pois: [
          {
            id: 'p1',
            name: '面馆',
            location: `${gcj.lng},${gcj.lat}`,
            typecode: '050100',
            address: '街 2 号',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchAmapPois({ ...BEIJING, zoom: 16, category: 'food', key: 'k' })
    const second = await fetchAmapPois({ ...BEIJING, zoom: 16, category: 'food', key: 'k' })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('境外中心点直接返回空数组', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const places = await fetchAmapPois({ lat: 48.8566, lng: 2.3522, zoom: 16, category: 'food', key: 'k' })
    expect(places).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('高德错误状态抛出可读信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' }),
      })
    )
    await expect(fetchAmapPois({ ...BEIJING, zoom: 16, category: 'food', key: 'k' })).rejects.toThrow(
      'INVALID_USER_KEY'
    )
  })
})

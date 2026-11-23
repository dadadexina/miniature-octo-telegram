import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildQueryVariants,
  mapPhotonFeature,
  mergePlaceResults,
  searchAltitude,
  searchPlacesOnline,
} from './geocode'

const feature = (overrides = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [108.9398, 34.3416] },
  properties: {
    name: '西安',
    city: '西安市',
    county: '碑林区',
    state: '陕西省',
    country: '中国',
    osm_type: 'N',
    osm_id: 123,
    osm_value: 'city',
    ...overrides,
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geocode', () => {
  it('maps photon features into places', () => {
    const place = mapPhotonFeature(feature())
    expect(place).toMatchObject({
      id: 'N:123',
      name: '西安',
      detail: '西安市 · 碑林区 · 陕西省',
      lat: 34.3416,
      lng: 108.9398,
      source: 'osm',
    })
    expect(place.altitude).toBeGreaterThan(0)
  })

  it('skips invalid or nameless features', () => {
    expect(mapPhotonFeature({ type: 'Feature', geometry: null })).toBeNull()
    expect(mapPhotonFeature(feature({ name: '', city: '', county: '', state: '' }))).toBeNull()
    expect(
      mapPhotonFeature({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [200, 100] },
        properties: { name: '越界' },
      })
    ).toBeNull()
  })

  it('chooses closer altitudes for smaller places', () => {
    expect(searchAltitude('country')).toBeGreaterThan(searchAltitude('state'))
    expect(searchAltitude('state')).toBeGreaterThan(searchAltitude('city'))
    expect(searchAltitude('city')).toBeGreaterThan(searchAltitude('town'))
    expect(searchAltitude('town')).toBeGreaterThan(searchAltitude('village'))
  })

  it('queries photon with bias and caches results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature()] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const first = await searchPlacesOnline('西安', { lat: 34.3, lng: 108.9, limit: 3 })
    expect(first.ok).toBe(true)
    expect(first.places[0].name).toBe('西安')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('q')).toBe('西安')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('lat')).toBe('34.3')
    expect(url.searchParams.get('lon')).toBe('108.9')

    const second = await searchPlacesOnline('西安', { lat: 34.3, lng: 108.9, limit: 3 })
    expect(second.places).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns an error without throwing when photon fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await searchPlacesOnline('故障地名', { limit: 2 })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.places).toEqual([])
  })

  it('expands station names into broader variants', () => {
    expect(buildQueryVariants('人民广场地铁站')).toEqual(['人民广场地铁站', '人民广场站', '人民广场'])
    expect(buildQueryVariants('上海地铁人民广场站')).toEqual([
      '上海地铁人民广场站',
      '人民广场站',
      '人民广场',
    ])
    expect(buildQueryVariants('瑞金医院')).toEqual(['瑞金医院'])
    expect(buildQueryVariants('')).toEqual([])
  })

  it('merges results from query variants and dedupes', async () => {
    const station = feature({
      name: '人民广场',
      geometry: { type: 'Point', coordinates: [121.4752, 31.2329] },
      osm_value: 'station',
      osm_key: 'railway',
    })
    const fetchMock = vi.fn((url) => {
      const q = new URL(url).searchParams.get('q')
      if (q === '人民广场地铁站') return Promise.resolve({ ok: true, json: async () => ({ features: [] }) })
      return Promise.resolve({ ok: true, json: async () => ({ features: [station] }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchPlacesOnline('人民广场地铁站', { lat: 31.2304, lng: 121.4737, limit: 6 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(true)
    expect(result.places).toHaveLength(1)
    expect(result.places[0]).toMatchObject({ name: '人民广场', kind: 'station' })
  })

  it('prioritises nearby POIs over transit stops', async () => {
    const make = (osmId, osmValue, coordinates) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {
        name: '中山医院',
        city: '上海市',
        osm_type: 'N',
        osm_id: osmId,
        osm_value: osmValue,
      },
    })
    const busStop = make(11, 'bus_stop', [121.474, 31.231])
    const hospital = make(12, 'hospital', [121.46, 31.2])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [busStop, hospital] }) })
    )
    const result = await searchPlacesOnline('中山医院', { lat: 31.2304, lng: 121.4737, limit: 5 })
    expect(result.places.map((place) => place.kind)).toEqual(['hospital', 'bus_stop'])
  })

  it('ranks exact name matches above fuzzy matches', async () => {
    const make = (name, osmId, coordinates) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: { name, city: '上海市', osm_type: 'N', osm_id: osmId, osm_value: 'hospital' },
    })
    const fuzzy = make('中德医院', 21, [121.473, 31.232])
    const exact = make('中山医院', 22, [121.46, 31.2])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [fuzzy, exact] }) })
    )
    const result = await searchPlacesOnline('中山医院', { lat: 31.2304, lng: 121.4737, limit: 4 })
    expect(result.places.map((place) => place.name)).toEqual(['中山医院', '中德医院'])
  })

  it('does not query for short input', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchPlacesOnline('西')
    expect(result).toEqual({ ok: true, places: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('merges and dedupes online and local places', () => {
    const online = [{ id: 'a', name: '西安', lat: 34.3416, lng: 108.9398 }]
    const local = [
      { id: 'local:xian', name: '西安', lat: 34.3416, lng: 108.9398 },
      { id: 'local:beijing', name: '北京', lat: 39.9, lng: 116.4 },
    ]
    const merged = mergePlaceResults(online, local)
    expect(merged.map((place) => place.name)).toEqual(['西安', '北京'])
  })
})

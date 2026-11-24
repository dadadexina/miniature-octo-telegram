import { describe, expect, it } from 'vitest'
import { PLACES, cityWeatherId, searchPlaces } from './places'

describe('PLACES', () => {
  it('城市标识唯一且天气 key 稳定', () => {
    const ids = new Set(PLACES.map((place) => place.id))
    expect(ids.size).toBe(PLACES.length)
    expect(cityWeatherId(PLACES[0])).toBe(`city-${PLACES[0].id}`)
  })

  it('所有坐标都在合法范围内', () => {
    PLACES.forEach((place) => {
      expect(place.lat).toBeGreaterThanOrEqual(-90)
      expect(place.lat).toBeLessThanOrEqual(90)
      expect(place.lng).toBeGreaterThanOrEqual(-180)
      expect(place.lng).toBeLessThanOrEqual(180)
      expect([1, 2, 3]).toContain(place.tier)
      expect(place.name.length).toBeGreaterThan(0)
    })
  })

  it('覆盖多个大洲且包含三级缩放层级', () => {
    expect(PLACES.length).toBeGreaterThanOrEqual(180)
    expect(new Set(PLACES.map((place) => place.tier))).toEqual(new Set([1, 2, 3]))
    expect(PLACES.some((place) => place.lng > 100)).toBe(true)
    expect(PLACES.some((place) => place.lng < -60)).toBe(true)
    expect(PLACES.some((place) => place.lat < 0)).toBe(true)
    expect(PLACES.some((place) => place.lat > 40)).toBe(true)
  })

  it('收录中国主要城市与旅游目的地', () => {
    const ids = new Set(PLACES.map((place) => place.id))
    ;['shenzhen', 'hangzhou', 'nanjing', 'wuhan', 'chengdu', 'sanya', 'guilin', 'dunhuang', 'kashgar'].forEach(
      (id) => expect(ids.has(id)).toBe(true)
    )
  })

  it('搜索城市名与拼音标识', () => {
    expect(searchPlaces('西安')[0].id).toBe('xian')
    expect(searchPlaces('xian')[0].name).toBe('西安')
    expect(searchPlaces('上海')[0].id).toBe('shanghai')
    expect(searchPlaces('new')[0].id).toBe('newyork')
    expect(searchPlaces('不存在的城市')).toEqual([])
    expect(searchPlaces('   ')).toEqual([])
  })
})

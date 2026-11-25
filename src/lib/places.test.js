import { describe, expect, it } from 'vitest'
import { PLACES } from './places'

describe('PLACES', () => {
  it('城市标识唯一', () => {
    const ids = new Set(PLACES.map((place) => place.id))
    expect(ids.size).toBe(PLACES.length)
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
})

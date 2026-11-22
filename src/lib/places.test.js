import { describe, expect, it } from 'vitest'
import { PLACES, cityWeatherId } from './places'

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
    expect(PLACES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(PLACES.map((place) => place.tier))).toEqual(new Set([1, 2, 3]))
    expect(PLACES.some((place) => place.lng > 100)).toBe(true)
    expect(PLACES.some((place) => place.lng < -60)).toBe(true)
    expect(PLACES.some((place) => place.lat < 0)).toBe(true)
    expect(PLACES.some((place) => place.lat > 40)).toBe(true)
  })
})

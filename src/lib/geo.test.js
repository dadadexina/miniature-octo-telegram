import { describe, expect, it } from 'vitest'
import {
  formatAccuracy,
  formatDistance,
  haversineKm,
  normalizePosition,
} from './geo'

describe('geo', () => {
  it('归一化定位结果并保留精度', () => {
    expect(
      normalizePosition({
        coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 8.4 },
        timestamp: 1700000000000,
      })
    ).toEqual({ lat: 31.2304, lng: 121.4737, accuracy: 8.4, timestamp: 1700000000000 })
  })

  it('丢弃越界或缺失坐标', () => {
    expect(normalizePosition(null)).toBeNull()
    expect(normalizePosition({ coords: { latitude: 100, longitude: 0 } })).toBeNull()
    expect(normalizePosition({ coords: { latitude: 0, longitude: -181 } })).toBeNull()
  })

  it('计算两点距离', () => {
    const km = haversineKm({ lat: 31.2304, lng: 121.4737 }, { lat: 39.9042, lng: 116.4074 })
    expect(km).toBeGreaterThan(1060)
    expect(km).toBeLessThan(1080)
  })

  it('按量级格式化距离与精度', () => {
    expect(formatDistance(0.42)).toBe('420 m')
    expect(formatDistance(3.26)).toBe('3.3 km')
    expect(formatDistance(18.6)).toBe('19 km')
    expect(formatAccuracy(4.2)).toBe('±4.2 m')
    expect(formatAccuracy(23.6)).toBe('±24 m')
    expect(formatAccuracy(null)).toBe('')
  })
})

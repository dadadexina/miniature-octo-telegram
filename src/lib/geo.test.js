import { describe, expect, it } from 'vitest'
import {
  bearingDegrees,
  compassLabel,
  coordPlace,
  formatAccuracy,
  formatDistance,
  haversineKm,
  normalizePosition,
  parseLatLngQuery,
  walkMinutes,
  watchLocation,
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

  it('解析经纬度查询并纠正顺序', () => {
    expect(parseLatLngQuery('31.2304, 121.4737')).toEqual({ lat: 31.2304, lng: 121.4737 })
    expect(parseLatLngQuery('31.2304 121.4737')).toEqual({ lat: 31.2304, lng: 121.4737 })
    expect(parseLatLngQuery('N31.23 E121.47')).toEqual({ lat: 31.23, lng: 121.47 })
    expect(parseLatLngQuery('S33.9 W70.6')).toEqual({ lat: -33.9, lng: -70.6 })
    expect(parseLatLngQuery('121.47, 31.23')).toEqual({ lat: 31.23, lng: 121.47 })
    expect(parseLatLngQuery('0, 0')).toEqual({ lat: 0, lng: 0 })
    expect(parseLatLngQuery('上海')).toBeNull()
    expect(parseLatLngQuery('200, 300')).toBeNull()
  })

  it('坐标结果可直接作为目的地', () => {
    expect(coordPlace(31.2304, 121.4737)).toMatchObject({
      name: '坐标 31.230400, 121.473700',
      lat: 31.2304,
      lng: 121.4737,
      kind: 'coords',
    })
    expect(coordPlace(NaN, 1)).toBeNull()
  })

  it('watchLocation 转发更新并在销毁时 clearWatch', () => {
    const calls = []
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          watchPosition: (success) => {
            calls.push('watch')
            success({
              coords: { latitude: 1.5, longitude: 2.5, accuracy: 5 },
              timestamp: 1,
            })
            return 42
          },
          clearWatch: (id) => calls.push(`clear:${id}`),
        },
      },
    })
    const seen = []
    const stop = watchLocation((location) => seen.push(location))
    expect(seen[0]).toMatchObject({ lat: 1.5, lng: 2.5, accuracy: 5 })
    stop()
    expect(calls).toEqual(['watch', 'clear:42'])
    if (original) Object.defineProperty(globalThis, 'navigator', original)
  })

  it('计算方位角、方向与步行时长', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(90)
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 90, lng: 0 })).toBeCloseTo(0, 5)
    expect(compassLabel(0)).toBe('北')
    expect(compassLabel(45)).toBe('东北')
    expect(compassLabel(225)).toBe('西南')
    expect(compassLabel(359)).toBe('北')
    expect(walkMinutes(0.8)).toBe(10)
    expect(walkMinutes(0)).toBe(0)
  })
})

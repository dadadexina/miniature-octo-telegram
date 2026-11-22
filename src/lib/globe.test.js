import { describe, expect, it } from 'vitest'
import {
  ME_COORDS,
  buildArc,
  buildMapPatchGeometry,
  citySpread,
  hashString,
  pointFor,
  smoothstep,
  sunPosition,
  toVec,
} from './globe'

describe('hashString', () => {
  it('空值返回 FNV 初值', () => {
    expect(hashString('')).toBe(2166136261)
  })

  it('同值稳定、异值不同', () => {
    expect(hashString('a')).toBe(hashString('a'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})

describe('smoothstep', () => {
  it('边界内平滑插值并夹紧', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
  })
})

describe('toVec', () => {
  it('赤道本初子午线映射到 (R,0,0)', () => {
    const point = toVec(0, 0)
    expect(point.x).toBeCloseTo(2)
    expect(point.y).toBeCloseTo(0)
    expect(point.z).toBeCloseTo(0)
  })

  it('北极映射到 (0,R,0)', () => {
    const point = toVec(90, 0)
    expect(point.x).toBeCloseTo(0)
    expect(point.y).toBeCloseTo(2)
    expect(point.z).toBeCloseTo(0)
  })
})

describe('pointFor', () => {
  it('纬度落在 [-90,90]、经度落在 [-180,180]', () => {
    for (const id of ['u1', 'u2', 'abc', '123']) {
      const point = pointFor(id)
      expect(point.lat).toBeGreaterThanOrEqual(-90)
      expect(point.lat).toBeLessThanOrEqual(90)
      expect(point.lng).toBeGreaterThanOrEqual(-180)
      expect(point.lng).toBeLessThanOrEqual(180)
    }
  })
})

describe('citySpread', () => {
  it('围绕城市坐标做有限偏移', () => {
    const spread = citySpread('u1', 34, 108)
    expect(Math.abs(spread.lat - 34)).toBeLessThan(0.05)
    expect(Math.abs(spread.lng - 108)).toBeLessThan(0.05)
  })
})

describe('sunPosition', () => {
  it('返回归一化方向与经度、赤纬', () => {
    const sun = sunPosition(new Date('2026-06-21T12:00:00Z'))
    expect(sun.dir.length()).toBeCloseTo(1)
    expect(typeof sun.declination).toBe('number')
    expect(typeof sun.lng).toBe('number')
  })
})

describe('buildArc', () => {
  it('生成连接两点的曲线，首尾落在目标半径附近', () => {
    const a = toVec(0, 0, 1).normalize()
    const b = toVec(0, 90, 1).normalize()
    const curve = buildArc(a, b, 2)
    expect(curve.getPoints(4).length).toBe(5)
    const first = curve.getPoint(0)
    const last = curve.getPoint(1)
    expect(first.length()).toBeCloseTo(2)
    expect(last.length()).toBeCloseTo(2)
  })
})

describe('buildMapPatchGeometry', () => {
  it('生成带位置与 uv 属性的索引几何体', () => {
    const block = { originX: 0, originY: 0, span: 1, zoom: 2 }
    const geometry = buildMapPatchGeometry(block, 2.1, 4)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
    expect(geometry.getAttribute('uv').count).toBeGreaterThan(0)
    expect(geometry.index.count).toBeGreaterThan(0)
  })
})

describe('ME_COORDS', () => {
  it('默认落在西安附近', () => {
    expect(ME_COORDS.lat).toBeCloseTo(34.3416)
    expect(ME_COORDS.lng).toBeCloseTo(108.9398)
  })
})

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { cityLocation, normalizeLocationRow } = await import('./locations')

describe('normalizeLocationRow', () => {
  it('映射城市级位置并固定两位小数精度', () => {
    expect(
      normalizeLocationRow({
        user_id: 'u1',
        lat: 34.34,
        lng: 108.94,
        label: ' 西安 ',
        precision: 9,
        visible: true,
        updated_at: '2026-11-22T00:00:00Z',
      })
    ).toEqual({
      userId: 'u1',
      lat: 34.34,
      lng: 108.94,
      label: '西安',
      precision: 2,
      visible: true,
      updatedAt: '2026-11-22T00:00:00Z',
    })
  })

  it('拒绝缺失用户、越界坐标与非法数值', () => {
    expect(normalizeLocationRow(null)).toBeNull()
    expect(normalizeLocationRow({ lat: 1, lng: 1 })).toBeNull()
    expect(normalizeLocationRow({ user_id: 'u1', lat: 91, lng: 0 })).toBeNull()
    expect(normalizeLocationRow({ user_id: 'u1', lat: 0, lng: -181 })).toBeNull()
    expect(normalizeLocationRow({ user_id: 'u1', lat: 'x', lng: 0 })).toBeNull()
  })

  it('未显式开启时视为不共享', () => {
    expect(normalizeLocationRow({ user_id: 'u1', lat: 1, lng: 2 }).visible).toBe(false)
    expect(normalizeLocationRow({ user_id: 'u1', lat: 1, lng: 2, visible: 'true' }).visible).toBe(false)
  })
})

describe('cityLocation', () => {
  it('支持城市 id 与中文名，返回城市中心坐标', () => {
    expect(cityLocation('xian')).toMatchObject({ label: '西安', lat: 34.34, lng: 108.94, precision: 2 })
    expect(cityLocation('西安')).toMatchObject({ label: '西安' })
  })

  it('未知城市返回 null', () => {
    expect(cityLocation(' Atlantis ')).toBeNull()
  })
})

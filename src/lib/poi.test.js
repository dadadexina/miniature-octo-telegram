import { describe, expect, it } from 'vitest'
import {
  POI_CATEGORIES,
  POI_LAYER_IDS,
  buildPoiFilter,
  poiCategoryClasses,
  poiCategoryOf,
  poiLayerVisible,
} from './poi'

describe('POI 分类与图层', () => {
  it('分类标识唯一且包含全部与小区', () => {
    const ids = POI_CATEGORIES.map((category) => category.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('all')
    expect(ids).toContain('community')
    expect(poiCategoryOf('missing').id).toBe('all')
  })

  it('餐饮和酒店分类映射到 OpenMapTiles 的 class', () => {
    expect(poiCategoryClasses('food')).toContain('restaurant')
    expect(poiCategoryClasses('lodging')).toContain('lodging')
    expect(poiCategoryClasses('all')).toEqual([])
  })

  it('分类过滤保留原始筛选条件', () => {
    const original = ['>=', ['get', 'rank'], 7]
    expect(buildPoiFilter(original, 'all')).toBe(original)
    expect(buildPoiFilter(original, 'food')).toEqual([
      'all',
      original,
      ['match', ['get', 'class'], poiCategoryClasses('food'), true, false],
    ])
    expect(buildPoiFilter(null, 'all')).toBeNull()
  })

  it('按分类决定图层可见性', () => {
    POI_LAYER_IDS.forEach((layerId) => {
      expect(poiLayerVisible(layerId, 'all')).toBe(true)
      expect(poiLayerVisible(layerId, 'community')).toBe(false)
    })
    expect(poiLayerVisible('poi_transit', 'transit')).toBe(true)
    expect(poiLayerVisible('poi_r1', 'transit')).toBe(false)
    expect(poiLayerVisible('poi_r1', 'food')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { CLOUD_LATS, CLOUD_LNGS, averageCloud, cloudGridFrom, cloudPointId, cloudPoints } from './clouds'

describe('cloud field', () => {
  it('生成覆盖全球的采样点', () => {
    const points = cloudPoints()
    expect(points).toHaveLength(CLOUD_LATS.length * CLOUD_LNGS.length)
    expect(points[0]).toMatchObject({ id: cloudPointId(0, 0), lat: -75, lng: -180 })
    expect(points.at(-1)).toMatchObject({ lat: 75, lng: 150 })
  })

  it('把接口结果还原成网格并处理缺失值', () => {
    const byId = {
      [cloudPointId(0, 0)]: { cloud: 80 },
      [cloudPointId(1, 2)]: { cloud: 20 },
    }
    const grid = cloudGridFrom(byId)
    expect(grid[0][0]).toBe(80)
    expect(grid[1][2]).toBe(20)
    expect(grid[0][1]).toBeNull()
    expect(averageCloud(grid)).toBe(50)
    expect(averageCloud([[10, 20], [null, 30]])).toBe(20)
  })
})

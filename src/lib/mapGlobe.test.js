import { describe, expect, it } from 'vitest'
import {
  MAP_THEMES,
  buildArcsGeoJSON,
  buildNodes,
  buildRouteGeoJSON,
  greatCircleLine,
  mapTheme,
  pseudoCoords,
  roadColor,
  roadKind,
} from './mapGlobe'

describe('mapGlobe', () => {
  it('主题缺省回退到 light', () => {
    expect(mapTheme('nope')).toBe(MAP_THEMES.light)
    expect(mapTheme('dark')).toBe(MAP_THEMES.dark)
  })

  it('按图层 id 区分道路等级', () => {
    expect(roadKind('tunnel_motorway')).toBe('major')
    expect(roadKind('road_primary')).toBe('primary')
    expect(roadKind('road_secondary')).toBe('secondary')
    expect(roadKind('road_minor')).toBe('minor')
    expect(roadKind('road_primary_casing')).toBe('casing')
    expect(roadColor(MAP_THEMES.light, 'road_motorway')).toBe(MAP_THEMES.light.roadMajor)
  })

  it('大圆线首尾与输入坐标一致', () => {
    const line = greatCircleLine({ lat: 0, lng: 0 }, { lat: 0, lng: 90 }, 8)
    expect(line).toHaveLength(9)
    expect(line[0][0]).toBeCloseTo(0)
    expect(line[0][1]).toBeCloseTo(0)
    expect(line[8][0]).toBeCloseTo(90)
    expect(line[8][1]).toBeCloseTo(0)
  })

  it('缺少坐标时生成稳定的伪坐标', () => {
    const a = pseudoCoords('friend-1')
    const b = pseudoCoords('friend-1')
    expect(a).toEqual(b)
    expect(a.lat).toBeGreaterThanOrEqual(-55)
    expect(a.lat).toBeLessThanOrEqual(55)
    expect(a.lng).toBeGreaterThanOrEqual(-180)
    expect(a.lng).toBeLessThanOrEqual(180)
  })

  it('构节点时我排在首位且跳过重复与无效项', () => {
    const nodes = buildNodes(
      [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }, { name: '无 id' }],
      { id: 'me', name: '我', coords: { lat: 1, lng: 2 } }
    )
    expect(nodes[0]).toMatchObject({ id: 'me', me: true, lat: 1, lng: 2 })
    expect(nodes).toHaveLength(2)
  })

  it('构弧线时忽略未知端点', () => {
    const nodes = [
      { id: 'me', lat: 0, lng: 0 },
      { id: 'a', lat: 10, lng: 10 },
    ]
    const geo = buildArcsGeoJSON(nodes, [['me', 'a'], ['me', 'ghost']])
    expect(geo.features).toHaveLength(1)
    expect(geo.features[0].geometry.type).toBe('LineString')
  })

  it('导航线只接受有效端点并包含全部路径点', () => {
    const geo = buildRouteGeoJSON({ lat: 31.2304, lng: 121.4737 }, { lat: 39.9042, lng: 116.4074 }, 24)
    expect(geo.features).toHaveLength(1)
    const line = geo.features[0].geometry.coordinates
    expect(line).toHaveLength(25)
    expect(line[0][0]).toBeCloseTo(121.4737)
    expect(line[24][1]).toBeCloseTo(39.9042)
    expect(buildRouteGeoJSON(null, { lat: 0, lng: 0 }).features).toHaveLength(0)
    expect(buildRouteGeoJSON({ lat: 0, lng: 0 }, { lat: NaN, lng: 1 }).features).toHaveLength(0)
  })
})

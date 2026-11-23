import { describe, expect, it } from 'vitest'
import {
  MAX_TILE_ZOOM,
  TILE_SPAN,
  altitudeLabel,
  formatCoords,
  latLngFromUnit,
  parseCoords,
  tileBlock,
  tileToLat,
  tileToLng,
  tileX,
  tileY,
  tileZoomFor,
} from './tiles'
import { tileUrl } from './mapTiles'

describe('tiles', () => {
  it('maps degrees to slippy tiles', () => {
    expect(tileX(108.94, 13)).toBe(6574)
    expect(tileY(34.34, 13)).toBe(3263)
    expect(tileX(-180, 3)).toBe(0)
    expect(tileY(0, 3)).toBe(4)
  })

  it('maps tile centers back to degrees', () => {
    expect(tileToLat(3263.5, 13)).toBeCloseTo(34.3253, 3)
    expect(tileToLng(6574.5, 13)).toBeCloseTo(108.9185, 3)
    expect(tileToLat(0, 0)).toBeCloseTo(85.0511, 3)
  })

  it('returns a square block of tiles around a coordinate', () => {
    const block = tileBlock(34.34, 108.94, 13)
    expect(block.span).toBe(TILE_SPAN)
    expect(block.originX).toBe(6573)
    expect(block.originY).toBe(3261)
    expect(Number.isInteger(block.originX)).toBe(true)
    expect(Number.isInteger(block.originY)).toBe(true)
  })

  it('clamps blocks at the poles', () => {
    const north = tileBlock(89, 10, 10)
    const south = tileBlock(-89, 10, 10)
    expect(north.originY).toBeGreaterThanOrEqual(0)
    expect(south.originY + north.span).toBeLessThanOrEqual(2 ** 10)
  })

  it('selects a deeper tile level as altitude drops', () => {
    const high = tileZoomFor({ altitudeWorld: 0.05, lat: 34 })
    const mid = tileZoomFor({ altitudeWorld: 0.00157, lat: 34 })
    const low = tileZoomFor({ altitudeWorld: 0.000005, lat: 34 })
    expect(high).toBeLessThan(mid)
    expect(mid).toBeLessThan(low)
    expect(low).toBe(MAX_TILE_ZOOM)
  })

  it('converts a globe vector back to real coordinates', () => {
    expect(latLngFromUnit({ x: 1, y: 0, z: 0 })).toEqual({ lat: 0, lng: -0 })
    expect(latLngFromUnit({ x: 0, y: 1, z: 0 }).lat).toBeCloseTo(90, 6)
    const xi = latLngFromUnit({ x: Math.cos(34.34 * (Math.PI / 180)), y: Math.sin(34.34 * (Math.PI / 180)), z: 0 })
    expect(xi.lat).toBeCloseTo(34.34, 6)
  })

  it('formats coordinates and altitude', () => {
    expect(formatCoords(34.34, 108.94)).toBe('N 34.34°  E 108.94°')
    expect(formatCoords(-33.9, -70.6)).toBe('S 33.90°  W 70.60°')
    expect(formatCoords(34.34162, 108.93984, 5)).toBe('N 34.34162°  E 108.93984°')
    expect(altitudeLabel(0.000005)).toBe('32 m')
    expect(altitudeLabel(0.05)).toBe('319 km')
  })

  it('parses decimal, paired and hemisphere coordinates', () => {
    expect(parseCoords('34.34, 108.94')).toEqual({ lat: 34.34, lng: 108.94 })
    expect(parseCoords('34.34 108.94')).toEqual({ lat: 34.34, lng: 108.94 })
    expect(parseCoords('N 34.34° E 108.94°')).toEqual({ lat: 34.34, lng: 108.94 })
    expect(parseCoords('S 33.9 W 70.6')).toEqual({ lat: -33.9, lng: -70.6 })
    expect(parseCoords('34.34，108.94')).toEqual({ lat: 34.34, lng: 108.94 })
    expect(parseCoords('上海')).toBeNull()
    expect(parseCoords('91, 108')).toBeNull()
    expect(parseCoords('34.34, 181')).toBeNull()
  })

  it('wraps tile x across the antimeridian', () => {
    expect(tileUrl('osm', 3, 8, 2)).toBe('https://tile.openstreetmap.org/3/0/2.png')
    expect(tileUrl('osm', 3, -1, 2)).toBe('https://tile.openstreetmap.org/3/7/2.png')
    expect(tileUrl('esri', 3, 8, 2)).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/0'
    )
  })
})

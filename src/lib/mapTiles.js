import { TILE_PX } from './tiles'

export const OSM_COPYRIGHT = '© OpenStreetMap contributors'
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'

const CACHE_LIMIT = 96
const tileCache = new Map()

export function clearTileCache() {
  tileCache.clear()
}

export function tileUrl(zoom, x, y) {
  const count = 2 ** zoom
  const wrapped = ((x % count) + count) % count
  return `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`
}

function paintTile(image) {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_PX
  canvas.height = TILE_PX
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, TILE_PX, TILE_PX)
  const frame = ctx.getImageData(0, 0, TILE_PX, TILE_PX)
  const data = frame.data
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue
    const water = blue > red + 10 && blue > green + 3 && luma > 90
    const road = luma > 248
    const value = water ? 10 + (255 - luma) * 0.12 : road ? 120 : 16 + (255 - luma) * 0.68
    data[index] = Math.min(255, value * 0.62)
    data[index + 1] = Math.min(255, value * 0.78)
    data[index + 2] = Math.min(255, value)
  }
  ctx.putImageData(frame, 0, 0)
  return canvas
}

function loadTile(zoom, x, y) {
  const count = 2 ** zoom
  const wrappedX = ((x % count) + count) % count
  const key = `${zoom}/${wrappedX}/${y}`
  const cached = tileCache.get(key)
  if (cached) {
    tileCache.delete(key)
    tileCache.set(key, cached)
    return cached
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      try {
        const canvas = paintTile(image)
        if (!canvas) throw new Error('canvas unavailable')
        resolve(canvas)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('tile failed'))
    image.src = tileUrl(zoom, wrappedX, y)
  })
  tileCache.set(key, promise)
  promise.catch(() => tileCache.delete(key))
  if (tileCache.size > CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value
    if (oldest && oldest !== key) tileCache.delete(oldest)
  }
  return promise
}

export async function buildTileCanvas(zoom, originX, originY, span = 4) {
  if (typeof document === 'undefined') return null
  const size = span * TILE_PX
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0a1624'
  ctx.fillRect(0, 0, size, size)
  const tiles = []
  for (let row = 0; row < span; row += 1) {
    for (let column = 0; column < span; column += 1) {
      tiles.push({ row, column, promise: loadTile(zoom, originX + column, originY + row) })
    }
  }
  const loaded = await Promise.all(tiles.map((tile) => tile.promise))
  loaded.forEach((tile, index) => {
    ctx.drawImage(tile, tiles[index].column * TILE_PX, tiles[index].row * TILE_PX)
  })
  return canvas
}

import { TILE_PX } from './tiles'

export const OSM_COPYRIGHT = '© OpenStreetMap contributors'
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
export const ESRI_COPYRIGHT = 'Esri, Maxar, Earthstar Geographics'
export const ESRI_COPYRIGHT_URL = 'https://www.esri.com/'

const CACHE_LIMIT = 128
const MAX_PARALLEL = 4
const TILE_CACHE_NAME = 'miniature-osm-tiles-v1'
const OSM_TILE_TEMPLATE = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ESRI_TILE_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const tileCache = new Map()
let cachePromise = null
let activeRequests = 0
const pendingRequests = []

export function clearTileCache() {
  tileCache.clear()
}

export function tileUrl(source, zoom, x, y) {
  const count = 2 ** zoom
  const wrapped = ((x % count) + count) % count
  if (source === 'esri') {
    return ESRI_TILE_TEMPLATE.replace('{z}', String(zoom)).replace('{y}', String(y)).replace('{x}', String(wrapped))
  }
  return OSM_TILE_TEMPLATE.replace('{z}', String(zoom)).replace('{x}', String(wrapped)).replace('{y}', String(y))
}

function openCache() {
  if (cachePromise) return cachePromise
  if (typeof caches === 'undefined') {
    cachePromise = Promise.resolve(null)
    return cachePromise
  }
  cachePromise = caches
    .open(TILE_CACHE_NAME)
    .then((cache) => cache)
    .catch(() => null)
  return cachePromise
}

function drainQueue() {
  while (activeRequests < MAX_PARALLEL && pendingRequests.length) {
    const job = pendingRequests.shift()
    activeRequests += 1
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeRequests -= 1
        drainQueue()
      })
  }
}

function schedule(task) {
  return new Promise((resolve, reject) => {
    pendingRequests.push({ task, resolve, reject })
    drainQueue()
  })
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchBlob(url) {
  const cache = await openCache()
  if (cache) {
    const hit = await cache.match(url).catch(() => null)
    if (hit) return hit.blob()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`tile ${response.status}`)
    const type = response.headers.get('content-type') || ''
    if (type && !type.startsWith('image/')) throw new Error('tile is not an image')
    if (cache) {
      cache.put(url, response.clone()).catch(() => {})
    }
    return await response.blob()
  } finally {
    clearTimeout(timer)
  }
}

async function decodeBlob(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(blob)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('tile decode failed'))
    }
    image.src = url
  })
}

function paintTile(image) {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_PX
  canvas.height = TILE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, TILE_PX, TILE_PX)
  if (typeof image.close === 'function') image.close()
  return canvas
}

function loadTile(source, zoom, x, y) {
  const count = 2 ** zoom
  const wrappedX = ((x % count) + count) % count
  const key = `${source}/${zoom}/${wrappedX}/${y}`
  const cached = tileCache.get(key)
  if (cached) {
    tileCache.delete(key)
    tileCache.set(key, cached)
    return cached
  }
  const promise = schedule(async () => {
    const url = tileUrl(source, zoom, wrappedX, y)
    let lastError = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const blob = await fetchBlob(url)
        const image = await decodeBlob(blob)
        const canvas = paintTile(image)
        if (!canvas) throw new Error('canvas unavailable')
        return canvas
      } catch (error) {
        lastError = error
        if (attempt === 0) await wait(500 + Math.random() * 500)
      }
    }
    throw lastError || new Error('tile failed')
  })
  tileCache.set(key, promise)
  promise.catch(() => tileCache.delete(key))
  if (tileCache.size > CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value
    if (oldest && oldest !== key) tileCache.delete(oldest)
  }
  return promise
}

export async function buildTileCanvas(zoom, originX, originY, span = 4, source = 'osm') {
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
      tiles.push({ row, column, promise: loadTile(source, zoom, originX + column, originY + row) })
    }
  }
  const settled = await Promise.allSettled(tiles.map((tile) => tile.promise))
  let loaded = 0
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled' || !result.value) return
    loaded += 1
    ctx.drawImage(result.value, tiles[index].column * TILE_PX, tiles[index].row * TILE_PX)
  })
  if (!loaded) throw new Error('all tiles failed')
  canvas.partial = loaded < tiles.length
  return canvas
}

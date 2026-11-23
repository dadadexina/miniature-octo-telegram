import { MAX_TILE_ZOOM, TILE_PX } from './tiles'

export const OSM_COPYRIGHT = '© OpenStreetMap contributors'
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
export const ESRI_COPYRIGHT = 'Esri, Maxar, Earthstar Geographics'
export const ESRI_COPYRIGHT_URL = 'https://www.esri.com/'

const CACHE_LIMIT = 256
const MAX_PARALLEL = 8
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

export function cancelPendingTiles() {
  for (const job of pendingRequests.splice(0)) {
    job.reject(new Error('tile request cancelled'))
  }
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

export function buildTileCanvasProgressive(zoom, originX, originY, span = 4, source = 'osm', onProgress) {
  if (typeof document === 'undefined') return null
  const canvasSize = span * TILE_PX
  const canvas = document.createElement('canvas')
  canvas.width = canvasSize
  canvas.height = canvasSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0a1624'
  ctx.fillRect(0, 0, canvasSize, canvasSize)

  const parentJobs = []
  if (zoom > 0) {
    const pOriginX = Math.floor(originX / 2)
    const pOriginY = Math.floor(originY / 2)
    const pSpan = Math.ceil(span / 2) + 1
    for (let py = 0; py < pSpan; py += 1) {
      for (let px = 0; px < pSpan; px += 1) {
        const tx = pOriginX + px
        const ty = pOriginY + py
        const dx = (tx * 2 - originX) * TILE_PX
        const dy = (ty * 2 - originY) * TILE_PX
        if (dx >= canvasSize || dy >= canvasSize) continue
        if (dx + TILE_PX * 2 <= 0 || dy + TILE_PX * 2 <= 0) continue
        parentJobs.push({ zoom: zoom - 1, x: tx, y: ty, dx, dy, draw: TILE_PX * 2 })
      }
    }
  }

  const childJobs = []
  const center = (span - 1) / 2
  for (let row = 0; row < span; row += 1) {
    for (let column = 0; column < span; column += 1) {
      childJobs.push({
        zoom,
        x: originX + column,
        y: originY + row,
        dx: column * TILE_PX,
        dy: row * TILE_PX,
        draw: TILE_PX,
        dist: (column - center) ** 2 + (row - center) ** 2,
      })
    }
  }
  childJobs.sort((a, b) => a.dist - b.dist)

  const stats = { loaded: 0, failed: 0, total: childJobs.length }
  const run = (async () => {
    if (parentJobs.length) {
      await Promise.allSettled(
        parentJobs.map(async (job) => {
          try {
            const image = await loadTile(source, job.zoom, job.x, job.y)
            if (image) ctx.drawImage(image, job.dx, job.dy, job.draw, job.draw)
          } catch {
            // 父级仅作模糊底图，失败不影响清晰子级
          }
        })
      )
      if (typeof onProgress === 'function') onProgress(stats)
    }
    await Promise.all(
      childJobs.map(async (job) => {
        try {
          const image = await loadTile(source, job.zoom, job.x, job.y)
          if (image) {
            ctx.drawImage(image, job.dx, job.dy, job.draw, job.draw)
            stats.loaded += 1
          }
        } catch {
          stats.failed += 1
        }
        if (typeof onProgress === 'function') onProgress(stats)
      })
    )
  })()

  return { canvas, done: run, stats }
}

export function prefetchTiles(source, zoom, centerX, centerY, span = 3) {
  if (zoom < 0 || zoom > MAX_TILE_ZOOM) return
  const offset = Math.floor(span / 2)
  for (let y = -offset; y <= offset; y += 1) {
    for (let x = -offset; x <= offset; x += 1) {
      loadTile(source, zoom, centerX + x, centerY + y)
    }
  }
}

export const CLOUD_LATS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75]
export const CLOUD_LNGS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]

const CLOUD_STEP = 15
const LNG_STEP = 30

export function cloudPointId(latIndex, lngIndex) {
  return `cloud-${latIndex}-${lngIndex}`
}

export function cloudPoints() {
  const points = []
  CLOUD_LATS.forEach((lat, latIndex) => {
    CLOUD_LNGS.forEach((lng, lngIndex) => {
      points.push({ id: cloudPointId(latIndex, lngIndex), lat, lng })
    })
  })
  return points
}

export function cloudGridFrom(byId) {
  return CLOUD_LATS.map((lat, latIndex) =>
    CLOUD_LNGS.map((lng, lngIndex) => {
      const value = byId?.[cloudPointId(latIndex, lngIndex)]?.cloud
      return typeof value === 'number' ? value : null
    })
  )
}

export function averageCloud(grid) {
  const values = grid.flat().filter((value) => typeof value === 'number')
  if (!values.length) return 50
  return values.reduce((total, value) => total + value, 0) / values.length
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function smoothValue(value) {
  return value * value * (3 - 2 * value)
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 69069)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function periodicNoise(x, y, period, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothValue(x - x0)
  const ty = smoothValue(y - y0)
  const wrap = (value) => ((value % period) + period) % period
  const xa = wrap(x0)
  const xb = wrap(x0 + 1)
  const a = hash2(xa, y0, seed)
  const b = hash2(xb, y0, seed)
  const c = hash2(xa, y0 + 1, seed)
  const d = hash2(xb, y0 + 1, seed)
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
}

function fbm(x, y, seed) {
  let total = 0
  let amplitude = 0.55
  let norm = 0
  for (let octave = 0; octave < 3; octave += 1) {
    const frequency = 2 ** octave
    total += amplitude * periodicNoise(x * frequency * 3, y * frequency * 1.8, frequency * 3, seed + octave)
    norm += amplitude
    amplitude *= 0.5
  }
  return total / norm
}

function sampleCloud(grid, avg, lat, lng) {
  const fy = Math.min(CLOUD_LATS.length - 1, Math.max(0, (lat - CLOUD_LATS[0]) / CLOUD_STEP))
  const fxRaw = ((lng + 180) / LNG_STEP + CLOUD_LNGS.length) % CLOUD_LNGS.length
  const i0 = Math.floor(fy)
  const i1 = Math.min(CLOUD_LATS.length - 1, i0 + 1)
  const j0 = Math.floor(fxRaw) % CLOUD_LNGS.length
  const j1 = (j0 + 1) % CLOUD_LNGS.length
  const tx = fxRaw - Math.floor(fxRaw)
  const ty = fy - i0
  const valueAt = (i, j) => {
    const value = grid[i]?.[j]
    return typeof value === 'number' ? value : avg
  }
  const top = valueAt(i0, j0) + (valueAt(i0, j1) - valueAt(i0, j0)) * tx
  const bottom = valueAt(i1, j0) + (valueAt(i1, j1) - valueAt(i1, j0)) * tx
  return top + (bottom - top) * ty
}

export function buildCloudCanvas(grid) {
  if (typeof document === 'undefined' || !grid?.length) return null
  const width = 768
  const height = 384
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const avg = averageCloud(grid)
  const image = ctx.createImageData(width, height)
  const data = image.data
  let offset = 0

  for (let y = 0; y < height; y += 1) {
    const lat = 90 - (y / height) * 180
    const polarFade = 1 - smoothstep(70, 88, Math.abs(lat))
    for (let x = 0; x < width; x += 1) {
      const lng = (x / width) * 360 - 180
      const cloud = sampleCloud(grid, avg, lat, lng) / 100
      const cover = smoothstep(0.42, 0.92, cloud)
      const grain = fbm(x / width, y / height, 19)
      let alpha = cover * (0.3 + 0.7 * grain) * polarFade
      if (alpha < 0.015) alpha = 0
      data[offset] = 214
      data[offset + 1] = 233
      data[offset + 2] = 255
      data[offset + 3] = Math.round(Math.min(0.9, alpha) * 255)
      offset += 4
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

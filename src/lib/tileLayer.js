import * as THREE from 'three'
import { R, buildTileGeometry, toVec } from './globe'
import { cancelPendingTiles, clearTileCache, loadTile } from './mapTiles'
import { MAX_TILE_ZOOM, MIN_ALTITUDE_WORLD, MIN_TILE_ZOOM, latLngFromUnit, tileToLat, tileToLng, tileX, tileY } from './tiles'

const RAD = Math.PI / 180
const RAD_DEG = 180 / Math.PI
const MAX_TILE_PIXELS = 512
const SEED_TARGET = 5
const REMOVE_GRACE_MS = 700
const RETRY_COOLDOWN_MS = 8000
const REFINE_INTERVAL_MS = 160

export function createTileLayer({ globe, renderer, getSource, lowPower }) {
  const group = new THREE.Group()
  group.visible = false
  globe.add(group)

  const meshes = new Map()
  const childKeys = new Map()
  const parentOf = new Map()
  let fade = 0
  let disposed = false
  let refineAt = 0
  let desired = new Set()

  const segments = lowPower ? 4 : 6

  const blankTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  blankTexture.needsUpdate = true
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy())

  const keyOf = (zoom, x, y) => `${zoom}/${x}/${y}`
  const wrapX = (x, zoom) => {
    const count = 2 ** zoom
    return ((x % count) + count) % count
  }

  function tilePixelSize(zoom, lat, altitude, screenHeight, fovY) {
    const arc = R * ((2 * Math.PI) / 2 ** zoom) * Math.max(0.08, Math.cos(lat * RAD))
    const viewHeight = 2 * altitude * Math.tan(fovY / 2)
    if (!(viewHeight > 0)) return 0
    return (arc / viewHeight) * screenHeight
  }

  function coveredByChildren(key) {
    const children = childKeys.get(key)
    if (!children || !children.length) return false
    return children.every((childKey) => {
      const entry = meshes.get(childKey)
      return entry && entry.state === 'loaded'
    })
  }

  function applyVisibility(key) {
    const entry = meshes.get(key)
    if (!entry) return
    entry.mesh.visible = entry.state === 'loaded' && !coveredByChildren(key)
  }

  function refreshTree(key) {
    const parentKey = parentOf.get(key)
    if (parentKey) applyVisibility(parentKey)
    applyVisibility(key)
  }

  function getMesh(zoom, x, y, radius) {
    const key = keyOf(zoom, x, y)
    const existing = meshes.get(key)
    if (existing) {
      existing.lastUsed = performance.now()
      return existing
    }
    const geometry = buildTileGeometry(x, y, zoom, radius, segments)
    const material = new THREE.MeshBasicMaterial({
      map: blankTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 10 + zoom
    mesh.visible = false
    group.add(mesh)
    const entry = { mesh, material, texture: null, state: 'idle', failedAt: 0, lastUsed: performance.now() }
    meshes.set(key, entry)
    return entry
  }

  function requestLoad(entry, zoom, x, y) {
    if (entry.state === 'loaded' || entry.state === 'loading') return
    if (entry.state === 'failed' && performance.now() - entry.failedAt < RETRY_COOLDOWN_MS) return
    entry.state = 'loading'
    const key = keyOf(zoom, x, y)
    const source = getSource()
    loadTile(source, zoom, x, y)
      .then((canvas) => {
        if (disposed || !meshes.has(key)) return
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = maxAniso
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        if (entry.texture) entry.texture.dispose()
        entry.texture = texture
        entry.material.map = texture
        entry.material.opacity = fade
        entry.state = 'loaded'
        refreshTree(key)
      })
      .catch((error) => {
        if (disposed || !meshes.has(key)) return
        entry.state = error && error.message === 'tile request cancelled' ? 'idle' : 'failed'
        entry.failedAt = performance.now()
      })
  }

  function refine(zoom, x, y, altitude, screenHeight, fovY, camDir, viewRadius) {
    const key = keyOf(zoom, x, y)
    const centerLat = tileToLat(y + 0.5, zoom)
    const centerLng = tileToLng(x + 0.5, zoom)
    const center = toVec(centerLat, centerLng, 1).normalize()
    const halfAngle = (2 * Math.PI) / 2 ** zoom
    if (camDir.angleTo(center) > viewRadius + halfAngle + 0.03) return
    desired.add(key)
    if (zoom >= MAX_TILE_ZOOM) return
    const pixels = tilePixelSize(zoom, centerLat, altitude, screenHeight, fovY)
    if (pixels <= MAX_TILE_PIXELS) return

    const childCount = 2 ** (zoom + 1)
    const childList = []
    for (const [cx, cy] of [
      [x * 2, y * 2],
      [x * 2 + 1, y * 2],
      [x * 2, y * 2 + 1],
      [x * 2 + 1, y * 2 + 1],
    ]) {
      if (cy < 0 || cy >= childCount) continue
      const wrapped = wrapX(cx, zoom + 1)
      const childKey = keyOf(zoom + 1, wrapped, cy)
      childList.push(childKey)
      parentOf.set(childKey, key)
    }
    childKeys.set(key, childList)
    for (const childKey of childList) {
      const [childZoom, childX, childY] = childKey.split('/').map(Number)
      refine(childZoom, childX, childY, altitude, screenHeight, fovY, camDir, viewRadius)
    }
  }

  function update(camera) {
    if (disposed) return
    const now = performance.now()
    if (now - refineAt < REFINE_INTERVAL_MS) return
    refineAt = now

    const distance = camera.position.length()
    const altitude = Math.max(distance - R, MIN_ALTITUDE_WORLD)
    const point = latLngFromUnit(camera.position)
    const screenHeight = renderer.domElement.clientHeight || 1
    const screenWidth = renderer.domElement.clientWidth || screenHeight
    const fovY = (camera.fov * Math.PI) / 180
    const aspect = screenWidth / screenHeight
    const halfFovH = Math.atan(Math.tan(fovY / 2) * Math.max(1, aspect))
    const horizonRad = Math.acos(Math.min(1, R / (R + altitude)))
    const screenSin = Math.min(1, ((R + altitude) / R) * Math.sin(halfFovH))
    const screenPhi = Math.asin(screenSin) - halfFovH
    const viewRadius = Math.max(0.00015, Math.min(horizonRad, screenPhi))

    const viewDiameterDeg = viewRadius * 2 * RAD_DEG
    const seedTileWidth = Math.max(1e-9, viewDiameterDeg / SEED_TARGET)
    const seedZoom = Math.max(MIN_TILE_ZOOM, Math.min(MAX_TILE_ZOOM, Math.round(Math.log2(360 / seedTileWidth))))
    const seedCount = 2 ** seedZoom
    const cx = wrapX(tileX(point.lng, seedZoom), seedZoom)
    const cy = Math.max(0, Math.min(seedCount - 1, tileY(point.lat, seedZoom)))
    const span = SEED_TARGET + 2
    const originX = cx - Math.floor(span / 2)
    const originY = cy - Math.floor(span / 2)
    const camDir = camera.position.clone().normalize()
    const radius = R

    desired = new Set()
    childKeys.clear()
    parentOf.clear()

    const seeds = []
    for (let row = 0; row < span; row += 1) {
      for (let column = 0; column < span; column += 1) {
        const ty = originY + row
        if (ty < 0 || ty >= seedCount) continue
        seeds.push({ zoom: seedZoom, x: wrapX(originX + column, seedZoom), y: ty })
      }
    }

    for (const seed of seeds) {
      refine(seed.zoom, seed.x, seed.y, altitude, screenHeight, fovY, camDir, viewRadius)
    }

    for (const key of desired) {
      const [zoom, x, y] = key.split('/').map(Number)
      const entry = getMesh(zoom, x, y, radius)
      requestLoad(entry, zoom, x, y)
    }

    const removeBefore = now - REMOVE_GRACE_MS
    for (const [key, entry] of meshes) {
      if (desired.has(key)) continue
      if (entry.lastUsed > removeBefore) continue
      group.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      entry.material.dispose()
      if (entry.texture) entry.texture.dispose()
      meshes.delete(key)
    }

    for (const key of desired) applyVisibility(key)
  }

  function setFade(value) {
    fade = value
    for (const entry of meshes.values()) {
      if (entry.state === 'loaded') entry.material.opacity = value
    }
  }

  function setVisible(visible) {
    group.visible = visible
  }

  function clear() {
    for (const entry of meshes.values()) {
      group.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      entry.material.dispose()
      if (entry.texture) entry.texture.dispose()
    }
    meshes.clear()
    childKeys.clear()
    parentOf.clear()
    desired = new Set()
    clearTileCache()
    cancelPendingTiles()
  }

  function dispose() {
    disposed = true
    clear()
    blankTexture.dispose()
    group.removeFromParent()
  }

  function stats() {
    let loading = false
    let loaded = 0
    let failed = 0
    for (const entry of meshes.values()) {
      if (entry.state === 'loading') loading = true
      else if (entry.state === 'loaded') loaded += 1
      else if (entry.state === 'failed') failed += 1
    }
    return { loading, loaded, failed, count: meshes.size }
  }

  return { update, setFade, setVisible, clear, dispose, stats }
}

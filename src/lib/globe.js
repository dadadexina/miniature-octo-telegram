import * as THREE from 'three'
import { MAX_ALTITUDE_WORLD, MIN_ALTITUDE_WORLD, tileToLat, tileToLng } from './tiles'

export const RAD = Math.PI / 180
export const R = 2
export const PALETTE = [0x4fc3ff, 0x7cffb2, 0xffa94d, 0xff6b9d]
export const ME_COLOR = 0xffd166
export const MIN_DISTANCE = R + MIN_ALTITUDE_WORLD
export const MAX_DISTANCE = R + MAX_ALTITUDE_WORLD
export const MAP_DISTANCE = R + 0.06

export const ME_COORDS = { lat: 34.3416, lng: 108.9398 }

export function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function hashString(value) {
  const text = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function pointFor(id) {
  const hash = hashString(id)
  const u = (hash % 10000) / 10000
  const v = (Math.floor(hash / 10000) % 10000) / 10000
  return {
    lat: Math.asin(2 * v - 1) / RAD,
    lng: u * 360 - 180,
  }
}

export function citySpread(id, lat, lng) {
  const hash = hashString(id)
  const angle = ((hash % 3600) / 3600) * Math.PI * 2
  const degrees = 0.006 + ((hash >>> 12) % 5) * 0.004
  return {
    lat: lat + Math.sin(angle) * degrees,
    lng: lng + (Math.cos(angle) * degrees) / Math.max(0.25, Math.cos(lat * RAD)),
  }
}

export function toVec(lat, lng, radius = R) {
  const phi = (90 - lat) * RAD
  const theta = (lng + 180) * RAD
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

export function sunPosition(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000)
  const declination = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60
  const lng = -15 * (hours - 12)
  return { declination, lng, dir: toVec(declination, lng, 1).normalize() }
}

export function deviceClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function deviceDaylight(date = new Date()) {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? '白昼' : '夜晚'
}

export function canUseWebGL() {
  try {
    if (typeof window.WebGLRenderingContext === 'undefined') return false
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.()
    const material = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose?.())
    else material?.dispose?.()
  })
}

export function buildArc(aUnit, bUnit, radius) {
  const angle = aUnit.angleTo(bUnit)
  const axis = new THREE.Vector3().crossVectors(aUnit, bUnit)
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0)
  else axis.normalize()
  const height = radius * (0.04 + angle * 0.14)
  const points = []
  for (let i = 0; i <= 64; i += 1) {
    const t = i / 64
    const point = aUnit.clone().applyAxisAngle(axis, angle * t)
    point.multiplyScalar(radius + Math.sin(Math.PI * t) * height)
    points.push(point)
  }
  return new THREE.CatmullRomCurve3(points)
}

export function buildMapPatchGeometry(block, radius, segments = 32) {
  const positions = []
  const uvs = []
  const indices = []
  for (let row = 0; row <= segments; row += 1) {
    const tileRow = block.originY + (block.span * row) / segments
    const lat = tileToLat(tileRow, block.zoom)
    for (let column = 0; column <= segments; column += 1) {
      const tileColumn = block.originX + (block.span * column) / segments
      const lng = tileToLng(tileColumn, block.zoom)
      const point = toVec(lat, lng, radius)
      positions.push(point.x, point.y, point.z)
      uvs.push(column / segments, 1 - row / segments)
    }
  }
  const stride = segments + 1
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * stride + column
      const b = a + 1
      const c = a + stride
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

export const GLOBE_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

export const GLOBE_FRAGMENT_SHADER = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 sunDir = normalize(sunDirection);
    float sunDot = dot(normal, sunDir);
    vec3 surface = texture2D(dayMap, vUv).rgb;
    surface = mix(surface, vec3(0.16, 0.42, 0.66), 0.3);
    surface *= vec3(0.78, 0.94, 1.1);
    vec3 dayColor = surface * (0.58 + 0.5 * max(sunDot, 0.0));
    vec3 lights = texture2D(nightMap, vUv).rgb;
    float lightsMask = smoothstep(0.04, 0.6, dot(lights, vec3(0.333)));
    vec3 nightColor = vec3(0.004, 0.012, 0.026) + vec3(1.0, 0.78, 0.44) * lightsMask * 0.4;
    vec3 color = mix(nightColor, dayColor, smoothstep(-0.16, 0.22, sunDot));
    float dusk = exp(-pow((sunDot + 0.02) / 0.13, 2.0));
    color += vec3(0.3, 0.13, 0.04) * dusk * 0.16;
    color += vec3(0.3, 0.6, 0.9) * pow(max(sunDot, 0.0), 10.0) * 0.06;
    gl_FragColor = vec4(color, 1.0);
  }`

export const CLOUD_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

export const CLOUD_FRAGMENT_SHADER = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float fade;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float alpha = texture2D(cloudMap, vUv).a;
    float lit = 0.2 + 0.8 * smoothstep(-0.14, 0.32, dot(normalize(vWorldNormal), normalize(sunDirection)));
    gl_FragColor = vec4(vec3(0.78, 0.88, 1.0), alpha * lit * 0.48 * fade);
  }`

export const GLOW_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

export const GLOW_FRAGMENT_SHADER = `
  uniform vec3 glowColor;
  uniform vec3 sunDirection;
  uniform float fade;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    float i = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    float day = smoothstep(-0.4, 0.6, dot(normalize(vWorldNormal), normalize(sunDirection)));
    gl_FragColor = vec4(glowColor * (0.7 + 0.5 * day), 1.0) * clamp(i, 0.0, 1.0) * (0.6 + 0.4 * day) * fade;
  }`

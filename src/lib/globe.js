import * as THREE from 'three'
import { MAX_ALTITUDE_WORLD, MIN_ALTITUDE_WORLD, tileToLat, tileToLng } from './tiles'

export const RAD = Math.PI / 180
export const R = 2
export const PALETTE = [0x4fc3ff, 0x7cffb2, 0xffa94d, 0xff6b9d]
export const ME_COLOR = 0xffd166

export const GLOBE_THEMES = {
  light: {
    clear: 0xe7e3d8,
    ambientColor: 0xf1ede2, ambientIntensity: 1.2,
    keyColor: 0xfffdf6, keyIntensity: 1.2,
    rimColor: 0xc7bfa9, rimIntensity: 0.7,
    oceanTint: 0xd9d3c2, shadow: 0x6f6a5c, highlight: 0xf8f5ec, grade: 0.82, brightness: 1.05,
    exploreLand: 0xefe8d4, exploreWater: 0xcdc6b2, exploreBorder: 0x8a8375,
    cloud: 0xffffff, cloudOpacity: 0.3,
    grid: 0x191919, gridOpacity: 0.08,
    glow: 0xbfb8a6,
    star: 0x54514b, starOpacity: 0,
    arcBase: 0x1f7fdc, arcActive: 0x0fb4f0,
    me: 0x9a6b1e, palette: [0x3b5d7a, 0x4e7d63, 0xa9702f, 0x9a4d63],
    labelText: '#3a3835', labelDot: '#3b5d7a', labelTemp: '#7a756a', labelShadow: '0 1px 3px rgba(255,255,255,0.85)',
  },
  sepia: {
    clear: 0xece0c4,
    ambientColor: 0xf7ecd2, ambientIntensity: 1.2,
    keyColor: 0xfff6e0, keyIntensity: 1.2,
    rimColor: 0xc7ac82, rimIntensity: 0.75,
    oceanTint: 0xdcc9a2, shadow: 0x6b5942, highlight: 0xfbf1db, grade: 0.82, brightness: 1.05,
    exploreLand: 0xf3e7c6, exploreWater: 0xdccba6, exploreBorder: 0x8a7550,
    cloud: 0xfff8ec, cloudOpacity: 0.3,
    grid: 0x3b2f25, gridOpacity: 0.08,
    glow: 0xc9b48a,
    star: 0x6a5b45, starOpacity: 0,
    arcBase: 0xc8681c, arcActive: 0xf08a2a,
    me: 0x8a5a1e, palette: [0x8a6a3a, 0x5f7d4f, 0xb0703a, 0x8e4a5a],
    labelText: '#3b2f25', labelDot: '#7a5c3a', labelTemp: '#8a7550', labelShadow: '0 1px 3px rgba(255,250,238,0.85)',
  },
  moss: {
    clear: 0xe1e8d6,
    ambientColor: 0xeef1e2, ambientIntensity: 1.2,
    keyColor: 0xf6f8ee, keyIntensity: 1.2,
    rimColor: 0xa9be9c, rimIntensity: 0.75,
    oceanTint: 0xccd8bb, shadow: 0x51614f, highlight: 0xf4f6e9, grade: 0.82, brightness: 1.05,
    exploreLand: 0xeaf0d8, exploreWater: 0xc4d3b0, exploreBorder: 0x7a8c74,
    cloud: 0xfbfff4, cloudOpacity: 0.3,
    grid: 0x3c473e, gridOpacity: 0.08,
    glow: 0xa9be9c,
    star: 0x5e6e58, starOpacity: 0,
    arcBase: 0x2f9c60, arcActive: 0x2fd07e,
    me: 0x6b7a2e, palette: [0x4f6b52, 0x7c8f4a, 0xb08a3a, 0x8a5a5a],
    labelText: '#3c473e', labelDot: '#4f6b52', labelTemp: '#7a8c74', labelShadow: '0 1px 3px rgba(247,243,227,0.85)',
  },
  blue: {
    clear: 0xdbe4ee,
    ambientColor: 0xeaf0f6, ambientIntensity: 1.2,
    keyColor: 0xffffff, keyIntensity: 1.2,
    rimColor: 0x9fb6cc, rimIntensity: 0.8,
    oceanTint: 0xbcd0e2, shadow: 0x5a6f86, highlight: 0xf3f8fd, grade: 0.7, brightness: 1.05,
    exploreLand: 0xe4edf5, exploreWater: 0xb6cbdf, exploreBorder: 0x7e97b0,
    cloud: 0xffffff, cloudOpacity: 0.34,
    grid: 0x2e3440, gridOpacity: 0.08,
    glow: 0x9fbad6,
    star: 0x64788c, starOpacity: 0,
    arcBase: 0x2f8fe6, arcActive: 0x1fc2ee,
    me: 0x2e6f9e, palette: [0x4c6a8c, 0x3f8f74, 0xc07a3a, 0x9a4d63],
    labelText: '#2e3440', labelDot: '#4c6a8c', labelTemp: '#7e97b0', labelShadow: '0 1px 3px rgba(250,252,255,0.85)',
  },
  dark: {
    clear: 0x03070f,
    ambientColor: 0x6fa8dc, ambientIntensity: 1.1,
    keyColor: 0xffffff, keyIntensity: 1.4,
    rimColor: 0x2f7fc0, rimIntensity: 1.2,
    oceanTint: 0x3a77b0, shadow: 0x06121f, highlight: 0xdde8f5, grade: 0.12, brightness: 1,
    exploreLand: 0xe8ecda, exploreWater: 0xaacbe8, exploreBorder: 0x8fa3b8,
    cloud: 0xc7dcff, cloudOpacity: 0.48,
    grid: 0x2a6fa8, gridOpacity: 0.12,
    glow: 0x3fa9ff,
    star: 0x9ec8ff, starOpacity: 0.7,
    arcBase: 0x5fc6ff, arcActive: 0xcaf6ff,
    me: 0xffd166, palette: [0x4fc3ff, 0x7cffb2, 0xffa94d, 0xff6b9d],
    labelText: '#b8ddff', labelDot: '#7cffb2', labelTemp: '#6fb8e2', labelShadow: '0 1px 5px rgba(2,8,16,0.92)',
  },
}
export const MIN_DISTANCE = R + MIN_ALTITUDE_WORLD
export const MAX_DISTANCE = R + MAX_ALTITUDE_WORLD
export const MAP_DISTANCE = R + 0.06

export const ME_COORDS = { lat: 34.3416, lng: 108.9398 }

export const SIDEREAL_DAY_MS = 86164090.5
export const EARTH_ROTATION_SPEED_SCALE = 1
const EARTH_ROTATION_RAD_PER_MS = (Math.PI * 2) / SIDEREAL_DAY_MS

export function earthRotationAngle(elapsedMs) {
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0
  return elapsed * EARTH_ROTATION_RAD_PER_MS * EARTH_ROTATION_SPEED_SCALE
}

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

export function buildArcFlowLine(curve, segments = 96) {
  const points = curve.getPoints(segments)
  const positions = new Float32Array(points.length * 3)
  const progress = new Float32Array(points.length)
  points.forEach((point, index) => {
    positions.set([point.x, point.y, point.z], index * 3)
    progress[index] = index / (points.length - 1)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1))
  return geometry
}

export function buildTileGeometry(x, y, zoom, radius, segments = 4) {
  const positions = []
  const uvs = []
  const indices = []
  for (let row = 0; row <= segments; row += 1) {
    const lat = tileToLat(y + row / segments, zoom)
    for (let column = 0; column <= segments; column += 1) {
      const lng = tileToLng(x + column / segments, zoom)
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
  uniform vec3 uOceanTint;
  uniform vec3 uShadow;
  uniform vec3 uHighlight;
  uniform float uGrade;
  uniform float uBrightness;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 sunDir = normalize(sunDirection);
    float sunDot = dot(normal, sunDir);
    vec3 surface = texture2D(dayMap, vUv).rgb;
    surface = mix(surface, uOceanTint, 0.3);
    surface *= vec3(0.78, 0.94, 1.1);
    float lum = dot(surface, vec3(0.299, 0.587, 0.114));
    vec3 graded = mix(uShadow, uHighlight, smoothstep(0.02, 0.85, lum));
    surface = mix(surface, graded, uGrade);
    vec3 dayColor = surface * (0.58 + 0.5 * max(sunDot, 0.0)) * uBrightness;
    vec3 lights = texture2D(nightMap, vUv).rgb;
    float lightsMask = smoothstep(0.04, 0.6, dot(lights, vec3(0.333)));
    vec3 nightColor = uShadow * 0.6 + vec3(1.0, 0.78, 0.44) * lightsMask * 0.4;
    vec3 color = mix(nightColor, dayColor, smoothstep(-0.16, 0.22, sunDot));
    float dusk = exp(-pow((sunDot + 0.02) / 0.13, 2.0));
    color += vec3(0.3, 0.13, 0.04) * dusk * 0.16 * (1.0 - uGrade * 0.7);
    color += uHighlight * pow(max(sunDot, 0.0), 10.0) * 0.06;
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
  uniform vec3 uCloudColor;
  uniform float uCloudOpacity;
  uniform float fade;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float alpha = texture2D(cloudMap, vUv).a;
    float lit = 0.2 + 0.8 * smoothstep(-0.14, 0.32, dot(normalize(vWorldNormal), normalize(sunDirection)));
    gl_FragColor = vec4(uCloudColor, alpha * lit * uCloudOpacity * fade);
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

export const ARC_VERTEX_SHADER = `
  attribute float aProgress;
  varying float vProgress;
  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

export const ARC_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uDashCount;
  uniform float uSpeed;
  uniform float uOpacity;
  varying float vProgress;
  void main() {
    float dashPhase = fract(vProgress * uDashCount - uTime * uSpeed + uPhase);
    float dash = smoothstep(0.0, 0.08, dashPhase) * smoothstep(0.6, 0.5, dashPhase);
    float headPos = fract(uTime * uSpeed * 0.4 + uPhase);
    float head = 1.0 - smoothstep(0.0, 0.05, abs(vProgress - headPos));
    float alpha = clamp(dash * 1.15 + head, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }`

export const EXPLORE_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`

export const EXPLORE_FRAGMENT_SHADER = `
  uniform vec3 uLandColor;
  uniform vec3 uWaterColor;
  uniform vec3 uBorderColor;
  uniform float uNoiseScale;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = p * 2.0 + vec3(1.7, 9.2, 5.1);
      amplitude *= 0.5;
    }
    return value;
  }
  void main() {
    vec3 dir = normalize(vWorldPosition);
    float continent = fbm(dir * uNoiseScale);
    float landMask = smoothstep(0.47, 0.60, continent);
    vec3 surface = mix(uWaterColor, uLandColor, landMask);
    float coast = smoothstep(0.05, 0.18, landMask) * (1.0 - smoothstep(0.18, 0.35, landMask));
    surface = mix(surface, uBorderColor, coast * 0.65);
    float shade = 0.9 + 0.1 * dot(normalize(vNormal), normalize(vec3(0.3, 0.8, 0.5)));
    surface *= shade;
    gl_FragColor = vec4(surface, 1.0);
  }`

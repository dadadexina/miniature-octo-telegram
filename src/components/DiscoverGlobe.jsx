import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import ImageViewer from './ImageViewer'
import earthDayUrl from '../assets/earth/earth-day.jpg'
import earthNightUrl from '../assets/earth/earth-night.jpg'
import { PLACES, cityWeatherId, searchPlaces } from '../lib/places'
import { cloudPoints, cloudGridFrom, buildCloudCanvas } from '../lib/clouds'
import { fetchWeather } from '../lib/weather'
import {
  MAX_ALTITUDE_WORLD,
  MIN_ALTITUDE_WORLD,
  altitudeLabel,
  formatCoords,
  latLngFromUnit,
  parseCoords,
  tileBlock,
  tileToLat,
  tileToLng,
  tileZoomFor,
} from '../lib/tiles'
import { OSM_COPYRIGHT, OSM_COPYRIGHT_URL, buildTileCanvas, clearTileCache } from '../lib/mapTiles'
import { formatRelativeTime } from '../utils'

const RAD = Math.PI / 180
const R = 2
const PALETTE = [0x4fc3ff, 0x7cffb2, 0xffa94d, 0xff6b9d]
const ME_COLOR = 0xffd166
const MIN_DISTANCE = R + MIN_ALTITUDE_WORLD
const MAX_DISTANCE = R + MAX_ALTITUDE_WORLD
const MAP_DISTANCE = R + 0.06

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function hashString(value) {
  const text = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pointFor(id) {
  const hash = hashString(id)
  const u = (hash % 10000) / 10000
  const v = (Math.floor(hash / 10000) % 10000) / 10000
  return {
    lat: Math.asin(2 * v - 1) / RAD,
    lng: u * 360 - 180,
  }
}

function citySpread(id, lat, lng) {
  const hash = hashString(id)
  const angle = ((hash % 3600) / 3600) * Math.PI * 2
  const degrees = 0.006 + ((hash >>> 12) % 5) * 0.004
  return {
    lat: lat + Math.sin(angle) * degrees,
    lng: lng + (Math.cos(angle) * degrees) / Math.max(0.25, Math.cos(lat * RAD)),
  }
}

function toVec(lat, lng, radius = R) {
  const phi = (90 - lat) * RAD
  const theta = (lng + 180) * RAD
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

const ME_COORDS = { lat: 34.3416, lng: 108.9398 }

function sunPosition(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000)
  const declination = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60
  const lng = -15 * (hours - 12)
  return { declination, lng, dir: toVec(declination, lng, 1).normalize() }
}

function deviceClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function deviceDaylight(date = new Date()) {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? '白昼' : '夜晚'
}

function canUseWebGL() {
  try {
    if (typeof window.WebGLRenderingContext === 'undefined') return false
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.()
    const material = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose?.())
    else material?.dispose?.()
  })
}

function buildArc(aUnit, bUnit, radius) {
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

function buildMapPatchGeometry(block, radius, segments = 32) {
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

export default function DiscoverGlobe({
  people,
  links = [],
  meId,
  meName = '你',
  meCoords = null,
  routes = [],
  loading,
  error,
  emptyText,
  onReply,
}) {
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)
  const labelsRef = useRef(null)
  const coordsRef = useRef(null)
  const mapStatusRef = useRef(null)
  const labelElsRef = useRef(new Map())
  const threeRef = useRef(null)
  const meNameRef = useRef(meName)
  const meCoordsRef = useRef(meCoords)
  const centeredOnMeRef = useRef(false)
  const copyTimerRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpQuery, setJumpQuery] = useState('')
  const [jumpError, setJumpError] = useState('')
  const [copied, setCopied] = useState('')
  const [fallback, setFallback] = useState(() => !canUseWebGL())
  const [weather, setWeather] = useState({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    meNameRef.current = meName
  }, [meName])

  useEffect(
    () => () => {
      clearTimeout(copyTimerRef.current)
    },
    []
  )

  useEffect(() => {
    if (fallback) return undefined
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [fallback])

  useEffect(() => {
    if (fallback) return undefined
    let cancelled = false
    const points = PLACES.map((place) => ({ id: cityWeatherId(place), lat: place.lat, lng: place.lng }))
    const load = () => {
      fetchWeather(points).then((result) => {
        if (!cancelled && result.ok) setWeather((previous) => ({ ...previous, ...result.byId }))
      })
    }
    load()
    const timer = setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fallback])

  useEffect(() => {
    if (fallback) return undefined
    let cancelled = false
    const points = cloudPoints()
    const load = () => {
      fetchWeather(points).then((result) => {
        if (cancelled || !result.ok) return
        const canvas = buildCloudCanvas(cloudGridFrom(result.byId))
        if (canvas) threeRef.current?.setClouds(canvas)
      })
    }
    load()
    const timer = setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fallback])

  useEffect(() => {
    const labels = labelElsRef.current
    if (!labels.size) return
    PLACES.forEach((place) => {
      const item = labels.get(place.id)
      if (!item) return
      const info = weather[cityWeatherId(place)]
      const temp = typeof info?.temp === 'number' ? `${Math.round(info.temp)}°` : ''
      item.temp.textContent = temp
      item.el.title = info ? `${place.name} · ${info.label}${temp ? ` ${temp}` : ''}` : place.name
    })
  }, [weather])

  const routeByAuthor = useMemo(() => new Map(routes.map((route) => [route.authorId, route])), [routes])
  const selectedPerson = useMemo(() => {
    if (!selectedId) return null
    if (selectedId === meId) return { id: meId, name: meName }
    return people.find((person) => person.id === selectedId) || { id: selectedId, name: '朋友' }
  }, [selectedId, meId, meName, people])
  const selectedRoute = selectedId ? routeByAuthor.get(selectedId) : null

  const relationNames = useMemo(() => {
    if (!selectedId) return []
    const names = new Map([[meId, meName], ...people.map((person) => [person.id, person.name])])
    const ids = new Set()
    links.forEach(([a, b]) => {
      if (a === selectedId) ids.add(b)
      else if (b === selectedId) ids.add(a)
    })
    return [...ids].map((id) => names.get(id)).filter(Boolean)
  }, [selectedId, links, people, meId, meName])

  useEffect(() => {
    if (fallback) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const lowPower =
      navigator.connection?.saveData === true ||
      (navigator.hardwareConcurrency || 8) <= 4 ||
      (navigator.deviceMemory || 8) <= 4

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    const initialMe = meCoordsRef.current || ME_COORDS
    camera.position.copy(toVec(initialMe.lat, initialMe.lng, 10))

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lowPower,
        powerPreference: lowPower ? 'low-power' : 'high-performance',
      })
    } catch {
      setFallback(true)
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75))
    renderer.setClearColor(0x03070f, 1)
    renderer.domElement.className = 'block h-full w-full'
    container.appendChild(renderer.domElement)

    const reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.5
    controls.enablePan = false
    controls.enableZoom = false
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = MAX_DISTANCE
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.55

    scene.add(new THREE.AmbientLight(0x6fa8dc, 1.1))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
    keyLight.position.set(4, 2, 5)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0x2f7fc0, 1.2)
    rimLight.position.set(-5, -2, -4)
    scene.add(rimLight)

    const globe = new THREE.Group()
    scene.add(globe)

    const textureLoader = new THREE.TextureLoader()
    const dayMap = textureLoader.load(earthDayUrl)
    dayMap.colorSpace = THREE.SRGBColorSpace
    dayMap.wrapS = THREE.RepeatWrapping
    dayMap.anisotropy = Math.min(lowPower ? 2 : 4, renderer.capabilities.getMaxAnisotropy())
    const nightMap = textureLoader.load(earthNightUrl)
    nightMap.colorSpace = THREE.SRGBColorSpace
    nightMap.wrapS = THREE.RepeatWrapping
    nightMap.anisotropy = Math.min(lowPower ? 2 : 4, renderer.capabilities.getMaxAnisotropy())

    const sunVector = new THREE.Vector3(1, 0, 0)
    const globeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        sunDirection: { value: sunVector },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
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
        }`,
    })
    const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(R, lowPower ? 64 : 96, lowPower ? 44 : 64), globeMaterial)
    globe.add(globeMesh)

    const blankCloud = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
    blankCloud.needsUpdate = true
    const cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cloudMap: { value: blankCloud },
        sunDirection: { value: sunVector },
        fade: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D cloudMap;
        uniform vec3 sunDirection;
        uniform float fade;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          float alpha = texture2D(cloudMap, vUv).a;
          float lit = 0.2 + 0.8 * smoothstep(-0.14, 0.32, dot(normalize(vWorldNormal), normalize(sunDirection)));
          gl_FragColor = vec4(vec3(0.78, 0.88, 1.0), alpha * lit * 0.48 * fade);
        }`,
      transparent: true,
      depthWrite: false,
    })
    const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, lowPower ? 48 : 64, lowPower ? 36 : 48), cloudMaterial)
    globe.add(cloudShell)

    const updateSun = () => {
      sunVector.copy(sunPosition(new Date()).dir)
    }
    updateSun()
    const sunTimer = setInterval(updateSun, 60000)

    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x2a6fa8, transparent: true, opacity: 0.12 })
    const grid = new THREE.Group()
    for (let lat = -75; lat <= 75; lat += 15) {
      const points = []
      for (let lng = -180; lng <= 180; lng += 4) points.push(toVec(lat, lng, R * 1.001))
      grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
    }
    for (let lng = -180; lng < 180; lng += 15) {
      const points = []
      for (let lat = -90; lat <= 90; lat += 4) points.push(toVec(lat, lng, R * 1.001))
      grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
    }
    globe.add(grid)

    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x3fa9ff) },
        sunDirection: { value: sunVector },
        fade: { value: 1 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform vec3 sunDirection;
        uniform float fade;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          float i = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          float day = smoothstep(-0.4, 0.6, dot(normalize(vWorldNormal), normalize(sunDirection)));
          gl_FragColor = vec4(glowColor * (0.7 + 0.5 * day), 1.0) * clamp(i, 0.0, 1.0) * (0.6 + 0.4 * day) * fade;
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, lowPower ? 36 : 48, lowPower ? 24 : 32), glowMaterial)
    globe.add(atmosphere)

    const mapPatch = new THREE.Group()
    mapPatch.visible = false
    globe.add(mapPatch)

    const starGeometry = new THREE.BufferGeometry()
    const starCount = lowPower ? 800 : 1600
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i += 1) {
      const distance = 30 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPositions[i * 3] = distance * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = distance * Math.cos(phi)
      starPositions[i * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta)
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0x9ec8ff,
      size: 0.28,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
    scene.add(new THREE.Points(starGeometry, starMaterial))

    const network = new THREE.Group()
    globe.add(network)

    const state = {
      renderer,
      scene,
      camera,
      controls,
      network,
      nodes: new Map(),
      nodeList: [],
      meshList: [],
      edges: [],
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      hoveredId: null,
      selectedId: null,
      disposed: false,
      mapMode: false,
      patchMesh: null,
      patchKey: '',
      patchToken: 0,
      patchLoading: false,
      patchAt: 0,
      patchFailed: false,
      patchPartial: false,
      patchRetryAt: 0,
      worldFade: 1,
      mapFade: 0,
      flight: null,
    }

    state.cloudTexture = null
    state.setClouds = (canvas) => {
      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.needsUpdate = true
      cloudMaterial.uniforms.cloudMap.value = texture
      if (state.cloudTexture) state.cloudTexture.dispose()
      state.cloudTexture = texture
    }

    const altitudeOf = () => Math.max(camera.position.length() - R, MIN_ALTITUDE_WORLD)
    const setAltitude = (value) => {
      const altitude = THREE.MathUtils.clamp(value, MIN_ALTITUDE_WORLD, MAX_ALTITUDE_WORLD)
      const direction = camera.position.clone().normalize()
      camera.position.copy(direction.multiplyScalar(R + altitude))
    }
    state.zoomBy = (factor) => {
      controls.autoRotate = false
      state.flight = null
      setAltitude(altitudeOf() * factor)
    }
    state.resetView = () => {
      controls.autoRotate = false
      const point = latLngFromUnit(camera.position)
      state.flyTo(point.lat, point.lng, 8)
    }
    state.focusAt = (lat, lng, altitude = altitudeOf()) => {
      controls.autoRotate = false
      state.flight = null
      const direction = toVec(lat, lng, 1).normalize()
      camera.position.copy(direction.multiplyScalar(R + THREE.MathUtils.clamp(altitude, MIN_ALTITUDE_WORLD, MAX_ALTITUDE_WORLD)))
      controls.target.set(0, 0, 0)
      controls.update()
    }
    state.flyTo = (lat, lng, altitude = 0.0015) => {
      controls.autoRotate = false
      const endDir = toVec(lat, lng, 1).normalize()
      const endAlt = THREE.MathUtils.clamp(altitude, MIN_ALTITUDE_WORLD, MAX_ALTITUDE_WORLD)
      const startDir = camera.position.clone().normalize()
      const startAlt = altitudeOf()
      if (reducedMotion) {
        state.focusAt(lat, lng, endAlt)
        return
      }
      const angle = startDir.angleTo(endDir)
      const ratio = Math.abs(Math.log(endAlt / startAlt))
      state.flight = {
        start: performance.now(),
        duration: THREE.MathUtils.clamp(550 + angle * 420 + ratio * 70, 550, 1700),
        startDir,
        endDir,
        startAlt,
        endAlt,
      }
    }
    state.center = () => {
      const point = latLngFromUnit(camera.position)
      return { ...point, altitude: altitudeOf() }
    }

    state.labelItems = []
    const labelLayer = labelsRef.current
    if (labelLayer) {
      labelLayer.replaceChildren()
      labelElsRef.current = new Map()
      PLACES.forEach((place) => {
        const el = document.createElement('div')
        el.setAttribute('data-testid', 'globe-label')
        el.dataset.tier = String(place.tier)
        el.className =
          'pointer-events-none absolute left-0 top-0 flex items-baseline gap-1 whitespace-nowrap text-[10px] leading-none tracking-[0.04em] text-[#b8ddff] will-change-transform'
        el.style.textShadow = '0 1px 5px rgba(2, 8, 16, 0.92)'
        el.style.opacity = '0'
        el.style.visibility = 'hidden'
        el.style.transition = 'opacity 220ms ease'
        const dot = document.createElement('span')
        dot.className = 'h-[3px] w-[3px] shrink-0 rounded-full bg-[#7cffb2]'
        const name = document.createElement('span')
        name.textContent = place.name
        const temp = document.createElement('span')
        temp.className = 'text-[9px] text-[#6fb8e2]'
        el.append(dot, name, temp)
        labelLayer.appendChild(el)
        const item = {
          place,
          el,
          temp,
          unit: toVec(place.lat, place.lng, 1).normalize(),
          threshold: place.tier === 1 ? 14 : place.tier === 2 ? 11.5 : 9.2,
          width: place.name.length * 11 + 32,
          visible: false,
        }
        labelElsRef.current.set(place.id, item)
        state.labelItems.push(item)
      })
    }

    const clearNetwork = () => {
      network.children.slice().forEach((child) => {
        network.remove(child)
        disposeObject(child)
      })
      state.nodes = new Map()
      state.nodeList = []
      state.meshList = []
      state.edges = []
    }

    state.rebuild = (nextPeople, nextLinks, nextMeId) => {
      clearNetwork()
      const nodeGeometry = new THREE.SphereGeometry(0.034, 16, 16)

      const addNode = (id, name, isMe, coords = null) => {
        const { lat, lng } = coords || (isMe ? ME_COORDS : pointFor(id))
        const position = toVec(lat, lng, R * 1.02)
        const color = isMe ? ME_COLOR : PALETTE[hashString(id) % PALETTE.length]
        const material = new THREE.MeshBasicMaterial({ color, transparent: true })
        const mesh = new THREE.Mesh(nodeGeometry, material)
        mesh.position.copy(position)
        mesh.userData.nodeId = id
        network.add(mesh)
        const node = {
          id,
          name,
          mesh,
          material,
          isMe,
          baseScale: isMe ? 1.7 : 1,
        }
        state.nodes.set(id, node)
        state.nodeList.push(node)
        state.meshList.push(mesh)
      }

      addNode(nextMeId, meNameRef.current, true, meCoordsRef.current)
      nextPeople.forEach((person) => {
        if (person.id === nextMeId) return
        const shared =
          Number.isFinite(person.lat) && Number.isFinite(person.lng)
            ? citySpread(person.id, person.lat, person.lng)
            : null
        addNode(person.id, person.name, false, shared)
      })

      nextLinks.forEach(([a, b]) => {
        const from = state.nodes.get(a)
        const to = state.nodes.get(b)
        if (!from || !to) return
        const curve = buildArc(
          from.mesh.position.clone().normalize(),
          to.mesh.position.clone().normalize(),
          R * 1.002
        )
        const geometry = new THREE.TubeGeometry(curve, 64, 0.006, 6, false)
        const material = new THREE.MeshBasicMaterial({
          color: 0x3fa9ff,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        network.add(mesh)
        state.edges.push({ a, b, material })
      })

      state.applyHighlight(state.selectedId)
    }

    state.applyHighlight = (selected) => {
      const related = new Set()
      if (selected) {
        related.add(selected)
        state.edges.forEach((edge) => {
          if (edge.a === selected || edge.b === selected) {
            related.add(edge.a)
            related.add(edge.b)
          }
        })
      }
      state.nodeList.forEach((node) => {
        const isSelected = node.id === selected
        const isRelated = related.has(node.id)
        const active = !selected || isRelated
        const baseColor = node.isMe ? ME_COLOR : PALETTE[hashString(node.id) % PALETTE.length]
        node.material.color.setHex(isSelected ? 0xffd166 : isRelated ? 0x8fe6ff : baseColor)
        node.baseOpacity = active ? 1 : 0.15
        node.material.opacity = node.baseOpacity * state.worldFade
        node.baseScale = isSelected ? 2.2 : isRelated && selected ? 1.5 : node.isMe ? 1.7 : 1
      })
      state.edges.forEach((edge) => {
        const active = !selected || edge.a === selected || edge.b === selected
        edge.baseOpacity = active ? (selected ? 0.9 : 0.3) : 0.05
        edge.material.opacity = edge.baseOpacity * state.worldFade
        edge.material.color.setHex(active && selected ? 0x8fe6ff : 0x3fa9ff)
      })
    }

    state.setWorldFade = (fade) => {
      const value = Math.min(1, Math.max(0, fade))
      if (Math.abs(value - state.worldFade) < 0.004) return
      state.worldFade = value
      state.nodeList.forEach((node) => {
        node.material.opacity = node.baseOpacity * value
      })
      state.edges.forEach((edge) => {
        edge.material.opacity = edge.baseOpacity * value
      })
    }

    state.setSelected = (id) => {
      state.selectedId = id
      state.applyHighlight(id)
      controls.autoRotate = !reducedMotion && !id && !state.hoveredId
    }

    const pickNode = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect()
      state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      state.raycaster.setFromCamera(state.pointer, camera)
      const hit = state.raycaster.intersectObjects(state.meshList, false)[0]
      return hit?.object?.userData?.nodeId || null
    }

    let downPoint = null

    const onPointerDown = (event) => {
      state.flight = null
      downPoint = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event) => {
      if (!downPoint) return
      const moved = Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y)
      downPoint = null
      if (moved > 8) return
      const id = pickNode(event.clientX, event.clientY)
      if (!id && state.mapMode) {
        const rect = renderer.domElement.getBoundingClientRect()
        state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        state.raycaster.setFromCamera(state.pointer, camera)
        const hit = state.raycaster.intersectObject(globeMesh, false)[0]
        if (hit) {
          const point = latLngFromUnit(hit.point)
          state.flyTo(point.lat, point.lng, altitudeOf())
        }
      }
      setSelectedId(id)
    }

    const onPointerMove = (event) => {
      const id = pickNode(event.clientX, event.clientY)
      if (id !== state.hoveredId) {
        state.hoveredId = id
        controls.autoRotate = !reducedMotion && !id && !state.selectedId
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      }
      const tooltip = tooltipRef.current
      if (!tooltip) return
      if (id) {
        tooltip.textContent = state.nodes.get(id)?.name || ''
        tooltip.style.left = `${event.clientX}px`
        tooltip.style.top = `${event.clientY}px`
        tooltip.style.opacity = 1
      } else {
        tooltip.style.opacity = 0
      }
    }

    const onPointerLeave = () => {
      state.hoveredId = null
      controls.autoRotate = !reducedMotion && !state.selectedId
      renderer.domElement.style.cursor = 'grab'
      if (tooltipRef.current) tooltipRef.current.style.opacity = 0
    }

    const onWheel = (event) => {
      event.preventDefault()
      state.flight = null
      controls.autoRotate = false
      const delta = THREE.MathUtils.clamp(event.deltaY, -240, 240)
      setAltitude(altitudeOf() * Math.exp(delta * 0.0022))
    }

    const touchPoints = new Map()
    let pinch = null
    const onTouchDown = (event) => {
      if (event.pointerType !== 'touch') return
      state.flight = null
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPoints.size === 2) {
        const [first, second] = [...touchPoints.values()]
        pinch = {
          distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
          altitude: altitudeOf(),
        }
      }
    }
    const onTouchMove = (event) => {
      if (!touchPoints.has(event.pointerId)) return
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!pinch || touchPoints.size < 2) return
      const [first, second] = [...touchPoints.values()]
      const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y))
      setAltitude(pinch.altitude * (pinch.distance / distance))
    }
    const onTouchUp = (event) => {
      touchPoints.delete(event.pointerId)
      if (touchPoints.size < 2) pinch = null
    }
    const onDoubleClick = () => {
      controls.autoRotate = false
      state.flight = null
      setAltitude(8)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    renderer.domElement.addEventListener('pointerdown', onTouchDown)
    renderer.domElement.addEventListener('pointermove', onTouchMove)
    renderer.domElement.addEventListener('pointerup', onTouchUp)
    renderer.domElement.addEventListener('pointercancel', onTouchUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('dblclick', onDoubleClick)

    const resize = () => {
      const width = container.clientWidth || 1
      const height = container.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    threeRef.current = state
    state.setSelected(null)

    const projected = new THREE.Vector3()
    const updateLabels = () => {
      const items = state.labelItems
      if (!items.length) return
      if (state.mapMode) {
        items.forEach((item) => {
          if (!item.visible) return
          item.el.style.opacity = '0'
          item.el.style.visibility = 'hidden'
          item.visible = false
        })
        return
      }
      const width = renderer.domElement.clientWidth
      const height = renderer.domElement.clientHeight
      if (!width || !height) return
      const distance = camera.position.length()
      const altitude = Math.max(distance - R, MIN_ALTITUDE_WORLD)
      const labelFade = smoothstep(0.09, 0.13, altitude)
      const camDir = camera.position.clone().normalize()
      const placed = []
      camera.updateMatrixWorld()
      items.forEach((item) => {
        let visible = distance <= item.threshold && item.unit.dot(camDir) > 0.08
        let x = 0
        let y = 0
        if (visible) {
          projected.copy(item.unit).multiplyScalar(R * 1.014).project(camera)
          x = (projected.x * 0.5 + 0.5) * width
          y = (-projected.y * 0.5 + 0.5) * height
          if (projected.z < -1 || projected.z > 1 || x < 4 || x > width - 4 || y < 72 || y > height - 86) {
            visible = false
          }
        }
        if (visible) {
          const rect = { left: x + 5, top: y - 8, right: x + 5 + item.width, bottom: y + 8 }
          for (let index = 0; index < placed.length; index += 1) {
            const other = placed[index]
            if (rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top) {
              visible = false
              break
            }
          }
          if (visible) placed.push(rect)
        }
        if (visible) {
          const fade = Math.min(1, (item.threshold - distance) / 0.7)
          item.el.style.opacity = String(0.92 * fade * labelFade)
          item.el.style.visibility = 'visible'
          item.el.style.transform = `translate3d(${x + 5}px, ${y - 8}px, 0)`
          item.visible = true
        } else if (item.visible) {
          item.el.style.opacity = '0'
          item.el.style.visibility = 'hidden'
          item.visible = false
        }
      })
    }

    const disposePatch = () => {
      if (!state.patchMesh) return
      mapPatch.remove(state.patchMesh)
      state.patchMesh.geometry.dispose()
      state.patchMesh.material.map?.dispose()
      state.patchMesh.material.dispose()
      state.patchMesh = null
    }

    const installPatch = (block, key, altitude) => {
      const token = state.patchToken + 1
      state.patchToken = token
      state.patchLoading = true
      state.patchPartial = false
      state.patchAt = Date.now()
      buildTileCanvas(block.zoom, block.originX, block.originY, block.span)
        .then((canvas) => {
          if (state.disposed || token !== state.patchToken) return
          if (!canvas) {
            state.patchKey = key
            return
          }
          const texture = new THREE.CanvasTexture(canvas)
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(lowPower ? 2 : 4, renderer.capabilities.getMaxAnisotropy())
          const offset = Math.max(5e-7, altitude * 0.005)
          const geometry = buildMapPatchGeometry(block, R + offset, lowPower ? 24 : 32)
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
          })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.renderOrder = 10
          disposePatch()
          mapPatch.add(mesh)
          state.patchMesh = mesh
          state.patchKey = key
          state.patchFailed = false
          state.patchPartial = Boolean(canvas.partial)
          if (state.patchPartial) state.patchRetryAt = Date.now() + 4000
        })
        .catch(() => {
          if (token === state.patchToken) {
            state.patchKey = key
            state.patchFailed = true
            state.patchPartial = false
            state.patchRetryAt = Date.now() + 8000
          }
        })
        .finally(() => {
          if (token === state.patchToken) state.patchLoading = false
        })
    }

    const updateSurface = () => {
      const distance = camera.position.length()
      const altitude = Math.max(distance - R, MIN_ALTITUDE_WORLD)
      const point = latLngFromUnit(camera.position)
      const mapActive = distance < MAP_DISTANCE && Math.abs(point.lat) < 84
      let zoom = 0
      if (mapActive) {
        zoom = tileZoomFor({ altitudeWorld: altitude, lat: point.lat, fovDeg: camera.fov })
        const block = tileBlock(point.lat, point.lng, zoom)
        const key = `${zoom}:${block.originX}:${block.originY}`
        const retryDue = (state.patchFailed || state.patchPartial) && Date.now() > state.patchRetryAt
        if ((key !== state.patchKey || retryDue) && !state.patchLoading && Date.now() - state.patchAt > 220) {
          state.patchFailed = false
          installPatch(block, key, altitude)
        }
      }
      const mapFade = 1 - smoothstep(0.045, 0.06, altitude)
      const networkFade = smoothstep(0.06, 0.14, altitude)
      const cloudFade = smoothstep(0.06, 0.12, altitude)
      const atmosphereFade = smoothstep(0.3, 0.42, altitude)
      state.mapFade = mapFade
      state.mapMode = mapActive
      state.setWorldFade(networkFade)
      network.visible = networkFade > 0.01
      gridMaterial.opacity = 0.12 * smoothstep(0.04, 0.08, altitude)
      grid.visible = gridMaterial.opacity > 0.001
      cloudMaterial.uniforms.fade.value = cloudFade
      cloudShell.visible = cloudFade > 0.01
      glowMaterial.uniforms.fade.value = atmosphereFade
      atmosphere.visible = atmosphereFade > 0.01
      if (state.patchMesh) state.patchMesh.material.opacity = mapFade
      mapPatch.visible = mapActive && Boolean(state.patchMesh) && mapFade > 0.005
      const status = mapStatusRef.current
      if (status) {
        const pending = mapActive && (!state.patchMesh || state.patchLoading || state.patchFailed || state.patchPartial)
        const copy = state.patchFailed
          ? '街道图暂不可用，稍后自动重试'
          : state.patchPartial
            ? '正在补齐街道图…'
            : '正在取街道图…'
        status.style.opacity = pending ? '1' : '0'
        if (pending && status.textContent !== copy) status.textContent = copy
      }
      if (altitude < 2 && controls.autoRotate) controls.autoRotate = false
      if (coordsRef.current && Date.now() - (state.coordAt || 0) > 120) {
        state.coordAt = Date.now()
        const maxDetail = altitude <= MIN_ALTITUDE_WORLD * 1.5
        const digits = altitude < 0.02 ? 5 : 2
        const suffix = mapActive
          ? `海拔 ${altitudeLabel(altitude)} · 地图 z${zoom}${maxDetail ? ' · 最大细节' : ''}`
          : altitude < 1.2
            ? altitudeLabel(altitude)
            : ''
        coordsRef.current.textContent = suffix
          ? `${formatCoords(point.lat, point.lng, digits)} · ${suffix}`
          : formatCoords(point.lat, point.lng, digits)
      }
    }

    const applyFlight = (now) => {
      const flight = state.flight
      if (!flight) return
      const t = THREE.MathUtils.clamp((now - flight.start) / flight.duration, 0, 1)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const rotation = new THREE.Quaternion().setFromUnitVectors(flight.startDir, flight.endDir)
      const step = new THREE.Quaternion().slerp(rotation, eased)
      const direction = flight.startDir.clone().applyQuaternion(step).normalize()
      const altitude = Math.exp(
        Math.log(flight.startAlt) + (Math.log(flight.endAlt) - Math.log(flight.startAlt)) * eased
      )
      camera.position.copy(direction.multiplyScalar(R + altitude))
      if (t >= 1) state.flight = null
    }

    const clock = new THREE.Clock()
    let frame = 0
    let lastFrameAt = 0
    const animate = (timestamp = 0) => {
      if (state.disposed) return
      frame = requestAnimationFrame(animate)
      const now = timestamp || performance.now()
      if (lowPower && now - lastFrameAt < 34) return
      lastFrameAt = now
      const time = clock.getElapsedTime()
      state.nodeList.forEach((node) => {
        const hoverBoost = node.id === state.hoveredId && node.id !== state.selectedId ? 1.5 : 1
        const target = node.baseScale * hoverBoost * (1 + Math.sin(time * 1.8 + hashString(node.id)) * 0.08)
        const scale = THREE.MathUtils.lerp(node.mesh.scale.x, target, 0.14)
        node.mesh.scale.setScalar(scale)
      })
      applyFlight(now)
      controls.update()
      const distance = camera.position.length()
      const altitude = Math.max(distance - R, MIN_ALTITUDE_WORLD)
      const near = THREE.MathUtils.clamp(altitude * 0.2, 1e-6, 0.5)
      if (Math.abs(camera.near - near) / near > 0.15) {
        camera.near = near
        camera.updateProjectionMatrix()
      }
      controls.rotateSpeed = THREE.MathUtils.clamp(altitude * 0.066, 1e-6, 0.5)
      camera.updateMatrixWorld()
      updateSurface()
      if (now - (state.labelAt || 0) >= (lowPower ? 55 : 33)) {
        state.labelAt = now
        updateLabels()
      }
      renderer.render(scene, camera)
    }
    animate()

    const onContextLost = (event) => {
      event.preventDefault()
      setFallback(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    return () => {
      state.disposed = true
      cancelAnimationFrame(frame)
      clearInterval(sunTimer)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      renderer.domElement.removeEventListener('pointerdown', onTouchDown)
      renderer.domElement.removeEventListener('pointermove', onTouchMove)
      renderer.domElement.removeEventListener('pointerup', onTouchUp)
      renderer.domElement.removeEventListener('pointercancel', onTouchUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('dblclick', onDoubleClick)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      controls.dispose()
      state.patchToken += 1
      disposePatch()
      clearTileCache()
      state.cloudTexture?.dispose()
      dayMap.dispose()
      nightMap.dispose()
      blankCloud.dispose()
      disposeObject(scene)
      renderer.dispose()
      renderer.domElement.remove()
      threeRef.current = null
    }
  }, [fallback])

  useEffect(() => {
    meCoordsRef.current = meCoords
    if (fallback) return
    threeRef.current?.rebuild(people, links, meId)
  }, [fallback, people, links, meId, meCoords])

  useEffect(() => {
    if (fallback || !meCoords || centeredOnMeRef.current) return
    centeredOnMeRef.current = true
    threeRef.current?.focusAt(meCoords.lat, meCoords.lng, 10)
  }, [fallback, meCoords])

  useEffect(() => {
    threeRef.current?.setSelected(selectedId)
  }, [fallback, selectedId])

  const currentDate = new Date(now)

  const closeSheet = () => setSelectedId(null)
  const routeIndex = selectedRoute ? routes.findIndex((route) => route.id === selectedRoute.id) : -1
  const jumpCoords = useMemo(() => parseCoords(jumpQuery), [jumpQuery])
  const jumpMatches = useMemo(() => (jumpCoords ? [] : searchPlaces(jumpQuery)), [jumpCoords, jumpQuery])
  const goTo = (lat, lng) => {
    threeRef.current?.flyTo(lat, lng)
    setJumpOpen(false)
    setJumpQuery('')
    setJumpError('')
  }
  const submitJump = (event) => {
    event.preventDefault()
    if (jumpCoords) {
      goTo(jumpCoords.lat, jumpCoords.lng)
      return
    }
    const place = searchPlaces(jumpQuery, 1)[0]
    if (place) {
      goTo(place.lat, place.lng, 0.003)
      return
    }
    setJumpError(jumpQuery.trim() ? '没有找到这个地点，试试输入经纬度' : '输入城市名或经纬度')
  }
  const copyCoords = async () => {
    const center = threeRef.current?.center?.()
    if (!center) return
    const text = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
    const finish = (ok) => {
      setCopied(ok ? '已复制' : '复制失败')
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(''), 1800)
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text)
      finish(true)
    } catch {
      finish(false)
    }
  }
  const reply = () => {
    const peerId = selectedId
    closeSheet()
    onReply(peerId)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#03070f] text-[#dff1ff]">
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          data-testid="relationship-globe"
          aria-label="3D 地球关系网，可拖动旋转、缩放并点击节点"
          className={fallback ? 'hidden' : 'absolute inset-0'}
        />
        <div
          ref={labelsRef}
          data-testid="globe-labels"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        />
        <div
          ref={tooltipRef}
          data-testid="globe-tooltip"
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-[160%] rounded-md border border-[#5ab4ff]/45 bg-[#081628]/92 px-2.5 py-1.5 text-[13px] whitespace-nowrap text-[#cfe9ff] opacity-0 transition-opacity"
          style={{ left: 0, top: 0 }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
          <p className="text-[11px] tracking-[0.08em] text-[#7fc4f0]">
            {meName} 的地球 · 全球实时天气
          </p>
          <p data-testid="globe-weather" className="mt-1 text-[10px] tracking-[0.06em] text-[#3d6f96]">
            此刻 · 本地 {deviceClock(currentDate)} · {deviceDaylight(currentDate)} · 城市实时天气
          </p>
          <div className={`mt-1.5 flex items-center justify-center gap-2 ${fallback ? 'hidden' : ''}`}>
            <p
              ref={coordsRef}
              data-testid="globe-coords"
              className="text-[10px] tracking-[0.14em] text-[#6fb8e2] tabular-nums"
            >
              N 0.00° E 0.00°
            </p>
            <button
              type="button"
              data-testid="globe-copy-coords"
              className="pointer-events-auto border border-[#2a6fa8]/35 px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-[#5da6d4] active:bg-[#0a2138]"
              onClick={copyCoords}
            >
              {copied || '复制'}
            </button>
          </div>
        </div>

        <div
          data-testid="globe-crosshair"
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 ${fallback ? 'hidden' : ''}`}
        >
          <span className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 bg-[#7fc4f0]/55" />
          <span className="absolute left-1/2 top-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-[#7fc4f0]/55" />
          <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7cffb2]/85" />
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-24 z-20 text-center ${fallback ? 'hidden' : ''}`}
        >
          <p
            ref={mapStatusRef}
            data-testid="globe-map-status"
            className="inline-block border border-[#2a6fa8]/35 bg-[#04101f]/85 px-3 py-1 text-[10px] tracking-[0.12em] text-[#7fc4f0] opacity-0 transition-opacity duration-300"
          />
        </div>

        <div
          className={`absolute right-4 top-1/2 z-20 -translate-y-1/2 flex-col gap-1 ${fallback ? 'hidden' : 'flex'}`}
        >
          <button
            type="button"
            data-testid="globe-zoom-in"
            aria-label="放大"
            className="h-9 w-9 border border-[#2a6fa8]/40 bg-[#081628]/85 text-[17px] leading-none text-[#7fc4f0] backdrop-blur active:bg-[#0a2138]"
            onClick={() => threeRef.current?.zoomBy(0.55)}
          >
            +
          </button>
          <button
            type="button"
            data-testid="globe-zoom-out"
            aria-label="缩小"
            className="h-9 w-9 border border-[#2a6fa8]/40 bg-[#081628]/85 text-[17px] leading-none text-[#7fc4f0] backdrop-blur active:bg-[#0a2138]"
            onClick={() => threeRef.current?.zoomBy(1.8)}
          >
            -
          </button>
          <button
            type="button"
            data-testid="globe-jump"
            aria-label="按城市或经纬度跳转"
            className="h-9 w-9 border border-[#2a6fa8]/40 bg-[#081628]/85 text-[10px] leading-none tracking-[0.06em] text-[#7fc4f0] backdrop-blur active:bg-[#0a2138]"
            onClick={() => {
              setJumpOpen(true)
              setJumpError('')
            }}
          >
            跳转
          </button>
          <button
            type="button"
            data-testid="globe-reset-view"
            aria-label="回到全球"
            className="h-9 w-9 border border-[#2a6fa8]/40 bg-[#081628]/85 text-[10px] leading-none tracking-[0.06em] text-[#7fc4f0] backdrop-blur active:bg-[#0a2138]"
            onClick={() => threeRef.current?.resetView()}
          >
            全球
          </button>
        </div>

        {loading ? (
          <p
            data-testid="routes-loading"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] tracking-[0.14em] text-[#3d6f96]"
          >
            正在取信...
          </p>
        ) : null}
        {error ? (
          <p
            data-testid="routes-error"
            className="absolute inset-x-6 top-14 border border-[#ff6b9d]/30 bg-[#2a0b16]/80 px-3 py-2 text-center text-[12px] text-[#ffb3cb]"
          >
            {error}
          </p>
        ) : null}
        {!loading && !error && routes.length === 0 ? (
          <p
            data-testid="routes-empty"
            className="pointer-events-none absolute inset-x-8 bottom-20 text-center text-[12px] leading-6 text-[#3d6f96]"
          >
            {emptyText}
          </p>
        ) : null}

        {fallback ? (
          <div data-testid="globe-fallback" className="absolute inset-0 overflow-y-auto px-5 pt-10 pb-24">
            <p className="mb-4 text-center text-[11px] text-[#3d6f96]">当前环境不支持 3D，已切换为关系列表</p>
            {routes.length ? (
              routes.map((route, index) => (
                <button
                  key={route.id}
                  type="button"
                  data-testid="route-card"
                  className="flex w-full items-baseline gap-3 border-b border-[#12324f] px-1 py-3.5 text-left active:bg-[#0a2138]"
                  onClick={() => setSelectedId(route.authorId)}
                >
                  <span className="w-7 shrink-0 text-[11px] tracking-[0.12em] text-[#3d6f96]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] text-[#dff1ff]">{route.name}</span>
                      <span className="shrink-0 text-[11px] text-[#3d6f96]">
                        {formatRelativeTime(route.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-[#7fc4f0]">
                      {route.content ||
                        (route.imageUrl ? '寄来了一张照片' : route.imageCount ? `寄来 ${route.imageCount} 张图` : '寄来了一页信')}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="py-10 text-center text-[13px] text-[#3d6f96]">还没有人留下信</p>
            )}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-end justify-between px-5">
          <div className="min-w-0">
            <p className="text-[11px] leading-5 text-[#3d6f96]">
              拖动旋转 · 滚轮/双指放大至村镇
              <br />
              点击节点看关系 · 地图内点选居中 · 双击回全球
            </p>
            <a
              href={OSM_COPYRIGHT_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="globe-attribution"
              className="pointer-events-auto mt-1 inline-block text-[9px] tracking-[0.04em] text-[#2f5d7d] underline decoration-[#2f5d7d]/50 underline-offset-2 hover:text-[#7fc4f0]"
            >
              {OSM_COPYRIGHT}
            </a>
          </div>
          <button
            type="button"
            data-testid="routes-toggle"
            className="pointer-events-auto border border-[#2a6fa8]/40 bg-[#081628]/80 px-3 py-1.5 text-[11px] tracking-[0.1em] text-[#7fc4f0] backdrop-blur active:bg-[#0a2138]"
            onClick={() => setListOpen(true)}
          >
            本周航线 {routes.length} 页
          </button>
        </div>
      </div>

      {selectedPerson ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/70"
          data-testid="moment-backdrop"
          onClick={closeSheet}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-testid="moment-sheet"
            className="safe-bottom max-h-[80vh] w-full overflow-y-auto border-t border-[#2a6fa8]/70 bg-[#071a2e] px-5 pt-4 pb-6 text-[#dff1ff]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-baseline justify-between text-[10px] tracking-[0.18em] text-[#3d6f96]">
              <span>
                {selectedRoute && routeIndex >= 0 ? `第 ${String(routeIndex + 1).padStart(2, '0')} 页` : '关系'}
              </span>
              <button type="button" className="px-1 text-[12px] tracking-normal text-[#7fc4f0]" onClick={closeSheet}>
                收起
              </button>
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <h2 className="truncate text-[18px] font-medium tracking-[0.04em] text-white">{selectedPerson.name}</h2>
              {selectedRoute ? (
                <span className="shrink-0 text-[11px] text-[#3d6f96]">
                  {formatRelativeTime(selectedRoute.createdAt)}
                </span>
              ) : null}
            </div>
            {selectedPerson.place ? (
              <p data-testid="globe-person-place" className="mt-2 text-[12px] tracking-[0.04em] text-[#3d6f96]">
                {selectedPerson.place} · 城市级位置
              </p>
            ) : null}
            {selectedId === meId ? (
              <p className="mt-4 text-[13px] leading-6 text-[#7fc4f0]">
                这是你的坐标。本周航线都从这里出发。
              </p>
            ) : selectedRoute ? (
              <>
                {selectedRoute.content ? (
                  <p className="moment-text mt-5 text-[15px] leading-7 break-words whitespace-pre-wrap text-[#e8f6ff]">
                    {selectedRoute.content}
                  </p>
                ) : null}
                {selectedRoute.imageUrl ? (
                  <button
                    type="button"
                    data-testid="moment-sheet-image"
                    className="mt-4 block w-full cursor-zoom-in border border-[#12324f]"
                    onClick={() => setViewerUrl(selectedRoute.imageUrl)}
                  >
                    <img src={selectedRoute.imageUrl} alt="信笺图片" className="max-h-[320px] w-full object-cover" />
                  </button>
                ) : selectedRoute.imageCount ? (
                  <div className="mt-4 border border-[#12324f] bg-[#04101f] px-4 py-6 text-center text-[13px] text-[#7fc4f0]">
                    附 {selectedRoute.imageCount} 张图
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-[13px] leading-6 text-[#7fc4f0]">本周还没有留下信。</p>
            )}

            {relationNames.length ? (
              <div data-testid="moment-relations" className="mt-5 border-t border-[#12324f] pt-3">
                <p className="text-[10px] tracking-[0.18em] text-[#3d6f96]">
                  关系 {relationNames.length}
                </p>
                <p className="mt-1.5 text-[12px] leading-6 text-[#7fc4f0]">
                  {relationNames.slice(0, 6).join(' · ')}
                  {relationNames.length > 6 ? ` · 等 ${relationNames.length} 人` : ''}
                </p>
              </div>
            ) : null}

            {selectedId !== meId ? (
              <button
                type="button"
                data-testid="moment-reply"
                className="mt-6 h-11 w-full bg-[#4fc3ff] text-[15px] font-medium text-[#03101f] active:bg-[#8fe6ff]"
                onClick={reply}
              >
                回信
              </button>
            ) : null}
            <p className="mt-2 text-center text-[11px] text-[#3d6f96]">回信会进入你们的单聊</p>
          </div>
        </div>
      ) : null}

      {listOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/70"
          data-testid="routes-backdrop"
          onClick={() => setListOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-testid="routes-sheet"
            className="safe-bottom max-h-[76vh] w-full overflow-y-auto border-t border-[#2a6fa8]/70 bg-[#071a2e] px-5 pt-4 pb-6 text-[#dff1ff]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-baseline justify-between border-b border-[#12324f] pb-3">
              <h2 className="text-[10px] tracking-[0.22em] text-[#3d6f96]">本周航线</h2>
              <button type="button" className="text-[12px] text-[#7fc4f0]" onClick={() => setListOpen(false)}>
                收起
              </button>
            </div>
            {routes.length ? (
              routes.map((route, index) => (
                <button
                  key={route.id}
                  type="button"
                  data-testid="route-card"
                  className="flex w-full items-baseline gap-3 border-b border-[#12324f] px-1 py-3.5 text-left active:bg-[#0a2138]"
                  onClick={() => {
                    setListOpen(false)
                    setSelectedId(route.authorId)
                  }}
                >
                  <span className="w-7 shrink-0 text-[11px] tracking-[0.12em] text-[#3d6f96]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] text-[#dff1ff]">{route.name}</span>
                      <span className="shrink-0 text-[11px] text-[#3d6f96]">
                        {formatRelativeTime(route.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-[#7fc4f0]">
                      {route.content ||
                        (route.imageUrl ? '寄来了一张照片' : route.imageCount ? `寄来 ${route.imageCount} 张图` : '寄来了一页信')}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="py-10 text-center text-[13px] text-[#3d6f96]">{emptyText}</p>
            )}
          </div>
        </div>
      ) : null}

      {jumpOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/70"
          data-testid="jump-backdrop"
          onClick={() => setJumpOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-testid="jump-sheet"
            className="safe-bottom max-h-[78vh] w-full overflow-y-auto border-t border-[#2a6fa8]/70 bg-[#071a2e] px-5 pt-4 pb-6 text-[#dff1ff]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-baseline justify-between border-b border-[#12324f] pb-3">
              <h2 className="text-[10px] tracking-[0.22em] text-[#3d6f96]">跳转地点</h2>
              <button type="button" className="text-[12px] text-[#7fc4f0]" onClick={() => setJumpOpen(false)}>
                收起
              </button>
            </div>
            <form className="mt-4 flex gap-2" onSubmit={submitJump}>
              <input
                data-testid="jump-input"
                value={jumpQuery}
                onChange={(event) => {
                  setJumpQuery(event.target.value)
                  setJumpError('')
                }}
                placeholder="城市名，或 34.34,108.94"
                autoFocus
                className="h-10 min-w-0 flex-1 border border-[#2a6fa8]/45 bg-[#04101f] px-3 text-[14px] text-[#e8f6ff] outline-none placeholder:text-[#3d6f96] focus:border-[#4fc3ff]"
              />
              <button
                type="submit"
                data-testid="jump-submit"
                className="h-10 shrink-0 bg-[#4fc3ff] px-4 text-[13px] font-medium text-[#03101f] active:bg-[#8fe6ff]"
              >
                前往
              </button>
            </form>
            {jumpError ? (
              <p data-testid="jump-error" className="mt-2 text-[12px] text-[#ffb3cb]">
                {jumpError}
              </p>
            ) : null}
            {jumpCoords ? (
              <button
                type="button"
                data-testid="jump-coords"
                className="mt-3 flex w-full items-baseline justify-between border border-[#2a6fa8]/45 bg-[#04101f] px-3 py-2.5 text-left active:bg-[#0a2138]"
                onClick={() => goTo(jumpCoords.lat, jumpCoords.lng)}
              >
                <span className="text-[14px] text-[#e8f6ff]">前往这组坐标</span>
                <span className="text-[11px] text-[#7fc4f0] tabular-nums">
                  {jumpCoords.lat.toFixed(4)}, {jumpCoords.lng.toFixed(4)}
                </span>
              </button>
            ) : null}
            {jumpMatches.length ? (
              <div className="mt-3 border-t border-[#12324f] pt-2">
                {jumpMatches.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    data-testid="jump-result"
                    className="flex w-full items-baseline justify-between border-b border-[#12324f] px-1 py-3 text-left active:bg-[#0a2138]"
                    onClick={() => goTo(place.lat, place.lng, 0.003)}
                  >
                    <span className="text-[14px] text-[#dff1ff]">{place.name}</span>
                    <span className="text-[11px] text-[#3d6f96] tabular-nums">
                      {formatCoords(place.lat, place.lng)}
                    </span>
                  </button>
                ))}
              </div>
            ) : !jumpQuery.trim() ? (
              <div className="mt-3 border-t border-[#12324f] pt-2">
                <p className="pt-2 text-[10px] tracking-[0.16em] text-[#3d6f96]">常去城市</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PLACES.filter((place) => place.tier === 1).map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      data-testid="jump-result"
                      className="border border-[#2a6fa8]/35 px-2.5 py-1.5 text-[12px] text-[#9ed4f7] active:bg-[#0a2138]"
                      onClick={() => goTo(place.lat, place.lng, 0.003)}
                    >
                      {place.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-5 text-[11px] leading-5 text-[#3d6f96]">
              支持 49 个常驻城市，也可以直接输入任意经纬度。跳转后会落在街道图，可继续滚轮放大到村镇。
            </p>
          </div>
        </div>
      ) : null}

      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl('')} /> : null}
    </div>
  )
}

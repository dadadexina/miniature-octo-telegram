import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import ImageViewer from './ImageViewer'
import earthDayUrl from '../assets/earth/earth-day.jpg'
import earthNightUrl from '../assets/earth/earth-night.jpg'
import { PLACES, cityWeatherId } from '../lib/places'
import { cloudPoints, cloudGridFrom, buildCloudCanvas } from '../lib/clouds'
import { fetchWeather } from '../lib/weather'
import { formatRelativeTime } from '../utils'

const RAD = Math.PI / 180
const R = 2
const PALETTE = [0x4fc3ff, 0x7cffb2, 0xffa94d, 0xff6b9d]
const ME_COLOR = 0xffd166

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

function toVec(lat, lng, radius = R) {
  const phi = (90 - lat) * RAD
  const theta = (lng + 180) * RAD
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

const ME_COORDS = { lat: 34, lng: 108 }

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

export default function DiscoverGlobe({
  people,
  links = [],
  meId,
  meName = '你',
  routes = [],
  loading,
  error,
  emptyText,
  onReply,
}) {
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)
  const labelsRef = useRef(null)
  const labelElsRef = useRef(new Map())
  const threeRef = useRef(null)
  const meNameRef = useRef(meName)
  const [selectedId, setSelectedId] = useState(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [fallback] = useState(() => !canUseWebGL())
  const [weather, setWeather] = useState({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    meNameRef.current = meName
  }, [meName])

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

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    camera.position.set(0, 1.8, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x03070f, 1)
    renderer.domElement.className = 'block h-full w-full'
    container.appendChild(renderer.domElement)

    const reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.5
    controls.zoomSpeed = 0.8
    controls.enablePan = false
    controls.minDistance = 4.4
    controls.maxDistance = 16
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
    dayMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    const nightMap = textureLoader.load(earthNightUrl)
    nightMap.colorSpace = THREE.SRGBColorSpace
    nightMap.wrapS = THREE.RepeatWrapping
    nightMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())

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
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), globeMaterial))

    const blankCloud = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
    blankCloud.needsUpdate = true
    const cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cloudMap: { value: blankCloud },
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
        uniform sampler2D cloudMap;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          float alpha = texture2D(cloudMap, vUv).a;
          float lit = 0.2 + 0.8 * smoothstep(-0.14, 0.32, dot(normalize(vWorldNormal), normalize(sunDirection)));
          gl_FragColor = vec4(vec3(0.78, 0.88, 1.0), alpha * lit * 0.48);
        }`,
      transparent: true,
      depthWrite: false,
    })
    const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 48), cloudMaterial)
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
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          float i = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          float day = smoothstep(-0.4, 0.6, dot(normalize(vWorldNormal), normalize(sunDirection)));
          gl_FragColor = vec4(glowColor * (0.7 + 0.5 * day), 1.0) * clamp(i, 0.0, 1.0) * (0.6 + 0.4 * day);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 48, 32), glowMaterial))

    const starGeometry = new THREE.BufferGeometry()
    const starPositions = new Float32Array(1600 * 3)
    for (let i = 0; i < 1600; i += 1) {
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

      const addNode = (id, name, isMe) => {
        const { lat, lng } = isMe ? ME_COORDS : pointFor(id)
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

      addNode(nextMeId, meNameRef.current, true)
      nextPeople.forEach((person) => {
        if (person.id !== nextMeId) addNode(person.id, person.name, false)
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
        node.material.opacity = active ? 1 : 0.15
        node.baseScale = isSelected ? 2.2 : isRelated && selected ? 1.5 : node.isMe ? 1.7 : 1
      })
      state.edges.forEach((edge) => {
        const active = !selected || edge.a === selected || edge.b === selected
        edge.material.opacity = active ? (selected ? 0.9 : 0.3) : 0.05
        edge.material.color.setHex(active && selected ? 0x8fe6ff : 0x3fa9ff)
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
      downPoint = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event) => {
      if (!downPoint) return
      const moved = Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y)
      downPoint = null
      if (moved > 8) return
      const id = pickNode(event.clientX, event.clientY)
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

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)

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
      const width = renderer.domElement.clientWidth
      const height = renderer.domElement.clientHeight
      if (!width || !height) return
      const distance = camera.position.length()
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
          item.el.style.opacity = String(0.92 * fade)
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

    const clock = new THREE.Clock()
    let frame = 0
    const animate = () => {
      if (state.disposed) return
      frame = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      state.nodeList.forEach((node) => {
        const hoverBoost = node.id === state.hoveredId && node.id !== state.selectedId ? 1.5 : 1
        const target = node.baseScale * hoverBoost * (1 + Math.sin(time * 1.8 + hashString(node.id)) * 0.08)
        const scale = THREE.MathUtils.lerp(node.mesh.scale.x, target, 0.14)
        node.mesh.scale.setScalar(scale)
      })
      controls.update()
      camera.updateMatrixWorld()
      updateLabels()
      renderer.render(scene, camera)
    }
    animate()

    const onContextLost = (event) => {
      event.preventDefault()
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
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      controls.dispose()
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
    if (fallback) return
    threeRef.current?.rebuild(people, links, meId)
  }, [fallback, people, links, meId])

  useEffect(() => {
    threeRef.current?.setSelected(selectedId)
  }, [fallback, selectedId])

  const currentDate = new Date(now)

  const closeSheet = () => setSelectedId(null)
  const routeIndex = selectedRoute ? routes.findIndex((route) => route.id === selectedRoute.id) : -1
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
          <p className="text-[11px] leading-5 text-[#3d6f96]">
            拖动旋转 · 放大显示地名
            <br />
            点击节点查看关系
          </p>
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

      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl('')} /> : null}
    </div>
  )
}

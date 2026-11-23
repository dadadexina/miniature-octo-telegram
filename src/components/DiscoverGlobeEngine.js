import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import earthDayUrl from '../assets/earth/earth-day.jpg'
import earthNightUrl from '../assets/earth/earth-night.jpg'
import { PLACES } from '../lib/places'
import { createTileLayer } from '../lib/tileLayer'
import {
  MAX_ALTITUDE_WORLD,
  MIN_ALTITUDE_WORLD,
  altitudeLabel,
  formatCoords,
  latLngFromUnit,
  tileZoomFor,
} from '../lib/tiles'
import {
  ARC_FRAGMENT_SHADER,
  ARC_VERTEX_SHADER,
  CLOUD_FRAGMENT_SHADER,
  CLOUD_VERTEX_SHADER,
  EXPLORE_FRAGMENT_SHADER,
  EXPLORE_VERTEX_SHADER,
  GLOBE_FRAGMENT_SHADER,
  GLOBE_VERTEX_SHADER,
  GLOW_FRAGMENT_SHADER,
  GLOW_VERTEX_SHADER,
  MAP_DISTANCE,
  MAX_DISTANCE,
  ME_COLOR,
  ME_COORDS,
  MIN_DISTANCE,
  PALETTE,
  R,
  buildArc,
  buildArcFlowLine,
  citySpread,
  disposeObject,
  hashString,
  pointFor,
  smoothstep,
  sunPosition,
  toVec,
} from '../lib/globe'

export function createGlobeEngine({
  container,
  labelLayer,
  tooltip,
  coords,
  mapStatus,
  labelElsRef,
  meNameRef,
  meCoordsRef,
  onPick,
  onFallback,
}) {
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
    onFallback()
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2))
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
    vertexShader: GLOBE_VERTEX_SHADER,
    fragmentShader: GLOBE_FRAGMENT_SHADER,
  })
  const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(R, lowPower ? 64 : 96, lowPower ? 44 : 64), globeMaterial)
  globe.add(globeMesh)

  const exploreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uLandColor: { value: new THREE.Color(0xe8ecda) },
      uWaterColor: { value: new THREE.Color(0xaacbe8) },
      uBorderColor: { value: new THREE.Color(0x8fa3b8) },
      uNoiseScale: { value: 2.2 },
    },
    vertexShader: EXPLORE_VERTEX_SHADER,
    fragmentShader: EXPLORE_FRAGMENT_SHADER,
  })

  const blankCloud = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  blankCloud.needsUpdate = true
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: blankCloud },
      sunDirection: { value: sunVector },
      fade: { value: 1 },
    },
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
  const cloudShell = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.012, lowPower ? 48 : 64, lowPower ? 36 : 48),
    cloudMaterial
  )
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
    vertexShader: GLOW_VERTEX_SHADER,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.18, lowPower ? 36 : 48, lowPower ? 24 : 32),
    glowMaterial
  )
  globe.add(atmosphere)

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

  const arcTimeUniform = { value: 0 }

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
    worldFade: 1,
    flight: null,
    mode: 'satellite',
    rotateLocked: false,
  }

  const tileLayer = createTileLayer({
    globe,
    renderer,
    getSource: () => (state.mode === 'explore' ? 'osm' : 'esri'),
    lowPower,
  })

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
    state.rotateLocked = true
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
  state.setMode = (mode) => {
    const next = mode === 'explore' ? 'explore' : 'satellite'
    if (next === state.mode) return
    state.mode = next
    globeMesh.material = next === 'explore' ? exploreMaterial : globeMaterial
    tileLayer.clear()
  }

  state.labelItems = []
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

    nextLinks.forEach(([a, b], index) => {
      const from = state.nodes.get(a)
      const to = state.nodes.get(b)
      if (!from || !to) return
      const curve = buildArc(
        from.mesh.position.clone().normalize(),
        to.mesh.position.clone().normalize(),
        R * 1.002
      )
      const geometry = buildArcFlowLine(curve, 140)
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0x5fbcff) },
          uTime: arcTimeUniform,
          uPhase: { value: index / Math.max(1, nextLinks.length) },
          uDashCount: { value: 34 },
          uSpeed: { value: 0.85 },
          uOpacity: { value: 0 },
        },
        vertexShader: ARC_VERTEX_SHADER,
        fragmentShader: ARC_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
      })
      const line = new THREE.Line(geometry, material)
      network.add(line)
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
      edge.baseOpacity = active ? (selected ? 0.95 : 0.45) : 0.05
      edge.material.uniforms.uOpacity.value = edge.baseOpacity * state.worldFade
      edge.material.uniforms.uColor.value.setHex(active && selected ? 0xb0f0ff : 0x5fbcff)
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
      edge.material.uniforms.uOpacity.value = edge.baseOpacity * value
    })
  }

  state.setSelected = (id) => {
    state.selectedId = id
    state.applyHighlight(id)
    controls.autoRotate = !reducedMotion && !id && !state.hoveredId && !state.rotateLocked
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
    onPick(id)
  }

  const onPointerMove = (event) => {
    const id = pickNode(event.clientX, event.clientY)
    if (id !== state.hoveredId) {
      state.hoveredId = id
      controls.autoRotate = !reducedMotion && !id && !state.selectedId && !state.rotateLocked
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    }
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
    controls.autoRotate = !reducedMotion && !state.selectedId && !state.rotateLocked
    renderer.domElement.style.cursor = 'grab'
    if (tooltip) tooltip.style.opacity = 0
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
        projected.copy(item.unit).multiplyScalar(R).project(camera)
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
        item.el.style.opacity = String((state.mapMode ? 0.98 : 0.92) * fade)
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

  const updateSurface = () => {
    const distance = camera.position.length()
    const altitude = Math.max(distance - R, MIN_ALTITUDE_WORLD)
    const point = latLngFromUnit(camera.position)
    const isExplore = state.mode === 'explore'
    const patchDistance = isExplore ? MAP_DISTANCE : R + 0.12
    const mapActive = distance < patchDistance && Math.abs(point.lat) < 84
    const mapFade = isExplore
      ? 1 - smoothstep(0.045, 0.06, altitude)
      : 1 - smoothstep(0.06, 0.12, altitude)
    const networkFade = smoothstep(0.06, 0.14, altitude)
    const cloudFade = smoothstep(0.06, 0.12, altitude)
    const atmosphereFade = smoothstep(0.3, 0.42, altitude)
    tileLayer.setFade(mapFade)
    tileLayer.setVisible(mapActive && mapFade > 0.005)
    if (mapActive) tileLayer.update(camera)
    state.mapMode = mapActive
    state.setWorldFade(networkFade)
    network.visible = networkFade > 0.01
    gridMaterial.opacity = isExplore ? 0 : 0.12 * smoothstep(0.04, 0.08, altitude)
    grid.visible = gridMaterial.opacity > 0.001
    cloudMaterial.uniforms.fade.value = isExplore ? 0 : cloudFade
    cloudShell.visible = !isExplore && cloudFade > 0.01
    glowMaterial.uniforms.fade.value = atmosphereFade
    atmosphere.visible = atmosphereFade > 0.01
    if (mapStatus) {
      const tileStats = tileLayer.stats()
      const hasTiles = tileStats.count > 0
      const allFailed = hasTiles && tileStats.loaded === 0 && tileStats.failed > 0 && !tileStats.loading
      const partial = hasTiles && tileStats.loaded > 0 && (tileStats.loading || tileStats.failed > 0)
      const pending = mapActive && (!hasTiles || tileStats.loading || allFailed || partial)
      const copy = allFailed
        ? isExplore
          ? '街道图暂不可用，稍后自动重试'
          : '影像暂不可用，稍后自动重试'
        : partial
          ? isExplore
            ? '正在补齐街道图…'
            : '正在补齐影像…'
          : isExplore
            ? '正在取街道图…'
            : '正在取影像…'
      mapStatus.style.opacity = pending ? '1' : '0'
      if (pending && mapStatus.textContent !== copy) mapStatus.textContent = copy
    }
    if (altitude < 2 && controls.autoRotate) controls.autoRotate = false
    if (coords && Date.now() - (state.coordAt || 0) > 120) {
      state.coordAt = Date.now()
      const maxDetail = altitude <= MIN_ALTITUDE_WORLD * 1.5
      const digits = altitude < 0.02 ? 5 : 2
      const zoom = mapActive ? tileZoomFor({ altitudeWorld: altitude, lat: point.lat, fovDeg: camera.fov }) : 0
      const suffix = mapActive
        ? `海拔 ${altitudeLabel(altitude)} · 地图 z${zoom}${maxDetail ? ' · 最大细节' : ''}`
        : altitude < 1.2
          ? altitudeLabel(altitude)
          : ''
      coords.textContent = suffix
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
    arcTimeUniform.value = time
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
    onFallback()
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)

  return {
    setClouds: (canvas) => state.setClouds(canvas),
    rebuild: (people, links, meId) => state.rebuild(people, links, meId),
    setSelected: (id) => state.setSelected(id),
    zoomBy: (factor) => state.zoomBy(factor),
    resetView: () => state.resetView(),
    focusAt: (lat, lng, altitude) => state.focusAt(lat, lng, altitude),
    flyTo: (lat, lng, altitude) => state.flyTo(lat, lng, altitude),
    center: () => state.center(),
    setMode: (mode) => state.setMode(mode),
    dispose: () => {
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
      tileLayer.dispose()
      state.cloudTexture?.dispose()
      dayMap.dispose()
      nightMap.dispose()
      blankCloud.dispose()
      exploreMaterial.dispose()
      disposeObject(scene)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

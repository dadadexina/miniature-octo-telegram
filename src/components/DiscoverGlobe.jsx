import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCoords } from '../lib/tiles'
import { canUseWebGL, deviceClock, deviceDaylight, earthRotationDegrees } from '../lib/globe'
import {
  applyMapTheme,
  buildArcsGeoJSON,
  buildNodes,
  buildRouteLine,
  mapTheme,
} from '../lib/mapGlobe'
import { POI_CATEGORIES, applyPoiLayers } from '../lib/poi'
import {
  bearingDegrees,
  compassLabel,
  coordPlace,
  formatAccuracy,
  formatDistance,
  geolocationSupported,
  getCurrentLocation,
  haversineKm,
  locationPermissionState,
  parseLatLngQuery,
  walkMinutes,
  watchLocation,
} from '../lib/geo'
import { mergePlaceResults, searchPlacesOnline } from '../lib/geocode'
import { planRoute, routeModeLabel, straightRoute } from '../lib/routing'
import { fetchWeather } from '../lib/weather'
import WorldChat from './WorldChat'
import { searchPlaces } from '../lib/places'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

const DASH_PATTERNS = [
  [2, 2],
  [1.6, 2.4],
  [1.2, 2.8],
  [0.8, 3.2],
  [0.5, 3.5],
  [0.25, 3.75],
  [0.1, 3.9],
  [0.25, 3.75],
  [0.5, 3.5],
  [0.8, 3.2],
  [1.2, 2.8],
  [1.6, 2.4],
]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }
const ROUTE_COLOR = '#c0332b'
const ASKED_KEY = 'globe.geoAsked'

function themeIdOf() {
  return document.documentElement?.dataset?.theme || 'light'
}

function wrapLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function hasAskedLocation() {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

function markAskedLocation() {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    // 隐私模式下忽略
  }
}

function localPlaceResults(query) {
  return searchPlaces(query, 5).map((place) => ({
    id: `local:${place.id}`,
    name: place.name,
    detail: '常用城市',
    lat: place.lat,
    lng: place.lng,
    kind: 'city',
    source: 'local',
  }))
}

export default function DiscoverGlobe({
  people = [],
  links = [],
  meId,
  meName = '你',
  meCoords = null,
}) {
  const containerRef = useRef(null)
  const coordsRef = useRef(null)
  const copyTimerRef = useRef(null)
  const mapRef = useRef(null)
  const syncRef = useRef(null)
  const routeSyncRef = useRef(null)
  const destMarkersRef = useRef([])
  const latestCoordsRef = useRef('N 0.00° E 0.00°')
  const peopleRef = useRef(people)
  const linksRef = useRef(links)
  const meRef = useRef({ id: meId, name: meName, coords: meCoords })
  const myPosRef = useRef(null)
  const destinationRef = useRef(null)
  const routeRef = useRef(null)
  const navSeqRef = useRef(0)
  const navAbortRef = useRef(null)
  const poiCategoryRef = useRef('all')

  const [copied, setCopied] = useState('')
  const [fallback, setFallback] = useState(() => !canUseWebGL())
  const [now, setNow] = useState(() => Date.now())
  const [myPos, setMyPos] = useState(null)
  const [geoState, setGeoState] = useState('idle')
  const [geoError, setGeoError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState([])
  const [preview, setPreview] = useState(null)
  const [nav, setNav] = useState(null)
  const [searchHost, setSearchHost] = useState(null)
  const [viewCenter, setViewCenter] = useState(null)
  const [weather, setWeather] = useState({ status: 'idle', data: null, error: '' })
  const [worldChatOpen, setWorldChatOpen] = useState(false)
  const [poiCategory, setPoiCategory] = useState('all')

  const locate = useCallback(async () => {
    markAskedLocation()
    setGeoError('')
    if (!geolocationSupported()) {
      setGeoState('unsupported')
      setGeoError('当前设备不支持定位')
      return { ok: false, error: '当前设备不支持定位' }
    }
    setGeoState('loading')
    const res = await getCurrentLocation()
    if (res.ok) {
      setMyPos(res.location)
      setGeoState('granted')
      const map = mapRef.current
      if (map && !destinationRef.current) {
        try {
          map.easeTo({
            center: [res.location.lng, res.location.lat],
            zoom: Math.max(map.getZoom(), 14),
            duration: 900,
          })
        } catch {
          // 地图尚未就绪时忽略
        }
      }
    } else {
      setGeoState(res.code === 1 ? 'denied' : 'error')
      setGeoError(res.error)
    }
    return res
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(
    () => () => {
      clearTimeout(copyTimerRef.current)
      navAbortRef.current?.abort()
    },
    []
  )

  useEffect(() => {
    let alive = true
    const check = async () => {
      if (!geolocationSupported()) {
        if (alive) setGeoState('unsupported')
        return
      }
      const state = await locationPermissionState()
      if (!alive) return
      if (state === 'granted') {
        locate()
        return
      }
      if (state === 'denied') {
        setGeoState('denied')
        setGeoError('定位权限已关闭，可在浏览器设置中允许后重试')
        return
      }
      setGeoState(hasAskedLocation() ? 'idle' : 'prompt')
    }
    check()
    return () => {
      alive = false
    }
  }, [locate])

  useEffect(() => {
    if (geoState !== 'granted') return undefined
    return watchLocation(
      (location) => {
        setMyPos(location)
        setGeoError('')
      },
      (err) => {
        if (err.code === 1) {
          setGeoState('denied')
          setGeoError(err.error)
        } else {
          setGeoError(err.error)
        }
      }
    )
  }, [geoState])

  useEffect(() => {
    const coords = myPos || meCoords
    const text =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? formatCoords(coords.lat, coords.lng, myPos ? 6 : 4)
        : 'N 0.00° E 0.00°'
    latestCoordsRef.current = text
    if (coordsRef.current && !myPos) coordsRef.current.textContent = text
  }, [meCoords, myPos])

  useEffect(() => {
    peopleRef.current = people
    linksRef.current = links
    syncRef.current?.()
  }, [people, links])

  useEffect(() => {
    myPosRef.current = myPos
    destinationRef.current = nav?.place || preview || null
    meRef.current = { id: meId, name: meName, coords: myPos || meCoords }
    routeSyncRef.current?.()
    const map = mapRef.current
    if (!map) return
    syncRef.current?.()
    if (nav?.place || preview) return
    const coords = myPos || meCoords
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      try {
        map.easeTo({
          center: [coords.lng, coords.lat],
          zoom: Math.max(map.getZoom(), myPos ? 12 : 2.4),
          duration: 900,
        })
      } catch {
        // 地图尚未就绪时忽略
      }
    }
  }, [myPos, meCoords, meId, meName, nav?.place, preview])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const place = nav?.place
    if (place) {
      const route = nav?.route
      if (!route?.coordinates?.length) return
      let minLng = Infinity
      let minLat = Infinity
      let maxLng = -Infinity
      let maxLat = -Infinity
      for (const [lng, lat] of route.coordinates) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
      const from = myPosRef.current || meRef.current.coords
      try {
        if (from && haversineKm(from, place) < 0.03) {
          map.easeTo({ center: [place.lng, place.lat], zoom: 17, duration: 700 })
        } else {
          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            {
              padding: { top: 70, bottom: 230, left: 36, right: 36 },
              maxZoom: 16.5,
              duration: 700,
            }
          )
        }
      } catch {
        // 地图尚未就绪时忽略
      }
      return
    }
    if (preview) {
      try {
        map.easeTo({ center: [preview.lng, preview.lat], zoom: 15, duration: 1000 })
      } catch {
        // 地图尚未就绪时忽略
      }
    }
  }, [nav, preview])

  useEffect(() => {
    const text = searchText.trim()
    if (text.length < 2) {
      setResults([])
      setSearchError('')
      setSearching(false)
      return undefined
    }
    const coord = parseLatLngQuery(text)
    if (coord) {
      setResults([coordPlace(coord.lat, coord.lng)].filter(Boolean))
      setSearchError('')
      setSearching(false)
      return undefined
    }
    const controller = new AbortController()
    let alive = true
    setSearching(true)
    setSearchError('')
    const timer = setTimeout(async () => {
      let me = myPosRef.current || meRef.current.coords
      if (!me && mapRef.current) {
        try {
          const center = mapRef.current.getCenter()
          me = { lat: center.lat, lng: center.lng }
        } catch {
          me = null
        }
      }
      const local = localPlaceResults(text)
      const res = await searchPlacesOnline(text, {
        lat: me?.lat,
        lng: me?.lng,
        limit: 8,
        signal: controller.signal,
      })
      if (!alive) return
      if (res.ok) {
        setResults(mergePlaceResults(res.places, local))
        setSearchError('')
      } else if (!res.aborted) {
        setResults(local)
        setSearchError(local.length ? '在线地名暂不可用，已显示常用城市' : res.error)
      }
      setSearching(false)
    }, 350)
    return () => {
      alive = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchText])

  useEffect(() => {
    if (fallback) return undefined
    const container = containerRef.current
    if (!container) return undefined

    let cancelled = false
    let map = null
    let raf = 0
    let flowTimer = 0
    let flowIndex = 0
    let observer = null
    let resizeObserver = null
    let lastTs = 0
    let pauseUntil = 0
    let dragging = false
    let markers = []
    let searchSlot = null

    const clearMarkers = () => {
      markers.forEach((marker) => {
        try {
          marker.remove()
        } catch {
          // 忽略已移除的标记
        }
      })
      markers = []
    }

    const clearDestMarkers = () => {
      destMarkersRef.current.forEach((marker) => {
        try {
          marker.remove()
        } catch {
          // 忽略已移除的标记
        }
      })
      destMarkersRef.current = []
    }

    const boot = async () => {
      let mod
      try {
        const gl = await import('maplibre-gl')
        try {
          gl.setWorkerUrl?.(maplibreWorkerUrl)
        } catch {
          // 旧版本不支持自定义 worker 地址时沿用默认
        }
        mod = gl.default || gl
      } catch {
        if (!cancelled) setFallback(true)
        return
      }
      if (cancelled) return
      try {
        await import('maplibre-gl/dist/maplibre-gl.css')
      } catch {
        // 样式表加载失败不影响地图本身
      }
      if (cancelled) return

      const start = myPosRef.current || meRef.current.coords
      try {
        map = new mod.Map({
          container,
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [
            start && Number.isFinite(start.lng) ? start.lng : 108.9398,
            start && Number.isFinite(start.lat) ? start.lat : 34.3416,
          ],
          zoom: 1.7,
          attributionControl: { compact: true },
          dragRotate: false,
        })
      } catch {
        if (!cancelled) setFallback(true)
        return
      }
      mapRef.current = map

      try {
        map.addControl(new mod.NavigationControl({ showCompass: true, visualizePitch: false }), 'bottom-right')
      } catch {
        // 控件不可用时忽略
      }

      try {
        const controlHost = container.querySelector('.maplibregl-ctrl-bottom-right')
        const zoomGroup = controlHost?.querySelector('.maplibregl-ctrl-group')
        if (controlHost && zoomGroup) {
          searchSlot = document.createElement('div')
          searchSlot.className = 'maplibregl-ctrl maplibregl-ctrl-group'
          controlHost.insertBefore(searchSlot, zoomGroup)
          setSearchHost(searchSlot)
        }
      } catch {
        // 控件容器尚未就绪时使用默认位置
      }

      const syncViewCenter = () => {
        if (!map) return
        try {
          const center = map.getCenter()
          setViewCenter((prev) =>
            prev &&
            Math.abs(prev.lat - center.lat) < 0.002 &&
            Math.abs(prev.lng - center.lng) < 0.002
              ? prev
              : { lat: center.lat, lng: center.lng }
          )
        } catch {
          // 地图尚未就绪时忽略
        }
      }
      map.on('moveend', syncViewCenter)
      syncViewCenter()

      try {
        resizeObserver = new ResizeObserver(() => {
          try {
            map.resize()
          } catch {
            // 销毁过程中忽略
          }
        })
        resizeObserver.observe(container)
      } catch {
        // 无 ResizeObserver 时忽略
      }

      const sync = () => {
        if (!map) return
        const nodes = buildNodes(peopleRef.current, meRef.current)
        clearMarkers()
        for (const node of nodes) {
          const el = document.createElement('div')
          el.className = 'globe-node pointer-events-none flex select-none flex-col items-center gap-0.5'
          const dot = document.createElement('span')
          dot.className = node.me
            ? 'h-2 w-2 rounded-full bg-eink-ink ring-2 ring-eink-paper'
            : 'h-1.5 w-1.5 rounded-full bg-eink-sub ring-1 ring-eink-paper'
          const label = document.createElement('span')
          label.className = 'whitespace-nowrap text-[10px] leading-none tracking-[0.04em] text-eink-ink'
          label.textContent = node.name
          el.append(dot, label)
          try {
            markers.push(new mod.Marker({ element: el, anchor: 'center' }).setLngLat([node.lng, node.lat]).addTo(map))
          } catch {
            // 单个标记异常不影响其余
          }
        }
        try {
          const source = map.getSource('arcs')
          if (source && source.setData) source.setData(buildArcsGeoJSON(nodes, linksRef.current))
        } catch {
          // 数据源尚未建立时忽略
        }
        const coords = myPosRef.current
        if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
          const text = formatCoords(coords.lat, coords.lng, 6)
          latestCoordsRef.current = text
        }
      }
      syncRef.current = sync

      const syncRoute = () => {
        if (!map) return
        const to = destinationRef.current
        try {
          const source = map.getSource('route')
          if (source && source.setData) {
            source.setData(routeRef.current ? buildRouteLine(routeRef.current) : EMPTY_FC)
          }
        } catch {
          // 数据源尚未建立时忽略
        }
        clearDestMarkers()
        if (!to || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return
        const el = document.createElement('div')
        el.className = 'pointer-events-none flex select-none flex-col items-center gap-0.5'
        const dot = document.createElement('span')
        dot.style.width = '9px'
        dot.style.height = '9px'
        dot.style.borderRadius = '9999px'
        dot.style.background = ROUTE_COLOR
        dot.style.boxShadow = '0 0 0 2px #f4f3ee'
        const label = document.createElement('span')
        label.className = 'whitespace-nowrap text-[10px] leading-none tracking-[0.04em]'
        label.style.color = ROUTE_COLOR
        label.textContent = to.name || '目的地'
        el.append(dot, label)
        try {
          destMarkersRef.current.push(
            new mod.Marker({ element: el, anchor: 'center' }).setLngLat([to.lng, to.lat]).addTo(map)
          )
        } catch {
          // 标记失败时保留路径线
        }
      }
      routeSyncRef.current = syncRoute

      const applyArcTheme = () => {
        if (!map) return
        const theme = mapTheme(themeIdOf())
        try {
          map.setPaintProperty('arc-base', 'line-color', theme.arcBase)
          map.setPaintProperty('arc-flow', 'line-color', theme.arcActive)
        } catch {
          // 图层未就绪时忽略
        }
      }

      const startFlow = () => {
        clearInterval(flowTimer)
        flowTimer = setInterval(() => {
          if (!map || document.hidden) return
          if (!map.getLayer('arc-flow')) return
          flowIndex = (flowIndex + 1) % DASH_PATTERNS.length
          try {
            map.setPaintProperty('arc-flow', 'line-dasharray', DASH_PATTERNS[flowIndex])
          } catch {
            // 忽略瞬时错误
          }
        }, 130)
      }

      map.on('style.load', () => {
        if (cancelled || !map) return
        try {
          map.setProjection({ type: 'globe' })
        } catch {
          // 低版本无投影切换时忽略
        }
        try {
          map.resize()
        } catch {
          // 忽略尺寸同步异常
        }
        const theme = mapTheme(themeIdOf())
        applyMapTheme(map, themeIdOf())
        applyPoiLayers(map, poiCategoryRef.current, theme)
        if (!map.getSource('arcs')) {
          map.addSource('arcs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'arc-base',
            type: 'line',
            source: 'arcs',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': theme.arcBase, 'line-width': 1.1, 'line-opacity': 0.4 },
          })
          map.addLayer({
            id: 'arc-flow',
            type: 'line',
            source: 'arcs',
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': theme.arcActive,
              'line-width': 1.7,
              'line-opacity': 0.95,
              'line-dasharray': [2, 2],
            },
          })
        }
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: EMPTY_FC })
          const routeLayout = { 'line-cap': 'round', 'line-join': 'round' }
          const plannedFilter = (mode) => [
            'all',
            ['==', ['get', 'mode'], mode],
            ['!=', ['get', 'fallback'], true],
          ]
          map.addLayer({
            id: 'route-driving',
            type: 'line',
            source: 'route',
            filter: plannedFilter('driving'),
            layout: routeLayout,
            paint: {
              'line-color': ROUTE_COLOR,
              'line-width': 4.2,
              'line-opacity': 0.95,
            },
          })
          map.addLayer({
            id: 'route-walking',
            type: 'line',
            source: 'route',
            filter: plannedFilter('walking'),
            layout: routeLayout,
            paint: {
              'line-color': ROUTE_COLOR,
              'line-width': 3.2,
              'line-opacity': 0.95,
              'line-dasharray': [1.6, 1.3],
            },
          })
          map.addLayer({
            id: 'route-fallback',
            type: 'line',
            source: 'route',
            filter: ['==', ['get', 'fallback'], true],
            layout: routeLayout,
            paint: {
              'line-color': ROUTE_COLOR,
              'line-width': 2.4,
              'line-opacity': 0.55,
              'line-dasharray': [0.7, 1.2],
            },
          })
        }
        sync()
        syncRoute()
        startFlow()
      })

      map.on('move', () => {
        if (!map || myPosRef.current) return
        const center = map.getCenter()
        const text = formatCoords(center.lat, center.lng, 4)
        latestCoordsRef.current = text
        if (coordsRef.current) coordsRef.current.textContent = text
      })

      map.on('click', (event) => {
        if (!map) return
        const center = event.lngLat
        try {
          new mod.Popup({ closeButton: true, offset: 10, className: 'globe-popup' })
            .setLngLat(center)
            .setHTML(
              `<div style="font-variant-numeric:tabular-nums">${formatCoords(center.lat, center.lng, 4)}` +
                `<span style="opacity:.55"> · z${map.getZoom().toFixed(2)}</span></div>`
            )
            .addTo(map)
        } catch {
          // 弹窗失败时忽略
        }
      })

      const pause = () => {
        pauseUntil = performance.now() + 2600
      }
      ;['mousedown', 'touchstart', 'wheel', 'dragstart', 'zoomstart', 'rotatestart'].forEach((name) => map.on(name, pause))
      map.on('dragstart', () => {
        dragging = true
      })
      map.on('dragend', () => {
        dragging = false
        pause()
      })
      map.on('zoomstart', () => {
        dragging = true
      })
      map.on('zoomend', () => {
        dragging = false
        pause()
      })

      const tick = (ts) => {
        raf = requestAnimationFrame(tick)
        if (!map || document.hidden) {
          lastTs = ts
          return
        }
        const dt = lastTs ? Math.min(1000, ts - lastTs) : 0
        lastTs = ts
        if (dragging || ts < pauseUntil || dt <= 0) return
        if (myPosRef.current || destinationRef.current) return
        if (map.getZoom() > 6) return
        const center = map.getCenter()
        try {
          map.setCenter([wrapLng(center.lng + earthRotationDegrees(dt)), center.lat])
        } catch {
          // 相机被约束时忽略
        }
      }
      raf = requestAnimationFrame(tick)

      observer = new MutationObserver(() => {
        if (!map) return
        const theme = mapTheme(themeIdOf())
        applyMapTheme(map, themeIdOf())
        applyPoiLayers(map, poiCategoryRef.current, theme)
        applyArcTheme()
      })
      if (document.documentElement) {
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      }
    }

    boot()

    return () => {
      cancelled = true
      syncRef.current = null
      routeSyncRef.current = null
      if (observer) observer.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      clearInterval(flowTimer)
      clearMarkers()
      clearDestMarkers()
      if (searchSlot) {
        searchSlot.remove()
        setSearchHost((prev) => (prev === searchSlot ? null : prev))
        searchSlot = null
      }
      if (map) {
        try {
          map.remove()
        } catch {
          // 销毁异常忽略
        }
      }
      if (mapRef.current === map) mapRef.current = null
    }
  }, [fallback])

  const copyCoords = async () => {
    const text = latestCoordsRef.current
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopied('已复制')
    } catch {
      setCopied('复制失败')
    }
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(''), 1500)
  }

  const goToMyLocation = async () => {
    const map = mapRef.current
    const coords = myPosRef.current || meRef.current.coords
    if (coords) {
      try {
        map?.easeTo({ center: [coords.lng, coords.lat], zoom: 16, duration: 900 })
      } catch {
        // 地图尚未就绪时忽略
      }
      if (!myPosRef.current) locate()
      return
    }
    const res = await locate()
    if (!res?.ok) return
    try {
      mapRef.current?.easeTo({
        center: [res.location.lng, res.location.lat],
        zoom: 16,
        duration: 900,
      })
    } catch {
      // 地图尚未就绪时忽略
    }
  }

  const selectPlace = (place) => {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return
    navSeqRef.current += 1
    navAbortRef.current?.abort()
    navAbortRef.current = null
    routeRef.current = null
    setNav(null)
    setPreview(place)
    setSearchOpen(false)
    setSearchText('')
    setResults([])
    setSearchError('')
    if (!myPosRef.current) locate()
  }

  const startNav = useCallback(
    async (place, mode) => {
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return
      const from = myPosRef.current || meRef.current.coords
      setPreview(null)
      if (!from) {
        setNav({ place, mode, status: 'need-location', route: null })
        locate()
        return
      }
      navAbortRef.current?.abort()
      const seq = navSeqRef.current + 1
      navSeqRef.current = seq
      const controller = new AbortController()
      navAbortRef.current = controller
      routeRef.current = null
      routeSyncRef.current?.()
      setNav({ place, mode, status: 'loading', route: null })
      try {
        const route = await planRoute({ from, to: place, mode, signal: controller.signal })
        if (navSeqRef.current !== seq) return
        routeRef.current = route
        setNav({ place, mode, status: 'ready', route })
        routeSyncRef.current?.()
      } catch (err) {
        if (navSeqRef.current !== seq || err?.name === 'AbortError') return
        const fallback = straightRoute(from, place, mode)
        if (!fallback) {
          setNav({ place, mode, status: 'error', route: null })
          return
        }
        routeRef.current = { ...fallback, error: err?.message }
        setNav({ place, mode, status: 'ready', route: routeRef.current })
        routeSyncRef.current?.()
      }
    },
    [locate]
  )

  const endNav = useCallback(() => {
    navSeqRef.current += 1
    navAbortRef.current?.abort()
    navAbortRef.current = null
    routeRef.current = null
    destinationRef.current = null
    setNav(null)
    setPreview(null)
    routeSyncRef.current?.()
  }, [])

  const currentDate = new Date(now)
  const weatherSummary =
    weather.status === 'ready' && weather.data
      ? `${Math.round(weather.data.temperature)}° ${weather.data.label}${
          Number.isFinite(weather.data.high) && Number.isFinite(weather.data.low)
            ? ` · ${Math.round(weather.data.low)}~${Math.round(weather.data.high)}°`
            : ''
        } · 湿度 ${Math.round(weather.data.humidity)}%`
      : weather.status === 'error'
        ? '天气暂不可用'
        : '天气加载中'
  const searchIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
  const effectiveCoords = myPos || meCoords
  const geoMessage =
    geoState === 'denied' || geoState === 'error' || geoState === 'unsupported' ? geoError : ''
  const navPlace = nav?.place || null
  const navRoute = nav?.route || null
  const previewDistance =
    preview && effectiveCoords ? haversineKm(effectiveCoords, preview) : null
  const previewDriveMin =
    previewDistance === null ? null : Math.max(1, Math.round((previewDistance / 30) * 60))
  const previewWalkMin = previewDistance === null ? null : walkMinutes(previewDistance)
  const navDistanceKm = navPlace && effectiveCoords ? haversineKm(effectiveCoords, navPlace) : 0
  const navBearing =
    navPlace && effectiveCoords ? bearingDegrees(effectiveCoords, navPlace) : null
  const navHeading = navBearing === null ? '' : compassLabel(navBearing)
  const arrived = Boolean(navPlace && effectiveCoords && navDistanceKm < 0.03)
  const navModeLabel = nav ? routeModeLabel(nav.mode) : ''
  const navStatus = !nav
    ? ''
    : nav.status === 'loading'
      ? `正在规划${navModeLabel}路线...`
      : nav.status === 'need-location'
        ? geoState === 'loading'
          ? '正在获取我的位置...'
          : geoError || '需要先获取你的位置才能规划路线'
        : nav.status === 'error'
          ? '路线规划失败，请重试'
          : arrived
            ? '已到达目的地附近'
            : effectiveCoords && navRoute
              ? `距目的地 ${formatDistance(navDistanceKm)} · 全程 ${formatDistance(navRoute.distanceKm)} · 约 ${navRoute.durationMin} 分钟 · 向${navHeading}`
              : '未获取到我的位置'

  useEffect(() => {
    if (nav?.status === 'need-location' && effectiveCoords) {
      startNav(nav.place, nav.mode)
    }
  }, [effectiveCoords, nav, startNav])

  useEffect(() => {
    const center = viewCenter || myPos || meCoords
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
      return undefined
    }
    const controller = new AbortController()
    let alive = true
    setWeather((prev) => ({ ...prev, status: prev.data ? 'ready' : 'loading' }))
    const timer = setTimeout(async () => {
      try {
        const data = await fetchWeather({
          lat: center.lat,
          lng: center.lng,
          signal: controller.signal,
        })
        if (alive) setWeather({ status: 'ready', data, error: '' })
      } catch (err) {
        if (!alive || err?.name === 'AbortError') return
        setWeather({ status: 'error', data: null, error: err?.message || '天气暂不可用' })
      }
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [viewCenter?.lat, viewCenter?.lng, myPos?.lat, myPos?.lng, meCoords?.lat, meCoords?.lng])

  useEffect(() => {
    poiCategoryRef.current = poiCategory
    const map = mapRef.current
    if (!map) return
    applyPoiLayers(map, poiCategory, mapTheme(themeIdOf()))
  }, [poiCategory])

  return (
    <div className="relative h-full overflow-hidden bg-eink-paper text-eink-ink">
      <div
        ref={containerRef}
        data-testid="relationship-globe"
        aria-label="关系网地球，可拖动旋转、缩放并点击查看经纬度"
        className={`h-full w-full ${fallback ? 'hidden' : ''}`}
      />

      <button
        type="button"
        data-testid="globe-world-chat"
        aria-label="打开世界频道"
        className="absolute left-2 top-3 z-20 flex items-center gap-1 border border-eink-divider bg-eink-bar/95 px-2 py-1 text-[10px] tracking-[0.08em] text-eink-sub shadow-sm active:bg-eink-surface"
        onClick={() => setWorldChatOpen(true)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5h16v10H9l-5 4v-14Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        世界
      </button>

      {fallback ? (
        <div data-testid="globe-fallback" className="absolute inset-0 overflow-y-auto px-6 pt-24 pb-32">
          <p className="mb-4 text-center text-[11px] tracking-[0.06em] text-eink-faint">
            当前环境不支持地图渲染，已切换为关系列表
          </p>
          <ul className="mx-auto max-w-sm">
            {people.length ? (
              people.map((person, index) => (
                <li
                  key={person.id || index}
                  className="flex items-baseline gap-3 border-b border-eink-divider px-1 py-3"
                >
                  <span className="w-7 shrink-0 text-[11px] tracking-[0.12em] text-eink-faint">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-eink-ink">{person.name}</span>
                </li>
              ))
            ) : (
              <li className="py-10 text-center text-[13px] text-eink-faint">还没有连接的人</li>
            )}
          </ul>
        </div>
      ) : null}

      {!fallback ? (
        <div
          data-testid="globe-poi-filter"
          role="group"
          aria-label="兴趣点分类"
          className="absolute inset-x-2 top-12 z-20 flex gap-1 overflow-x-auto pb-0.5"
        >
          {POI_CATEGORIES.map((category) => {
            const active = poiCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                data-testid={`globe-poi-${category.id}`}
                aria-pressed={active}
                className={`shrink-0 border px-2 py-0.5 text-[10px] tracking-[0.06em] shadow-sm active:bg-eink-surface ${
                  active
                    ? 'border-eink-ink bg-eink-bar text-eink-ink'
                    : 'border-eink-line/30 bg-eink-bar/90 text-eink-sub'
                }`}
                onClick={() => setPoiCategory(category.id)}
              >
                {category.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {searchHost
        ? createPortal(
            <button
              type="button"
              data-testid="globe-search-toggle"
              aria-label="搜索地名、商户或经纬度"
              title="搜索地名、商户或经纬度"
              className="text-eink-ink active:bg-eink-surface"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setSearchOpen(true)}
            >
              {searchIcon}
            </button>,
            searchHost
          )
        : (
            <button
              type="button"
              data-testid="globe-search-toggle"
              aria-label="搜索地名、商户或经纬度"
              className="absolute bottom-24 right-14 z-30 flex h-8 w-8 items-center justify-center border border-eink-line/30 bg-eink-bar/95 text-eink-ink shadow-sm active:bg-eink-surface"
              onClick={() => setSearchOpen(true)}
            >
              {searchIcon}
            </button>
          )}

      {searchOpen ? (
        <div className="absolute inset-0 z-40">
          <button
            type="button"
            aria-label="关闭搜索"
            data-testid="globe-search-backdrop"
            className="absolute inset-0 bg-eink-ink/15"
            onClick={() => setSearchOpen(false)}
          />
          <div
            data-testid="globe-search-sheet"
            className="absolute inset-x-2 top-2 border border-eink-line/30 bg-eink-bar shadow-lg"
          >
            <div className="flex items-center gap-1.5 border-b border-eink-divider px-2 py-1.5">
              <input
                data-testid="globe-search-input"
                value={searchText}
                autoFocus
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索地名、商户或经纬度"
                aria-label="搜索地名、商户或经纬度"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-eink-ink outline-none placeholder:text-eink-faint"
              />
              {searchText ? (
                <button
                  type="button"
                  data-testid="globe-search-clear"
                  className="shrink-0 px-1 text-[11px] text-eink-faint"
                  onClick={() => setSearchText('')}
                >
                  清除
                </button>
              ) : null}
              <button
                type="button"
                data-testid="globe-search-close"
                className="shrink-0 border border-eink-line/40 px-2 py-0.5 text-[11px] text-eink-sub active:bg-eink-surface"
                onClick={() => setSearchOpen(false)}
              >
                关闭
              </button>
            </div>

            <div data-testid="globe-search-panel" className="max-h-[52vh] overflow-y-auto">
              {searchText.trim().length < 2 ? (
                <p className="px-3 py-2 text-[11px] text-eink-faint">
                  输入地名或商户，也可直接输入经纬度，例如 31.2304, 121.4737
                </p>
              ) : null}
              {searching ? (
                <p className="px-3 py-2 text-[12px] text-eink-faint">搜索中...</p>
              ) : null}
              {searchError ? (
                <p className="px-3 py-2 text-[11px] text-eink-faint">{searchError}</p>
              ) : null}
              {!searching && !searchError && !results.length && searchText.trim().length >= 2 ? (
                <p className="px-3 py-2 text-[12px] text-eink-faint">没有找到匹配地点</p>
              ) : null}
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  data-testid="globe-place-result"
                  onClick={() => selectPlace(place)}
                  className="flex w-full items-center gap-2 border-b border-eink-divider px-3 py-2 text-left active:bg-eink-surface"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-eink-ink">{place.name}</span>
                    {place.detail ? (
                      <span className="block truncate text-[10px] text-eink-faint">{place.detail}</span>
                    ) : null}
                  </span>
                  <span
                    data-testid="globe-go-here"
                    className="shrink-0 border border-eink-line/40 px-2 py-0.5 text-[10px] text-eink-sub"
                  >
                    查看
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center">
        <p className="text-[10px] tracking-[0.08em] text-eink-sub">{meName} 的地球 · 全球实时天气</p>
        <p data-testid="globe-weather" className="mt-0.5 text-[10px] tracking-[0.06em] text-eink-faint">
          此刻 · 本地 {deviceClock(currentDate)} · {deviceDaylight(currentDate)} · {weatherSummary}
        </p>
      </div>

      {geoState === 'prompt' ? (
        <div
          data-testid="globe-locate-prompt"
          className="absolute inset-x-2 bottom-48 z-20 border border-eink-line/30 bg-eink-bar px-3 py-2 text-[11px] shadow-sm"
        >
          <p className="text-eink-sub">开启定位，获取你的精准经纬度，用于从当前位置导航。</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              data-testid="globe-locate-allow"
              className="border border-eink-line px-2 py-1 text-eink-ink active:bg-eink-surface"
              onClick={() => locate()}
            >
              允许定位
            </button>
            <button
              type="button"
              className="px-2 py-1 text-eink-faint"
              onClick={() => {
                markAskedLocation()
                setGeoState('idle')
              }}
            >
              稍后
            </button>
          </div>
        </div>
      ) : null}

      {preview && !nav ? (
        <div
          data-testid="globe-place-preview"
          className="absolute bottom-36 left-2 right-14 z-20 border border-eink-line/30 bg-eink-bar/95 px-3 py-2 text-[11px] shadow-sm"
        >
          <p className="min-w-0 truncate text-eink-ink">目的地 {preview.name}</p>
          {preview.detail ? (
            <p className="mt-0.5 truncate text-[10px] text-eink-faint">{preview.detail}</p>
          ) : null}
          <p data-testid="globe-preview-estimate" className="mt-0.5 text-[10px] text-eink-sub tabular-nums">
            {previewDistance === null
              ? '选择出行方式后开始规划路线'
              : `距你 ${formatDistance(previewDistance)} · 开车约 ${previewDriveMin} 分钟 · 步行约 ${previewWalkMin} 分钟`}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              data-testid="globe-route-drive"
              className="border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
              onClick={() => startNav(preview, 'driving')}
            >
              开车导航
            </button>
            <button
              type="button"
              data-testid="globe-route-walk"
              className="border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
              onClick={() => startNav(preview, 'walking')}
            >
              步行导航
            </button>
            <button
              type="button"
              data-testid="globe-preview-close"
              className="ml-auto border border-eink-line/40 px-2 py-0.5 text-eink-faint active:bg-eink-surface"
              onClick={() => setPreview(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {nav ? (
        <div
          data-testid="globe-route-info"
          className="absolute bottom-36 left-2 right-14 z-20 border border-eink-line/30 bg-eink-bar/95 px-3 py-2 text-[11px] shadow-sm"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p data-testid="globe-route-title" className="min-w-0 truncate text-eink-ink">
              {nav.status === 'loading' || nav.status === 'need-location'
                ? `正在规划${navModeLabel}路线`
                : `${navModeLabel}导航 · ${nav.place.name}`}
            </p>
            <span
              data-testid="globe-route-mode"
              className="shrink-0 text-[9px] tracking-[0.08em] text-eink-faint"
            >
              {nav.status === 'loading' || nav.status === 'need-location'
                ? '规划中'
                : arrived
                  ? '已到达'
                  : '导航中'}
            </span>
          </div>
          <p data-testid="globe-route-status" className="mt-0.5 text-[10px] text-eink-sub tabular-nums">
            {navStatus}
          </p>
          {nav.status === 'ready' && navRoute?.fallback ? (
            <p data-testid="globe-route-fallback" className="mt-0.5 text-[10px] text-eink-faint">
              路线服务暂不可用，当前以直线距离示意
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="globe-mode-drive"
              aria-pressed={nav.mode === 'driving'}
              className={`border px-2 py-0.5 active:bg-eink-surface ${
                nav.mode === 'driving'
                  ? 'border-eink-ink text-eink-ink'
                  : 'border-eink-line/40 text-eink-sub'
              }`}
              onClick={() => startNav(nav.place, 'driving')}
            >
              开车
            </button>
            <button
              type="button"
              data-testid="globe-mode-walk"
              aria-pressed={nav.mode === 'walking'}
              className={`border px-2 py-0.5 active:bg-eink-surface ${
                nav.mode === 'walking'
                  ? 'border-eink-ink text-eink-ink'
                  : 'border-eink-line/40 text-eink-sub'
              }`}
              onClick={() => startNav(nav.place, 'walking')}
            >
              步行
            </button>
            {!effectiveCoords ? (
              <button
                type="button"
                data-testid="globe-route-locate"
                className="border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
                onClick={() => locate()}
              >
                重试定位
              </button>
            ) : null}
            <button
              type="button"
              data-testid="globe-route-clear"
              className="ml-auto border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
              onClick={endNav}
            >
              结束导航
            </button>
          </div>
        </div>
      ) : null}

      {worldChatOpen ? <WorldChat onClose={() => setWorldChatOpen(false)} /> : null}

      <div className="absolute bottom-20 left-2 z-20 max-w-[70%] border border-eink-divider bg-eink-bar/95 px-2 py-1.5 text-[10px] shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="globe-my-location"
            aria-label="我的位置，点击放大到当前位置"
            title="回到我的位置"
            className="flex items-center gap-1 tracking-[0.08em] text-eink-faint active:text-eink-ink"
            onClick={goToMyLocation}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            我的位置
          </button>
          <button
            type="button"
            data-testid="globe-copy-coords"
            className="border border-eink-line/40 px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-eink-sub active:bg-eink-surface"
            onClick={copyCoords}
          >
            {copied || '复制'}
          </button>
        </div>
        <p data-testid="globe-coords" className="mt-0.5 text-eink-sub tabular-nums">
          {myPos ? (
            <>
              {formatCoords(myPos.lat, myPos.lng, 6)}
              <span className="ml-1 text-eink-faint">{formatAccuracy(myPos.accuracy) || '精度未知'}</span>
            </>
          ) : (
            <span ref={coordsRef}>N 0.00° E 0.00°</span>
          )}
        </p>
        {geoMessage ? (
          <p data-testid="globe-geo-error" className="mt-0.5 text-eink-faint">
            {geoMessage}
          </p>
        ) : null}
        {geoState === 'granted' && myPos ? (
          <p data-testid="globe-geo-status" className="mt-0.5 text-eink-faint">
            已按当前定位显示，可直接搜索目的地
          </p>
        ) : null}
      </div>
    </div>
  )
}

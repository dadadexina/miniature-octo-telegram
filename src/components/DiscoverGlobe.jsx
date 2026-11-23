import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCoords } from '../lib/tiles'
import { canUseWebGL, deviceClock, deviceDaylight } from '../lib/globe'
import {
  applyMapTheme,
  buildArcsGeoJSON,
  buildNodes,
  buildRouteGeoJSON,
  mapTheme,
} from '../lib/mapGlobe'
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
  navigationUrl,
  parseLatLngQuery,
  walkMinutes,
  watchLocation,
} from '../lib/geo'
import { mergePlaceResults, searchPlacesOnline } from '../lib/geocode'
import { searchPlaces } from '../lib/places'

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
  const [destination, setDestination] = useState(null)

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
    destinationRef.current = destination
    meRef.current = { id: meId, name: meName, coords: myPos || meCoords }
    routeSyncRef.current?.()
    const map = mapRef.current
    if (!map) return
    syncRef.current?.()
    if (destination) return
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
  }, [myPos, meCoords, meId, meName, destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !destination) return
    const from = myPosRef.current || meRef.current.coords
    try {
      if (from && Number.isFinite(from.lat) && Number.isFinite(from.lng)) {
        const km = haversineKm(from, destination)
        if (km < 0.03) {
          map.easeTo({ center: [destination.lng, destination.lat], zoom: 17, duration: 700 })
        } else {
          map.fitBounds(
            [
              [Math.min(from.lng, destination.lng), Math.min(from.lat, destination.lat)],
              [Math.max(from.lng, destination.lng), Math.max(from.lat, destination.lat)],
            ],
            {
              padding: { top: 70, bottom: 210, left: 40, right: 40 },
              maxZoom: 16.5,
              duration: 700,
            }
          )
        }
      } else {
        map.easeTo({ center: [destination.lng, destination.lat], zoom: 15, duration: 1000 })
      }
    } catch {
      // 地图尚未就绪时忽略
    }
  }, [destination, myPos])

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
      const me = myPosRef.current || meRef.current.coords
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
        const from = myPosRef.current || meRef.current.coords
        const to = destinationRef.current
        try {
          const source = map.getSource('route')
          if (source && source.setData) source.setData(buildRouteGeoJSON(from, to))
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
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ROUTE_COLOR,
              'line-width': 2.4,
              'line-opacity': 0.95,
              'line-dasharray': [2, 1.5],
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
        const dt = lastTs ? Math.min(64, ts - lastTs) : 0
        lastTs = ts
        if (dragging || ts < pauseUntil || dt <= 0) return
        if (myPosRef.current || destinationRef.current) return
        const center = map.getCenter()
        try {
          map.setCenter([wrapLng(center.lng + dt * 0.0022), center.lat])
        } catch {
          // 相机被约束时忽略
        }
      }
      raf = requestAnimationFrame(tick)

      observer = new MutationObserver(() => {
        if (!map) return
        applyMapTheme(map, themeIdOf())
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

  const goHere = (place) => {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return
    setDestination(place)
    setSearchOpen(false)
    setSearchText('')
    setResults([])
    setSearchError('')
    if (!myPosRef.current) locate()
  }

  const currentDate = new Date(now)
  const effectiveCoords = myPos || meCoords
  const distanceKm = destination ? haversineKm(effectiveCoords, destination) : 0
  const geoMessage =
    geoState === 'denied' || geoState === 'error' || geoState === 'unsupported' ? geoError : ''
  const bearing =
    destination && effectiveCoords ? bearingDegrees(effectiveCoords, destination) : null
  const heading = bearing === null ? '' : compassLabel(bearing)
  const walkMin = destination ? walkMinutes(distanceKm) : 0
  const arrived = Boolean(destination && effectiveCoords && distanceKm < 0.03)
  const routeStatus = effectiveCoords
    ? arrived
      ? '已到达目的地附近'
      : `距目的地 ${formatDistance(distanceKm)} · 步行约 ${walkMin} 分钟 · 向${heading}`
    : geoState === 'loading'
      ? '正在获取我的位置...'
      : geoError || '未获取到我的位置'
  const mapsHref = destination ? navigationUrl(destination) : ''

  return (
    <div className="relative h-full overflow-hidden bg-eink-paper text-eink-ink">
      <div
        ref={containerRef}
        data-testid="relationship-globe"
        aria-label="关系网地球，可拖动旋转、缩放并点击查看经纬度"
        className={`h-full w-full ${fallback ? 'hidden' : ''}`}
      />

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

      <button
        type="button"
        data-testid="globe-search-toggle"
        aria-label="搜索地名、商户或经纬度"
        className="absolute bottom-24 right-14 z-30 flex h-8 w-8 items-center justify-center border border-eink-line/30 bg-eink-bar/95 text-eink-ink shadow-sm active:bg-eink-surface"
        onClick={() => setSearchOpen(true)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

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
                  onClick={() => goHere(place)}
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
                    去这里
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
          此刻 · 本地 {deviceClock(currentDate)} · {deviceDaylight(currentDate)} · 城市实时天气
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

      {destination ? (
        <div
          data-testid="globe-route-info"
          className="absolute bottom-36 left-2 right-14 z-20 border border-eink-line/30 bg-eink-bar/95 px-3 py-2 text-[11px] shadow-sm"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-eink-ink">导航前往 {destination.name}</p>
            <span className="shrink-0 text-[9px] tracking-[0.08em] text-eink-faint">
              {arrived ? '已到达' : '导航中'}
            </span>
          </div>
          <p data-testid="globe-route-status" className="mt-0.5 text-[10px] text-eink-sub tabular-nums">
            {routeStatus}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
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
            {mapsHref ? (
              <a
                data-testid="globe-open-maps"
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
              >
                系统地图
              </a>
            ) : null}
            <button
              type="button"
              data-testid="globe-route-clear"
              className="ml-auto border border-eink-line/40 px-2 py-0.5 text-eink-sub active:bg-eink-surface"
              onClick={() => setDestination(null)}
            >
              结束导航
            </button>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-20 left-2 z-20 max-w-[70%] border border-eink-divider bg-eink-bar/95 px-2 py-1.5 text-[10px] shadow-sm">
        <div className="flex items-center gap-2">
          <span className="tracking-[0.08em] text-eink-faint">我的位置</span>
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

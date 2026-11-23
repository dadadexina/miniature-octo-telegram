import { useEffect, useRef, useState } from 'react'
import { formatCoords } from '../lib/tiles'
import { canUseWebGL, deviceClock, deviceDaylight } from '../lib/globe'
import { applyMapTheme, buildArcsGeoJSON, buildNodes, mapTheme } from '../lib/mapGlobe'

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

function themeIdOf() {
  return document.documentElement?.dataset?.theme || 'light'
}

function wrapLng(lng) {
  return (((lng + 180) % 360) + 360) % 360 - 180
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
  const latestCoordsRef = useRef('N 0.00° E 0.00°')
  const peopleRef = useRef(people)
  const linksRef = useRef(links)
  const meRef = useRef({ id: meId, name: meName, coords: meCoords })

  const [copied, setCopied] = useState('')
  const [fallback, setFallback] = useState(() => !canUseWebGL())
  const [now, setNow] = useState(() => Date.now())

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
    const coords = meRef.current.coords
    const text =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? formatCoords(coords.lat, coords.lng, 4)
        : 'N 0.00° E 0.00°'
    latestCoordsRef.current = text
    if (coordsRef.current) coordsRef.current.textContent = text
  }, [meCoords])

  useEffect(() => {
    peopleRef.current = people
    linksRef.current = links
    syncRef.current?.()
  }, [people, links])

  useEffect(() => {
    meRef.current = { id: meId, name: meName, coords: meCoords }
    const map = mapRef.current
    if (!map) return
    syncRef.current?.()
    if (meCoords && Number.isFinite(meCoords.lat) && Number.isFinite(meCoords.lng)) {
      try {
        map.easeTo({
          center: [meCoords.lng, meCoords.lat],
          zoom: Math.max(map.getZoom(), 2.4),
          duration: 900,
        })
      } catch {
        // 地图尚未就绪时忽略
      }
    }
  }, [meCoords, meId, meName])

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

      const start = meRef.current.coords
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
        const coords = meRef.current.coords
        if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
          const text = formatCoords(coords.lat, coords.lng, 4)
          latestCoordsRef.current = text
          if (coordsRef.current) coordsRef.current.textContent = text
        }
      }
      syncRef.current = sync

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
        sync()
        startFlow()
      })

      map.on('move', () => {
        if (!map) return
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
      if (observer) observer.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      clearInterval(flowTimer)
      clearMarkers()
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

  const currentDate = new Date(now)

  return (
    <div className="relative h-full overflow-hidden bg-eink-paper text-eink-ink">
      <div
        ref={containerRef}
        data-testid="relationship-globe"
        aria-label="关系网地球，可拖动旋转、缩放并点击查看经纬度"
        className={`h-full w-full ${fallback ? 'hidden' : ''}`}
      />

      {fallback ? (
        <div data-testid="globe-fallback" className="absolute inset-0 overflow-y-auto px-6 pt-16 pb-24">
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

      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 text-center">
        <p className="text-[11px] tracking-[0.08em] text-eink-sub">{meName} 的地球 · 全球实时天气</p>
        <p data-testid="globe-weather" className="mt-1 text-[10px] tracking-[0.06em] text-eink-faint">
          此刻 · 本地 {deviceClock(currentDate)} · {deviceDaylight(currentDate)} · 城市实时天气
        </p>
        <div className="mt-1.5 flex flex-col items-center gap-1.5">
          <p
            ref={coordsRef}
            data-testid="globe-coords"
            className="text-[10px] tracking-[0.14em] text-eink-sub tabular-nums"
          />
          <button
            type="button"
            data-testid="globe-copy-coords"
            className="pointer-events-auto border border-eink-line/40 px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-eink-sub active:bg-eink-surface"
            onClick={copyCoords}
          >
            {copied || '复制'}
          </button>
        </div>
      </div>
    </div>
  )
}

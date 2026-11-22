import { useEffect, useMemo, useRef, useState } from 'react'
import ImageViewer from './ImageViewer'
import { createGlobeEngine } from './DiscoverGlobeEngine'
import { PLACES, cityWeatherId, searchPlaces } from '../lib/places'
import { buildCloudCanvas, cloudGridFrom, cloudPoints } from '../lib/clouds'
import { searchPlacesOnline } from '../lib/geocode'
import { fetchWeather } from '../lib/weather'
import { formatCoords, parseCoords } from '../lib/tiles'
import { OSM_COPYRIGHT, OSM_COPYRIGHT_URL } from '../lib/mapTiles'
import { canUseWebGL, deviceClock, deviceDaylight } from '../lib/globe'
import { formatRelativeTime } from '../utils'

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
  const [onlinePlaces, setOnlinePlaces] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
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
    const api = createGlobeEngine({
      container,
      labelLayer: labelsRef.current,
      tooltip: tooltipRef.current,
      coords: coordsRef.current,
      mapStatus: mapStatusRef.current,
      labelElsRef,
      meNameRef,
      meCoordsRef,
      onPick: setSelectedId,
      onFallback: () => setFallback(true),
    })
    if (!api) return undefined
    threeRef.current = api
    return () => {
      api.dispose()
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
  const localMatches = useMemo(() => (jumpCoords ? [] : searchPlaces(jumpQuery)), [jumpCoords, jumpQuery])
  const jumpMatches = useMemo(() => {
    if (!onlinePlaces.length) return localMatches
    const merged = [...localMatches.map((place) => ({ ...place, altitude: 0.006 }))]
    onlinePlaces.forEach((place) => {
      const duplicate = merged.some(
        (item) =>
          item.name === place.name &&
          Math.abs(item.lat - place.lat) < 0.12 &&
          Math.abs(item.lng - place.lng) < 0.12
      )
      if (!duplicate) merged.push(place)
    })
    return merged.slice(0, 10)
  }, [localMatches, onlinePlaces])
  useEffect(() => {
    if (!jumpOpen || jumpCoords || jumpQuery.trim().length < 2) {
      setOnlinePlaces([])
      setSearchLoading(false)
      setSearchError('')
      return undefined
    }
    setOnlinePlaces([])
    setSearchError('')
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearchLoading(true)
      const center = threeRef.current?.center?.()
      searchPlacesOnline(jumpQuery, {
        lat: center?.lat,
        lng: center?.lng,
        signal: controller.signal,
      }).then((result) => {
        if (controller.signal.aborted) return
        setSearchLoading(false)
        if (result.ok) setOnlinePlaces(result.places)
        else if (!result.aborted) setSearchError(result.error || '地名搜索失败')
      })
    }, 420)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [jumpOpen, jumpQuery, jumpCoords])
  const goTo = (lat, lng, altitude = 0.003) => {
    threeRef.current?.flyTo(lat, lng, altitude)
    setJumpOpen(false)
    setJumpQuery('')
    setJumpError('')
    setSearchError('')
  }
  const submitJump = async (event) => {
    event.preventDefault()
    if (jumpCoords) {
      goTo(jumpCoords.lat, jumpCoords.lng, 0.0015)
      return
    }
    const place = jumpMatches[0] || searchPlaces(jumpQuery, 1)[0]
    if (place) {
      goTo(place.lat, place.lng, place.altitude || 0.006)
      return
    }
    if (jumpQuery.trim().length < 2) {
      setJumpError('输入城市、村镇或经纬度')
      return
    }
    setSearchLoading(true)
    const result = await searchPlacesOnline(jumpQuery, { limit: 1 })
    setSearchLoading(false)
    if (result.ok && result.places[0]) {
      goTo(result.places[0].lat, result.places[0].lng, result.places[0].altitude)
      return
    }
    setJumpError(result.error || '没有找到这个地点，试试输入经纬度')
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
                placeholder="城市、街道、村镇，或 34.34,108.94"
                autoFocus
                className="h-10 min-w-0 flex-1 border border-[#2a6fa8]/45 bg-[#04101f] px-3 text-[14px] text-[#e8f6ff] outline-none placeholder:text-[#3d6f96] focus:border-[#4fc3ff]"
              />
              <button
                type="submit"
                data-testid="jump-submit"
                className="h-10 shrink-0 bg-[#4fc3ff] px-4 text-[13px] font-medium text-[#03101f] active:bg-[#8fe6ff]"
              >
                {searchLoading ? '搜索中' : '前往'}
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
                onClick={() => goTo(jumpCoords.lat, jumpCoords.lng, 0.0015)}
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
                    onClick={() => goTo(place.lat, place.lng, place.altitude || 0.006)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-[#dff1ff]">{place.name}</span>
                      {place.detail ? (
                        <span className="mt-0.5 block truncate text-[11px] text-[#5d92b8]">{place.detail}</span>
                      ) : null}
                    </span>
                    <span className="ml-3 shrink-0 text-[11px] text-[#3d6f96] tabular-nums">
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
                      onClick={() => goTo(place.lat, place.lng, 0.006)}
                    >
                      {place.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : !jumpCoords && jumpQuery.trim() ? (
              <p data-testid="jump-hint" className="mt-3 border-t border-[#12324f] pt-3 text-[12px] text-[#5d92b8]">
                {searchLoading ? '正在搜索地名…' : searchError || '没有找到匹配的地点，可按回车重试，或直接输入经纬度。'}
              </p>
            ) : null}
            <p className="mt-5 text-[11px] leading-5 text-[#3d6f96]">
              支持城市、街道、村镇等任意地名与经纬度，选中后直接飞到附近，可继续滚轮放大查看细节。
            </p>
          </div>
        </div>
      ) : null}

      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl('')} /> : null}
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import ImageViewer from './ImageViewer'
import { formatRelativeTime } from '../utils'

const RAD = Math.PI / 180

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
    lon: u * 360 - 180,
  }
}

function projectLL(lat, lon, rotation) {
  const latRad = lat * RAD
  const lonRad = (lon + rotation) * RAD
  return {
    x: 50 + Math.cos(latRad) * Math.sin(lonRad) * 46,
    y: 50 - Math.sin(latRad) * 46,
    z: Math.cos(latRad) * Math.cos(lonRad),
  }
}

function project(id, rotation) {
  const { lat, lon } = pointFor(id)
  return projectLL(lat, lon, rotation)
}

const LAND_POLYGONS = [
  [
    [-168, 65], [-160, 70], [-140, 70], [-125, 72], [-100, 70], [-80, 73], [-62, 60],
    [-55, 50], [-65, 45], [-70, 41], [-75, 35], [-81, 25], [-90, 21], [-97, 18],
    [-105, 22], [-113, 29], [-124, 40], [-130, 55], [-150, 60], [-168, 65],
  ],
  [
    [-81, 0], [-75, 10], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-55, -35],
    [-65, -55], [-72, -52], [-75, -30], [-70, -18], [-81, 0],
  ],
  [
    [-17, 15], [-16, 22], [-10, 28], [0, 37], [10, 37], [20, 32], [32, 31], [43, 12],
    [51, 12], [41, -2], [40, -15], [35, -25], [25, -34], [18, -34], [12, -18],
    [9, -1], [8, 4], [-8, 5], [-17, 15],
  ],
  [
    [-10, 36], [-9, 44], [-1, 48], [2, 51], [5, 58], [10, 64], [20, 70], [30, 70],
    [45, 68], [60, 70], [75, 73], [95, 76], [120, 73], [140, 72], [160, 69],
    [180, 65], [180, 58], [160, 56], [145, 44], [140, 35], [130, 33], [122, 31],
    [120, 22], [108, 10], [103, 1], [98, 8], [95, 16], [88, 21], [80, 8], [72, 20],
    [66, 24], [58, 25], [50, 30], [43, 12], [40, 15], [32, 30], [28, 41], [20, 40],
    [14, 38], [3, 42], [-10, 36],
  ],
  [
    [114, -22], [122, -18], [135, -12], [142, -11], [146, -19], [150, -25],
    [153, -28], [150, -37], [140, -38], [130, -32], [115, -34], [114, -22],
  ],
  [
    [-45, 60], [-30, 70], [-20, 75], [-25, 82], [-45, 83], [-58, 80], [-60, 70], [-45, 60],
  ],
  [[43, -12], [50, -15], [50, -25], [45, -25], [43, -12]],
  [[130, 32], [140, 36], [145, 44], [141, 45], [136, 35], [130, 32]],
  [[-6, 50], [-2, 53], [-3, 58], [-6, 58], [-6, 50]],
  [[166, -46], [174, -41], [178, -38], [174, -35], [168, -44], [166, -46]],
]

function insidePolygon(lon, lat, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

const LAND_DOTS = (() => {
  const dots = []
  for (let lat = -76; lat <= 76; lat += 4) {
    for (let lon = -180; lon < 180; lon += 4) {
      if (LAND_POLYGONS.some((polygon) => insidePolygon(lon, lat, polygon))) dots.push({ lat, lon })
    }
  }
  return dots
})()

function formatLongitude(rotation) {
  const raw = (((-rotation + 180) % 360) + 360) % 360 - 180
  const value = Math.round(Math.abs(raw))
  if (value === 0) return '0°'
  return `${value}°${raw > 0 ? 'E' : 'W'}`
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target - yearStart) / 86400000 + 1) / 7)
}

function routePath(point) {
  if (!point || point.z <= 0.05) return ''
  const controlX = 50 + (point.x - 50) * 0.42
  const controlY = 88 - Math.abs(point.x - 50) * 0.16 - 10
  return `M 50 88 Q ${controlX} ${controlY} ${point.x} ${point.y}`
}

function GlobeArt({ rotation }) {
  const rawId = useId()
  const suffix = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `globe-clip-${suffix}`
  const shadeId = `globe-shade-${suffix}`
  const meridians = Array.from({ length: 6 }, (_, index) => index * 30)
  const latitudes = [-60, -30, 0, 30, 60]
  const ticks = Array.from({ length: 48 }, (_, index) => index * 7.5)

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full text-eink-ink" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
        <radialGradient id={shadeId} cx="46%" cy="40%" r="52%">
          <stop offset="0%" stopColor="rgb(var(--eink-line))" stopOpacity="0" />
          <stop offset="74%" stopColor="rgb(var(--eink-line))" stopOpacity="0" />
          <stop offset="92%" stopColor="rgb(var(--eink-line))" stopOpacity="0.04" />
          <stop offset="100%" stopColor="rgb(var(--eink-line))" stopOpacity="0.09" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="rgb(var(--eink-bar))" />
      <g clipPath={`url(#${clipId})`}>
        <g fill="currentColor">
          {LAND_DOTS.map((dot) => {
            const point = projectLL(dot.lat, dot.lon, rotation)
            if (point.z <= 0.04) return null
            return (
              <circle
                key={`${dot.lat}:${dot.lon}`}
                cx={point.x}
                cy={point.y}
                r={0.48 + 0.22 * point.z}
                opacity={0.28 + 0.34 * point.z}
              />
            )
          })}
        </g>
        <g opacity="0.14" stroke="currentColor" fill="none" strokeWidth="0.2">
          {latitudes.map((lat) => {
            const y = 50 - Math.sin(lat * RAD) * 46
            const rx = Math.cos(lat * RAD) * 46
            return <ellipse key={lat} cx="50" cy={y} rx={rx} ry={Math.max(1.2, rx * 0.16)} />
          })}
          {meridians.map((lon) => {
            const points = []
            for (let lat = -80; lat <= 80; lat += 8) {
              const latRad = lat * RAD
              const lonRad = (lon + rotation) * RAD
              points.push(`${50 + Math.cos(latRad) * Math.sin(lonRad) * 46},${50 - Math.sin(latRad) * 46}`)
            }
            return <polyline key={lon} points={points.join(' ')} />
          })}
        </g>
        <circle cx="50" cy="50" r="46" fill={`url(#${shadeId})`} />
        <circle cx="50" cy="50" r="45.9" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.5" />
      </g>
      <g stroke="currentColor" strokeLinecap="round">
        {ticks.map((angle, index) => {
          const long = index % 6 === 0
          const rad = angle * RAD
          const inner = long ? 46.8 : 47.6
          const outer = long ? 49.4 : 48.8
          return (
            <line
              key={angle}
              x1={50 + Math.cos(rad) * inner}
              y1={50 + Math.sin(rad) * inner}
              x2={50 + Math.cos(rad) * outer}
              y2={50 + Math.sin(rad) * outer}
              strokeWidth={long ? 0.34 : 0.16}
              opacity={long ? 0.4 : 0.22}
            />
          )
        })}
      </g>
      <circle
        cx="50"
        cy="50"
        r="49.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.14"
        strokeDasharray="0.5 2.2"
        opacity="0.2"
      />
    </svg>
  )
}

export default function DiscoverGlobe({ people, routes, meId, loading, error, emptyText, onReply }) {
  const [rotation, setRotation] = useState(0)
  const [selected, setSelected] = useState(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const [hint, setHint] = useState('')
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const centeredRef = useRef(false)
  const touchedRef = useRef(false)

  const coordinates = useMemo(() => {
    const map = new Map()
    people.forEach((person) => {
      map.set(person.id, project(person.id, rotation))
    })
    return map
  }, [people, rotation])

  const routeAuthors = useMemo(() => new Set(routes.map((route) => route.authorId)), [routes])
  const hiddenCount = useMemo(
    () => people.filter((person) => (coordinates.get(person.id)?.z ?? 0) <= 0.05).length,
    [people, coordinates]
  )
  const routeIndex = useMemo(() => {
    const map = new Map()
    routes.forEach((route, index) => map.set(route.authorId, index))
    return map
  }, [routes])

  useEffect(() => {
    if (centeredRef.current || touchedRef.current || !routes.length) return
    centeredRef.current = true
    setRotation(-pointFor(routes[0].authorId).lon)
  }, [routes])

  useEffect(() => {
    if (!selected) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [selected])

  const onPointerDown = (event) => {
    touchedRef.current = true
    dragRef.current = { x: event.clientX, rotation }
    movedRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    if (!dragRef.current) return
    const delta = event.clientX - dragRef.current.x
    if (Math.abs(delta) > 4) movedRef.current = true
    setRotation(dragRef.current.rotation + delta * 0.45)
  }

  const onPointerUp = (event) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const openRoute = (route) => {
    setSelected(route)
    setViewerUrl('')
    setHint('')
    setRotation(-pointFor(route.authorId).lon)
  }

  const openPerson = (person) => {
    if (movedRef.current) return
    const route = routes.find((item) => item.authorId === person.id)
    if (route) {
      openRoute(route)
      return
    }
    setHint(person.id === meId ? '这是你的坐标' : `${person.name} 本周还没有留下信`)
  }

  const selectedIndex = selected ? routes.findIndex((route) => route.id === selected.id) : -1

  return (
    <>
      <section className="px-4 pt-3">
        <div
          data-testid="relationship-globe"
          className="relative mx-auto aspect-square w-full max-w-[340px] cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-[5%] -rotate-2 border border-eink-line/20" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-[2.5%] rotate-1 border border-eink-line/25 bg-eink-paper/70" />
          <GlobeArt rotation={rotation} />

          <span className="pointer-events-none absolute left-0 top-0 border border-eink-line/30 px-1 py-0.5 text-[9px] tracking-[0.16em] text-eink-faint">
            W{isoWeek(new Date())}
          </span>
          <span className="pointer-events-none absolute right-0 top-0 border border-eink-line/30 px-1 py-0.5 text-[9px] tracking-[0.16em] text-eink-faint">
            {formatLongitude(rotation)}
          </span>

          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full text-eink-ink" aria-hidden="true">
            {routes.map((route) => {
              const point = coordinates.get(route.authorId)
              if (!point || point.z <= 0.05) return null
              return (
                <g key={route.id}>
                  <path
                    d={routePath(point)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.46"
                    strokeDasharray="1.1 1.5"
                    opacity={selected?.id === route.id ? 0.9 : 0.46}
                  />
                  <circle cx={point.x} cy={point.y} r="1.15" fill="none" stroke="currentColor" strokeWidth="0.28" opacity="0.6" />
                </g>
              )
            })}
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-[88%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute h-4 w-px bg-eink-ink/40" />
              <span className="absolute h-px w-4 bg-eink-ink/40" />
              <span className="relative block h-1.5 w-1.5 rounded-full bg-eink-ink" />
            </span>
            <span className="mt-0.5 text-[9px] leading-none text-eink-sub">你</span>
          </div>

          {people.map((person) => {
            const point = coordinates.get(person.id)
            if (!point) return null
            const front = point.z > 0.05
            const isRoute = routeAuthors.has(person.id)
            if (!front) {
              return (
                <span
                  key={person.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                >
                  <span className="block h-1 w-1 rounded-full bg-eink-ink opacity-15" />
                </span>
              )
            }
            return (
              <button
                key={person.id}
                type="button"
                data-testid={`globe-person-${person.id}`}
                aria-label={`查看${person.name}的近况`}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => openPerson(person)}
              >
                {isRoute ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-eink-ink bg-eink-bar text-[9px] leading-none text-eink-ink ring-2 ring-eink-bar">
                    {String((routeIndex.get(person.id) ?? 0) + 1).padStart(2, '0')}
                  </span>
                ) : (
                  <span className="block h-2 w-2 rounded-full border border-eink-sub/70 bg-eink-bar ring-2 ring-eink-bar" />
                )}
              </button>
            )
          })}
        </div>
        <p data-testid="globe-hint" className="mt-1 text-center text-[11px] leading-5 text-eink-faint">
          {hint || (hiddenCount ? `${hiddenCount} 位朋友在背面，拖动地球看看` : '拖动地球，换个方向')}
        </p>
      </section>

      <section className="px-4 pb-8 pt-4">
        <div className="flex items-baseline justify-between border-b border-eink-line/20 pb-2">
          <h2 className="text-[12px] tracking-[0.22em] text-eink-sub">本周航线</h2>
          <span className="text-[11px] text-eink-faint">{routes.length ? `${routes.length} 页` : '等信'}</span>
        </div>

        {loading ? (
          <p data-testid="routes-loading" className="py-10 text-center text-[13px] text-eink-sub">
            正在取信...
          </p>
        ) : error ? (
          <p data-testid="routes-error" className="py-10 text-center text-[13px] text-eink-sub">
            {error}
          </p>
        ) : routes.length === 0 ? (
          <p data-testid="routes-empty" className="py-10 text-center text-[13px] leading-6 text-eink-sub">
            {emptyText}
          </p>
        ) : (
          <div>
            {routes.map((route, index) => (
              <button
                key={route.id}
                type="button"
                data-testid="route-card"
                className="flex w-full gap-3 border-b border-eink-divider px-1 py-3.5 text-left active:bg-eink-active/50"
                onClick={() => openRoute(route)}
              >
                <span className="w-6 shrink-0 pt-0.5 text-[11px] tracking-[0.12em] text-eink-faint">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-eink-ink">{route.name}</span>
                    <span className="shrink-0 text-[11px] text-eink-faint">{formatRelativeTime(route.createdAt)}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-eink-sub">
                    {route.content || (route.imageUrl ? '寄来了一张照片' : route.imageCount ? `寄来 ${route.imageCount} 张图` : '寄来了一页信')}
                  </span>
                </span>
                <span className="shrink-0 pt-0.5 text-[16px] text-eink-faint">›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50"
          data-testid="moment-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-testid="moment-sheet"
            className="safe-bottom max-h-[82vh] w-full overflow-y-auto border-t-2 border-eink-ink bg-eink-paper px-5 pb-6 pt-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between text-[10px] tracking-[0.2em] text-eink-faint">
              <span>第 {String(Math.max(selectedIndex, 0) + 1).padStart(2, '0')} 页</span>
              <button type="button" className="px-1 text-[12px] tracking-normal text-eink-sub" onClick={() => setSelected(null)}>
                收起
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={selected.name} color={selected.color} size={38} src={selected.avatarUrl || ''} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-eink-ink">{selected.name}</p>
                <p className="mt-0.5 text-[11px] text-eink-faint">{formatRelativeTime(selected.createdAt)}</p>
              </div>
            </div>
            {selected.content ? (
              <p className="moment-text mt-5 whitespace-pre-wrap break-words text-[16px] leading-8 text-eink-ink">
                {selected.content}
              </p>
            ) : null}
            {selected.imageUrl ? (
              <button
                type="button"
                data-testid="moment-sheet-image"
                className="mt-4 block w-full cursor-zoom-in border border-eink-divider"
                onClick={() => setViewerUrl(selected.imageUrl)}
              >
                <img src={selected.imageUrl} alt="信笺图片" className="max-h-[320px] w-full object-cover grayscale" />
              </button>
            ) : selected.imageCount ? (
              <div className="mt-4 border border-eink-divider bg-eink-surface px-4 py-6 text-center text-[13px] text-eink-sub">
                附 {selected.imageCount} 张图
              </div>
            ) : null}
            <button
              type="button"
              data-testid="moment-reply"
              className="mt-6 h-11 w-full bg-eink-ink text-[15px] text-eink-paper active:bg-eink-pressed"
              onClick={() => {
                setSelected(null)
                onReply(selected.authorId)
              }}
            >
              回信
            </button>
            <p className="mt-2 text-center text-[11px] text-eink-faint">回信会进入你们的单聊</p>
          </div>
        </div>
      ) : null}

      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl('')} /> : null}
    </>
  )
}

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

function project(id, rotation) {
  const { lat, lon } = pointFor(id)
  const latRad = lat * RAD
  const lonRad = (lon + rotation) * RAD
  const x = Math.cos(latRad) * Math.sin(lonRad)
  const y = Math.sin(latRad)
  const z = Math.cos(latRad) * Math.cos(lonRad)
  return {
    x: 50 + x * 46,
    y: 50 - y * 46,
    z,
  }
}

function routePath(point) {
  if (!point || point.z <= 0.05) return ''
  const controlX = 50 + (point.x - 50) * 0.42
  const controlY = 88 - Math.abs(point.x - 50) * 0.16 - 10
  return `M 50 88 Q ${controlX} ${controlY} ${point.x} ${point.y}`
}

function GlobeArt({ rotation }) {
  const rawId = useId()
  const clipId = `globe-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const meridians = Array.from({ length: 6 }, (_, index) => index * 30)
  const latitudes = [-60, -30, 0, 30, 60]

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full text-eink-ink" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="46"
        style={{ fill: 'rgb(var(--eink-bar))', stroke: 'rgb(var(--eink-line))' }}
        strokeWidth="0.35"
      />
      <g clipPath={`url(#${clipId})`} opacity="0.24" stroke="currentColor" fill="none" strokeWidth="0.22">
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
      <circle
        cx="50"
        cy="50"
        r="49"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.18"
        strokeDasharray="0.4 2.4"
        opacity="0.28"
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

  const coordinates = useMemo(() => {
    const map = new Map()
    people.forEach((person) => {
      map.set(person.id, project(person.id, rotation))
    })
    return map
  }, [people, rotation])

  const routeAuthors = useMemo(() => new Set(routes.map((route) => route.authorId)), [routes])

  useEffect(() => {
    if (!selected) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [selected])

  const onPointerDown = (event) => {
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
          <GlobeArt rotation={rotation} />

          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full text-eink-ink" aria-hidden="true">
            {routes.map((route) => (
              <path
                key={route.id}
                d={routePath(coordinates.get(route.authorId))}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.42"
                strokeDasharray="1.1 1.5"
                opacity={selected?.id === route.id ? 0.9 : 0.42}
              />
            ))}
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-[88%] -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="block text-[9px] leading-none text-eink-sub">你</span>
            <span className="mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full bg-eink-ink" />
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
                <span className="relative flex flex-col items-center">
                  <span
                    className={`block rounded-full ring-4 ring-eink-ink/10 ${
                      isRoute ? 'h-2.5 w-2.5 bg-eink-ink' : 'h-1.5 w-1.5 bg-eink-sub'
                    }`}
                  />
                  {isRoute ? (
                    <span className="mt-1 max-w-[72px] truncate rounded-none bg-eink-bar/90 px-1 text-[10px] leading-4 text-eink-ink">
                      {person.name}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
        <p data-testid="globe-hint" className="mt-1 text-center text-[11px] leading-5 text-eink-faint">
          {hint || '拖动地球，转到背面看看'}
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

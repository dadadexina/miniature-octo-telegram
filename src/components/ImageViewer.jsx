import { useEffect, useRef, useState } from 'react'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SCALE = 2.5

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function touchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export default function ImageViewer({ url, onClose }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  const gesture = useRef({ mode: 'none', startScale: 1, startDistance: 1, startX: 0, startY: 0, originX: 0, originY: 0, lastTap: 0 })
  const lastTouchAt = useRef(0)

  const applyView = (next) => {
    viewRef.current = next
    setView(next)
  }

  useEffect(() => {
    if (!url) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, onClose])

  const toggleZoom = () => {
    const current = viewRef.current
    applyView(
      current.scale > 1.01
        ? { scale: 1, x: 0, y: 0 }
        : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }
    )
  }

  const onTouchStart = (e) => {
    const g = gesture.current
    if (e.touches.length >= 2) {
      const [a, b] = e.touches
      gesture.current = {
        ...g,
        mode: 'pinch',
        startScale: viewRef.current.scale,
        startDistance: touchDistance(a, b) || 1,
        lastTap: 0,
      }
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const now = Date.now()
      if (now - g.lastTap < DOUBLE_TAP_MS) {
        toggleZoom()
        gesture.current = { ...g, mode: 'none', lastTap: 0 }
        return
      }
      gesture.current = {
        ...g,
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
        lastTap: now,
      }
    }
  }

  const onTouchMove = (e) => {
    const g = gesture.current
    if (g.mode === 'pinch' && e.touches.length >= 2) {
      const [a, b] = e.touches
      const next = clamp(g.startScale * (touchDistance(a, b) / g.startDistance), MIN_SCALE, MAX_SCALE)
      const settled = next <= 1 ? 0 : viewRef.current.x
      const settledY = next <= 1 ? 0 : viewRef.current.y
      applyView({ scale: next, x: settled, y: settledY })
      return
    }
    if (g.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0]
      if (viewRef.current.scale <= 1) return
      applyView({
        scale: viewRef.current.scale,
        x: g.originX + (t.clientX - g.startX),
        y: g.originY + (t.clientY - g.startY),
      })
    }
  }

  const onTouchEnd = (e) => {
    lastTouchAt.current = Date.now()
    if (e.touches.length === 0) {
      gesture.current.mode = 'none'
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      gesture.current = {
        ...gesture.current,
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      }
    }
  }

  const onDoubleClick = () => {
    if (Date.now() - lastTouchAt.current < 500) return
    toggleZoom()
  }

  const onWheel = (e) => {
    const current = viewRef.current
    const next = clamp(current.scale * (e.deltaY < 0 ? 1.12 : 0.89), MIN_SCALE, MAX_SCALE)
    applyView({
      scale: next,
      x: next <= 1 ? 0 : current.x,
      y: next <= 1 ? 0 : current.y,
    })
  }

  return (
    <div
      data-testid="image-viewer"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/90"
      style={{ touchAction: 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <img
        data-testid="image-viewer-img"
        src={url}
        alt="图片大图"
        draggable={false}
        className="max-h-full max-w-full select-none object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={onDoubleClick}
      />
      <button
        type="button"
        data-testid="image-viewer-close"
        aria-label="关闭图片"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center border border-white/40 text-[20px] leading-none text-white/80 active:bg-white/10"
        onClick={(e) => {
          e.stopPropagation()
          onClose?.()
        }}
      >
        ×
      </button>
    </div>
  )
}

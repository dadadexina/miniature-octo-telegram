import { useEffect, useRef } from 'react'

const EDGE_WIDTH = 28
const MIN_DISTANCE = 64

export default function useSwipeBack(onBack, { enabled = true, edge = EDGE_WIDTH, distance = MIN_DISTANCE } = {}) {
  const handlerRef = useRef(onBack)

  useEffect(() => {
    handlerRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    let tracking = false
    let dragging = false
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0

    const onStart = (event) => {
      if (event.touches?.length !== 1) {
        tracking = false
        return
      }
      const touch = event.touches[0]
      if (touch.clientX > edge) {
        tracking = false
        return
      }
      tracking = true
      dragging = false
      startX = touch.clientX
      startY = touch.clientY
      lastX = touch.clientX
      lastY = touch.clientY
    }

    const onMove = (event) => {
      if (!tracking) return
      if (event.touches?.length !== 1) {
        tracking = false
        return
      }
      const touch = event.touches[0]
      lastX = touch.clientX
      lastY = touch.clientY
      const dx = lastX - startX
      const dy = lastY - startY
      if (!dragging) {
        if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) {
          tracking = false
          return
        }
        if (dx <= 12 || Math.abs(dx) <= Math.abs(dy) * 1.2) return
        dragging = true
      }
      if (dragging && event.cancelable) event.preventDefault()
    }

    const onEnd = (event) => {
      if (!tracking) return
      const touch = event.changedTouches?.[0]
      if (touch) {
        lastX = touch.clientX
        lastY = touch.clientY
      }
      const dx = lastX - startX
      const dy = lastY - startY
      const shouldBack = dx >= distance && Math.abs(dy) <= Math.max(80, dx * 0.7)
      tracking = false
      dragging = false
      if (shouldBack) handlerRef.current?.()
    }

    const onCancel = () => {
      tracking = false
      dragging = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [enabled, edge, distance])
}

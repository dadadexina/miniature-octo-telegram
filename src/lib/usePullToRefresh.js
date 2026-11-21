import { useRef, useState } from 'react'

export default function usePullToRefresh({ onRefresh, threshold = 60 } = {}) {
  const scrollRef = useRef(null)
  const startYRef = useRef(null)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const reset = () => {
    startYRef.current = null
    pullRef.current = 0
    setPull(0)
  }

  const onTouchStart = (e) => {
    if (refreshingRef.current) return
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) {
      startYRef.current = null
      return
    }
    startYRef.current = e.touches?.[0]?.clientY ?? null
    pullRef.current = 0
  }

  const onTouchMove = (e) => {
    if (startYRef.current == null) return
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) {
      reset()
      return
    }
    const currentY = e.touches?.[0]?.clientY
    if (typeof currentY !== 'number') return
    const next = Math.min(Math.max((currentY - startYRef.current) * 0.5, 0), threshold * 1.5)
    pullRef.current = next
    setPull(next)
  }

  const onTouchEnd = async () => {
    if (startYRef.current == null) return
    const shouldRefresh = pullRef.current >= threshold
    reset()
    if (!shouldRefresh || refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      await onRefresh?.()
    } catch {
      // 刷新失败时保留原列表，错误由调用方自行提示
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }

  return {
    scrollRef,
    pull,
    refreshing,
    threshold,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: reset,
    },
  }
}

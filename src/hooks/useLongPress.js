import { useCallback, useEffect, useRef } from 'react'

const DEFAULT_DELAY = 450
const DEFAULT_MOVE_TOLERANCE = 10
const SUPPRESS_CLICK_MS = 400

const INTERACTIVE_SELECTOR = 'button, a, input, textarea'

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_SELECTOR))
}

export default function useLongPress({
  onLongPress,
  delay = DEFAULT_DELAY,
  moveTolerance = DEFAULT_MOVE_TOLERANCE,
} = {}) {
  const state = useRef({ timer: 0, fired: false, x: 0, y: 0, suppressUntil: 0 })

  useEffect(
    () => () => {
      clearTimeout(state.current.timer)
    },
    []
  )

  const begin = useCallback(
    (e, payload) => {
      if (typeof e.button === 'number' && e.button !== 0) return
      if (isInteractiveTarget(e.target)) return
      const current = state.current
      clearTimeout(current.timer)
      current.fired = false
      current.x = e.clientX
      current.y = e.clientY
      current.timer = setTimeout(() => {
        current.timer = 0
        current.fired = true
        current.suppressUntil = Date.now() + SUPPRESS_CLICK_MS
        try {
          globalThis.getSelection?.()?.removeAllRanges?.()
        } catch {
          // 忽略选区清理失败
        }
        onLongPress?.(payload)
      }, delay)
    },
    [delay, onLongPress]
  )

  const move = useCallback(
    (e) => {
      const current = state.current
      if (!current.timer) return
      if (
        Math.abs(e.clientX - current.x) > moveTolerance ||
        Math.abs(e.clientY - current.y) > moveTolerance
      ) {
        clearTimeout(current.timer)
        current.timer = 0
      }
    },
    [moveTolerance]
  )

  const end = useCallback(() => {
    const current = state.current
    if (current.timer) {
      clearTimeout(current.timer)
      current.timer = 0
    }
  }, [])

  const consume = useCallback(() => {
    if (!state.current.fired) return false
    state.current.fired = false
    return true
  }, [])

  const isSuppressed = useCallback(() => Date.now() < state.current.suppressUntil, [])

  const contextMenu = useCallback(
    (e, payload) => {
      if (isInteractiveTarget(e.target)) return
      e.preventDefault()
      state.current.suppressUntil = Date.now() + SUPPRESS_CLICK_MS
      onLongPress?.(payload)
    },
    [onLongPress]
  )

  return { begin, move, end, consume, isSuppressed, contextMenu }
}

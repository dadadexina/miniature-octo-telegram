import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const OPEN_W = 72
const OPEN_THRESHOLD = 36
const OVERDRAG = 16
const LOCK_SLOP = 6

export default function SwipeRow({ rowId, to, swiped, onOpen, onClose, onDelete, onLongPress, pinned = false, children }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null)
  const lockRef = useRef(null)
  const movedRef = useRef(false)
  const pressRef = useRef(null)
  const longFiredRef = useRef(false)

  useEffect(() => {
    if (dragging) return
    const target = swiped ? -OPEN_W : 0
    setDx((prev) => (prev === target ? prev : target))
  }, [swiped, dragging])

  const cancelPress = () => {
    if (pressRef.current) {
      clearTimeout(pressRef.current)
      pressRef.current = null
    }
  }

  const startPress = () => {
    if (!onLongPress) return
    longFiredRef.current = false
    cancelPress()
    pressRef.current = setTimeout(() => {
      pressRef.current = null
      longFiredRef.current = true
      onLongPress()
    }, 500)
  }

  useEffect(() => cancelPress, [])

  const onTouchStart = (e) => {
    const t = e.touches?.[0]
    if (!t) return
    startRef.current = { x: t.clientX, y: t.clientY }
    lockRef.current = null
    movedRef.current = false
    startPress()
  }

  const onTouchMove = (e) => {
    const t = e.touches?.[0]
    if (!t || !startRef.current) return
    const ddx = t.clientX - startRef.current.x
    const ddy = t.clientY - startRef.current.y
    if (!lockRef.current) {
      if (Math.abs(ddx) < LOCK_SLOP && Math.abs(ddy) < LOCK_SLOP) return
      cancelPress()
      lockRef.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v'
      if (lockRef.current !== 'h') {
        startRef.current = null
        return
      }
      setDragging(true)
      movedRef.current = true
    }
    if (lockRef.current !== 'h') return
    const base = swiped ? -OPEN_W : 0
    let next = base + ddx
    if (next > 0) next = 0
    if (next < -OPEN_W - OVERDRAG) next = -OPEN_W - OVERDRAG
    setDx(next)
  }

  const onTouchEnd = () => {
    cancelPress()
    if (lockRef.current === 'h') {
      if (dx <= -OPEN_THRESHOLD) {
        setDx(-OPEN_W)
        if (!swiped) onOpen()
      } else {
        setDx(0)
        if (swiped) onClose()
      }
    }
    setDragging(false)
    startRef.current = null
    lockRef.current = null
  }

  const onClick = (e) => {
    if (longFiredRef.current) {
      e.preventDefault()
      e.stopPropagation()
      longFiredRef.current = false
      return
    }
    if (movedRef.current || swiped) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = false
      if (swiped) onClose()
    }
  }

  const onContextMenu = (e) => {
    if (!onLongPress) return
    e.preventDefault()
    cancelPress()
    longFiredRef.current = true
    onLongPress()
  }

  return (
    <div
      className="relative overflow-hidden border-b border-eink-divider"
      data-swipe-row={rowId}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <button
        type="button"
        data-testid="swipe-delete"
        aria-label="删除会话"
        className="absolute inset-y-0 right-0 flex w-[72px] items-center justify-center bg-[#C0392B] text-[15px] font-medium text-white"
        onClick={onDelete}
      >
        删除
      </button>
      <Link
        to={to}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{ transform: `translateX(${dx}px)` }}
        className={`relative flex items-center gap-3 px-4 py-3 active:bg-[#E7E5DD] ${
          pinned ? 'border-l-[3px] border-eink-ink bg-[#E9E7DF]' : 'border-l-[3px] border-transparent bg-eink-bar'
        } ${dragging ? '' : 'transition-transform duration-200'}`}
      >
        {children}
      </Link>
    </div>
  )
}

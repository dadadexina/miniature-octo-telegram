import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { useStore } from '../store'
import { formatRelativeTime } from '../utils'

const PLACEHOLDER_COLORS = [
  ['#4A4A4A', '#2E2E2E'],
  ['#6E6E6E', '#525252'],
  ['#8A8A85', '#6B6B66'],
  ['#3A3A3A', '#222222'],
  ['#5C5C5C', '#404040'],
  ['#7A7A75', '#5B5B57'],
  ['#9A9A94', '#787872'],
  ['#2B2B2B', '#151515'],
  ['#686863', '#4C4C48'],
]

function gridClass(count) {
  if (count <= 1) return 'grid-cols-1 w-[180px]'
  if (count === 2) return 'grid-cols-2 w-[154px]'
  if (count === 4) return 'grid-cols-2 w-[154px]'
  return 'grid-cols-3 w-[232px]'
}

function PhotoGrid({ count, seed = '' }) {
  const n = Math.min(Math.max(count, 0), 9)
  if (!n) return null
  return (
    <div className={`mt-2.5 grid gap-[4px] ${gridClass(n)}`}>
      {Array.from({ length: n }).map((_, i) => {
        const [from, to] = PLACEHOLDER_COLORS[(seed.length + i) % PLACEHOLDER_COLORS.length]
        return (
          <div
            key={i}
            className="relative aspect-square overflow-hidden rounded-none"
            style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[12px] text-white/80">
              图{i + 1}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Discover() {
  const { currentUser, momentsFeed, publishMoment, getUser, avatarColor, profile } = useStore()
  const meName = profile?.nickname || currentUser.nickname
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState(4)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const feed = momentsFeed()

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const submit = (e) => {
    e.preventDefault()
    const result = publishMoment({ text, images })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText('')
    setImages(4)
    setError('')
    setOpen(false)
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center border-b border-eink-divider bg-eink-bar px-3">
        <div className="w-16" />
        <h1 className="flex-1 truncate text-center text-[17px] font-medium">朋友圈</h1>
        <div className="flex w-16 justify-end">
          <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => setOpen(true)} aria-label="发布">
            <CameraIcon />
          </button>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div className="relative h-[220px] overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, #2A2A2A 0%, #55554F 42%, #8B8B84 70%, #1F1F1F 100%)',
            }}
          />
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: coverPattern() }} />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
          <div className="absolute -bottom-5 right-3 flex items-end gap-2.5">
            <span className="mb-2 text-[16px] font-medium text-white drop-shadow">{meName}</span>
            <Link to="/me" className="rounded-none ring-2 ring-white/80">
              <Avatar name={meName} color={avatarColor(currentUser.id)} size={70} />
            </Link>
          </div>
        </div>

        <div className="h-8" />

        {feed.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] text-eink-sub">还没有动态，发布第一条吧</p>
        ) : (
          feed.map((moment) => {
            const author = getUser(moment.userId)
            if (!author) return null
            const authorName = author.id === currentUser.id ? meName : author.nickname
            return (
              <article key={moment.id} className="flex gap-3 border-b border-eink-divider px-3 py-3.5">
                <Avatar name={authorName} color={avatarColor(author.id)} size={42} />
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-[15px] font-medium text-eink-ink">{authorName}</div>
                  {moment.text ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[#191919]">
                      {moment.text}
                    </p>
                  ) : null}
                  <PhotoGrid count={moment.images} seed={moment.id} />
                  <div className="mt-2.5 text-[12px] text-eink-faint">{formatRelativeTime(moment.time)}</div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(false)}>
          <form
            className="safe-bottom w-full rounded-t-none border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={() => setOpen(false)}>
                取消
              </button>
              <span className="text-[16px] font-medium">发布动态</span>
              <button type="submit" className="px-1 text-[15px] font-medium text-eink-ink">
                发表
              </button>
            </div>
            <textarea
              className="h-28 w-full resize-none rounded-none border border-eink-divider bg-eink-paper p-3 outline-none"
              placeholder="这一刻的想法..."
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
              autoFocus
            />
            <div className="mt-3">
              <div className="mb-2 text-[13px] text-eink-sub">图片数量</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }).map((_, n) => (
                  <button
                    key={n}
                    type="button"
                    className={`h-8 w-8 rounded-none ${images === n ? 'bg-eink-ink text-eink-paper' : 'border border-eink-divider bg-eink-surface text-eink-sub'}`}
                    onClick={() => setImages(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {images > 0 ? <PhotoGrid count={images} seed="preview" /> : null}
            {error ? <p className="mt-2 text-[13px] font-medium text-eink-ink">{error}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 7.2 10.1 5.5h3.8L15 7.2h2.2A2.3 2.3 0 0 1 19.5 9.5v7.2A2.3 2.3 0 0 1 17.2 19H6.8A2.3 2.3 0 0 1 4.5 16.7V9.5A2.3 2.3 0 0 1 6.8 7.2H9Z" stroke="#191919" strokeWidth="1.6" />
      <circle cx="12" cy="13" r="3.1" stroke="#191919" strokeWidth="1.6" />
    </svg>
  )
}

function coverPattern() {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
      <rect width='120' height='120' fill='none'/>
      <path d='M0 80 Q30 40 60 70 T120 50' stroke='white' stroke-width='6' fill='none' opacity='0.25'/>
      <circle cx='90' cy='28' r='14' fill='white' opacity='0.18'/>
    </svg>`
  )}")`
}

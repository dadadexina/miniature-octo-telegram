import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { loadMomentCover, saveMomentCover } from '../lib/momentCover'

export default function MomentCover({ userId, name, avatarSrc, avatarColor }) {
  const [cover, setCover] = useState(() => loadMomentCover(userId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const errorTimer = useRef(null)

  useEffect(() => () => clearTimeout(errorTimer.current), [])

  const flashError = (text) => {
    setError(text)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 2200)
  }

  const onChange = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true)
    const res = await saveMomentCover(userId, file)
    setBusy(false)
    if (!res.ok) {
      flashError(res.error || '更换背景失败')
      return
    }
    setCover(res.url)
  }

  return (
    <div className="relative h-[260px]" data-testid="moments-cover">
      <div className="absolute inset-0 overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt="朋友圈背景"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: 'grayscale(1) contrast(1.05)' }}
            data-testid="moments-cover-image"
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, #2A2A2A 0%, #55554F 42%, #8B8B84 70%, #1F1F1F 100%)',
              }}
            />
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: coverPattern() }} />
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/45 to-transparent" />
      </div>

      <button
        type="button"
        className="absolute right-3 top-3 z-10 flex h-8 items-center gap-1.5 rounded-full bg-black/35 px-3 text-[12px] text-white backdrop-blur-sm active:bg-black/55 disabled:opacity-60"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label="更换背景"
        data-testid="change-cover"
      >
        <ImageIcon />
        <span>{busy ? '处理中' : '更换背景'}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
        data-testid="cover-input"
      />

      <div className="absolute inset-x-0 bottom-0 flex translate-y-[38px] flex-col items-center">
        <Link to="/me" className="rounded-full ring-4 ring-eink-paper" aria-label="查看我的资料">
          <Avatar name={name} color={avatarColor} size={76} src={avatarSrc || ''} />
        </Link>
        <span className="mt-1.5 max-w-[70%] truncate text-[16px] font-medium text-eink-ink">{name}</span>
      </div>

      {error ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <span className="bg-eink-ink px-3 py-1.5 text-[12px] text-eink-paper">{error}</span>
        </div>
      ) : null}
    </div>
  )
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4.5 17 4.8-4.6 3.2 3 2.6-2.4 4.4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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

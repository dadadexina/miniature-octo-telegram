import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { loadMomentCover, saveMomentCover } from '../lib/momentCover'

export default function MomentCover({ userId, name, avatarSrc, avatarColor, profileHref = '/me', editable = true, raised = false }) {
  const [cover, setCover] = useState(() => loadMomentCover(userId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const errorTimer = useRef(null)

  useEffect(() => () => clearTimeout(errorTimer.current), [])

  useEffect(() => {
    const onCoverUpdated = (event) => {
      if (event?.detail?.userId === userId) setCover(loadMomentCover(userId))
    }
    globalThis.addEventListener?.('moment-cover-updated', onCoverUpdated)
    return () => globalThis.removeEventListener?.('moment-cover-updated', onCoverUpdated)
  }, [userId])

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

      {editable ? (
        <>
          <button
            type="button"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm active:bg-black/55 disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="更换背景"
            title="更换背景"
            data-testid="change-cover"
          >
            {busy ? <span className="text-[11px]">…</span> : <CameraIcon />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onChange}
            data-testid="cover-input"
          />
        </>
      ) : null}

      <div
        className={`absolute inset-x-0 flex flex-col items-center ${
          raised ? 'bottom-[48px]' : 'bottom-0 translate-y-[38px]'
        }`}
      >
        <Link
          to={profileHref}
          className={`rounded-full ring-4 ${raised ? 'ring-white/80' : 'ring-eink-paper'}`}
          aria-label="查看资料"
        >
          <Avatar name={name} color={avatarColor} size={76} src={avatarSrc || ''} />
        </Link>
        <span
          className={`mt-1.5 max-w-[70%] truncate text-[16px] font-medium ${
            raised ? 'text-white drop-shadow' : 'text-eink-ink'
          }`}
        >
          {name}
        </span>
      </div>

      {error ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <span className="bg-eink-ink px-3 py-1.5 text-[12px] text-eink-paper">{error}</span>
        </div>
      ) : null}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7.2 10.1 5.5h3.8L15 7.2h2.2A2.3 2.3 0 0 1 19.5 9.5v7.2A2.3 2.3 0 0 1 17.2 19H6.8A2.3 2.3 0 0 1 4.5 16.7V9.5A2.3 2.3 0 0 1 6.8 7.2H9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.1" stroke="currentColor" strokeWidth="1.7" />
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

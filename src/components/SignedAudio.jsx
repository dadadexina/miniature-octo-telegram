import { useEffect, useRef, useState } from 'react'
import { signedMediaUrl } from '../lib/messageMedia'

const BARS = [5, 9, 13, 8, 15, 10, 6, 12, 9]

export default function SignedAudio({ attachment, mine = false }) {
  const [url, setUrl] = useState(attachment?.url || '')
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(Number(attachment?.duration) || 0)
  const audioRef = useRef(null)

  useEffect(() => {
    if (attachment?.url) {
      setUrl(attachment.url)
      return undefined
    }
    let alive = true
    signedMediaUrl(attachment?.path || '').then((res) => {
      if (!alive) return
      if (res.ok) setUrl(res.url)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [attachment?.path, attachment?.url])

  useEffect(() => {
    if (!url) return undefined
    const audio = new Audio(url)
    audio.preload = 'metadata'
    audioRef.current = audio
    const onEnded = () => setPlaying(false)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration))
      }
    }
    const onError = () => setFailed(true)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('error', onError)
    return () => {
      audio.pause()
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onError)
      audioRef.current = null
    }
  }, [url])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
    } catch {
      setFailed(true)
    }
  }

  if (failed) {
    return (
      <span
        data-testid="audio-failed"
        className="inline-flex items-center border border-eink-divider bg-eink-bar px-3 py-2 text-[12px] text-eink-sub"
      >
        语音加载失败
      </span>
    )
  }

  if (!url) {
    return (
      <span
        data-testid="audio-loading"
        className="inline-flex h-10 w-32 animate-pulse border border-eink-divider bg-eink-line/40"
      />
    )
  }

  return (
    <div
      data-testid="msg-audio"
      className={`flex min-w-[150px] items-center gap-2 border px-2.5 py-2 ${
        mine ? 'border-eink-ink bg-eink-ink text-eink-paper' : 'border-eink-line/25 bg-eink-bar text-eink-text'
      }`}
    >
      <button
        type="button"
        data-testid="audio-toggle"
        aria-label={playing ? '暂停语音' : '播放语音'}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
          mine ? 'border-eink-paper/45 text-eink-paper' : 'border-eink-line/40 text-eink-ink'
        }`}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1.5" width="2.5" height="9" />
            <rect x="7.5" y="1.5" width="2.5" height="9" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5 10 6l-7 4.5v-9Z" />
          </svg>
        )}
      </button>
      <span className="flex flex-1 items-center gap-0.5" aria-hidden="true">
        {BARS.map((height, index) => (
          <span
            key={index}
            className={`w-0.5 ${mine ? 'bg-eink-paper/80' : 'bg-eink-line'} ${playing ? 'animate-pulse' : ''}`}
            style={{ height }}
          />
        ))}
      </span>
      <span data-testid="audio-duration" className="shrink-0 text-[11px] tabular-nums">
        {duration ? `${duration}"` : '语音'}
      </span>
    </div>
  )
}

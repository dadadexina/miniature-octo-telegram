import { useEffect, useState } from 'react'

import { signedMediaUrl } from '../lib/messageMedia'

function displaySize(attachment) {
  const w = Number(attachment?.width) || 0
  const h = Number(attachment?.height) || 0
  if (!w || !h) return { width: 168, height: 168 }
  const long = 220
  const short = Math.max(96, Math.round((long * Math.min(w, h)) / Math.max(w, h)))
  return w >= h ? { width: long, height: short } : { width: short, height: long }
}

export default function SignedImage({ attachment, onView }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const size = displaySize(attachment)

  useEffect(() => {
    let alive = true
    signedMediaUrl(attachment?.path || '').then((res) => {
      if (!alive) return
      if (res.ok) setUrl(res.url)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [attachment?.path])

  if (failed) {
    return (
      <span
        data-testid="media-failed"
        className="mt-1 inline-block border border-eink-divider bg-eink-bar px-3 py-2 text-[12px] text-eink-sub"
      >
        图片加载失败
      </span>
    )
  }

  if (!url) {
    return (
      <div
        data-testid="media-loading"
        style={{ width: size.width, height: size.height }}
        className="mt-1 animate-pulse bg-eink-line/40"
      />
    )
  }

  return (
    <img
      data-testid="msg-image"
      src={url}
      alt="图片消息"
      loading="lazy"
      width={size.width}
      height={size.height}
      style={{ width: size.width, height: size.height, filter: 'grayscale(1) contrast(1.05)' }}
      className="mt-1 cursor-zoom-in border border-eink-divider object-cover"
      onClick={() => onView?.(url)}
    />
  )
}

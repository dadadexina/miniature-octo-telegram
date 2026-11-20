import { useState } from 'react'

export default function Avatar({ name = '', color = '#191919', size = 40, badge = 0, src = '' }) {
  const text = (name || '?').slice(0, 1)
  const [brokenSrc, setBrokenSrc] = useState('')

  const showImage = Boolean(src) && brokenSrc !== src
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-none text-white font-medium select-none"
        style={{ background: color, fontSize: size * 0.42 }}
      >
        {showImage ? (
          <img
            src={src}
            alt={name || '头像'}
            className="h-full w-full object-cover"
            style={{ filter: 'grayscale(1) contrast(1.05)' }}
            onError={() => setBrokenSrc(src)}
          />
        ) : (
          text
        )}
      </div>
      {badge ? (
        <span
          data-testid="unread-badge"
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#191919] px-1 text-[11px] leading-none text-white"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </div>
  )
}

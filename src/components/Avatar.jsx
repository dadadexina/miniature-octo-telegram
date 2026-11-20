export default function Avatar({ name = '', color = '#191919', size = 40, badge = 0 }) {
  const text = (name || '?').slice(0, 1)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-none text-white font-medium select-none"
        style={{ background: color, fontSize: size * 0.42 }}
      >
        {text}
      </div>
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#191919] px-1 text-[11px] leading-none text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </div>
  )
}

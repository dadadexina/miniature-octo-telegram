export default function OnlineDot({ online = false, className = '', label = '在线' }) {
  if (!online) return null
  return (
    <span
      data-testid="online-dot"
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-eink-ink ring-1 ring-eink-paper align-middle ${className}`}
    />
  )
}

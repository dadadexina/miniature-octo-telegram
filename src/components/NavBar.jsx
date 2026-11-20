export default function NavBar({ title, left, right, dark = false }) {
  return (
    <header
      className={`sticky top-0 z-20 flex h-11 shrink-0 items-center px-3 ${
        dark ? 'bg-eink-ink text-eink-paper' : 'border-b border-eink-divider bg-eink-bar text-eink-text'
      }`}
    >
      <div className="flex min-w-16 items-center justify-start">{left}</div>
      <h1 className="flex-1 truncate text-center text-[17px] font-medium">{title}</h1>
      <div className="flex min-w-16 items-center justify-end">{right}</div>
    </header>
  )
}

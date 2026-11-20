export default function AuthBar({ email, onSignOut }) {
  if (!email) return null
  return (
    <div className="flex h-8 shrink-0 items-center justify-end gap-2 bg-eink-ink px-3">
      <span className="min-w-0 truncate text-[11px] text-eink-paper/90">{email}</span>
      <button
        type="button"
        className="shrink-0 text-[11px] text-eink-paper underline underline-offset-2"
        onClick={onSignOut}
      >
        退出登录
      </button>
    </div>
  )
}

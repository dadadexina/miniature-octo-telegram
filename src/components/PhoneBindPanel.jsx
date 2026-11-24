import { useEffect, useState } from 'react'
import {
  PHONE_RESEND_SECONDS,
  maskPhoneNumber,
  profilePhoneOf,
  sendPhoneBindCode,
  verifyPhoneBindCode,
} from '../lib/phoneAuth'
import { updateProfileSettings } from '../lib/profiles'
import { useStore } from '../store'

export default function PhoneBindPanel() {
  const { authUser, currentUser, profile, setCloudProfile } = useStore()
  const userId = authUser?.id || currentUser?.id || ''
  const boundPhone = authUser?.phone || ''
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const startEditing = () => {
    setEditing(true)
    setPhone('')
    setCode('')
    setSent(false)
    setNotice('')
  }

  const cancelEditing = () => {
    setEditing(false)
    setPhone('')
    setCode('')
    setSent(false)
    setNotice('')
    setCooldown(0)
  }

  const onSendCode = async () => {
    if (busy || cooldown > 0) return
    setBusy(true)
    setNotice('')
    const result = await sendPhoneBindCode(phone)
    setBusy(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setSent(true)
    setCooldown(PHONE_RESEND_SECONDS)
    setNotice(`验证码已发送至 ${maskPhoneNumber(phone)}，请查收短信。`)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice('')
    const result = await verifyPhoneBindCode(phone, code)
    if (!result.ok) {
      setBusy(false)
      setNotice(result.error)
      return
    }
    const digits = profilePhoneOf(phone)
    const sync = await updateProfileSettings(userId, {
      phone: digits,
      allowEmailSearch: profile?.allowEmailSearch !== false,
      allowPhoneSearch: profile?.allowPhoneSearch !== false,
    })
    setBusy(false)
    if (sync.ok && sync.profile) setCloudProfile(sync.profile, true)
    setEditing(false)
    setPhone('')
    setCode('')
    setSent(false)
    setCooldown(0)
    setNotice(
      sync.ok
        ? '手机号已绑定，可用于登录和好友搜索。'
        : `手机号已验证，但资料同步失败：${sync.error || '请稍后重试'}`
    )
  }

  return (
    <div className="mx-4 mt-3 border border-eink-divider bg-eink-bar" data-testid="phone-bind-panel">
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[14px] text-eink-text">手机号</p>
          <p data-testid="phone-bind-status" className="mt-0.5 text-[12px] text-eink-sub">
            {boundPhone ? `已绑定 ${maskPhoneNumber(boundPhone)}` : '未绑定，绑定后可用短信登录'}
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            data-testid="phone-bind-start"
            className="h-8 shrink-0 border border-eink-line/40 px-3 text-[12px] text-eink-ink active:bg-eink-surface"
            onClick={startEditing}
            disabled={!userId}
          >
            {boundPhone ? '更换' : '绑定'}
          </button>
        ) : null}
      </div>

      {editing ? (
        <form className="border-t border-eink-divider px-3 py-3" onSubmit={onSubmit} data-testid="phone-bind-form">
          <input
            data-testid="phone-bind-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
            placeholder="中国大陆手机号或 +国家码号码"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value)
              setNotice('')
            }}
          />
          <div className="mt-2 flex gap-2">
            <input
              data-testid="phone-bind-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-10 min-w-0 flex-1 border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
              placeholder="6 位短信验证码"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                setNotice('')
              }}
            />
            <button
              type="button"
              data-testid="phone-bind-send"
              className="h-10 shrink-0 border border-eink-ink px-3 text-[12px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
              onClick={onSendCode}
              disabled={busy || cooldown > 0 || !phone.trim()}
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : sent ? '重新发送' : '获取验证码'}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              data-testid="phone-bind-submit"
              className="h-10 flex-1 bg-eink-ink text-[14px] text-eink-paper active:bg-eink-pressed disabled:opacity-60"
              disabled={busy || !code.trim()}
            >
              {busy ? '正在验证...' : '确认绑定'}
            </button>
            <button
              type="button"
              className="h-10 shrink-0 border border-eink-line/40 px-4 text-[13px] text-eink-sub active:bg-eink-surface"
              onClick={cancelEditing}
              disabled={busy}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <p data-testid="phone-bind-notice" className="border-t border-eink-divider px-3 py-2 text-[12px] leading-5 text-eink-sub">
          {notice}
        </p>
      ) : null}
    </div>
  )
}

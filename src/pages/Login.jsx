import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authErrorText } from '../lib/authErrors'
import {
  maskPhoneNumber,
  PHONE_RESEND_SECONDS,
  sendPhoneLoginCode,
  verifyPhoneLoginCode,
} from '../lib/phoneAuth'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Login() {
  const { loginWithSupabaseUser } = useStore()
  const navigate = useNavigate()
  const [channel, setChannel] = useState('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneSent, setPhoneSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [phoneLoading, setPhoneLoading] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const goHome = (user) => {
    loginWithSupabaseUser(user)
    navigate('/chats', { replace: true })
  }

  const clearFeedback = () => {
    setError('')
    setInfo('')
  }

  const switchChannel = (next) => {
    setChannel(next)
    clearFeedback()
  }

  const onLogin = async (e) => {
    e.preventDefault()
    clearFeedback()
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码')
      return
    }
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (authError) {
      setError(authErrorText(authError))
      return
    }
    if (data.user) goHome(data.user)
  }

  const onSignUp = async () => {
    clearFeedback()
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setLoading(false)
    if (authError) {
      setError(authErrorText(authError))
      return
    }
    if (data.session?.user) {
      goHome(data.session.user)
      return
    }
    if (data.user && !data.session) {
      setInfo('验证邮件已发送到你的邮箱，完成验证后返回本页登录。')
      return
    }
    if (data.user) {
      goHome(data.user)
      return
    }
    setError('注册未完成，请稍后重试')
  }

  const onForgot = async () => {
    clearFeedback()
    if (!email.trim()) {
      setError('请先输入你的注册邮箱')
      return
    }
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (resetError) {
      setError(authErrorText(resetError))
      return
    }
    setInfo('重置邮件已发送，请在邮箱中点击链接设置新密码')
  }

  const onSendPhoneCode = async () => {
    clearFeedback()
    if (phoneLoading || cooldown > 0) return
    setPhoneLoading(true)
    const result = await sendPhoneLoginCode(phone)
    setPhoneLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.session?.user) {
      goHome(result.session.user)
      return
    }
    setPhoneSent(true)
    setCooldown(PHONE_RESEND_SECONDS)
    setInfo(`验证码已发送至 ${maskPhoneNumber(phone)}。未注册的手机号验证后将自动创建账号。`)
  }

  const onPhoneLogin = async (e) => {
    e.preventDefault()
    clearFeedback()
    if (!phone.trim()) {
      setError('请输入手机号')
      return
    }
    if (!phoneCode.trim()) {
      setError('请输入验证码')
      return
    }
    setPhoneLoading(true)
    const result = await verifyPhoneLoginCode(phone, phoneCode)
    setPhoneLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    goHome(result.user)
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <div className="px-8 pt-16">
        <h1 className="text-[22px] font-medium text-[#191919]">登录 / 注册</h1>
        <p className="mt-2 text-[13px] text-eink-sub">使用邮箱密码或手机号验证码接入账号</p>
      </div>

      <div className="mt-6 flex gap-2 px-8" data-testid="login-channels">
        <button
          type="button"
          data-testid="login-channel-email"
          className={`h-9 flex-1 border text-[14px] ${
            channel === 'email'
              ? 'border-eink-ink bg-eink-ink text-eink-paper'
              : 'border-eink-line/30 text-eink-sub'
          }`}
          onClick={() => switchChannel('email')}
        >
          邮箱
        </button>
        <button
          type="button"
          data-testid="login-channel-phone"
          className={`h-9 flex-1 border text-[14px] ${
            channel === 'phone'
              ? 'border-eink-ink bg-eink-ink text-eink-paper'
              : 'border-eink-line/30 text-eink-sub'
          }`}
          onClick={() => switchChannel('phone')}
        >
          手机号
        </button>
      </div>

      {channel === 'email' ? (
        <form className="mt-6 flex flex-1 flex-col px-8" onSubmit={onLogin}>
          <label className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-20 text-[16px] text-[#191919]">邮箱</span>
            <input
              data-testid="login-email"
              className="flex-1 bg-transparent outline-none"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearFeedback()
              }}
            />
          </label>

          <label className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-20 text-[16px] text-[#191919]">密码</span>
            <input
              data-testid="login-password"
              className="flex-1 bg-transparent outline-none"
              type="password"
              autoComplete="current-password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearFeedback()
              }}
            />
          </label>

          {error ? <p data-testid="login-error" className="mt-4 text-[13px] leading-5 font-medium text-eink-ink">{error}</p> : null}
          {info ? <p className="mt-4 text-[13px] leading-5 text-eink-sub">{info}</p> : null}

          <button
            type="submit"
            className="mt-8 h-11 rounded-none bg-eink-ink text-[17px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
            disabled={loading}
          >
            {loading ? '请稍候...' : '登录'}
          </button>
          <button
            type="button"
            className="mt-3 h-11 rounded-none border border-eink-line/30 bg-eink-bar text-[17px] text-eink-text active:bg-[#E7E5DD] disabled:opacity-60"
            disabled={loading}
            onClick={onSignUp}
          >
            注册
          </button>
          <button
            type="button"
            className="mt-4 self-center text-[13px] text-eink-sub underline disabled:opacity-60"
            disabled={loading}
            onClick={onForgot}
          >
            忘记密码？
          </button>

          <p className="mt-8 text-center text-[12px] leading-5 text-eink-sub">
            注册即代表同意
            <Link to="/legal/terms" className="mx-1 text-eink-ink underline">用户协议</Link>
            与
            <Link to="/legal/privacy" className="mx-1 text-eink-ink underline">隐私政策</Link>
          </p>
        </form>
      ) : (
        <form className="mt-6 flex flex-1 flex-col px-8" onSubmit={onPhoneLogin}>
          <label className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-20 text-[16px] text-[#191919]">手机号</span>
            <input
              data-testid="login-phone"
              className="flex-1 bg-transparent outline-none"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="中国大陆手机号或 +国家码号码"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearFeedback()
              }}
            />
          </label>

          <div className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-20 text-[16px] text-[#191919]">验证码</span>
            <input
              data-testid="login-phone-code"
              className="min-w-0 flex-1 bg-transparent outline-none"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6 位短信验证码"
              value={phoneCode}
              onChange={(e) => {
                setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                clearFeedback()
              }}
            />
            <button
              type="button"
              data-testid="login-send-phone-code"
              className="h-8 shrink-0 border border-eink-ink px-3 text-[12px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
              onClick={onSendPhoneCode}
              disabled={phoneLoading || cooldown > 0}
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : phoneSent ? '重新发送' : '获取验证码'}
            </button>
          </div>

          {error ? <p data-testid="login-error" className="mt-4 text-[13px] leading-5 font-medium text-eink-ink">{error}</p> : null}
          {info ? <p data-testid="login-info" className="mt-4 text-[13px] leading-5 text-eink-sub">{info}</p> : null}

          <button
            type="submit"
            data-testid="login-phone-submit"
            className="mt-8 h-11 rounded-none bg-eink-ink text-[17px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
            disabled={phoneLoading}
          >
            {phoneLoading ? '请稍候...' : '登录 / 注册'}
          </button>

          <p className="mt-4 text-center text-[12px] leading-5 text-eink-sub">
            未注册手机号验证后自动创建账号；已有账号将直接登录。
          </p>
          <p className="mt-6 text-center text-[12px] leading-5 text-eink-sub">
            注册即代表同意
            <Link to="/legal/terms" className="mx-1 text-eink-ink underline">用户协议</Link>
            与
            <Link to="/legal/privacy" className="mx-1 text-eink-ink underline">隐私政策</Link>
          </p>
        </form>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authErrorText } from '../lib/authErrors'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Login() {
  const { loginWithSupabaseUser } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const goHome = (user) => {
    loginWithSupabaseUser(user)
    navigate('/chats', { replace: true })
  }

  const onLogin = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
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
    setError('')
    setInfo('')
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
      setInfo('账号已创建，但需要邮箱验证。可到 Supabase Authentication → Providers 关闭 Confirm email 后再登录。')
      return
    }
    if (data.user) {
      goHome(data.user)
      return
    }
    setError('注册未完成，请稍后重试')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <div className="px-8 pt-16">
        <h1 className="text-[22px] font-medium text-[#191919]">邮箱登录 / 注册</h1>
        <p className="mt-2 text-[13px] text-eink-sub">使用邮箱和密码接入 Supabase 账号</p>
      </div>

      <form className="mt-10 flex flex-1 flex-col px-8" onSubmit={onLogin}>
        <label className="flex items-center border-b border-eink-line/30 py-3">
          <span className="w-20 text-[16px] text-[#191919]">邮箱</span>
          <input
            className="flex-1 bg-transparent outline-none"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
              setInfo('')
            }}
          />
        </label>

        <label className="flex items-center border-b border-eink-line/30 py-3">
          <span className="w-20 text-[16px] text-[#191919]">密码</span>
          <input
            className="flex-1 bg-transparent outline-none"
            type="password"
            autoComplete="current-password"
            placeholder="至少 6 位"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
              setInfo('')
            }}
          />
        </label>

        {error ? <p className="mt-4 text-[13px] leading-5 font-medium text-eink-ink">{error}</p> : null}
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
      </form>
    </div>
  )
}

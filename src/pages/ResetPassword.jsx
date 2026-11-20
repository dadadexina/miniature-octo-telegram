import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('waiting')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hasCode = params.has('code') || params.has('access_token') || window.location.hash.includes('access_token')
    if (!hasCode) {
      setPhase('invalid')
      return undefined
    }
    let alive = true
    const timer = setTimeout(() => {
      if (alive) setPhase((prev) => (prev === 'waiting' ? 'invalid' : prev))
    }, 8000)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setPhase('ready')
      }
    })
    return () => {
      alive = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      setError(updateError.message || '设置失败，请稍后重试')
      return
    }
    await supabase.auth.signOut()
    setSaving(false)
    setPhase('done')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="重置密码" left={<Link to="/login" className="px-4 py-3 text-[15px] text-eink-sub">‹ 返回</Link>} />

      {phase === 'waiting' ? (
        <p className="p-8 text-center text-[14px] text-eink-sub">正在校验重置链接...</p>
      ) : null}

      {phase === 'invalid' ? (
        <div className="p-8 text-center">
          <p className="text-[14px] text-eink-sub">链接无效或已过期。</p>
          <Link to="/login" className="mt-4 inline-block text-[14px] underline">返回登录页重新申请</Link>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="p-8 text-center">
          <p className="text-[15px] text-eink-ink">密码已更新</p>
          <button
            type="button"
            className="mt-6 h-11 w-full bg-eink-ink text-[16px] text-eink-paper"
            onClick={() => navigate('/login', { replace: true })}
          >
            去登录
          </button>
        </div>
      ) : null}

      {phase === 'ready' ? (
        <form className="mt-6 flex flex-col px-8" onSubmit={onSubmit}>
          <label className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-24 text-[16px] text-[#191919]">新密码</span>
            <input
              className="flex-1 bg-transparent outline-none"
              type="password"
              autoComplete="new-password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
            />
          </label>
          <label className="flex items-center border-b border-eink-line/30 py-3">
            <span className="w-24 text-[16px] text-[#191919]">确认密码</span>
            <input
              className="flex-1 bg-transparent outline-none"
              type="password"
              autoComplete="new-password"
              placeholder="再输入一次"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError('')
              }}
            />
          </label>
          {error ? <p className="mt-4 text-[13px] font-medium text-eink-ink">{error}</p> : null}
          <button
            type="submit"
            className="mt-8 h-11 bg-eink-ink text-[17px] text-eink-paper disabled:bg-eink-disabled"
            disabled={saving}
          >
            {saving ? '保存中...' : '设置新密码'}
          </button>
        </form>
      ) : null}
    </div>
  )
}

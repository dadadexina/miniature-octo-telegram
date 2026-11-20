import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import { insertProfile, updateProfileNickname } from '../lib/profiles'
import { useStore } from '../store'

export default function EditProfile() {
  const navigate = useNavigate()
  const { currentUser, authUser, profile, avatarColor, applyProfileToUser, setCloudProfile, saveLocalProfile } = useStore()
  const userId = authUser?.id || currentUser?.id
  const [nickname, setNickname] = useState(profile?.nickname || currentUser?.nickname || '')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)

  if (!userId) {
    navigate('/login', { replace: true })
    return null
  }

  const username = profile?.username || currentUser?.publicId || ''

  const submit = async (e) => {
    e.preventDefault()
    const name = nickname.trim()
    if (!name) {
      setError('昵称不能为空')
      return
    }
    if (name.length > 16) {
      setError('昵称最多16个字')
      return
    }
    setError('')
    setHint('')
    setSaving(true)
    let result = await updateProfileNickname(userId, name)
    if (result.ok && !result.profile) {
      result = await insertProfile({ id: userId, nickname: name, username })
    }
    setSaving(false)
    if (result.ok && result.profile) {
      applyProfileToUser(userId, result.profile)
      setCloudProfile(result.profile, true)
      navigate('/me', { replace: true })
      return
    }
    saveLocalProfile(userId, { id: userId, nickname: name, username })
    setHint(result.error || '云端同步失败，已先保存到本地')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="编辑资料" left={<Back onClick={() => navigate('/me')} />} />
      <form className="flex flex-1 flex-col px-6" onSubmit={submit}>
        <div className="mt-6 flex items-center gap-4">
          <Avatar name={nickname.trim() || '我'} color={avatarColor(userId)} size={64} />
          <div className="min-w-0">
            <div className="truncate text-[16px]">{nickname.trim() || '未设置昵称'}</div>
            <div className="mt-1 text-[13px] text-eink-sub">ID: {username || '未设置'}</div>
          </div>
        </div>
        <label className="mt-8 flex items-center border-b border-eink-line/30 py-3">
          <span className="w-16 text-[16px]">昵称</span>
          <input
            className="flex-1 bg-transparent outline-none"
            maxLength={16}
            placeholder="怎么称呼你"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value)
              setError('')
            }}
          />
        </label>
        <p className="mt-3 text-[12px] leading-5 text-eink-sub">
          ID 创建后不支持修改，好友通过 ID 搜索添加你。
        </p>
        {error ? <p className="mt-3 text-[13px] font-medium text-eink-ink">{error}</p> : null}
        {hint ? <p className="mt-3 text-[12px] leading-5 text-eink-sub">{hint}</p> : null}
        <button
          type="submit"
          className="mt-8 h-11 rounded-none bg-eink-ink text-[16px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
          disabled={saving || nickname.trim() === (profile?.nickname || currentUser?.nickname)}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </form>
    </div>
  )
}

function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="#191919" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

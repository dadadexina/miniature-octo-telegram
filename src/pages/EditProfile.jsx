import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import { downscaleAvatar, validateAvatarFile } from '../lib/avatarImage'
import {
  insertProfile,
  updateProfileAvatar,
  updateProfileNickname,
  uploadAvatarFile,
} from '../lib/profiles'
import { useStore } from '../store'

export default function EditProfile() {
  const navigate = useNavigate()
  const { currentUser, authUser, profile, avatarColor, applyProfileToUser, setCloudProfile, saveLocalProfile } = useStore()
  const userId = authUser?.id || currentUser?.id
  const [nickname, setNickname] = useState(profile?.nickname || currentUser?.nickname || '')
  const [pendingAvatar, setPendingAvatar] = useState(null)
  const [avatarError, setAvatarError] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  if (!userId) {
    navigate('/login', { replace: true })
    return null
  }

  const username = profile?.username || currentUser?.publicId || ''
  const previewSrc = pendingAvatar?.dataUrl || profile?.avatarUrl || currentUser?.avatarUrl || ''
  const nameUnchanged = nickname.trim() === (profile?.nickname || currentUser?.nickname || '')

  const pickFile = (e) => {
    const file = e.target.files && e.target.files[0]
    if (e.target) e.target.value = ''
    if (!file) return
    const check = validateAvatarFile(file)
    if (!check.ok) {
      setAvatarError(check.error)
      return
    }
    setAvatarError('')
    downscaleAvatar(file).then((res) => {
      if (!res.ok) {
        setAvatarError(res.error || '处理图片失败')
        return
      }
      setPendingAvatar({ dataUrl: res.dataUrl, blob: res.blob, contentType: res.contentType })
    })
  }

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

    let avatarUnsaved = false
    if (pendingAvatar?.blob) {
      const up = await uploadAvatarFile(userId, pendingAvatar.blob, pendingAvatar.contentType)
      if (up.ok && up.url) {
        const res = await updateProfileAvatar(userId, up.url)
        if (!res.ok) avatarUnsaved = true
      } else {
        avatarUnsaved = true
      }
    }

    let result = await updateProfileNickname(userId, name)
    if (result.ok && !result.profile) {
      result = await insertProfile({ id: userId, nickname: name, username })
    }
    if (result.ok && result.profile) {
      applyProfileToUser(userId, result.profile)
      setCloudProfile(result.profile, true)
      setPendingAvatar(null)
      navigate('/me', { replace: true })
      return
    }
    saveLocalProfile(userId, {
      id: userId,
      nickname: name,
      username,
      avatarUrl: pendingAvatar?.dataUrl || result.profile?.avatarUrl || '',
    })
    setPendingAvatar(null)
    setHint(
      avatarUnsaved
        ? '头像未能保存到云端（可能需重新执行云初始化 SQL），已先保存到本地'
        : result.error || '云端同步失败，已先保存到本地'
    )
    setSaving(false)
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="编辑资料" left={<Back onClick={() => navigate('/me')} />} />
      <form className="flex flex-1 flex-col px-6" onSubmit={submit}>
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative shrink-0"
            aria-label="更换头像"
          >
            <Avatar name={nickname.trim() || '我'} color={avatarColor(userId)} size={64} src={previewSrc} />
            <span className="absolute -bottom-1 right-0 bg-eink-ink px-1 text-[10px] leading-4 text-eink-paper">
              换
            </span>
          </button>
          <div className="min-w-0">
            <div className="truncate text-[16px]">{nickname.trim() || '未设置昵称'}</div>
            <div className="mt-1 text-[13px] text-eink-sub">ID: {username || '未设置'}</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />
        </div>
        {avatarError ? <p className="mt-3 text-[12px] text-eink-sub">{avatarError}</p> : null}
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
          disabled={saving || (nameUnchanged && !pendingAvatar)}
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

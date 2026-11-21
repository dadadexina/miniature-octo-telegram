import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import useSwipeBack from '../hooks/useSwipeBack'
import { downscaleAvatar, validateAvatarFile } from '../lib/avatarImage'
import { goBackOr } from '../lib/navigation'
import {
  insertProfile,
  updateProfileAvatar,
  updateProfileNickname,
  updateProfileSettings,
  updatePublicId,
  uploadAvatarFile,
} from '../lib/profiles'
import { canChangePublicId, formatChangeDate, nextPublicIdChangeAt, publicIdError } from '../lib/publicId'
import { useStore } from '../store'

export default function EditProfile() {
  const navigate = useNavigate()
  const { currentUser, authUser, profile, avatarColor, applyProfileToUser, setCloudProfile, saveLocalProfile } = useStore()
  const userId = authUser?.id || currentUser?.id
  const [nickname, setNickname] = useState(profile?.nickname || currentUser?.nickname || '')
  const [idDraft, setIdDraft] = useState(profile?.username || currentUser?.publicId || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [allowEmailSearch, setAllowEmailSearch] = useState(profile?.allowEmailSearch !== false)
  const [allowPhoneSearch, setAllowPhoneSearch] = useState(profile?.allowPhoneSearch !== false)
  const [pendingAvatar, setPendingAvatar] = useState(null)
  const [avatarError, setAvatarError] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const goBack = () => goBackOr(navigate, '/me')
  useSwipeBack(goBack)

  if (!userId) {
    navigate('/login', { replace: true })
    return null
  }

  const username = profile?.username || currentUser?.publicId || ''
  const previewSrc = pendingAvatar?.dataUrl || profile?.avatarUrl || currentUser?.avatarUrl || ''
  const nameUnchanged = nickname.trim() === (profile?.nickname || currentUser?.nickname || '')
  const idChanged = idDraft.trim() !== username
  const idChangeAllowed = canChangePublicId(profile)
  const nextChangeAt = nextPublicIdChangeAt(profile)
  const settingsUnchanged =
    phone.replace(/\D/g, '') === String(profile?.phone || '') &&
    allowEmailSearch === (profile?.allowEmailSearch !== false) &&
    allowPhoneSearch === (profile?.allowPhoneSearch !== false)

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
    const idValue = idDraft.trim()
    if (idChanged) {
      const idError = publicIdError(idValue)
      if (idError) {
        setError(idError)
        return
      }
      if (!idChangeAllowed) {
        setError(`下次可修改 ID 的时间是 ${formatChangeDate(nextChangeAt)}`)
        return
      }
    }
    const digits = phone.replace(/\D/g, '')
    if (digits && !/^\d{6,20}$/.test(digits)) {
      setError('手机号需为 6-20 位数字')
      return
    }
    setError('')
    setHint('')
    setSaving(true)

    let nextProfile = profile
    let avatarUnsaved = false
    if (pendingAvatar?.blob) {
      const up = await uploadAvatarFile(userId, pendingAvatar.blob, pendingAvatar.contentType)
      if (up.ok && up.url) {
        const res = await updateProfileAvatar(userId, up.url)
        if (!res.ok) avatarUnsaved = true
        else nextProfile = res.profile || nextProfile
      } else {
        avatarUnsaved = true
      }
    }

    if (idChanged) {
      const renamed = await updatePublicId(idValue)
      if (!renamed.ok) {
        setSaving(false)
        setError(renamed.error || '修改 ID 失败')
        return
      }
      nextProfile = {
        ...(nextProfile || {}),
        username: renamed.username,
        idChangeCount: Number(renamed.changeCount || (nextProfile?.idChangeCount || 0) + 1),
        idChangedAt: new Date().toISOString(),
      }
      setHint(`ID 已更新。下次可修改时间：${formatChangeDate(renamed.nextChangeAt) || '一年后'}`)
    }

    if (!settingsUnchanged) {
      const saved = await updateProfileSettings(userId, { phone: digits, allowEmailSearch, allowPhoneSearch })
      if (!saved.ok) {
        setSaving(false)
        setError(saved.error || '保存手机号与搜索设置失败')
        return
      }
      nextProfile = { ...(nextProfile || {}), ...(saved.profile || {}) }
    }

    let result = await updateProfileNickname(userId, name)
    if (result.ok && !result.profile) {
      result = await insertProfile({ id: userId, nickname: name, username: nextProfile?.username || idValue })
    }
    if (result.ok && result.profile) {
      const merged = { ...(nextProfile || {}), ...result.profile }
      applyProfileToUser(userId, merged)
      setCloudProfile(merged, true)
      setPendingAvatar(null)
      navigate('/me', { replace: true })
      return
    }
    saveLocalProfile(userId, {
      id: userId,
      nickname: name,
      username: nextProfile?.username || idValue,
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
      <NavBar title="编辑资料" left={<Back onClick={goBack} />} />
      <form className="flex flex-1 flex-col overflow-y-auto px-6" onSubmit={submit}>
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
            <div className="mt-1 text-[13px] text-eink-sub">ID: {idDraft.trim() || '未设置'}</div>
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
        <label className="mt-4 flex items-center border-b border-eink-line/30 py-3">
          <span className="w-16 text-[16px]">唯一 ID</span>
          <input
            className="flex-1 bg-transparent outline-none"
            maxLength={15}
            placeholder="8-15 位字母和数字"
            data-testid="profile-id-input"
            value={idDraft}
            disabled={!idChangeAllowed}
            onChange={(e) => {
              setIdDraft(e.target.value.replace(/[^A-Za-z0-9]/g, ''))
              setError('')
            }}
          />
        </label>
        <p className="mt-2 text-[12px] leading-5 text-eink-sub">
          {idChangeAllowed
            ? '本次可修改一次。ID 需 8-15 位，且同时包含字母和数字。'
            : `下次可修改时间：${formatChangeDate(nextChangeAt)}（每年一次）`}
        </p>
        <label className="mt-4 flex items-center border-b border-eink-line/30 py-3">
          <span className="w-16 text-[16px]">手机号</span>
          <input
            className="flex-1 bg-transparent outline-none"
            inputMode="numeric"
            maxLength={20}
            placeholder="选填，绑定后可用手机号被搜索"
            data-testid="profile-phone-input"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^0-9]/g, ''))
              setError('')
            }}
          />
        </label>
        <div className="mt-5 space-y-3 border-y border-eink-divider py-4">
          <label className="flex items-center justify-between gap-4 text-[14px]">
            <span>允许通过邮箱搜索到我</span>
            <input
              type="checkbox"
              data-testid="allow-email-search"
              checked={allowEmailSearch}
              onChange={(e) => setAllowEmailSearch(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-[14px]">
            <span>允许通过手机号搜索到我</span>
            <input
              type="checkbox"
              data-testid="allow-phone-search"
              checked={allowPhoneSearch}
              onChange={(e) => setAllowPhoneSearch(e.target.checked)}
            />
          </label>
          <p className="text-[12px] leading-5 text-eink-sub">
            关闭后，别人用对应方式搜索会显示“未找到”。唯一 ID 始终可以被搜索。
          </p>
        </div>
        {error ? <p className="mt-3 text-[13px] font-medium text-eink-ink">{error}</p> : null}
        {hint ? <p className="mt-3 text-[12px] leading-5 text-eink-sub">{hint}</p> : null}
        <button
          type="submit"
          className="mt-6 mb-8 h-11 rounded-none bg-eink-ink text-[16px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
          disabled={saving || (nameUnchanged && !pendingAvatar && !idChanged && settingsUnchanged)}
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
        <path d="M9 1 1 9l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

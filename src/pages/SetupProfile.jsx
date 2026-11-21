import { useState } from 'react'
import { insertProfile, isUniqueViolation, usernameTaken } from '../lib/profiles'
import { isValidPublicId, publicIdError, randomPublicId } from '../lib/publicId'
import { useStore } from '../store'

export default function SetupProfile({ userId, fetchError }) {
  const { setCloudProfile, saveLocalProfile, applyProfileToUser } = useStore()
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState(() => randomPublicId())
  const [error, setError] = useState('')
  const [hint, setHint] = useState(fetchError && fetchError.includes('permission') ? '云端资料表暂无读取权限，先保存本地资料即可进入应用。' : '')
  const [loading, setLoading] = useState(false)

  const finish = (saved, synced) => {
    if (synced) setCloudProfile(saved, true)
    else saveLocalProfile(userId, saved)
  }

  const submit = async (e) => {
    e.preventDefault()
    const name = nickname.trim()
    const idValue = username.trim()
    if (!name) {
      setError('请填写昵称')
      return
    }
    const idError = publicIdError(idValue)
    if (idError) {
      setError(idError)
      return
    }
    setLoading(true)
    setError('')
    const local = { id: userId, nickname: name, username: idValue }
    const check = await usernameTaken(idValue, userId)
    if (check.ok && check.taken) {
      setLoading(false)
      setError('这个 ID 已被占用，换一个试试')
      return
    }
    const result = await insertProfile(local)
    if (!result.ok && isUniqueViolation({ message: result.error })) {
      setLoading(false)
      setUsername(randomPublicId())
      setError('这个 ID 已被占用，已为你换一个新的')
      return
    }
    setLoading(false)
    if (result.ok) {
      applyProfileToUser(userId, result.profile)
      finish(result.profile, true)
      return
    }
    finish(local, false)
    setHint(result.error || '已先保存到本地，云端写入失败时仍可进入应用')
  }

  const shuffle = () => {
    setUsername(randomPublicId())
    setError('')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <div className="px-8 pt-16">
        <h1 className="text-[22px] font-medium text-[#191919]">完善资料</h1>
        <p className="mt-2 text-[13px] text-eink-sub">
          已为你生成随机 ID。首次进入可以修改一次，之后每年可再改一次。
        </p>
      </div>
      <form className="mt-10 flex flex-1 flex-col px-8" onSubmit={submit}>
        <label className="flex items-center border-b border-eink-line/30 py-3">
          <span className="w-24 text-[16px] text-[#191919]">昵称</span>
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
          <span className="w-24 text-[16px] text-[#191919]">唯一 ID</span>
          <input
            className="flex-1 bg-transparent outline-none"
            maxLength={15}
            placeholder="8-15 位字母和数字"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.replace(/[^A-Za-z0-9]/g, ''))
              setError('')
            }}
          />
          <button
            type="button"
            onClick={shuffle}
            className="ml-2 shrink-0 border border-eink-line/40 px-2 py-1 text-[12px] text-eink-sub active:bg-eink-bar"
          >
            换一个
          </button>
        </label>
        <p className="mt-3 text-[12px] leading-5 text-eink-sub">
          好友可用这个 ID 搜索添加你。ID 需 8-15 位，且同时包含字母和数字。
          {isValidPublicId(username) ? '' : ' 当前格式不正确。'}
        </p>
        {error ? <p className="mt-4 text-[13px] font-medium text-eink-ink">{error}</p> : null}
        {hint ? <p className="mt-4 text-[12px] leading-5 text-eink-sub">{hint}</p> : null}
        <button
          type="submit"
          className="mt-8 h-11 rounded-none bg-eink-ink text-[17px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
          disabled={loading}
        >
          {loading ? '保存中...' : '保存并进入'}
        </button>
      </form>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import { fetchProfileById } from '../lib/profiles'
import { useStore } from '../store'

export default function FriendProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { getUser, avatarColor } = useStore()
  const cached = getUser(userId)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchProfileById(userId).then((res) => {
      if (!alive) return
      setLoading(false)
      if (res.ok && res.profile) {
        setProfile(res.profile)
        return
      }
      setError(res.error || '读取资料失败')
    })
    return () => {
      alive = false
    }
  }, [userId])

  const info = profile
    ? { nickname: profile.nickname, publicId: profile.username, avatarUrl: profile.avatarUrl || '' }
    : cached
      ? { nickname: cached.nickname, publicId: cached.publicId || cached.username || '', avatarUrl: cached.avatarUrl || '' }
      : null

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/contacts')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="个人资料" left={<Back onClick={goBack} />} />

      {info ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar">
          <div className="flex flex-col items-center px-6 pb-2 pt-10">
            <Avatar name={info.nickname} color={avatarColor(userId)} size={88} src={info.avatarUrl} />
            <h2 data-testid="friend-nickname" className="mt-4 text-center text-[22px] font-medium text-[#191919]">
              {info.nickname || '用户'}
            </h2>
            <p data-testid="friend-id" className="mt-1.5 text-center text-[13px] text-eink-faint">
              ID: {info.publicId || '未设置'}
            </p>
          </div>

          <div className="mt-8 border-y border-eink-divider bg-eink-paper">
            <button
              type="button"
              data-testid="friend-moments-entry"
              className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-[#E7E5DD]"
              onClick={() => navigate(`/friend/${userId}/moments`)}
            >
              <span className="text-[15px] text-[#191919]">朋友圈</span>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
                <path d="M1 1l6 6-6 6" stroke="#9A9A94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {loading ? <p className="mt-3 text-center text-[12px] text-eink-faint">正在同步最新资料...</p> : null}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-[14px] text-eink-sub">正在读取资料...</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-[14px] text-eink-sub">无法读取该用户的资料</p>
          {error ? <p className="text-[12px] text-eink-faint">{error}</p> : null}
        </div>
      )}

      <div className="shrink-0 border-t border-eink-divider bg-eink-bar p-4 safe-bottom">
        <button
          type="button"
          data-testid="send-message-btn"
          disabled={!userId}
          className="h-12 w-full rounded-none bg-[#07C160] text-[16px] font-medium text-white active:brightness-95 disabled:bg-eink-disabled"
          onClick={() => navigate(`/chat/${userId}`)}
        >
          发送信息
        </button>
      </div>
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

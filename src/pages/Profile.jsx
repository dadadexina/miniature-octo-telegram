import { Link, useNavigate } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Profile() {
  const navigate = useNavigate()
  const { currentUser, avatarColor, logout, profile, profileSynced, authUser } = useStore()

  if (!currentUser) {
    navigate('/login', { replace: true })
    return null
  }

  const onSignOut = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  const nickname = profile?.nickname || currentUser.nickname
  const username = profile?.username || ''
  const email = authUser?.email || currentUser.email || ''

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <AuthBar email={email} onSignOut={onSignOut} />
      <NavBar title="我的" />
      <div className="mt-3 border-y border-eink-divider bg-eink-bar">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[16px]">头像</span>
          <Avatar name={nickname} color={avatarColor(currentUser.id)} size={64} />
        </div>
        <div className="flex items-center justify-between border-t border-eink-divider px-4 py-4">
          <span className="text-[16px]">昵称</span>
          <span className="text-[16px] text-eink-sub">{nickname}</span>
        </div>
        <div className="flex items-center justify-between border-t border-eink-divider px-4 py-4">
          <span className="text-[16px]">ID</span>
          <span className="text-[14px] text-eink-sub">{username}</span>
        </div>
        <div className="flex items-center justify-between border-t border-eink-divider px-4 py-4">
          <span className="text-[16px]">邮箱</span>
          <span className="max-w-[60%] truncate text-[14px] text-eink-sub">{email}</span>
        </div>
        <Link
          to="/profile/edit"
          className="flex items-center justify-between border-t border-eink-divider px-4 py-4 active:bg-[#E7E5DD]"
        >
          <span className="text-[16px]">编辑资料</span>
          <span className="text-eink-faint">›</span>
        </Link>
      </div>
      {!profileSynced ? (
        <p className="px-4 py-3 text-[12px] leading-5 text-eink-sub">资料暂存在本地。跑完下面 SQL 后再保存一次就会同步到云端。</p>
      ) : null}
      <CopySql />
      <button
        type="button"
        className="mt-8 h-12 bg-eink-ink text-[16px] text-eink-paper"
        onClick={onSignOut}
      >
        退出登录
      </button>
    </div>
  )
}

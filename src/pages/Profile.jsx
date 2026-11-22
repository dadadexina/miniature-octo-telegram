import { Link, Navigate, useNavigate } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import { formatRegistrationDate, genderLabel } from '../lib/profileMeta'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Profile() {
  const navigate = useNavigate()
  const { currentUser, avatarColor, logout, profile, profileSynced, authUser } = useStore()

  if (!currentUser) {
    return <Navigate to="/login" replace />
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
    <div className="flex h-full flex-col overflow-y-auto bg-eink-paper">
      <AuthBar email={email} onSignOut={onSignOut} />
      <NavBar title="我的" />
      <div className="mt-3 border-y border-eink-divider bg-eink-bar">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[16px]">头像</span>
          <Avatar name={nickname} color={avatarColor(currentUser.id)} size={64} src={profile?.avatarUrl || currentUser.avatarUrl || ''} />
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
          <span className="text-[16px]">性别</span>
          <span data-testid="my-gender" className="text-[14px] text-eink-sub">{genderLabel(profile?.gender)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-eink-divider px-4 py-4">
          <span className="text-[16px]">注册日期</span>
          <span data-testid="my-created-at" className="text-[14px] text-eink-sub">
            {formatRegistrationDate(profile?.createdAt || currentUser.createdAt) || '未知'}
          </span>
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
        <Link
          to="/settings"
          className="flex items-center justify-between border-t border-eink-divider px-4 py-4 active:bg-[#E7E5DD]"
        >
          <span className="text-[16px]">设置</span>
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

      <div className="mt-8 px-4 pb-10">
        <p className="text-[11px] leading-5 text-eink-sub">
          继续使用即代表同意
          <Link to="/legal/terms" className="mx-1 underline">用户协议</Link>
          与
          <Link to="/legal/privacy" className="mx-1 underline">隐私政策</Link>
        </p>
      </div>
    </div>
  )
}

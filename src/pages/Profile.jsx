import { useState } from 'react'
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteHint, setDeleteHint] = useState('')

  if (!currentUser) {
    navigate('/login', { replace: true })
    return null
  }

  const onSignOut = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  const onDeleteAccount = async () => {
    setDeleting(true)
    setDeleteHint('')
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error || (data && data.error)) {
      setDeleting(false)
      setDeleteHint(error?.message || data?.error || '注销失败，请稍后重试')
      return
    }
    try {
      localStorage.removeItem('wechat-chat-app-v3')
      Object.keys(localStorage)
        .filter((key) => key.startsWith('wechat-chat-app-v3:'))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      // 本地存储不可用时忽略，云端账号已删除
    }
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

      <div className="mt-12 px-4 pb-10">
        <h2 className="text-[15px] font-medium text-eink-ink">注销账号</h2>
        <p className="mt-2 text-[12px] leading-5 text-eink-sub">
          永久删除你在云端的资料、好友关系与全部聊天记录，此操作不可恢复。
        </p>
        {confirmDelete ? (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="h-10 flex-1 bg-eink-ink text-[14px] text-eink-paper disabled:bg-eink-disabled"
              disabled={deleting}
              onClick={onDeleteAccount}
            >
              {deleting ? '注销中...' : '确认注销'}
            </button>
            <button
              type="button"
              className="h-10 flex-1 border border-eink-line/40 text-[14px] text-eink-sub disabled:opacity-60"
              disabled={deleting}
              onClick={() => {
                setConfirmDelete(false)
                setDeleteHint('')
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mt-4 h-10 w-full border border-eink-line/40 text-[14px] text-eink-ink"
            onClick={() => setConfirmDelete(true)}
          >
            注销账号
          </button>
        )}
        {deleteHint ? <p className="mt-3 text-[12px] leading-5 text-eink-sub">{deleteHint}</p> : null}
        <p className="mt-6 text-[11px] leading-5 text-eink-sub">
          继续使用即代表同意
          <Link to="/legal/terms" className="mx-1 underline">用户协议</Link>
          与
          <Link to="/legal/privacy" className="mx-1 underline">隐私政策</Link>
        </p>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import { formatRegistrationDate, genderLabel } from '../lib/profileMeta'
import { fetchProfilesByIds } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Profile() {
  const navigate = useNavigate()
  const { currentUser, avatarColor, logout, purgeAccount, profile, profileSynced, authUser, blockedIds, setBlockedFor } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteHint, setDeleteHint] = useState('')
  const [blockedProfiles, setBlockedProfiles] = useState(null)

  // 黑名单展示名:拉取被拉黑用户的公开资料(失败时降级为 id);列表为空时不渲染,无需重置缓存
  useEffect(() => {
    if (blockedIds.length === 0) return undefined
    let cancelled = false
    fetchProfilesByIds(blockedIds).then((res) => {
      if (!cancelled && res?.ok) setBlockedProfiles(res.profiles || [])
    })
    return () => {
      cancelled = true
    }
  }, [blockedIds])

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
      await supabase.auth.signOut()
    } catch {
      // 账号已在服务端删除,本地会话失效属预期
    }
    // 清空内存状态与全部本地缓存,保证同邮箱重新注册时是全新空白账号
    purgeAccount()
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

      <div className="mt-12 px-4" data-testid="blacklist-section">
        <h2 className="text-[15px] font-medium text-eink-ink">黑名单</h2>
        <p className="mt-2 text-[12px] leading-5 text-eink-sub">
          拉黑后对方无法给你发消息或查看/参与你的公开内容。可在对方聊天页右上角菜单中拉黑或解除。
        </p>
        {blockedIds.length === 0 ? (
          <p className="mt-3 text-[12px] text-eink-sub" data-testid="blacklist-empty">暂无拉黑的用户。</p>
        ) : (
          <ul className="mt-3 divide-y divide-eink-divider/60 border border-eink-line/30 bg-eink-paper" data-testid="blacklist">
            {blockedIds.map((id) => {
              const info = blockedProfiles?.find((p) => p.id === id)
              return (
                <li key={id} className="flex items-center justify-between px-4 py-3" data-testid="blacklist-item">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={info?.nickname || '?'} color={avatarColor(id)} size={40} src={info?.avatarUrl || ''} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium" data-testid="blacklist-nickname">{info?.nickname || id.slice(0, 8)}</p>
                      {info?.username ? <p className="truncate text-[11px] text-eink-sub">{info.username}</p> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 shrink-0 border border-eink-line/40 px-3 text-[12px] text-eink-ink"
                    onClick={() => setBlockedFor(id, false)}
                  >
                    移除
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

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

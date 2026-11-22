import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cancelAccountDeletion,
  finalizeAccountDeletion,
  formatDeletionDate,
  isDeletionDue,
} from '../lib/accountDeletion'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function PendingDeletionGate() {
  const { currentUser, profile, purgeAccount, logout, setCloudProfile } = useStore()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const finalizedRef = useRef(false)
  const deletedAt = profile?.deletedAt || ''
  const due = Boolean(deletedAt) && isDeletionDue(deletedAt)

  useEffect(() => {
    if (!due || finalizedRef.current) return
    finalizedRef.current = true
    finalizeAccountDeletion().then((result) => {
      if (result.ok) {
        purgeAccount()
        logout()
        navigate('/login', { replace: true })
        return
      }
      setError(result.error || '注销失败')
    })
  }, [due, navigate, purgeAccount, logout])

  if (!currentUser || !deletedAt) return null

  const onCancel = async () => {
    setBusy(true)
    setError('')
    const result = await cancelAccountDeletion(currentUser.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error || '撤销失败，请稍后重试')
      return
    }
    setCloudProfile(profile ? { ...profile, deletedAt: '' } : profile)
  }

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // 本地会话失效也直接回登录页
    }
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-8">
      <div
        className="w-full max-w-[320px] border border-eink-divider bg-eink-paper px-5 pb-4 pt-5 text-center"
        role="dialog"
        aria-modal="true"
        data-testid="pending-deletion-gate"
      >
        <p className="text-[17px] font-medium text-eink-ink">账号注销申请中</p>
        {due ? (
          <p className="mt-2 text-[14px] leading-6 text-eink-text">
            宽限期已结束，正在删除账号，请稍候。
          </p>
        ) : (
          <p className="mt-2 text-[14px] leading-6 text-eink-text">
            账号将在 {formatDeletionDate(deletedAt)} 自动删除。继续使用将撤销注销。
          </p>
        )}
        {error ? <p className="mt-2 text-[13px] text-[#8C2F22]">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          {due ? (
            <button
              type="button"
              className="h-10 border border-eink-divider text-[14px] text-eink-sub"
              onClick={onSignOut}
            >
              退出登录
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid="cancel-deletion"
                className="h-10 bg-eink-ink text-[14px] text-eink-paper disabled:opacity-60"
                onClick={onCancel}
                disabled={busy}
              >
                {busy ? '正在撤销...' : '撤销注销并继续使用'}
              </button>
              <button
                type="button"
                className="h-10 border border-eink-divider text-[14px] text-eink-sub"
                onClick={onSignOut}
                disabled={busy}
              >
                退出登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

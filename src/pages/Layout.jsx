import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import TabBar from '../components/TabBar'
import useNotificationDigest from '../hooks/useNotificationDigest'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Layout() {
  const { currentUser, logout, offline } = useStore()
  const navigate = useNavigate()
  useNotificationDigest(currentUser?.id)
  if (!currentUser) return <Navigate to="/login" replace />

  const onSignOut = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <AuthBar email={currentUser.email} onSignOut={onSignOut} />
      {offline ? (
        <div data-testid="offline-banner" className="shrink-0 bg-eink-ink py-1 text-center text-[12px] text-eink-paper">
          网络已断开，恢复后将自动同步
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

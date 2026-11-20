import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import TabBar from '../components/TabBar'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export default function Layout() {
  const { currentUser, logout } = useStore()
  const navigate = useNavigate()
  if (!currentUser) return <Navigate to="/login" replace />

  const onSignOut = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <AuthBar email={currentUser.email} onSignOut={onSignOut} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

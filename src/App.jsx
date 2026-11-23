import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store'
import CallProvider from './components/CallProvider'
import Layout from './pages/Layout'
import Chats from './pages/Chats'
import ProfileGate from './pages/ProfileGate'
import useRoutePreload from './hooks/useRoutePreload'
import { isRecoveryCallback } from './lib/recovery'

const Login = lazy(() => import('./pages/Login'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Discover = lazy(() => import('./pages/Discover'))
const ChatDetail = lazy(() => import('./pages/ChatDetail'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const FriendProfile = lazy(() => import('./pages/FriendProfile'))
const FriendMoments = lazy(() => import('./pages/FriendMoments'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Legal = lazy(() => import('./pages/Legal'))

function Guard() {
  const { currentUser, authReady } = useStore()
  if (!authReady) return <BootScreen />
  if (!currentUser) return <Navigate to="/login" replace />
  return (
    <ProfileGate>
      <Suspense fallback={<PageScreen />}>
        <Outlet />
      </Suspense>
    </ProfileGate>
  )
}

function BootScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-eink-paper text-[14px] text-eink-sub">
      加载中...
    </div>
  )
}

function PageScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-eink-paper text-[14px] text-eink-sub">
      加载中...
    </div>
  )
}

function RecoveryRedirect() {
  const location = useLocation()
  if (location.pathname !== '/reset-password' && isRecoveryCallback(location)) {
    return (
      <Navigate
        to={{ pathname: '/reset-password', search: location.search, hash: location.hash }}
        replace
      />
    )
  }
  return null
}

export default function App() {
  const { currentUser, authReady } = useStore()
  useRoutePreload(Boolean(authReady && currentUser))

  return (
    <div className="mx-auto h-full max-w-md overflow-hidden border-x border-eink-divider bg-eink-paper">
      <RecoveryRedirect />
      <CallProvider>
        <Suspense fallback={<BootScreen />}>
          <Routes>
            <Route
              path="/login"
              element={!authReady ? <BootScreen /> : currentUser ? <Navigate to="/chats" replace /> : <Login />}
            />
            <Route element={<Guard />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/chats" replace />} />
                <Route path="/chats" element={<Chats />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/me" element={<Profile />} />
              </Route>
              <Route path="/chat/:peerId" element={<ChatDetail />} />
              <Route path="/friend/:userId" element={<FriendProfile />} />
              <Route path="/friend/:userId/moments" element={<FriendMoments />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/legal/terms" element={<Legal kind="terms" />} />
            <Route path="/legal/privacy" element={<Legal kind="privacy" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </CallProvider>
    </div>
  )
}

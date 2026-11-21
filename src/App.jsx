import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
import CallProvider from './components/CallProvider'
import Layout from './pages/Layout'
import Chats from './pages/Chats'
import ProfileGate from './pages/ProfileGate'

const Login = lazy(() => import('./pages/Login'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Discover = lazy(() => import('./pages/Discover'))
const ChatDetail = lazy(() => import('./pages/ChatDetail'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const FriendProfile = lazy(() => import('./pages/FriendProfile'))
const FriendMoments = lazy(() => import('./pages/FriendMoments'))
const Profile = lazy(() => import('./pages/Profile'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Legal = lazy(() => import('./pages/Legal'))

function Guard({ children }) {
  const { currentUser, authReady } = useStore()
  if (!authReady) return <BootScreen />
  if (!currentUser) return <Navigate to="/login" replace />
  return <ProfileGate>{children}</ProfileGate>
}

function BootScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-eink-paper text-[14px] text-eink-sub">
      加载中...
    </div>
  )
}

export default function App() {
  const { currentUser, authReady } = useStore()

  return (
    <div className="mx-auto h-full max-w-md overflow-hidden border-x border-eink-divider bg-eink-paper">
      <CallProvider>
        <Suspense fallback={<BootScreen />}>
          <Routes>
            <Route
              path="/login"
              element={!authReady ? <BootScreen /> : currentUser ? <Navigate to="/chats" replace /> : <Login />}
            />
            <Route
              path="/"
              element={
                <Guard>
                  <Layout />
                </Guard>
              }
            >
              <Route index element={<Navigate to="/chats" replace />} />
              <Route path="chats" element={<Chats />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="discover" element={<Discover />} />
              <Route path="me" element={<Profile />} />
            </Route>
            <Route
              path="/chat/:peerId"
              element={
                <Guard>
                  <ChatDetail />
                </Guard>
              }
            />
            <Route
              path="/friend/:userId"
              element={
                <Guard>
                  <FriendProfile />
                </Guard>
              }
            />
            <Route
              path="/friend/:userId/moments"
              element={
                <Guard>
                  <FriendMoments />
                </Guard>
              }
            />
            <Route
              path="/profile/edit"
              element={
                <Guard>
                  <EditProfile />
                </Guard>
              }
            />
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

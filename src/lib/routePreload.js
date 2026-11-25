const ROUTE_LOADERS = {
  login: () => import('../pages/Login'),
  contacts: () => import('../pages/Contacts'),
  me: () => import('../pages/Profile'),
  chat: () => import('../pages/ChatDetail'),
  friend: () => import('../pages/FriendProfile'),
  friendMoments: () => import('../pages/FriendMoments'),
  editProfile: () => import('../pages/EditProfile'),
  settings: () => import('../pages/Settings'),
  resetPassword: () => import('../pages/ResetPassword'),
  legal: () => import('../pages/Legal'),
}

const CORE_KEYS = ['contacts', 'me', 'chat']

const started = new Set()

export function resolveRouteKey(pathname = '') {
  const path = String(pathname).split('?')[0].split('#')[0]
  if (path === '/' || path === '/chats') return 'chats'
  if (path === '/contacts') return 'contacts'
  if (path === '/me') return 'me'
  if (path === '/login') return 'login'
  if (path === '/settings') return 'settings'
  if (path === '/profile/edit') return 'editProfile'
  if (path === '/reset-password') return 'resetPassword'
  if (path.startsWith('/legal/')) return 'legal'
  if (path.startsWith('/chat/')) return 'chat'
  if (/^\/friend\/[^/]+\/moments\/?$/.test(path)) return 'friendMoments'
  if (/^\/friend\/[^/]+\/?$/.test(path)) return 'friend'
  return null
}

export function preloadRoute(pathname) {
  const key = resolveRouteKey(pathname)
  if (!key || !ROUTE_LOADERS[key] || started.has(key)) return
  started.add(key)
  ROUTE_LOADERS[key]().catch(() => {
    started.delete(key)
  })
}

export function preloadCoreRoutes() {
  CORE_KEYS.forEach((key) => {
    if (!ROUTE_LOADERS[key] || started.has(key)) return
    started.add(key)
    ROUTE_LOADERS[key]().catch(() => {
      started.delete(key)
    })
  })
}

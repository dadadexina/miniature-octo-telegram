import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { deleteFriend, fetchFriends, upsertFriend } from './lib/friends'
import { involvesUser, isPairMessage, isUuid, mapMessage, mergeMessages, peerIdOf } from './lib/messages'
import { fetchProfilesByIds } from './lib/profiles'
import { supabase } from './lib/supabase'

const STORAGE_KEY = 'wechat-chat-app-v3'
const VERIFY_CODE = '1234'

const AVATAR_COLORS = [
  '#1A1A1A',
  '#4A4A4A',
  '#2F2F2F',
  '#5C5C5C',
  '#3A3A3A',
  '#6E6E6E',
  '#252525',
  '#515151',
]

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function now() {
  return Date.now()
}

function avatarColor(id = '') {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function seedDemoUsers() {
  return [
    { id: 'u_demo_xiaoming', publicId: '12345', phone: '13800000001', password: '1234', nickname: '小明', createdAt: now() - 86400000 * 8 },
    { id: 'u_demo_xiaohong', publicId: '23456', phone: '13800000002', password: '1234', nickname: '小红', createdAt: now() - 86400000 * 7 },
    { id: 'u_demo_laowang', publicId: '34567', phone: '13800000003', password: '1234', nickname: '老王', createdAt: now() - 86400000 * 6 },
    { id: 'u_demo_xiaoli', publicId: '45678', phone: '13800000004', password: '1234', nickname: '小李', createdAt: now() - 86400000 * 5 },
  ]
}

function withPublicId(user, fallback = '88888') {
  if (user?.publicId) return user
  const demo = seedDemoUsers().find((d) => d.id === user.id)
  return { ...user, publicId: demo?.publicId || fallback }
}

function emptyState() {
  return {
    users: seedDemoUsers(),
    currentUserId: null,
    localProfiles: {},
    friendships: [],
    messages: [],
    moments: [
      {
        id: 'm_seed_1',
        userId: 'u_demo_xiaoming',
        text: '今天天气真好，出去走走，路边的花都开了。',
        images: 4,
        time: now() - 10 * 60 * 1000,
      },
      {
        id: 'm_seed_2',
        userId: 'u_demo_xiaohong',
        text: '周末做了顿晚饭，味道还不错。',
        images: 1,
        time: now() - 2 * 60 * 60 * 1000,
      },
      {
        id: 'm_seed_3',
        userId: 'u_demo_laowang',
        text: '出差路过老街，随手拍了几张。',
        images: 9,
        time: now() - 26 * 60 * 60 * 1000,
      },
    ],
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    const merged = { ...emptyState(), ...parsed }
    const users = (merged.users || []).map((u) => withPublicId(u))
    seedDemoUsers().forEach((demo) => {
      if (!users.some((u) => u.id === demo.id || u.publicId === demo.publicId)) users.push(demo)
    })
    return { ...merged, users, localProfiles: merged.localProfiles || {}, currentUserId: null }
  } catch {
    return emptyState()
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const UNREAD_KEY = 'wechat-chat-app-v3:unread:'

function loadUnread(meId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(UNREAD_KEY + meId) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveUnread(meId, value) {
  try {
    localStorage.setItem(UNREAD_KEY + meId, JSON.stringify(value || {}))
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

function pairKey(a, b) {
  return [a, b].sort().join('__')
}

function applyAuthUser(prev, authUser) {
  const email = authUser.email || ''
  const exist = prev.users.find((u) => u.id === authUser.id || (email && u.email === email))
  if (exist) {
    const user = { ...withPublicId(exist, exist.publicId || '88888'), email, id: authUser.id }
    return {
      ...prev,
      currentUserId: authUser.id,
      users: prev.users.map((u) => (u.id === exist.id ? user : u)),
    }
  }
  const taken = new Set(prev.users.map((u) => u.publicId).filter(Boolean))
  const user = {
    id: authUser.id,
    publicId: taken.has('88888') ? String(80000 + (prev.users.length % 9999)) : '88888',
    email,
    phone: '',
    nickname: email.split('@')[0] || '新用户',
    createdAt: now(),
  }
  return { ...prev, users: [...prev.users, user], currentUserId: user.id }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadState)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileSynced, setProfileSynced] = useState(false)
  const [inbox, setInbox] = useState([])
  const [unread, setUnread] = useState({})
  const [activePeerId, setActivePeerId] = useState(null)
  const authUserRef = useRef(null)
  const activePeerRef = useRef(null)
  const inboxIdsRef = useRef(new Set())
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!authUser?.id) return
    saveUnread(authUser.id, unread)
  }, [authUser?.id, unread])

  useEffect(() => {
    authUserRef.current = authUser
  }, [authUser])

  useEffect(() => {
    activePeerRef.current = activePeerId
  }, [activePeerId])

  const ingestCloudMessage = useCallback((incoming) => {
    const msg = incoming?.raw ? incoming : mapMessage(incoming)
    const me = authUserRef.current?.id
    if (!msg?.id || !involvesUser(msg, me)) return
    if (inboxIdsRef.current.has(msg.id)) return
    inboxIdsRef.current.add(msg.id)
    setInbox((prev) => mergeMessages(prev, [msg]))
    const peer = peerIdOf(msg, me)
    if (msg.fromId !== me && peer && peer !== activePeerRef.current) {
      setUnread((prev) => ({ ...prev, [peer]: (prev[peer] || 0) + 1 }))
    }
  }, [])

  const mergeInbox = useCallback((list) => {
    const incoming = list || []
    incoming.forEach((msg) => {
      if (msg?.id) inboxIdsRef.current.add(msg.id)
    })
    setInbox((prev) => mergeMessages(prev, incoming))
  }, [])

  const replaceInbox = useCallback((list) => {
    const next = mergeMessages([], list || [])
    inboxIdsRef.current = new Set(next.map((msg) => msg.id))
    setInbox(next)
  }, [])

  const openPeer = useCallback((peerId) => {
    setActivePeerId(peerId || null)
    if (peerId) {
      setUnread((prev) => {
        if (!prev[peerId]) return prev
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    }
  }, [])

  const syncFriendToCloud = useCallback((meId, friendId) => {
    if (!isUuid(meId) || !isUuid(friendId)) return
    upsertFriend(meId, friendId)
  }, [])

  useEffect(() => {
    const me = authUser?.id
    if (!me || !isUuid(me)) return undefined
    let alive = true
    const sync = async () => {
      const result = await fetchFriends(me)
      if (!alive || !result.ok) return
      const prev = stateRef.current
      const localIds = new Set(
        prev.friendships.filter((f) => f.userId === me && isUuid(f.friendId)).map((f) => f.friendId)
      )
      const cloudIds = [
        ...new Set(result.friends.map((f) => f.friendId).filter((id) => id && id !== me)),
      ]
      const newIds = cloudIds.filter((id) => !localIds.has(id))
      const profilesResult = newIds.length
        ? await fetchProfilesByIds(newIds)
        : { ok: true, profiles: [] }
      if (!alive) return
      const backfill = [...localIds].filter((id) => !cloudIds.includes(id))
      backfill.forEach((id) => upsertFriend(me, id))
      if (!newIds.length) return
      setState((p) => {
        const users = [...p.users]
        const known = new Set(users.map((u) => u.id))
        newIds.forEach((id) => {
          if (known.has(id)) return
          users.push({ id, nickname: '用户', publicId: '', email: '', phone: '', createdAt: now() })
        })
        ;(profilesResult.profiles || []).forEach((prof) => {
          if (!prof?.id) return
          const idx = users.findIndex((u) => u.id === prof.id)
          if (idx >= 0) {
            users[idx] = {
              ...users[idx],
              nickname: prof.nickname || users[idx].nickname,
              publicId: prof.username || users[idx].publicId,
              avatarUrl: prof.avatarUrl || users[idx].avatarUrl || '',
            }
          }
        })
        const exists = new Set(p.friendships.filter((f) => f.userId === me).map((f) => f.friendId))
        const pairs = []
        newIds.forEach((id) => {
          if (exists.has(id)) return
          pairs.push({ userId: me, friendId: id }, { userId: id, friendId: me })
        })
        return { ...p, users, friendships: [...p.friendships, ...pairs] }
      })
    }
    sync()
    return () => {
      alive = false
    }
  }, [authUser?.id])

  useEffect(() => {
    if (!authUser?.id || !isUuid(authUser.id)) {
      inboxIdsRef.current = new Set()
      setInbox([])
      setUnread({})
      setActivePeerId(null)
      return undefined
    }
    const channel = supabase
      .channel(`messages-insert:${authUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          ingestCloudMessage(payload.new)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [authUser?.id, ingestCloudMessage])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error || !data.session?.user) {
        setAuthUser(null)
        setProfile(null)
        setProfileReady(true)
        setProfileSynced(false)
        inboxIdsRef.current = new Set()
        setInbox([])
        setUnread({})
      } else {
        setAuthUser(data.session.user)
        setUnread(loadUnread(data.session.user.id))
        setState((prev) => applyAuthUser(prev, data.session.user))
      }
      setAuthReady(true)
    }).catch(() => {
      if (!alive) return
      setAuthUser(null)
      setProfile(null)
      setProfileReady(true)
      setProfileSynced(false)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'SIGNED_OUT' || !session?.user) {
        setAuthUser(null)
        setProfile(null)
        setProfileReady(true)
        setProfileSynced(false)
        inboxIdsRef.current = new Set()
        setInbox([])
        setUnread({})
        setActivePeerId(null)
        setState((prev) => ({ ...prev, currentUserId: null }))
        return
      }
      if (event === 'INITIAL_SESSION') return
      setAuthUser(session.user)
      setUnread(loadUnread(session.user.id))
      setState((prev) => applyAuthUser(prev, session.user))
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) || null,
    [state.users, state.currentUserId]
  )

  const setCloudProfile = useCallback((next, synced = true) => {
    setProfile(next)
    setProfileReady(true)
    setProfileSynced(Boolean(next) && synced)
  }, [])

  const api = useMemo(() => {
    const patch = (updater) => setState((prev) => updater(prev))

    const getUser = (id) => state.users.find((u) => u.id === id)

    const friendsOf = (userId) => {
      const ids = state.friendships
        .filter((f) => f.userId === userId)
        .map((f) => f.friendId)
      return state.users.filter((u) => ids.includes(u.id))
    }

    const isFriend = (userId, friendId) =>
      state.friendships.some((f) => f.userId === userId && f.friendId === friendId)

    const lastMessageOf = (userId, peerId) => {
      const key = pairKey(userId, peerId)
      const list = state.messages.filter((m) => m.pair === key)
      return list[list.length - 1] || null
    }

    return {
      state,
      currentUser,
      authReady,
      authUser,
      profile,
      profileReady,
      profileSynced,
      inbox,
      unread,
      activePeerId,
      ingestCloudMessage,
      mergeInbox,
      replaceInbox,
      openPeer,
      unreadOf(peerId) {
        return unread[peerId] || 0
      },
      unreadTotal() {
        return Object.values(unread).reduce((sum, n) => sum + (Number(n) || 0), 0)
      },
      setCloudProfile,
      applyProfileToUser(userId, next) {
        if (!userId || !next) return
        patch((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  nickname: next.nickname || u.nickname,
                  publicId: next.username || u.publicId,
                  avatarUrl: next.avatarUrl || u.avatarUrl || '',
                }
              : u
          ),
        }))
      },
      saveLocalProfile(userId, next) {
        setState((prev) => ({
          ...prev,
          localProfiles: { ...(prev.localProfiles || {}), [userId]: next },
          users: prev.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  nickname: next.nickname || u.nickname,
                  publicId: next.username || u.publicId,
                  avatarUrl: next.avatarUrl || u.avatarUrl || '',
                }
              : u
          ),
        }))
        setCloudProfile(next, false)
      },
      localProfileOf(userId) {
        return state.localProfiles?.[userId] || null
      },
      upsertUsers(list) {
        if (!list?.length) return
        patch((prev) => {
          const users = [...prev.users]
          list.forEach((incoming) => {
            if (!incoming?.id) return
            const idx = users.findIndex((u) => u.id === incoming.id)
            const next = {
              id: incoming.id,
              nickname: incoming.nickname || '用户',
              publicId: incoming.publicId || incoming.username || '',
              avatarUrl: incoming.avatarUrl || incoming.avatar_url || '',
              email: incoming.email || '',
              phone: incoming.phone || '',
              createdAt: incoming.createdAt || now(),
            }
            if (idx >= 0) {
              users[idx] = {
                ...users[idx],
                nickname: next.nickname || users[idx].nickname,
                publicId: next.publicId || users[idx].publicId,
                avatarUrl: next.avatarUrl || users[idx].avatarUrl || '',
                email: next.email || users[idx].email,
              }
            } else {
              users.push(next)
            }
          })
          return { ...prev, users }
        })
      },
      verifyCode: VERIFY_CODE,
      getUser,
      friendsOf,
      isFriend,
      lastMessageOf,
      avatarColor,
      suggestedUsers() {
        const me = state.currentUserId
        return seedDemoUsers().filter((u) => u.id !== me && !isFriend(me, u.id))
      },

        loginWithSupabaseUser(authUser) {
          if (!authUser?.id) return { ok: false }
          const email = authUser.email || ''
          const exist = state.users.find((u) => u.id === authUser.id || u.email === email)
          if (exist) {
            const user = {
              ...withPublicId(exist, exist.publicId || '88888'),
              email,
              id: authUser.id,
            }
            patch((prev) => ({
              ...prev,
              currentUserId: authUser.id,
              users: prev.users.map((u) => (u.id === exist.id ? { ...user, id: authUser.id } : u)),
            }))
            return { ok: true, user }
          }
          const taken = new Set(state.users.map((u) => u.publicId).filter(Boolean))
          const user = {
            id: authUser.id,
            publicId: taken.has('88888') ? String(80000 + (state.users.length % 9999)) : '88888',
            email,
            phone: '',
            nickname: email.split('@')[0] || '新用户',
            createdAt: now(),
          }
          patch((prev) => ({
            ...prev,
            users: [...prev.users, user],
            currentUserId: user.id,
          }))
          return { ok: true, user, isNew: true }
        },

      logout() {
        patch((prev) => ({ ...prev, currentUserId: null }))
      },

      updateNickname(nickname) {
        const name = nickname.trim()
        if (!name) return { ok: false, error: '昵称不能为空' }
        if (name.length > 16) return { ok: false, error: '昵称最多16个字' }
        patch((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.id === prev.currentUserId ? { ...u, nickname: name } : u
          ),
        }))
        return { ok: true }
      },

      searchUser(keyword) {
        const q = keyword.trim()
        if (!q) return []
        const exact = state.users.filter(
          (u) => u.id !== state.currentUserId && String(u.publicId || '') === q
        )
        if (exact.length) return exact
        const lower = q.toLowerCase()
        return state.users.filter(
          (u) =>
            u.id !== state.currentUserId &&
            (String(u.publicId || '').includes(q) ||
              u.id.toLowerCase().includes(lower) ||
              u.phone.includes(q) ||
              u.nickname.includes(q))
        )
      },

      addFriend(friendId) {
        const me = state.currentUserId
        if (!me || friendId === me) return { ok: false, error: '无法添加' }
        if (isFriend(me, friendId)) return { ok: false, error: '已经是好友' }
        const friend = getUser(friendId)
        if (!friend) return { ok: false, error: '用户不存在' }
        patch((prev) => ({
          ...prev,
          friendships: [
            ...prev.friendships,
            { userId: me, friendId },
            { userId: friendId, friendId: me },
          ],
        }))
        syncFriendToCloud(me, friendId)
        return { ok: true }
      },

      addFriendFromProfile(profile) {
        const me = state.currentUserId
        if (!me || !profile?.id || profile.id === me) return { ok: false, error: '无法添加' }
        if (isFriend(me, profile.id)) return { ok: false, error: '已经是好友' }
        const user = {
          id: profile.id,
          publicId: profile.username || '',
          nickname: profile.nickname || '用户',
          avatarUrl: profile.avatarUrl || '',
          email: '',
          phone: '',
          createdAt: now(),
        }
        patch((prev) => {
          const exist = prev.users.find((u) => u.id === profile.id)
          const users = exist
            ? prev.users.map((u) =>
                u.id === profile.id
                  ? { ...u, nickname: user.nickname, publicId: user.publicId || u.publicId, avatarUrl: user.avatarUrl || u.avatarUrl || '' }
                  : u
              )
            : [...prev.users, user]
          return {
            ...prev,
            users,
            friendships: [
              ...prev.friendships,
              { userId: me, friendId: profile.id },
              { userId: profile.id, friendId: me },
            ],
          }
        })
        syncFriendToCloud(me, profile.id)
        return { ok: true }
      },

      removeFriend(friendId) {
        const me = state.currentUserId
        if (!me || !friendId) return { ok: false, error: '参数错误' }
        patch((prev) => ({
          ...prev,
          friendships: prev.friendships.filter(
            (f) =>
              !(f.userId === me && f.friendId === friendId) &&
              !(f.userId === friendId && f.friendId === me)
          ),
          messages: prev.messages.filter((m) => !isPairMessage(m, me, friendId)),
        }))
        setInbox((prev) => prev.filter((m) => !isPairMessage(m, me, friendId)))
        setUnread((prev) => {
          if (!(friendId in prev)) return prev
          const next = { ...prev }
          delete next[friendId]
          return next
        })
        if (isUuid(me) && isUuid(friendId)) deleteFriend(me, friendId)
        return { ok: true }
      },

      conversations() {
        const me = state.currentUserId
        if (!me) return []
        const friends = friendsOf(me)
        const friendIds = new Set(friends.map((f) => f.id))
        const extraPeerIds = [
          ...new Set(
            state.messages
              .filter((m) => m.fromId === me || m.toId === me)
              .map((m) => (m.fromId === me ? m.toId : m.fromId))
          ),
        ].filter((id) => !friendIds.has(id) && id !== me)
        const extras = extraPeerIds.map((id) => getUser(id)).filter(Boolean)
        return [...friends, ...extras]
          .map((friend) => ({ friend, last: lastMessageOf(me, friend.id) }))
          .sort((a, b) => (b.last?.time || 0) - (a.last?.time || 0))
      },

      messagesWith(peerId) {
        const me = state.currentUserId
        if (!me) return []
        const key = pairKey(me, peerId)
        return state.messages.filter((m) => m.pair === key)
      },

      sendMessage(peerId, text) {
        const me = state.currentUserId
        const content = text.trim()
        if (!me || !content) return { ok: false }
        const msg = {
          id: uid('msg'),
          pair: pairKey(me, peerId),
          fromId: me,
          toId: peerId,
          text: content,
          time: now(),
        }
        patch((prev) => ({ ...prev, messages: [...prev.messages, msg] }))
        return { ok: true, msg }
      },

      receiveMessage(fromId, text) {
        const me = state.currentUserId
        const content = String(text || '').trim()
        if (!me || !fromId || fromId === me || !content) return { ok: false }
        const msg = {
          id: uid('msg'),
          pair: pairKey(me, fromId),
          fromId,
          toId: me,
          text: content,
          time: now(),
        }
        patch((prev) => ({ ...prev, messages: [...prev.messages, msg] }))
        return { ok: true, msg }
      },

      bootstrapInbox() {
        const me = state.currentUserId
        if (!me) return
        const demoIds = seedDemoUsers()
          .map((u) => u.id)
          .filter((id) => id !== me)
        patch((prev) => {
          const nextFriends = [...prev.friendships]
          demoIds.forEach((friendId) => {
            const has = nextFriends.some((f) => f.userId === me && f.friendId === friendId)
            if (!has) {
              nextFriends.push({ userId: me, friendId }, { userId: friendId, friendId: me })
            }
          })
          const nextMessages = [...prev.messages]
          const greetings = {
            u_demo_xiaoming: '你好，我是小明。点开就能直接发消息。',
            u_demo_xiaohong: '在吗？有空一起看看朋友圈。',
            u_demo_laowang: '晚上有空聊两句。',
          }
          Object.entries(greetings).forEach(([fromId, text]) => {
            if (fromId === me) return
            const key = pairKey(me, fromId)
            const exists = nextMessages.some((m) => m.pair === key)
            if (!exists) {
              nextMessages.push({
                id: uid('msg'),
                pair: key,
                fromId,
                toId: me,
                text,
                time: now() - 1000 * 60 * 12,
              })
            }
          })
          return { ...prev, friendships: nextFriends, messages: nextMessages }
        })
      },

      momentsFeed() {
        const me = state.currentUserId
        if (!me) return []
        return [...state.moments].sort((a, b) => b.time - a.time)
      },

      publishMoment({ text, images }) {
        const me = state.currentUserId
        const content = text.trim()
        if (!me) return { ok: false, error: '未登录' }
        if (!content && !images) return { ok: false, error: '请输入内容' }
        const moment = {
          id: uid('m'),
          userId: me,
          text: content,
          images: Number(images) || 0,
          time: now(),
        }
        patch((prev) => ({ ...prev, moments: [moment, ...prev.moments] }))
        return { ok: true }
      },
    }
  }, [state, currentUser, authReady, authUser, profile, profileReady, profileSynced, inbox, unread, activePeerId, ingestCloudMessage, mergeInbox, replaceInbox, openPeer, setCloudProfile, syncFriendToCloud])

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearAccountStorage } from './lib/accountCleanup'
import { notifyIncoming } from './lib/appSettings'
import { blockUser, fetchMyBlocks, unblockUser } from './lib/blocks'
import { deleteFriend, fetchFriends, upsertFriend } from './lib/friends'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriendRequests,
  sendFriendRequest,
} from './lib/friendRequests'
import { applyDraft, loadDrafts, saveDrafts } from './lib/drafts'
import { fetchConversationPrefs, upsertConversationPref } from './lib/conversationPrefs'
import { deletePairMessages, fetchHiddenIds, fetchInbox, fetchReceivedSince, hideMessage, involvesUser, isPairMessage, isUuid, mapMessage, mergeMessages, peerIdOf } from './lib/messages'
import { findAuthIdentity } from './lib/identity'
import { mapProfile, fetchProfilesByIds } from './lib/profiles'
import { applyProfileRow, withMappedAvatar } from './lib/profileMerge'
import { buildCursorMaps, fetchCursorsFor, upsertReadCursor } from './lib/readCursors'
import { supabase } from './lib/supabase'
import { mergeReadAtMaps, recomputeUnreadCounts } from './lib/syncHelpers'

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

const READAT_KEY = 'wechat-chat-app-v3:readat:'

function loadReadAt(meId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(READAT_KEY + meId) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveReadAt(meId, value) {
  try {
    localStorage.setItem(READAT_KEY + meId, JSON.stringify(value || {}))
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

function pairKey(a, b) {
  return [a, b].sort().join('__')
}

function applyAuthUser(prev, authUser) {
  const email = authUser.email || ''
  const exist = findAuthIdentity(prev.users, authUser)
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

function prefsToMap(prefs) {
  const map = {}
  for (const p of prefs || []) {
    if (!p?.peerId) continue
    map[p.peerId] = { pinned: Boolean(p.pinned), muted: Boolean(p.muted) }
  }
  return map
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
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const [unread, setUnread] = useState({})
  const [readAt, setReadAt] = useState({})
  const [drafts, setDrafts] = useState({})
  const [peerReadAt, setPeerReadAt] = useState({})
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [blockedIds, setBlockedIds] = useState([])
  const [convPrefs, setConvPrefs] = useState({})
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  )
  const [syncTick, setSyncTick] = useState(0)
  const [activePeerId, setActivePeerId] = useState(null)
  const authUserRef = useRef(null)
  const activePeerRef = useRef(null)
  const readAtRef = useRef({})
  const peerReadAtRef = useRef({})
  const inboxIdsRef = useRef(new Set())
  const inboxRef = useRef([])
  const hiddenIdsRef = useRef(new Set())
  const stateRef = useRef(state)
  const resyncRef = useRef(null)
  const refreshRequestsRef = useRef(null)
  const markLocalFriendRef = useRef(null)
  const friendResyncRef = useRef(null)
  const hadDisconnectedRef = useRef(false)
  const profileSyncedRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    inboxRef.current = inbox
  }, [inbox])

  useEffect(() => {
    profileSyncedRef.current = profileSynced
  }, [profileSynced])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!authUser?.id) return
    saveUnread(authUser.id, unread)
  }, [authUser?.id, unread])

  useEffect(() => {
    if (!authUser?.id) return
    saveReadAt(authUser.id, readAt)
  }, [authUser?.id, readAt])

  useEffect(() => {
    if (!authUser?.id) return
    saveDrafts(authUser.id, drafts)
  }, [authUser?.id, drafts])

  const setDraft = useCallback((peerId, text) => {
    if (!peerId) return
    setDrafts((prev) => applyDraft(prev, peerId, text))
  }, [])

  useEffect(() => {
    readAtRef.current = readAt
  }, [readAt])

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
    if (hiddenIdsRef.current.has(msg.id)) return
    if (inboxIdsRef.current.has(msg.id)) return
    inboxIdsRef.current.add(msg.id)
    setInbox((prev) => mergeMessages(prev, [msg]))
    const peer = peerIdOf(msg, me)
    if (msg.fromId !== me && peer && peer === activePeerRef.current && isUuid(me)) {
      upsertReadCursor(me, peer)
      readAtRef.current = { ...readAtRef.current, [peer]: Date.now() }
      setReadAt((prev) => ({ ...prev, [peer]: readAtRef.current[peer] }))
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

  const removeThread = useCallback(
    async (peerId) => {
      const me = authUserRef.current?.id
      if (!me || !peerId) return
      console.log('准备删除与该用户的聊天', peerId)
      const doomed = inbox.filter((m) => isPairMessage(m, me, peerId) && !hiddenIdsRef.current.has(m.id))
      if (doomed.length) {
        const ids = new Set(doomed.map((m) => m.id))
        hiddenIdsRef.current = new Set([...hiddenIdsRef.current, ...ids])
        setHiddenIds(hiddenIdsRef.current)
        replaceInbox(inbox.filter((m) => !ids.has(m.id)))
        if (isUuid(me)) await Promise.all(doomed.map((m) => hideMessage(m.id, me)))
      }
      readAtRef.current = { ...readAtRef.current, [peerId]: Date.now() }
      setReadAt(readAtRef.current)
      setUnread((prev) => ({ ...prev, [peerId]: 0 }))
    },
    [inbox, replaceInbox]
  )

  const openPeer = useCallback((peerId) => {
    setActivePeerId(peerId || null)
    if (peerId) {
      const ts = Date.now()
      readAtRef.current = { ...readAtRef.current, [peerId]: ts }
      setReadAt((prev) => ({ ...prev, [peerId]: ts }))
      setUnread((prev) => {
        if (!prev[peerId]) return prev
        const next = { ...prev }
        delete next[peerId]
        return next
      })
      const me = authUserRef.current?.id
      if (me && isUuid(me) && isUuid(peerId)) upsertReadCursor(me, peerId)
    }
  }, [])

  const applyCursors = useCallback((result) => {
    if (!result?.ok) return
    const maps = buildCursorMaps(result)
    peerReadAtRef.current = mergeReadAtMaps(peerReadAtRef.current, maps.peers)
    setPeerReadAt({ ...peerReadAtRef.current })
    const merged = mergeReadAtMaps(readAtRef.current, maps.mine)
    if (JSON.stringify(merged) !== JSON.stringify(readAtRef.current)) {
      readAtRef.current = merged
      setReadAt(merged)
    }
  }, [])

  const applyCloudProfiles = useCallback((profiles, { keepAvatarIfEmpty = false } = {}) => {
    const list = (profiles || []).filter((prof) => prof?.id)
    if (!list.length) return
    setState((prev) => {
      let users = prev.users
      list.forEach((prof) => {
        users = applyProfileRow(users, withMappedAvatar(prof), { keepAvatarIfEmpty })
      })
      return users === prev.users ? prev : { ...prev, users }
    })
  }, [])

  const applyProfileRows = useCallback((profiles) => {
    const me = authUserRef.current?.id
    const known = new Set([me, ...stateRef.current.users.map((u) => u.id)].filter(Boolean))
    const list = (profiles || []).filter((prof) => prof?.id && known.has(prof.id))
    if (list.length) applyCloudProfiles(list)
  }, [applyCloudProfiles])

  // 拉取指定用户的最新云端资料:登录、重连、好友变化时调用,
  // 保证离线期间对方更换的头像在上线后立即生效。
  const refreshProfiles = useCallback(
    async (ids) => {
      const me = authUserRef.current?.id
      const unique = [...new Set((ids || []).filter((id) => id && isUuid(id)))]
      if (!unique.length) return
      const result = await fetchProfilesByIds(unique)
      if (!result.ok) return
      const others = []
      ;(result.profiles || []).forEach((prof) => {
        if (!prof?.id) return
        if (prof.id === me) {
          // 本地头像尚未同步到云端时保留本地值,避免把刚选的头像冲掉
          applyCloudProfiles([prof], { keepAvatarIfEmpty: true })
          setProfile((prev) => (prev && !profileSyncedRef.current ? prev : prof))
          setProfileReady(true)
          return
        }
        others.push(prof)
      })
      if (others.length) applyCloudProfiles(others)
    },
    [applyCloudProfiles]
  )

  const refreshFriendRequests = useCallback(async () => {
    const me = authUserRef.current?.id
    if (!me || !isUuid(me)) return
    const result = await fetchFriendRequests(me)
    if (result.ok) setRequests({ incoming: result.incoming, outgoing: result.outgoing })
  }, [])

  useEffect(() => {
    refreshRequestsRef.current = refreshFriendRequests
  }, [refreshFriendRequests])

  // 通讯录页挂载时主动拉一次好友边,避免实时订阅尚未就绪时看不到对方刚接受的好友
  const refreshFriends = useCallback(async () => {
    if (friendResyncRef.current) await friendResyncRef.current()
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
      // friends 表是唯一好友真源:双方各一行才成立。曾经用 accepted 请求+对等回补,
      // 会在对方删除后把关系自动写回,导致删除失效,现已移除。
      const result = await fetchFriends(me)
      if (!alive || !result.ok) return
      const prev = stateRef.current
      const localIds = new Set(
        prev.friendships.filter((f) => f.userId === me && isUuid(f.friendId)).map((f) => f.friendId)
      )
      const cloudIds = [...new Set(result.friends.map((f) => f.friendId))].filter((id) => id && id !== me)
      // 每次好友同步都刷新一次资料,覆盖离线期间对方更换的头像
      refreshProfiles(cloudIds)
      const newIds = cloudIds.filter((id) => !localIds.has(id))
      const removedIds = [...localIds].filter((id) => !cloudIds.includes(id))
      if (!newIds.length && !removedIds.length) return
      const profilesResult = newIds.length
        ? await fetchProfilesByIds(newIds)
        : { ok: true, profiles: [] }
      if (!alive) return
      if (removedIds.length) {
        const removed = new Set(removedIds)
        setState((p) => ({
          ...p,
          friendships: p.friendships.filter(
            (f) =>
              !(f.userId === me && removed.has(f.friendId)) &&
              !(f.friendId === me && removed.has(f.userId))
          ),
        }))
      }
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
    let timer = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(sync, 150)
    }
    friendResyncRef.current = schedule
    sync()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      if (friendResyncRef.current === schedule) friendResyncRef.current = null
    }
  }, [authUser?.id, refreshProfiles])

  useEffect(() => {
    const me = authUser?.id
    if (!me || !isUuid(me)) return undefined
    let alive = true
    ;(async () => {
      const [cursorsRes, blocksRes, hiddenRes, prefsRes] = await Promise.all([
        fetchCursorsFor(me),
        fetchMyBlocks(me),
        fetchHiddenIds(me),
        fetchConversationPrefs(me),
      ])
      if (!alive) return
      applyCursors(cursorsRes)
      if (blocksRes.ok) setBlockedIds(blocksRes.ids)
      if (prefsRes.ok) setConvPrefs(prefsToMap(prefsRes.prefs))
      if (hiddenRes.ok) {
        hiddenIdsRef.current = new Set(hiddenRes.ids)
        setHiddenIds(hiddenIdsRef.current)
      }
      await refreshFriendRequests()
    })()
    return () => {
      alive = false
    }
  }, [authUser?.id, applyCursors, refreshFriendRequests])

  const resyncCloud = useCallback(async () => {
    const me = authUserRef.current?.id
    if (!me || !isUuid(me)) return
    const [inboxRes, cursorsRes, hiddenRes, prefsRes] = await Promise.all([
      fetchInbox(me),
      fetchCursorsFor(me),
      fetchHiddenIds(me),
      fetchConversationPrefs(me),
    ])
    if (inboxRes.ok) mergeInbox(inboxRes.messages)
    if (prefsRes.ok) setConvPrefs(prefsToMap(prefsRes.prefs))
    if (hiddenRes.ok) {
      hiddenIdsRef.current = new Set(hiddenRes.ids)
      setHiddenIds(hiddenIdsRef.current)
    }
    applyCursors(cursorsRes)
    await refreshFriendRequests()
    const friendIds = stateRef.current.friendships
      .filter((f) => f.userId === me && isUuid(f.friendId))
      .map((f) => f.friendId)
    await refreshProfiles([me, ...friendIds])
    setSyncTick((tick) => tick + 1)
  }, [mergeInbox, applyCursors, refreshFriendRequests, refreshProfiles])

  useEffect(() => {
    resyncRef.current = resyncCloud
  }, [resyncCloud])

  useEffect(() => {
    if (!authUser?.id || !isUuid(authUser.id)) {
      inboxIdsRef.current = new Set()
      setInbox([])
      hiddenIdsRef.current = new Set()
      setHiddenIds(hiddenIdsRef.current)
      setUnread({})
      setDrafts({})
      readAtRef.current = {}
      setReadAt({})
      peerReadAtRef.current = {}
      setPeerReadAt({})
      setRequests({ incoming: [], outgoing: [] })
      setBlockedIds([])
      setConvPrefs({})
      setActivePeerId(null)
      return undefined
    }
    let disposed = false
    const me = authUser.id
    const channel = supabase
      .channel(`chat-sync:${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          ingestCloudMessage(payload.new)
          const raw = payload.new
          const fromId = raw?.sender_id || raw?.from_id
          const toId = raw?.receiver_id || raw?.to_id
          if (fromId && toId === me && fromId !== me && fromId !== activePeerRef.current) {
            const body = raw.content || raw.text || raw.body || ''
            notifyIncoming({ body: String(body).slice(0, 40) || '[新消息]' })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new?.recalled_at) mergeInbox([mapMessage(payload.new)])
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'read_cursors', filter: `peer_id=eq.${me}` },
        (payload) => {
          const row = payload.new
          if (!row?.user_id || row.user_id === me || !row.read_at) return
          const ts = new Date(row.read_at).getTime()
          peerReadAtRef.current = {
            ...peerReadAtRef.current,
            [row.user_id]: Math.max(peerReadAtRef.current[row.user_id] || 0, ts),
          }
          setPeerReadAt({ ...peerReadAtRef.current })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends' },
        () => friendResyncRef.current?.()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          applyProfileRows([mapProfile(row)])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          const prof = mapProfile(row)
          if (row.id === me) {
            setProfile((prev) => (prev && !profileSyncedRef.current ? prev : prof))
            applyCloudProfiles([prof], { keepAvatarIfEmpty: true })
            return
          }
          applyProfileRows([prof])
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        (payload) => {
          const row = payload.new
          if (!row || (row.to_id !== me && row.from_id !== me)) return
          if (row.status === 'accepted') {
            // 我发出的请求被接受:即时落本地好友边并回写云端(owner=我,策略始终放行)
            const other = row.from_id === me ? row.to_id : row.from_id
            if (other) {
              markLocalFriendRef.current?.(me, other)
              upsertFriend(me, other)
            }
          }
          refreshRequestsRef.current?.()
        }
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          if (hadDisconnectedRef.current) {
            hadDisconnectedRef.current = false
            setOffline(false)
            resyncRef.current?.()
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          hadDisconnectedRef.current = true
        }
      })
    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [authUser?.id, ingestCloudMessage, mergeInbox, applyCloudProfiles, applyProfileRows])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const goOnline = () => {
      setOffline(false)
      hadDisconnectedRef.current = false
      resyncRef.current?.()
    }
    const goOffline = () => setOffline(true)
    // 移动端切到后台会挂起长连接,回到前台先补拉,避免未读数等到手动切页才出现
    const refreshWhenVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setOffline(false)
      resyncRef.current?.()
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  // 实时订阅可能短暂断连或漏帧:每 15 秒做一次增量补拉,只取比本地最新消息更新的收件
  useEffect(() => {
    const me = authUser?.id
    if (!me || !isUuid(me)) return undefined
    let alive = true
    const catchUp = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      const latest = inboxRef.current.reduce((max, msg) => Math.max(max, msg.time || 0), 0)
      // 收件箱尚未加载完成时退化为补拉最近一分钟,避免错过首条消息
      const since = new Date((latest || Date.now() - 60000) - 2000).toISOString()
      const res = await fetchReceivedSince(me, since)
      if (!alive || !res.ok) return
      res.messages.forEach((msg) => ingestCloudMessage(msg))
      await refreshRequestsRef.current?.()
    }
    void catchUp()
    const timer = setInterval(catchUp, 6000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [authUser?.id, ingestCloudMessage])

  useEffect(() => {
    const me = authUser?.id
    if (!me || !isUuid(me)) return
    setUnread(
      recomputeUnreadCounts({
        messages: hiddenIds.size ? inbox.filter((m) => !hiddenIds.has(m.id)) : inbox,
        meId: me,
        readAtMap: readAtRef.current,
        activePeerId: activePeerRef.current,
      })
    )
  }, [inbox, hiddenIds, readAt, activePeerId, authUser?.id])

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
        hiddenIdsRef.current = new Set()
        setHiddenIds(hiddenIdsRef.current)
        setUnread({})
        setDrafts({})
        readAtRef.current = {}
        setReadAt({})
        peerReadAtRef.current = {}
        setPeerReadAt({})
        setRequests({ incoming: [], outgoing: [] })
        setBlockedIds([])
        setConvPrefs({})
      } else {
        setAuthUser(data.session.user)
        setUnread(loadUnread(data.session.user.id))
        setDrafts(loadDrafts(data.session.user.id))
        readAtRef.current = loadReadAt(data.session.user.id)
        setReadAt(readAtRef.current)
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
        hiddenIdsRef.current = new Set()
        setHiddenIds(hiddenIdsRef.current)
        setUnread({})
        setDrafts({})
        readAtRef.current = {}
        setReadAt({})
        peerReadAtRef.current = {}
        setPeerReadAt({})
        setRequests({ incoming: [], outgoing: [] })
        setBlockedIds([])
        setConvPrefs({})
        setActivePeerId(null)
        setState((prev) => ({ ...prev, currentUserId: null }))
        return
      }
      if (event === 'INITIAL_SESSION') return
      setAuthUser(session.user)
      setUnread(loadUnread(session.user.id))
      setDrafts(loadDrafts(session.user.id))
      readAtRef.current = loadReadAt(session.user.id)
      setReadAt(readAtRef.current)
      setState((prev) => applyAuthUser(prev, session.user))
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const registerUserFromProfile = useCallback((prof) => {
    if (!prof?.id) return
    setState((prev) => {
      const exist = prev.users.find((u) => u.id === prof.id)
      const nickname = prof.nickname || '用户'
      const publicId = prof.username || ''
      const avatarUrl = prof.avatarUrl || ''
      if (exist) {
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === prof.id
              ? {
                  ...u,
                  nickname: nickname || u.nickname,
                  publicId: publicId || u.publicId,
                  avatarUrl: avatarUrl || u.avatarUrl || '',
                }
              : u
          ),
        }
      }
      return {
        ...prev,
        users: [
          ...prev.users,
          { id: prof.id, publicId, nickname, avatarUrl, email: '', phone: '', createdAt: now() },
        ],
      }
    })
  }, [])

  const markLocalFriend = useCallback((meId, friendId) => {
    setState((prev) => {
      const exists = new Set(prev.friendships.filter((f) => f.userId === meId).map((f) => f.friendId))
      if (exists.has(friendId)) return prev
      return {
        ...prev,
        friendships: [
          ...prev.friendships,
          { userId: meId, friendId },
          { userId: friendId, friendId: meId },
        ],
      }
    })
  }, [])

  useEffect(() => {
    markLocalFriendRef.current = markLocalFriend
  }, [markLocalFriend])

  const requestFriendFromProfile = useCallback(
    async (prof) => {
      const me = authUserRef.current?.id
      if (!me || !prof?.id || prof.id === me) return { ok: false, error: '无法添加' }
      if (!isUuid(me) || !isUuid(prof.id)) return { ok: false, error: '仅云端账号支持好友请求' }
      registerUserFromProfile(prof)
      const result = await sendFriendRequest(me, prof.id)
      if (result.ok) {
        await refreshFriendRequests()
        return { ok: true, pending: true }
      }
      if (result.reversePending) {
        await refreshFriendRequests()
        return { ok: false, error: '对方已向你发送好友请求，去「新的朋友」接受吧' }
      }
      return result
    },
    [registerUserFromProfile, refreshFriendRequests]
  )

  const respondToRequest = useCallback(
    async (request, action) => {
      const me = authUserRef.current?.id
      if (!me || !request?.id) return { ok: false, error: '参数错误' }
      const result =
        action === 'accept' ? await acceptFriendRequest(request) : await declineFriendRequest(request.id)
      if (result.ok && action === 'accept') {
        markLocalFriend(me, request.fromId)
        const profilesRes = await fetchProfilesByIds([request.fromId])
        if (profilesRes.ok) (profilesRes.profiles || []).forEach(registerUserFromProfile)
      }
      await refreshFriendRequests()
      return result
    },
    [markLocalFriend, registerUserFromProfile, refreshFriendRequests]
  )

  const cancelRequest = useCallback(
    async (request) => {
      if (!request?.id) return { ok: false, error: '参数错误' }
      const result = await cancelFriendRequest(request.id)
      if (result.ok) await refreshFriendRequests()
      return result
    },
    [refreshFriendRequests]
  )

  const setBlockedFor = useCallback(async (targetId, blocked) => {
    const me = authUserRef.current?.id
    if (!me || !targetId) return { ok: false, error: '参数错误' }
    const result = blocked ? await blockUser(me, targetId) : await unblockUser(me, targetId)
    if (result.ok) {
      setBlockedIds((prev) =>
        blocked ? [...new Set([...prev, targetId])] : prev.filter((id) => id !== targetId)
      )
    }
    return result
  }, [])

  const setConversationPref = useCallback(async (peerId, patch) => {
    const me = authUserRef.current?.id
    if (!me || !peerId) return { ok: false, error: '参数错误' }
    let snapshot = null
    let next = null
    setConvPrefs((prev) => {
      snapshot = prev
      const cur = prev[peerId] || { pinned: false, muted: false }
      next = { ...cur, ...patch }
      if (!next.pinned && !next.muted) {
        const copy = { ...prev }
        delete copy[peerId]
        return copy
      }
      return { ...prev, [peerId]: next }
    })
    if (isUuid(me)) {
      const res = await upsertConversationPref({ userId: me, peerId, pinned: next.pinned, muted: next.muted })
      if (!res.ok) {
        setConvPrefs(snapshot)
        return res
      }
    }
    return { ok: true, pref: { peerId, ...next } }
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
      drafts,
      setDraft,
      activePeerId,
      offline,
      syncTick,
      peerReadAt,
      requests,
      blockedIds,
      convPrefs,
      setConversationPref,
      ingestCloudMessage,
      mergeInbox,
      replaceInbox,
      removeThread,
      hiddenIds,
      openPeer,
      refreshFriendRequests,
      refreshFriends,
      requestFriendFromProfile,
      respondToRequest,
      cancelRequest,
      setBlockedFor,
      isBlocked(targetId) {
        return blockedIds.includes(targetId)
      },
      readReceiptOf(peerId) {
        return peerReadAt[peerId] || 0
      },
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
          // 与 applyAuthUser 共用同一套身份解析,并按最新状态幂等写入,避免重复本地用户
          setState((prev) => applyAuthUser(prev, authUser))
          return { ok: true }
        },

      logout() {
        patch((prev) => ({ ...prev, currentUserId: null }))
      },

      // 注销账号后彻底清空本机残留:内存状态、按用户划分的缓存与通话临时标识
      purgeAccount() {
        clearAccountStorage()
        setState(emptyState())
        setAuthUser(null)
        setProfile(null)
        setProfileReady(true)
        setProfileSynced(false)
        setInbox([])
        inboxIdsRef.current = new Set()
        hiddenIdsRef.current = new Set()
        setHiddenIds(hiddenIdsRef.current)
        setUnread({})
        setDrafts({})
        readAtRef.current = {}
        setReadAt({})
        peerReadAtRef.current = {}
        setPeerReadAt({})
        setRequests({ incoming: [], outgoing: [] })
        setBlockedIds([])
        setConvPrefs({})
        setActivePeerId(null)
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

      async removeFriend(friendId) {
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
        setDrafts((prev) => {
          if (!(friendId in prev)) return prev
          const next = { ...prev }
          delete next[friendId]
          return next
        })
        if (!isUuid(me) || !isUuid(friendId)) return { ok: true }
        // 双向删除好友边并清空该会话双方的历史消息,否则对方仍是联系人可继续收发
        const [edge, history] = await Promise.all([
          deleteFriend(me, friendId),
          deletePairMessages(me, friendId),
        ])
        if (!edge.ok || !history.ok) {
          friendResyncRef.current?.()
          return { ok: false, error: edge.error || history.error || '删除失败' }
        }
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
  }, [state, currentUser, authReady, authUser, profile, profileReady, profileSynced, inbox, unread, drafts, setDraft, activePeerId, offline, syncTick, peerReadAt, requests, blockedIds, convPrefs, setConversationPref, ingestCloudMessage, mergeInbox, replaceInbox, removeThread, hiddenIds, openPeer, setCloudProfile, syncFriendToCloud, refreshFriendRequests, refreshFriends, requestFriendFromProfile, respondToRequest, cancelRequest, setBlockedFor])

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

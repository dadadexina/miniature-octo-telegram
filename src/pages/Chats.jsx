import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import SwipeRow from '../components/SwipeRow'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import { fetchInbox, groupConversations, isUuid } from '../lib/messages'
import { fetchProfilesByIds } from '../lib/profiles'
import { callEventText } from '../lib/call'
import { useStore } from '../store'
import { formatTime } from '../utils'

export default function Chats() {
  const { conversations, avatarColor, currentUser, getUser, upsertUsers, inbox, mergeInbox, unreadOf, syncTick, hiddenIds, removeThread, drafts, convPrefs, setConversationPref, displayNameOf } = useStore()
  const [swipedId, setSwipedId] = useState(null)
  const [hint, setHint] = useState('')
  const [needSql, setNeedSql] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cloudOk, setCloudOk] = useState(false)
  const localList = conversations()

  const visibleInbox = useMemo(() => {
    if (!hiddenIds.size) return inbox
    return inbox.filter((m) => !hiddenIds.has(m.id))
  }, [inbox, hiddenIds])

  useEffect(() => {
    if (!swipedId) return undefined
    const closeOnOutside = (e) => {
      const row = e.target.closest?.('[data-swipe-row]')
      if (!row || row.getAttribute('data-swipe-row') !== swipedId) setSwipedId(null)
    }
    document.addEventListener('touchstart', closeOnOutside, true)
    document.addEventListener('mousedown', closeOnOutside, true)
    return () => {
      document.removeEventListener('touchstart', closeOnOutside, true)
      document.removeEventListener('mousedown', closeOnOutside, true)
    }
  }, [swipedId])

  useEffect(() => {
    if (!currentUser?.id || !cloudOk) return undefined
    const missing = groupConversations(currentUser.id, visibleInbox)
      .map((item) => item.peerId)
      .filter((id) => id && !getUser(id))
    if (!missing.length) return undefined
    let alive = true
    fetchProfilesByIds(missing).then((profiles) => {
      if (!alive || !profiles.ok) return
      upsertUsers(
        profiles.profiles.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          publicId: p.username,
          avatarUrl: p.avatarUrl || '',
        }))
      )
    })
    return () => {
      alive = false
    }
  }, [visibleInbox, cloudOk, currentUser?.id])

  useEffect(() => {
    let alive = true
    if (!currentUser?.id) return undefined
    if (!isUuid(currentUser.id)) {
      setCloudOk(false)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    fetchInbox(currentUser.id).then(async (result) => {
      if (!alive) return
      if (!result.ok) {
        setCloudOk(false)
        setNeedSql(Boolean(result.permission))
        setHint(result.permission ? 'messages 表暂无读取权限，先显示本地会话。' : result.error || '读取会话失败')
        setLoading(false)
        return
      }
      mergeInbox(result.messages)
      const grouped = groupConversations(currentUser.id, result.messages)
      const extras = grouped.map((item) => item.peerId).filter((id) => !getUser(id))
      if (extras.length) {
        const profiles = await fetchProfilesByIds(extras)
        if (alive && profiles.ok) {
          upsertUsers(
            profiles.profiles.map((p) => ({
              id: p.id,
              nickname: p.nickname,
              publicId: p.username,
              avatarUrl: p.avatarUrl || '',
            }))
          )
        }
      }
      if (!alive) return
      setCloudOk(true)
      setNeedSql(false)
      setHint('')
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [currentUser?.id, mergeInbox, syncTick])

  const list = useMemo(() => {
    const base = cloudOk
      ? groupConversations(currentUser.id, visibleInbox).map(({ peerId, last }) => ({
          friend: getUser(peerId) || { id: peerId, nickname: '用户', publicId: '' },
          last,
        }))
      : localList
    return [...base].sort((a, b) => {
      const pa = convPrefs[a.friend.id]?.pinned ? 1 : 0
      const pb = convPrefs[b.friend.id]?.pinned ? 1 : 0
      if (pa !== pb) return pb - pa
      return (b.last?.time || 0) - (a.last?.time || 0)
    })
  }, [cloudOk, localList, visibleInbox, currentUser?.id, getUser, convPrefs])

  const [actionPeer, setActionPeer] = useState(null)

  return (
    <div className="flex h-full flex-col">
      <NavBar
        title="消息"
        right={
          <Link to="/me" className="text-[13px] font-medium text-eink-ink underline underline-offset-2">
            我
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-eink-bar no-scrollbar">
        {needSql ? <CopySql compact /> : hint ? <p className="px-4 py-2 text-[12px] leading-5 text-eink-sub">{hint}</p> : null}
        {loading ? (
          <p className="px-6 py-20 text-center text-[14px] text-eink-sub">正在读取会话...</p>
        ) : list.length === 0 ? (
          <div className="px-6 py-20 text-center text-[14px] text-eink-sub">
            暂无会话，去通讯录找好友聊聊
            <div className="mt-4">
              <Link to="/contacts" className="font-medium text-eink-ink underline underline-offset-2">
                打开通讯录
              </Link>
            </div>
          </div>
        ) : (
          list.map(({ friend, last }) => (
            <SwipeRow
              key={friend.id}
              rowId={friend.id}
              to={`/chat/${friend.id}`}
              swiped={swipedId === friend.id}
              pinned={Boolean(convPrefs[friend.id]?.pinned)}
              onOpen={() => setSwipedId(friend.id)}
              onClose={() => setSwipedId(null)}
              onLongPress={() => setActionPeer(friend)}
              onDelete={() => {
                setSwipedId(null)
                removeThread(friend.id)
              }}
            >
              <Avatar
                name={displayNameOf(friend.id) || friend.nickname}
                color={avatarColor(friend.id)}
                size={48}
                badge={convPrefs[friend.id]?.muted ? 0 : unreadOf(friend.id)}
                src={friend.avatarUrl || ''}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-[16px] text-[#191919]">
                    {displayNameOf(friend.id) || friend.nickname}
                    {convPrefs[friend.id]?.muted && unreadOf(friend.id) > 0 ? (
                      <span data-testid="muted-dot" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-none bg-eink-sub align-middle" />
                    ) : null}
                  </span>
                  <span className="ml-3 shrink-0 text-[12px] text-eink-faint">
                    {last ? formatTime(last.time) : ''}
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] text-eink-sub">
                  {drafts[friend.id] ? (
                    <>
                      <span data-testid="draft-prefix" className="mr-1 font-medium text-eink-ink">[草稿]</span>
                      <span className="text-eink-ink">{drafts[friend.id]}</span>
                    </>
                  ) : last ? (
                    `${last.fromId === currentUser.id ? '我: ' : ''}${
                      last.text ||
                      (last.attachments?.type === 'image'
                        ? '[图片]'
                        : last.attachments?.type === 'call'
                          ? callEventText(last.attachments)
                          : '')
                    }`
                  ) : (
                    '点击开始聊天'
                  )}
                </p>
              </div>
            </SwipeRow>
          ))
        )}
      </div>
      {actionPeer ? (
        <div className="fixed inset-0 z-50" data-testid="row-actions" onMouseDown={() => setActionPeer(null)}>
          <div className="absolute inset-0 bg-black/25" />
          <div
            className="absolute inset-x-0 bottom-0 border-t border-eink-divider bg-eink-paper safe-bottom"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="border-b border-eink-divider px-4 py-2.5 text-center text-[13px] text-eink-sub">
              {actionPeer.nickname}
            </p>
            <button
              type="button"
              data-testid="action-pin"
              className="block w-full border-b border-eink-divider px-4 py-3 text-center text-[15px] text-eink-ink active:bg-eink-pressed"
              onClick={() => {
                const next = !convPrefs[actionPeer.id]?.pinned
                setActionPeer(null)
                setConversationPref(actionPeer.id, { pinned: next })
              }}
            >
              {convPrefs[actionPeer.id]?.pinned ? '取消置顶' : '置顶会话'}
            </button>
            <button
              type="button"
              data-testid="action-mute"
              className="block w-full border-b border-eink-divider px-4 py-3 text-center text-[15px] text-eink-ink active:bg-eink-pressed"
              onClick={() => {
                const next = !convPrefs[actionPeer.id]?.muted
                setActionPeer(null)
                setConversationPref(actionPeer.id, { muted: next })
              }}
            >
              {convPrefs[actionPeer.id]?.muted ? '取消免打扰' : '消息免打扰'}
            </button>
            <button
              type="button"
              data-testid="action-delete"
              className="block w-full border-b border-eink-divider px-4 py-3 text-center text-[15px] text-[#8C2F22] active:bg-eink-pressed"
              onClick={() => {
                const id = actionPeer.id
                setActionPeer(null)
                removeThread(id)
              }}
            >
              删除会话
            </button>
            <button
              type="button"
              data-testid="action-cancel"
              className="block w-full px-4 py-3 text-center text-[15px] text-eink-sub active:bg-eink-pressed"
              onClick={() => setActionPeer(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

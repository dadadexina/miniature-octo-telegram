import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import CallOverlay from '../components/CallOverlay'
import useKeyboardInset from '../hooks/useKeyboardInset'
import {
  canRecall,
  fetchHiddenIds,
  fetchThread,
  hideMessage,
  insertMessage,
  isPairMessage,
  isUuid,
  recallMessage,
} from '../lib/messages'
import { supabase } from '../lib/supabase'
import { friendlyInsertError } from '../lib/syncHelpers'
import { useStore } from '../store'
import { formatChatTime } from '../utils'

const REPLIES = [
  '收到，我稍后回你。',
  '好的，没问题。',
  '哈哈，明白了。',
  '现在有点忙，等会儿聊。',
  '嗯嗯。',
  '这个主意不错。',
]

const CALL_IDLE = 'idle'
const CALL_CALLING = 'calling'
const CALL_CONNECTED = 'connected'

export default function ChatDetail() {
  const { peerId } = useParams()
  const navigate = useNavigate()
  const {
    currentUser, getUser, messagesWith, sendMessage, receiveMessage, avatarColor, logout, profile,
    inbox, mergeInbox, openPeer, readReceiptOf, isBlocked, setBlockedFor, syncTick,
  } = useStore()
  const meName = profile?.nickname || currentUser?.nickname
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('')
  const [needSql, setNeedSql] = useState(false)
  const [useCloud, setUseCloud] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [oldestAt, setOldestAt] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [callState, setCallState] = useState(CALL_IDLE)
  const [callKind, setCallKind] = useState('audio')
  const [pendingList, setPendingList] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [activeMsgId, setActiveMsgId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const listRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const replyTimer = useRef(null)
  const keepScrollRef = useRef(false)
  const keyboardInset = useKeyboardInset()
  const peer = getUser(peerId) || (peerId ? { id: peerId, nickname: '用户', publicId: '' } : null)
  const cloudReady = Boolean(currentUser) && isUuid(currentUser.id) && isUuid(peerId)
  const localMessages = currentUser && peer ? messagesWith(peerId) : []
  const cloudMessages = currentUser
    ? inbox.filter((msg) => isPairMessage(msg, currentUser.id, peerId))
    : []
  const messages = (useCloud || (cloudReady && loading) ? cloudMessages : localMessages).filter(
    (msg) => !hiddenIds.has(msg.id)
  )
  const peerReadTs = cloudReady ? readReceiptOf(peerId) : 0

  const scrollToBottom = (smooth = true) => {
    const node = listRef.current
    if (!node) return
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }

  useEffect(() => {
    if (keepScrollRef.current) {
      keepScrollRef.current = false
      return
    }
    scrollToBottom(messages.length > 1)
  }, [messages.length, keyboardInset])

  useEffect(() => {
    openPeer(peerId)
    return () => {
      openPeer(null)
      if (replyTimer.current) clearTimeout(replyTimer.current)
    }
  }, [peerId, openPeer])

  useEffect(() => {
    let alive = true
    if (!currentUser || !peerId) return undefined
    if (!cloudReady) {
      setUseCloud(false)
      setLoading(false)
      setHint('当前好友是本地演示用户，消息暂存在本机。')
      return undefined
    }
    setLoading(true)
    fetchHiddenIds(currentUser.id).then((result) => {
      if (!alive || !result.ok) return
      setHiddenIds(new Set(result.ids))
    })
    fetchThread(currentUser.id, peerId).then((result) => {
      if (!alive) return
      setLoading(false)
      if (result.ok) {
        setUseCloud(true)
        mergeInbox(result.messages)
        setHasMore(result.hasMore)
        setOldestAt(result.oldest)
        setNeedSql(false)
        setHint('')
        return
      }
      setUseCloud(false)
      setHasMore(false)
      setOldestAt(null)
      setNeedSql(Boolean(result.permission))
      setHint(result.permission ? 'messages 表暂无读写权限，先显示本地消息。' : result.error || '读取消息失败')
    })
    return () => {
      alive = false
    }
  }, [currentUser?.id, peerId, cloudReady, mergeInbox, syncTick])

  useEffect(() => {
    setActiveMsgId(null)
    setMenuOpen(false)
    setPendingList([])
    setHiddenIds(new Set())
  }, [peerId])

  if (!currentUser) return <Navigate to="/login" replace />

  if (!peer) {
    return (
      <div className="flex h-full flex-col bg-eink-paper">
        <NavBar title="聊天" left={<Back onClick={() => navigate('/chats')} />} />
        <p className="p-8 text-center text-eink-sub">用户不存在</p>
      </div>
    )
  }

  const sendCloudMessage = async (content, tmpId) => {
    setPendingList((prev) =>
      prev.map((item) => (item.tmpId === tmpId ? { ...item, status: 'sending', error: '' } : item))
    )
    const result = await insertMessage({
      senderId: currentUser.id,
      receiverId: peerId,
      content,
    })
    if (!result.ok) {
      setPendingList((prev) =>
        prev.map((item) =>
          item.tmpId === tmpId
            ? { ...item, status: 'failed', error: friendlyInsertError(result.error, result.permission) }
            : item
        )
      )
      setNeedSql(Boolean(result.permission) && String(result.error || '').toLowerCase().includes('permission denied'))
      return
    }
    setPendingList((prev) => prev.filter((item) => item.tmpId !== tmpId))
    mergeInbox([result.message])
    requestAnimationFrame(() => scrollToBottom(true))
  }

  const submit = async (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    if (cloudReady) {
      const tmpId = `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      setPendingList((prev) => [...prev, { tmpId, text: content, time: Date.now(), status: 'sending', error: '' }])
      setText('')
      requestAnimationFrame(() => scrollToBottom(true))
      await sendCloudMessage(content, tmpId)
      return
    }
    const result = sendMessage(peerId, content)
    if (!result.ok) return
    setText('')
    requestAnimationFrame(() => scrollToBottom(true))
    if (replyTimer.current) clearTimeout(replyTimer.current)
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)]
    replyTimer.current = setTimeout(() => {
      receiveMessage(peerId, reply)
    }, 700)
  }

  const onRecall = async (msg) => {
    setActiveMsgId(null)
    const result = await recallMessage(msg.id)
    if (!result.ok) {
      setHint(result.error || '撤回失败')
      return
    }
    setHint('')
    mergeInbox([result.message])
  }

  const onDelete = async (msg) => {
    setActiveMsgId(null)
    setHiddenIds((prev) => new Set([...prev, msg.id]))
    if (cloudReady && msg.id) await hideMessage(msg.id, currentUser.id)
  }

  const onToggleBlock = async () => {
    setMenuOpen(false)
    const blocked = isBlocked(peerId)
    const result = await setBlockedFor(peerId, !blocked)
    setHint(result.ok ? (blocked ? '已取消拉黑' : '已拉黑，对方无法再给你发消息') : result.error || '操作失败')
  }

  const onSignOut = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  const onCall = (kind) => {
    setCallKind(kind)
    setCallState(CALL_CALLING)
  }

  const onHangup = () => {
    setCallState(CALL_IDLE)
  }

  const loadOlder = async () => {
    if (!cloudReady || loadingMore || !hasMore) return
    setLoadingMore(true)
    const node = listRef.current
    const prevHeight = node ? node.scrollHeight : 0
    const prevTop = node ? node.scrollTop : 0
    const result = await fetchThread(currentUser.id, peerId, { before: oldestAt })
    setLoadingMore(false)
    if (!result.ok) {
      setHint(result.error || '加载历史消息失败')
      return
    }
    keepScrollRef.current = true
    mergeInbox(result.messages)
    setHasMore(result.hasMore)
    if (result.oldest) setOldestAt(result.oldest)
    requestAnimationFrame(() => {
      if (node) node.scrollTop = prevTop + (node.scrollHeight - prevHeight)
    })
  }

  return (
    <div
      className="flex h-full flex-col bg-eink-paper"
      style={{ paddingBottom: keyboardInset }}
    >
      <AuthBar email={currentUser.email} onSignOut={onSignOut} />
      <NavBar
        title={peer.nickname}
        left={<Back onClick={() => navigate('/chats')} />}
        right={
          <div className="relative flex items-center gap-1">
            <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => onCall('audio')} aria-label="语音通话（演示）" title="演示功能">
              <PhoneIcon />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => onCall('video')} aria-label="视频通话（演示）" title="演示功能">
              <VideoIcon />
            </button>
            {cloudReady ? (
              <button
                type="button"
                data-testid="chat-menu"
                className="flex h-9 w-9 items-center justify-center"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="更多操作"
              >
                <MoreIcon />
              </button>
            ) : null}
            {menuOpen ? (
              <div className="absolute right-0 top-9 z-40 w-36 border border-eink-divider bg-eink-bar">
                <button
                  type="button"
                  data-testid="block-toggle"
                  className="block w-full px-3 py-2.5 text-left text-[14px] text-eink-ink active:bg-eink-pressed"
                  onClick={onToggleBlock}
                >
                  {isBlocked(peerId) ? '取消拉黑' : '拉黑对方'}
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 no-scrollbar"
        onClick={() => {
          inputRef.current?.blur()
          setActiveMsgId(null)
          setMenuOpen(false)
        }}
      >
        {loading ? (
          <p className="py-10 text-center text-[12px] text-eink-faint">正在读取消息...</p>
        ) : null}
        {!loading && useCloud && hasMore ? (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              className="rounded-none border border-eink-divider bg-eink-bar px-3 py-1.5 text-[13px] text-eink-sub disabled:opacity-60"
              disabled={loadingMore}
              onClick={loadOlder}
            >
              {loadingMore ? '正在加载...' : '加载更早的消息'}
            </button>
          </div>
        ) : null}
        {!loading && needSql ? <CopySql compact /> : null}
        {!loading && hint && !needSql ? (
          <p className="px-4 py-2 text-center text-[12px] leading-5 text-eink-sub">{hint}</p>
        ) : null}
        {!loading && messages.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-eink-faint">暂无消息，发一条打个招呼吧</p>
        ) : null}
        {!loading
          ? messages.map((msg, index) => {
              const mine = msg.fromId === currentUser.id
              const showTime = index === 0 || msg.time - messages[index - 1].time > 5 * 60 * 1000
              const user = mine ? { ...currentUser, nickname: meName } : peer
              if (msg.recalledAt) {
                return (
                  <div key={msg.id}>
                    {showTime ? <TimeDivider time={msg.time} /> : null}
                    <p
                      data-testid="recalled-placeholder"
                      className="my-2 text-center text-[12px] text-eink-faint"
                    >
                      {mine ? '你撤回了一条消息' : '对方撤回了一条消息'}
                    </p>
                  </div>
                )
              }
              const read = mine && peerReadTs > 0 && peerReadTs >= msg.time
              return (
                <div key={msg.id} data-msg-id={msg.id}>
                  {showTime ? <TimeDivider time={msg.time} /> : null}
                  <div
                    className={`mb-3 flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}
                    onClick={(e) => {
                      // 阻止冒泡到列表容器(容器 onClick 会将 activeMsgId 置空)
                      e.stopPropagation()
                      setActiveMsgId(activeMsgId === msg.id ? null : msg.id)
                    }}
                  >
                    <Avatar name={user.nickname} color={avatarColor(user.id)} size={40} src={user.avatarUrl || ''} />
                    <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <Bubble mine={mine}>{msg.text}</Bubble>
                      {read ? (
                        <span data-testid="read-receipt" className="mt-0.5 px-1 text-[11px] text-eink-faint">
                          已读
                        </span>
                      ) : null}
                      {activeMsgId === msg.id ? (
                        <div
                          data-testid="msg-actions"
                          className="mt-1 flex gap-1.5 border border-eink-divider bg-eink-bar px-1.5 py-1"
                        >
                          {mine && canRecall(msg, currentUser.id) && cloudReady ? (
                            <button
                              type="button"
                              data-testid="recall-action"
                              className="px-1.5 py-0.5 text-[12px] text-eink-ink active:bg-eink-pressed"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRecall(msg)
                              }}
                            >
                              撤回
                            </button>
                          ) : null}
                          <button
                            type="button"
                            data-testid="delete-action"
                            className="px-1.5 py-0.5 text-[12px] text-eink-sub active:bg-eink-pressed"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDelete(msg)
                            }}
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })
          : null}
        {cloudReady
          ? pendingList.map((item) => (
              <div key={item.tmpId} data-testid={item.status === 'failed' ? 'pending-failed' : 'pending-sending'}>
                <div className="mb-3 flex flex-row-reverse items-start gap-2">
                  <Avatar name={meName} color={avatarColor(currentUser.id)} size={40} src={currentUser.avatarUrl || ''} />
                  <div className="flex max-w-[78%] flex-col items-end">
                    <div className="relative mr-1 max-w-full opacity-70">
                      <span className="bubble-tail bubble-tail-mine" />
                      <div className="break-words rounded-none bg-eink-ink px-2.5 py-[7px] text-[16px] leading-[22px] text-eink-paper">
                        {item.text}
                      </div>
                    </div>
                    {item.status === 'failed' ? (
                      <div className="mt-1 flex items-center gap-2 px-1">
                        <span className="text-[11px] leading-4 text-eink-sub">{item.error}</span>
                        <button
                          type="button"
                          data-testid="retry-send"
                          className="shrink-0 border border-eink-line/40 bg-eink-bar px-2 py-0.5 text-[12px] text-eink-ink active:bg-eink-pressed"
                          onClick={() => sendCloudMessage(item.text, item.tmpId)}
                        >
                          重试
                        </button>
                      </div>
                    ) : (
                      <span className="mt-0.5 px-1 text-[11px] text-eink-faint">发送中...</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          : null}
        <div ref={bottomRef} className="h-1" />
      </div>

      <form
        className="composer safe-bottom flex items-center gap-2 border-t border-eink-divider bg-eink-bar px-2 py-1.5"
        onSubmit={submit}
      >
        <input
          ref={inputRef}
          className="h-9 min-w-0 flex-1 rounded-none border border-eink-line/25 bg-eink-bar px-3 text-[16px] outline-none"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          placeholder="发送消息"
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setTimeout(() => scrollToBottom(true), 80)}
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-none bg-eink-ink px-3.5 text-[15px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
          disabled={!text.trim()}
        >
          发送
        </button>
      </form>

      {callState !== CALL_IDLE ? (
        <CallOverlay
          kind={callKind}
          state={callState === CALL_CONNECTED ? CALL_CONNECTED : CALL_CALLING}
          peer={peer}
          color={avatarColor(peer.id)}
          onHangup={onHangup}
        />
      ) : null}
    </div>
  )
}

function Bubble({ mine, children }) {
  return (
    <div className={`relative max-w-[72%] ${mine ? 'mr-1' : 'ml-1'}`}>
      <span className={`bubble-tail ${mine ? 'bubble-tail-mine' : 'bubble-tail-peer'}`} />
      <div
        className={`break-words rounded-none px-2.5 py-[7px] text-[16px] leading-[22px] ${
          mine ? 'bg-eink-ink text-eink-paper' : 'border border-eink-line/25 bg-eink-bar text-eink-text'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function TimeDivider({ time }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-none border border-eink-divider bg-eink-bar px-1.5 py-0.5 text-[12px] text-eink-faint">
        {formatChatTime(time)}
      </span>
    </div>
  )
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="5.5" cy="12" r="1.6" fill="#191919" />
      <circle cx="12" cy="12" r="1.6" fill="#191919" />
      <circle cx="18.5" cy="12" r="1.6" fill="#191919" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6.6 3.8c.4-.4 1-.5 1.5-.3l2.1.8c.5.2.8.7.8 1.2v2.2c0 .4-.2.8-.5 1L9.2 10c.8 1.7 2.1 3 3.8 3.8l1.3-1.3c.3-.3.7-.5 1.1-.5h2.2c.5 0 1 .3 1.2.8l.8 2.1c.2.5.1 1.1-.3 1.5l-1.3 1.3c-.4.4-1 .6-1.6.5C11.2 18.5 5.5 12.8 4.8 7.7c-.1-.6.1-1.2.5-1.6L6.6 3.8Z" stroke="#191919" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" stroke="#191919" strokeWidth="1.6" />
      <path d="M15.5 10.5 20 8v8l-4.5-2.5v-3Z" stroke="#191919" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="#191919" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

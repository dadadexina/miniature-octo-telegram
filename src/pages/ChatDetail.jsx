import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import AuthBar from '../components/AuthBar'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import LongTextBody from '../components/LongTextBody'
import SignedImage from '../components/SignedImage'
import CallOverlay from '../components/CallOverlay'
import useKeyboardInset from '../hooks/useKeyboardInset'
import useVoiceCall from '../hooks/useVoiceCall'
import {
  canRecall,
  fetchHiddenIds,
  fetchThread,
  hideMessage,
  insertMessage,
  isPairMessage,
  isUuid,
  recallMessage,
  searchThreadMessages,
} from '../lib/messages'
import { downscaleImageFile } from '../lib/imagePipeline'
import { CALL_STATUS } from '../lib/call'
import { MESSAGE_MEDIA_LIMITS, uploadMessageBlob } from '../lib/messageMedia'
import { supabase } from '../lib/supabase'
import { friendlyInsertError } from '../lib/syncHelpers'
import { useStore } from '../store'
import { formatChatTime, quoteExcerpt } from '../utils'

const REPLIES = [
  '收到，我稍后回你。',
  '好的，没问题。',
  '哈哈，明白了。',
  '现在有点忙，等会儿聊。',
  '嗯嗯。',
  '这个主意不错。',
]

export default function ChatDetail() {
  const { peerId } = useParams()
  const navigate = useNavigate()
  const {
    currentUser, getUser, messagesWith, sendMessage, receiveMessage, avatarColor, logout, profile,
    inbox, mergeInbox, openPeer, readReceiptOf, isBlocked, setBlockedFor, syncTick, drafts, setDraft,
  } = useStore()
  const meName = profile?.nickname || currentUser?.nickname
  const text = drafts?.[peerId] || ''
  const setText = (v) => setDraft(peerId, v)
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('')
  const [needSql, setNeedSql] = useState(false)
  const [useCloud, setUseCloud] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [oldestAt, setOldestAt] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pendingList, setPendingList] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [activeMsgId, setActiveMsgId] = useState(null)
  const [quoteMsg, setQuoteMsg] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [flashMsgId, setFlashMsgId] = useState(null)
  const flashTimer = useRef(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const typingChannelRef = useRef(null)
  const peerTypingTimer = useRef(null)
  const lastTrackRef = useRef(0)
  const [attach, setAttach] = useState(null)
  const [viewerUrl, setViewerUrl] = useState(null)
  const fileInputRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const listRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const replyTimer = useRef(null)
  const keepScrollRef = useRef(false)
  const keyboardInset = useKeyboardInset()
  const call = useVoiceCall({
    myId: currentUser?.id,
    remoteId: peerId,
    enabled: Boolean(currentUser) && isUuid(currentUser.id) && isUuid(peerId),
  })
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
  const msgById = new Map(messages.map((m) => [String(m.id), m]))
  const peerDisplayName = peer?.nickname || '用户'
  const nameOfSender = (fromId) => (fromId === currentUser?.id ? meName : peerDisplayName)
  const resolveQuote = (replyToId) => {
    if (!replyToId) return null
    const q = msgById.get(String(replyToId))
    if (!q) return { name: '', text: '[原消息已不可见]' }
    if (q.recalledAt) return { name: nameOfSender(q.fromId), text: '[已撤回的消息]' }
    const excerpted = quoteExcerpt(q.text || '')
    return {
      name: nameOfSender(q.fromId),
      text: excerpted || (q.attachments?.type === 'image' ? '[图片]' : ''),
    }
  }

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
    setQuoteMsg(null)
    setSearchOpen(false)
    setSearchQ('')
    setSearchResults([])
    setFlashMsgId(null)
    setAttach(null)
    setViewerUrl(null)
  }, [peerId])

  useEffect(() => {
    if (!searchOpen) return undefined
    const q = searchQ.trim()
    if (!q) {
      setSearchResults([])
      setSearching(false)
      return undefined
    }
    let alive = true
    setSearching(true)
    const t = setTimeout(async () => {
      let msgs = []
      if (cloudReady) {
        const res = await searchThreadMessages({ userId: currentUser.id, peerId, query: q, limit: 50 })
        if (res.ok) msgs = res.messages
      } else {
        const lq = q.toLowerCase()
        msgs = messagesWith(peerId).filter((m) => (m.text || '').toLowerCase().includes(lq))
      }
      if (!alive) return
      setSearchResults(
        msgs
          .filter((m) => !m.recalledAt && !hiddenIds.has(m.id))
          .sort((x, y) => y.time - x.time)
          .slice(0, 50)
      )
      setSearching(false)
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [searchOpen, searchQ, cloudReady, currentUser?.id, peerId, hiddenIds, messagesWith])

  useEffect(() => {
    if (!cloudReady) return undefined
    const pairKey = [currentUser.id, peerId].sort().join('__')
    const ch = supabase.channel(`typing:${pairKey}`, {
      config: { presence: { key: currentUser.id, enabled: true } },
    })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      if (state[peerId]?.length) {
        setPeerTyping(true)
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current)
        peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 5000)
      } else if (!state[peerId]) {
        setPeerTyping(false)
      }
    })
    ch.subscribe()
    typingChannelRef.current = ch
    return () => {
      if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current)
      typingChannelRef.current = null
      setPeerTyping(false)
      supabase.removeChannel(ch)
    }
  }, [cloudReady, currentUser?.id, peerId])

  if (!currentUser) return <Navigate to="/login" replace />

  if (!peer) {
    return (
      <div className="flex h-full flex-col bg-eink-paper">
        <NavBar title="聊天" left={<Back onClick={() => navigate('/chats')} />} />
        <p className="p-8 text-center text-eink-sub">用户不存在</p>
      </div>
    )
  }

  const sendCloudMessage = async (content, tmpId, replyToId = '', media = null) => {
    let attachments = null
    if (media?.blob) {
      setPendingList((prev) =>
        prev.map((item) => (item.tmpId === tmpId ? { ...item, status: 'uploading', error: '' } : item))
      )
      const up = await uploadMessageBlob({
        blob: media.blob,
        width: media.width || 0,
        height: media.height || 0,
        meId: currentUser.id,
        peerId,
      })
      if (!up.ok) {
        setPendingList((prev) =>
          prev.map((item) =>
            item.tmpId === tmpId ? { ...item, status: 'failed', error: up.error || '图片上传失败' } : item
          )
        )
        return
      }
      attachments = { type: 'image', path: up.path, width: up.width, height: up.height }
    }
    setPendingList((prev) =>
      prev.map((item) => (item.tmpId === tmpId ? { ...item, status: 'sending', error: '' } : item))
    )
    const result = await insertMessage({
      senderId: currentUser.id,
      receiverId: peerId,
      content,
      replyToId,
      attachments,
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


  const jumpToResult = (msg) => {
    setSearchOpen(false)
    setSearchQ('')
    setSearchResults([])
    const idStr = String(msg.id)
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-msg-id="${idStr}"]`)
      if (!node) {
        setHint('该消息不在已加载范围，可先点「加载更早的消息」')
        return
      }
      setHint('')
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashMsgId(idStr)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlashMsgId(null), 1500)
    })
  }

  const announceTyping = () => {
    const ch = typingChannelRef.current
    if (!ch || !cloudReady) return
    const nowTs = Date.now()
    if (nowTs - lastTrackRef.current < 2000) return
    lastTrackRef.current = nowTs
    ch.track({ typing: true }).catch(() => {})
  }

  const stopTypingSignal = () => {
    typingChannelRef.current?.untrack().catch(() => {})
  }

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAttach({ status: 'processing', error: '' })
    const scaled = await downscaleImageFile(file, MESSAGE_MEDIA_LIMITS)
    if (!scaled.ok) {
      setAttach({ status: 'error', error: scaled.error })
      return
    }
    const url =
      typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(scaled.blob) : ''
    setAttach({
      status: 'ready',
      blob: scaled.blob,
      url,
      width: scaled.width || 0,
      height: scaled.height || 0,
      error: '',
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    const content = text.trim()
    const media =
      attach?.status === 'ready' && attach.blob
        ? { blob: attach.blob, width: attach.width, height: attach.height, url: attach.url }
        : null
    if (!content && !media) return
    if (cloudReady) {
      const tmpId = makeTmpId()
      const quote = quoteMsg
        ? {
            replyToId: quoteMsg.id,
            name: nameOfSender(quoteMsg.fromId),
            text:
              quoteMsg.recalledAt
                ? '[已撤回的消息]'
                : quoteExcerpt(quoteMsg.text || '') ||
                  (quoteMsg.attachments?.type === 'image' ? '[图片]' : ''),
          }
        : null
      setPendingList((prev) => [
        ...prev,
        {
          tmpId,
          text: content,
          time: Date.now(),
          status: media ? 'uploading' : 'sending',
          error: '',
          reply: quote,
          image: media?.url || '',
          media,
        },
      ])
      setText('')
      setQuoteMsg(null)
      setAttach(null)
      stopTypingSignal()
      requestAnimationFrame(() => scrollToBottom(true))
      await sendCloudMessage(content, tmpId, quote?.replyToId || '', media)
      return
    }
    const result = sendMessage(peerId, content)
    if (!result.ok) return
    setText('')
    requestAnimationFrame(() => scrollToBottom(true))
    if (replyTimer.current) clearTimeout(replyTimer.current)
    const reply = pickReply()
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
        title={peerTyping ? <span data-testid="typing-indicator">正在输入…</span> : peer.nickname}
        left={<Back onClick={() => navigate('/chats')} />}
        right={
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              data-testid="msg-search-open"
              className="flex h-9 w-9 items-center justify-center"
              aria-label="搜索聊天记录"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <SearchIcon />
            </button>
            {cloudReady ? (
              <button
                type="button"
                data-testid="call-audio-btn"
                className="flex h-9 w-9 items-center justify-center"
                onClick={call.start}
                aria-label="语音通话"
              >
                <PhoneIcon />
              </button>
            ) : null}
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


      {searchOpen ? (
        <div data-testid="msg-search-bar" className="shrink-0 border-b border-eink-divider bg-eink-bar px-2 py-1.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              data-testid="msg-search-input"
              className="h-8 min-w-0 flex-1 rounded-none border border-eink-line/25 bg-eink-paper px-2 text-[14px] outline-none"
              type="text"
              placeholder="搜索聊天记录"
              maxLength={64}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
            <button
              type="button"
              data-testid="msg-search-close"
              className="shrink-0 px-2 py-1 text-[13px] text-eink-sub active:text-eink-ink"
              onClick={() => {
                setSearchOpen(false)
                setSearchQ('')
                setSearchResults([])
              }}
            >
              关闭
            </button>
          </div>
          {searching ? (
            <p className="px-1 py-2 text-[12px] text-eink-faint">搜索中...</p>
          ) : searchQ.trim() && searchResults.length === 0 ? (
            <p data-testid="msg-search-empty" className="px-1 py-2 text-[12px] text-eink-faint">
              没有匹配的消息
            </p>
          ) : null}
          <div className="max-h-[45vh] overflow-y-auto no-scrollbar">
            {searchResults.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid="msg-search-result"
                className="block w-full border-b border-eink-divider/60 px-1 py-2 text-left active:bg-eink-pressed"
                onClick={() => jumpToResult(m)}
              >
                <span className="block text-[11px] text-eink-faint">
                  {formatChatTime(m.time)} · {m.fromId === currentUser.id ? '我' : peer.nickname}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-eink-ink">{m.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
                <div
                  key={msg.id}
                  data-msg-id={msg.id}
                  className={flashMsgId === String(msg.id) ? 'bg-[#E4E2DA] transition-colors duration-300' : 'transition-colors duration-300'}
                >
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
                      <Bubble mine={mine}>
                        {msg.replyToId ? <QuoteStrip mine={mine} quote={resolveQuote(msg.replyToId)} /> : null}
                        {msg.attachments?.type === 'image' ? (
                          <SignedImage attachment={msg.attachments} onView={setViewerUrl} />
                        ) : null}
                        <LongTextBody text={msg.text} />
                      </Bubble>
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
                          {cloudReady ? (
                            <button
                              type="button"
                              data-testid="quote-action"
                              className="px-1.5 py-0.5 text-[12px] text-eink-ink active:bg-eink-pressed"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMsgId(null)
                                setQuoteMsg(msg)
                                setTimeout(() => inputRef.current?.focus(), 0)
                              }}
                            >
                              引用
                            </button>
                          ) : null}
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
                      <div className="break-words whitespace-pre-wrap rounded-none bg-eink-ink px-2.5 py-[7px] text-[16px] leading-[22px] text-eink-paper">
                        {item.reply ? <QuoteStrip mine quote={item.reply} /> : null}
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="mb-1 max-w-full border border-eink-divider object-cover opacity-80"
                            style={{ width: 160, filter: 'grayscale(1) contrast(1.05)' }}
                          />
                        ) : null}
                        <LongTextBody text={item.text} />
                      </div>
                    </div>
                    {item.status === 'failed' ? (
                      <div className="mt-1 flex items-center gap-2 px-1">
                        <span className="text-[11px] leading-4 text-eink-sub">{item.error}</span>
                        <button
                          type="button"
                          data-testid="retry-send"
                          className="shrink-0 border border-eink-line/40 bg-eink-bar px-2 py-0.5 text-[12px] text-eink-ink active:bg-eink-pressed"
                          onClick={() => sendCloudMessage(item.text, item.tmpId, item.reply?.replyToId || '', item.media || null)}
                        >
                          重试
                        </button>
                      </div>
                    ) : (
                      <span className="mt-0.5 px-1 text-[11px] text-eink-faint">
                        {item.status === 'uploading' ? '图片上传中...' : '发送中...'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          : null}
        <div ref={bottomRef} className="h-1" />
      </div>

      <form
        className="composer safe-bottom border-t border-eink-divider bg-eink-bar"
        onSubmit={submit}
      >
        {attach ? (
          <div
            data-testid="attach-preview"
            className="flex items-center gap-2 border-b border-eink-divider px-2 py-1.5"
          >
            {attach.status === 'processing' ? (
              <span className="text-[12px] text-eink-sub">处理图片中...</span>
            ) : null}
            {attach.status === 'error' ? (
              <span className="text-[12px] text-eink-sub" data-testid="attach-error">{attach.error}</span>
            ) : null}
            {attach.status === 'ready' && attach.url ? (
              <img
                src={attach.url}
                alt="附件预览"
                className="h-14 w-14 border border-eink-divider object-cover"
                style={{ filter: 'grayscale(1) contrast(1.05)' }}
              />
            ) : null}
            <button
              type="button"
              data-testid="attach-clear"
              className="ml-auto shrink-0 border border-eink-line/40 bg-eink-bar px-2 py-0.5 text-[12px] text-eink-ink active:bg-eink-pressed"
              onClick={() => setAttach(null)}
            >
              移除
            </button>
          </div>
        ) : null}
        {quoteMsg ? (
          <div className="flex items-center gap-2 px-2 pt-1.5">
            <div
              data-testid="quote-bar"
              className="min-w-0 flex-1 truncate border-l-2 border-eink-line bg-eink-paper px-2 py-1 text-[12px] text-eink-sub"
            >
              {nameOfSender(quoteMsg.fromId)}: {quoteMsg.recalledAt ? '[已撤回的消息]' : quoteExcerpt(quoteMsg.text || '')}
            </div>
            <button
              type="button"
              data-testid="quote-clear"
              aria-label="取消引用"
              className="shrink-0 px-2 py-1 text-[15px] leading-none text-eink-sub active:text-eink-ink"
              onClick={() => setQuoteMsg(null)}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 px-2 py-1.5">
        {cloudReady ? (
          <>
            <button
              type="button"
              data-testid="attach-btn"
              aria-label="发送图片"
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-eink-line/25 bg-eink-bar text-eink-ink active:bg-eink-pressed"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              data-testid="attach-input"
              className="hidden"
              onChange={handlePickFile}
            />
          </>
        ) : null}
        <input
          ref={inputRef}
          className="h-9 min-w-0 flex-1 rounded-none border border-eink-line/25 bg-eink-bar px-3 text-[16px] outline-none"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          placeholder="发送消息"
          maxLength={4000}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            announceTyping()
          }}
          onBlur={stopTypingSignal}
          onFocus={() => setTimeout(() => scrollToBottom(true), 80)}
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-none bg-eink-ink px-3.5 text-[15px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
          disabled={!text.trim() && !(attach?.status === 'ready' && attach.blob)}
        >
          发送
        </button>
        </div>
      </form>

      {viewerUrl ? (
        <div
          data-testid="image-viewer"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewerUrl(null)}
        >
          <img
            src={viewerUrl}
            alt="图片大图"
            className="max-h-full max-w-full object-contain"
            style={{ filter: 'grayscale(1) contrast(1.05)' }}
          />
        </div>
      ) : null}

      {call.status !== CALL_STATUS.IDLE ? (
        <CallOverlay
          state={call.status}
          seconds={call.seconds}
          muted={call.muted}
          error={call.error}
          peer={peer}
          color={avatarColor(peer.id)}
          remoteStream={call.remoteStream}
          onAnswer={call.answer}
          onDecline={call.decline}
          onHangup={call.hangup}
          onToggleMute={call.toggleMute}
        />
      ) : null}
    </div>
  )
}

function QuoteStrip({ mine, quote }) {
  if (!quote) return null
  return (
    <span
      data-testid="quote-strip"
      className={`mb-1 block border-l-2 pl-1.5 text-[13px] leading-[18px] ${
        mine ? 'border-eink-paper/50 text-eink-paper/80' : 'border-eink-line text-eink-sub'
      }`}
    >
      {quote.name ? `${quote.name}: ` : ''}
      {quote.text}
    </span>
  )
}

function makeTmpId() {
  return `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function pickReply() {
  return REPLIES[Math.floor(Math.random() * REPLIES.length)]
}

function Bubble({ mine, children }) {
  return (
    <div className={`relative max-w-full ${mine ? 'mr-1' : 'ml-1'}`}>
      <span className={`bubble-tail ${mine ? 'bubble-tail-mine' : 'bubble-tail-peer'}`} />
      <div
        className={`break-words whitespace-pre-wrap rounded-none px-2.5 py-[7px] text-[16px] leading-[22px] ${
          mine ? 'bg-eink-ink text-eink-paper' : 'border border-eink-line/25 bg-eink-bar text-eink-text'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.2" stroke="#191919" strokeWidth="1.6" />
      <path d="m12.2 12.2 3.3 3.3" stroke="#191919" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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


function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="#191919" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import ReportSheet from './ReportSheet'
import { isUuid } from '../lib/messages'
import { fetchProfilesByIds } from '../lib/profiles'
import { submitReport } from '../lib/reports'
import { formatTime } from '../utils'
import { useStore } from '../store'
import {
  WORLD_CHANNELS,
  WORLD_MESSAGE_LIMIT,
  fetchWorldMessages,
  filterBlockedMessages,
  mergeWorldMessages,
  sendWorldMessage,
  subscribeWorldMessages,
  worldChannelLabel,
} from '../lib/worldChat'

export default function WorldChat({ onClose }) {
  const { currentUser, profile, avatarColor, blockedIds, setBlockedFor, displayNameOf } = useStore()
  const meId = currentUser?.id || ''
  const canChat = isUuid(meId)
  const meName = displayNameOf?.(meId) || profile?.nickname || currentUser?.nickname || '我'
  const [channel, setChannel] = useState('world')
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(canChat)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionFor, setActionFor] = useState(null)
  const [reportFor, setReportFor] = useState(null)
  const listRef = useRef(null)
  const profilesRef = useRef({})
  const statusTimerRef = useRef(null)

  const colorOf = useCallback((id) => (typeof avatarColor === 'function' ? avatarColor(id) : '#191919'), [avatarColor])

  const showStatus = useCallback((message) => {
    setStatus(message)
    clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => setStatus(''), 2600)
  }, [])

  useEffect(() => () => clearTimeout(statusTimerRef.current), [])

  useEffect(() => {
    if (!canChat) {
      setLoading(false)
      return undefined
    }
    let alive = true
    setLoading(true)
    setError('')
    setMessages([])
    profilesRef.current = {}
    setProfiles({})
    fetchWorldMessages(channel).then((result) => {
      if (!alive) return
      if (!result.ok) {
        setError(result.error || '世界频道暂时不可用')
        setMessages([])
      } else {
        setMessages(result.messages)
      }
      setLoading(false)
    })
    const stop = subscribeWorldMessages(channel, (message) => {
      if (!alive) return
      setMessages((prev) => mergeWorldMessages(prev, message))
    })
    return () => {
      alive = false
      stop()
    }
  }, [canChat, channel])

  useEffect(() => {
    if (!messages.length) return undefined
    const missing = [...new Set(messages.map((message) => message.authorId))].filter(
      (id) => id && !profilesRef.current[id]
    )
    if (!missing.length) return undefined
    missing.forEach((id) => {
      profilesRef.current[id] = { name: '', avatarUrl: '' }
    })
    let alive = true
    fetchProfilesByIds(missing).then((result) => {
      if (!alive) return
      const next = { ...profilesRef.current }
      if (result.ok) {
        result.profiles.forEach((item) => {
          next[item.id] = { name: item.nickname || '纸墨用户', avatarUrl: item.avatarUrl || '' }
        })
      }
      missing.forEach((id) => {
        if (!next[id]?.name) next[id] = { name: '纸墨用户', avatarUrl: '' }
      })
      profilesRef.current = next
      setProfiles(next)
    })
    return () => {
      alive = false
    }
  }, [messages])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, channel, loading])

  const visibleMessages = useMemo(
    () => filterBlockedMessages(messages, blockedIds || []),
    [messages, blockedIds]
  )

  const authorOf = useCallback(
    (id) => {
      if (id === meId) return { name: meName, avatarUrl: profile?.avatarUrl || '' }
      return profiles[id] || { name: '纸墨用户', avatarUrl: '' }
    },
    [meId, meName, profile?.avatarUrl, profiles]
  )

  const send = async (event) => {
    event?.preventDefault?.()
    if (sending || !canChat) return
    const body = text.trim()
    if (!body) return
    setSending(true)
    setError('')
    const result = await sendWorldMessage(channel, body)
    setSending(false)
    if (!result.ok) {
      setError(result.error || '发送失败')
      return
    }
    setText('')
    if (result.message) setMessages((prev) => mergeWorldMessages(prev, result.message))
  }

  const blockAuthor = async (message) => {
    if (!message || message.authorId === meId) return
    setActionFor(null)
    if (typeof setBlockedFor !== 'function') return
    const result = await setBlockedFor(message.authorId, true)
    if (!result?.ok) {
      setError(result?.error || '屏蔽失败')
      return
    }
    setMessages((prev) => prev.filter((item) => item.authorId !== message.authorId))
    showStatus('已屏蔽，该用户的消息不再显示')
  }

  const report = async (reason, detail) => {
    if (!reportFor) return { ok: false, error: '消息不存在' }
    return submitReport({
      reporterId: meId,
      targetType: 'message',
      targetId: reportFor.id,
      targetUserId: reportFor.authorId,
      reason,
      detail,
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-eink-ink/25"
      data-testid="world-chat"
      onClick={onClose}
    >
      <div
        className="safe-bottom flex h-[84vh] w-full flex-col border-t-2 border-eink-ink bg-eink-paper text-eink-ink"
        data-testid="world-chat-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-eink-divider px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium tracking-[0.08em]">世界频道</p>
            <p data-testid="world-chat-notice" className="mt-0.5 text-[10px] text-eink-faint">
              公开聊天，这里不能加好友 · 消息保留 7 天
            </p>
          </div>
          <button
            type="button"
            data-testid="world-chat-close"
            className="shrink-0 border border-eink-line/40 px-2 py-1 text-[11px] text-eink-sub active:bg-eink-surface"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-eink-divider px-2 py-1.5">
          {WORLD_CHANNELS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`world-chat-tab-${item.id}`}
              aria-pressed={channel === item.id}
              title={item.hint}
              className={`shrink-0 border px-2 py-1 text-[11px] ${
                channel === item.id
                  ? 'border-eink-ink bg-eink-ink text-eink-paper'
                  : 'border-eink-line/30 text-eink-sub active:bg-eink-surface'
              }`}
              onClick={() => setChannel(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
          {!canChat ? (
            <p data-testid="world-chat-guest" className="px-4 py-10 text-center text-[13px] text-eink-faint">
              世界频道仅对注册用户开放，请先登录云端账号。
            </p>
          ) : loading ? (
            <p className="px-4 py-10 text-center text-[12px] text-eink-faint">正在接入 {worldChannelLabel(channel)}…</p>
          ) : visibleMessages.length ? (
            visibleMessages.map((message) => {
              const author = authorOf(message.authorId)
              const mine = message.authorId === meId
              return (
                <div
                  key={message.id}
                  data-testid="world-chat-message"
                  className={`flex items-start gap-2 px-3 py-1.5 ${mine ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar name={author.name} color={colorOf(message.authorId)} src={author.avatarUrl} size={26} />
                  <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-1.5 text-[10px] text-eink-faint">
                      <span className="max-w-[120px] truncate">{mine ? '我' : author.name}</span>
                      <span className="tabular-nums">{formatTime(message.time)}</span>
                    </div>
                    <p
                      className={`mt-0.5 whitespace-pre-wrap break-words border px-2 py-1 text-[13px] leading-relaxed ${
                        mine
                          ? 'border-eink-ink/20 bg-eink-surface text-eink-ink'
                          : 'border-eink-divider bg-eink-bar text-eink-ink'
                      }`}
                    >
                      {message.content}
                    </p>
                  </div>
                  {mine ? null : (
                    <button
                      type="button"
                      data-testid="world-chat-more"
                      aria-label={`对 ${author.name} 的消息操作`}
                      className="mt-2 shrink-0 px-1 text-[13px] leading-none text-eink-faint active:text-eink-ink"
                      onClick={() => setActionFor(message)}
                    >
                      ···
                    </button>
                  )}
                </div>
              )
            })
          ) : (
            <p data-testid="world-chat-empty" className="px-4 py-10 text-center text-[13px] text-eink-faint">
              {worldChannelLabel(channel)}还没有人说话，来打个招呼。
            </p>
          )}
        </div>

        {error ? (
          <p data-testid="world-chat-error" className="border-t border-eink-divider px-3 py-1 text-[11px] text-[#8C2F22]">
            {error}
          </p>
        ) : null}
        {status ? (
          <p data-testid="world-chat-status" className="border-t border-eink-divider px-3 py-1 text-[11px] text-eink-sub">
            {status}
          </p>
        ) : null}

        <form className="flex items-end gap-2 border-t border-eink-divider px-2 py-2" onSubmit={send}>
          <textarea
            data-testid="world-chat-input"
            rows={2}
            value={text}
            maxLength={WORLD_MESSAGE_LIMIT}
            disabled={!canChat || sending}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(event)
              }
            }}
            placeholder={canChat ? '说点什么，所有人可见…' : '登录后可参与世界频道'}
            className="min-h-[44px] min-w-0 flex-1 resize-none border border-eink-divider bg-eink-bar px-2 py-1.5 text-[13px] text-eink-ink outline-none placeholder:text-eink-faint disabled:opacity-60"
          />
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[9px] tabular-nums text-eink-faint">
              {text.length}/{WORLD_MESSAGE_LIMIT}
            </span>
            <button
              type="submit"
              data-testid="world-chat-send"
              disabled={!canChat || sending || !text.trim()}
              className="border border-eink-ink bg-eink-ink px-3 py-1.5 text-[12px] text-eink-paper disabled:opacity-40"
            >
              {sending ? '发送中' : '发送'}
            </button>
          </div>
        </form>
      </div>

      {actionFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-eink-ink/30"
          data-testid="world-chat-actions"
          onClick={(event) => {
            event.stopPropagation()
            setActionFor(null)
          }}
        >
          <div
            className="safe-bottom w-full border-t-2 border-eink-ink bg-eink-bar px-3 py-2"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-2 truncate text-[12px] text-eink-sub">
              {authorOf(actionFor.authorId).name} 的消息
            </p>
            <button
              type="button"
              data-testid="world-chat-report"
              className="block w-full border-b border-eink-divider py-2 text-left text-[14px] text-eink-ink active:bg-eink-surface"
              onClick={() => {
                setReportFor(actionFor)
                setActionFor(null)
              }}
            >
              举报这条消息
            </button>
            <button
              type="button"
              data-testid="world-chat-block"
              className="block w-full border-b border-eink-divider py-2 text-left text-[14px] text-[#8C2F22] active:bg-eink-surface"
              onClick={() => blockAuthor(actionFor)}
            >
              屏蔽该用户
            </button>
            <button
              type="button"
              className="block w-full py-2 text-left text-[14px] text-eink-sub active:bg-eink-surface"
              onClick={() => setActionFor(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {reportFor ? (
        <ReportSheet
          title={`举报 ${authorOf(reportFor.authorId).name} 的世界频道消息`}
          onClose={() => setReportFor(null)}
          onSubmit={report}
        />
      ) : null}
    </div>
  )
}

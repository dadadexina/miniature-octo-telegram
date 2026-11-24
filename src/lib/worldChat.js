import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export const WORLD_CHANNELS = [
  { id: 'world', label: '世界', hint: '所有注册用户' },
  { id: 'asia', label: '亚洲', hint: '亚洲时区' },
  { id: 'europe', label: '欧洲', hint: '欧洲时区' },
  { id: 'africa', label: '非洲', hint: '非洲时区' },
  { id: 'north-america', label: '北美', hint: '北美时区' },
  { id: 'south-america', label: '南美', hint: '南美时区' },
  { id: 'oceania', label: '大洋洲', hint: '大洋洲时区' },
  { id: 'antarctica', label: '南极', hint: '南极考察站' },
]

const CHANNEL_IDS = new Set(WORLD_CHANNELS.map((item) => item.id))
export const WORLD_MESSAGE_LIMIT = 300
export const WORLD_RETENTION_DAYS = 7
const FETCH_LIMIT = 60
const KEEP_LIMIT = 200

const ERROR_TEXT = {
  not_authenticated: '登录后才能发言',
  bad_channel: '频道不存在',
  empty_content: '说点什么再发送',
  content_too_long: '消息最多 300 字',
  new_account: '新账号注册满 30 秒后才能发言',
  rate_limited: '发送太快了，稍等片刻再发',
}

export function worldChannelLabel(id) {
  return WORLD_CHANNELS.find((item) => item.id === id)?.label || '世界'
}

export function isWorldChannel(id) {
  return CHANNEL_IDS.has(String(id || ''))
}

export function normalizeWorldMessage(row) {
  if (!row || !row.id || !row.author_id) return null
  const time = row.created_at ? new Date(row.created_at).getTime() : Date.now()
  return {
    id: String(row.id),
    authorId: row.author_id,
    channel: row.channel || 'world',
    content: String(row.content || ''),
    time: Number.isFinite(time) ? time : Date.now(),
    createdAt: row.created_at || '',
  }
}

export function validateWorldMessage(input) {
  const text = String(input || '').trim()
  if (!text) return { ok: false, error: ERROR_TEXT.empty_content, text: '' }
  if (text.length > WORLD_MESSAGE_LIMIT) {
    return { ok: false, error: ERROR_TEXT.content_too_long, text }
  }
  return { ok: true, text, error: '' }
}

export function worldChatErrorText(error) {
  const raw = String(error?.message || '').toLowerCase()
  const key = Object.keys(ERROR_TEXT).find((item) => raw.includes(item))
  if (key) return ERROR_TEXT[key]
  if (isPermissionError(error)) return '暂无世界频道权限，请先执行云初始化 SQL'
  return error?.message || '发送失败，请稍后再试'
}

export function filterBlockedMessages(messages, blockedIds) {
  const blocked = blockedIds instanceof Set ? blockedIds : new Set([...(blockedIds || [])].map(String))
  if (!blocked.size) return messages
  return messages.filter((message) => !blocked.has(String(message.authorId)))
}

export function mergeWorldMessages(messages, incoming) {
  if (!incoming) return messages
  const exists = messages.some((message) => message.id === incoming.id)
  const next = exists
    ? messages.map((message) => (message.id === incoming.id ? incoming : message))
    : [...messages, incoming]
  next.sort((a, b) => a.time - b.time || Number(a.id) - Number(b.id))
  return next.slice(-KEEP_LIMIT)
}

export async function fetchWorldMessages(channel, { limit = FETCH_LIMIT } = {}) {
  if (!isWorldChannel(channel)) return { ok: false, error: '频道不存在', messages: [] }
  const since = new Date(Date.now() - WORLD_RETENTION_DAYS * 86400000).toISOString()
  try {
    const { data, error } = await supabase
      .from('world_messages')
      .select('id,author_id,channel,content,created_at')
      .eq('channel', channel)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      return { ok: false, error: worldChatErrorText(error), messages: [], permission: isPermissionError(error) }
    }
    const messages = (data || [])
      .map(normalizeWorldMessage)
      .filter(Boolean)
      .sort((a, b) => a.time - b.time || Number(a.id) - Number(b.id))
    return { ok: true, messages, error: '' }
  } catch {
    return { ok: false, error: '网络异常，无法读取世界频道', messages: [] }
  }
}

export async function sendWorldMessage(channel, input) {
  const check = validateWorldMessage(input)
  if (!check.ok) return { ok: false, error: check.error }
  if (!isWorldChannel(channel)) return { ok: false, error: '频道不存在' }
  try {
    const { data, error } = await supabase.rpc('send_world_message', {
      p_channel: channel,
      p_content: check.text,
    })
    if (error) {
      return { ok: false, error: worldChatErrorText(error), permission: isPermissionError(error) }
    }
    const row = Array.isArray(data) ? data[0] : data
    const message = normalizeWorldMessage(row)
    if (!message) return { ok: true, message: null }
    return { ok: true, message }
  } catch {
    return { ok: false, error: '网络异常，消息未发出' }
  }
}

export function subscribeWorldMessages(channel, onMessage) {
  if (!isWorldChannel(channel)) return () => {}
  let channelRef = null
  try {
    channelRef = supabase
      .channel(`world-chat:${channel}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'world_messages', filter: `channel=eq.${channel}` },
        (payload) => {
          const message = normalizeWorldMessage(payload?.new)
          if (message) onMessage(message)
        }
      )
      .subscribe()
  } catch {
    return () => {}
  }
  return () => {
    try {
      if (channelRef) supabase.removeChannel(channelRef)
    } catch {
      // 频道已断开时忽略
    }
  }
}

import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export function isUuid(id = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function parseAttachments(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw
  return null
}

export function mapMessage(row) {
  if (!row) return null
  const fromId = row.sender_id || row.from_id || ''
  const toId = row.receiver_id || row.to_id || ''
  const text = row.content || row.text || row.body || ''
  const time = row.created_at ? new Date(row.created_at).getTime() : Date.now()
  return {
    id: row.id,
    fromId,
    toId,
    text,
    time,
    recalledAt: row.recalled_at ? new Date(row.recalled_at).getTime() : null,
    replyToId: row.reply_to_id ?? '',
    attachments: parseAttachments(row.attachments),
    raw: row,
  }
}

export const RECALL_WINDOW_MS = 2 * 60 * 1000

export function canRecall(msg, meId, nowMs = Date.now()) {
  return Boolean(
    msg && !msg.pending && msg.fromId === meId && !msg.recalledAt &&
    nowMs - (msg.time || 0) <= RECALL_WINDOW_MS
  )
}

export async function recallMessage(messageId) {
  const { data, error } = await supabase
    .from('messages')
    .update({ recalled_at: new Date().toISOString(), content: '' })
    .eq('id', messageId)
    .select('*')
    .maybeSingle()
  if (error) {
    const msg = `${error.message || ''}`.toLowerCase()
    const denied = isPermissionError(error) || msg.includes('row-level security')
    return {
      ok: false,
      error: denied ? '超过 2 分钟的消息不能撤回' : error.message,
      permission: false,
    }
  }
  if (!data) return { ok: false, error: '超过 2 分钟的消息不能撤回' }
  return { ok: true, message: mapMessage(data) }
}

export async function hideMessage(messageId, meId) {
  const { error } = await supabase
    .from('message_hides')
    .upsert({ message_id: messageId, user_id: meId }, { ignoreDuplicates: true, onConflict: 'message_id,user_id' })
  if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
  return { ok: true }
}

export async function fetchHiddenIds(meId) {
  const { data, error } = await supabase.from('message_hides').select('message_id').eq('user_id', meId)
  if (error) return { ok: false, error: error.message, ids: [], permission: isPermissionError(error) }
  return { ok: true, ids: (data || []).map((row) => row.message_id) }
}

export async function insertMessage({ senderId, receiverId, content, replyToId = '', attachments = null }) {
  const payload = { sender_id: senderId, receiver_id: receiverId, content }
  if (replyToId) payload.reply_to_id = replyToId
  if (attachments) payload.attachments = attachments
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('*')
    .single()
  if (error) {
    return { ok: false, error: error.message, permission: isPermissionError(error) }
  }
  return { ok: true, message: mapMessage(data) }
}

export function escapeLikePattern(q) {
  return String(q || '').replace(/[%_\\]/g, (c) => `\\${c}`)
}

export async function searchThreadMessages({ userId, peerId, query, limit = 50 }) {
  const q = String(query || '').trim()
  if (!userId || !peerId || !q) return { ok: true, messages: [] }
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .or(`sender_id.eq.${peerId},receiver_id.eq.${peerId}`)
      .ilike('content', `%${escapeLikePattern(q)}%`)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      return { ok: false, error: error.message, messages: [], permission: isPermissionError(error) }
    }
    const messages = (data || [])
      .map(mapMessage)
      .filter((m) => isPairMessage(m, userId, peerId))
      .sort((a, b) => a.time - b.time)
    return { ok: true, messages }
  } catch {
    return { ok: false, error: '网络异常', messages: [] }
  }
}

export async function deletePairMessages(meId, peerId) {
  if (!meId || !peerId || meId === peerId) return { ok: false, error: '参数错误' }
  const pair = `and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`
  const { error } = await supabase.from('messages').delete().or(pair)
  if (error) {
    return { ok: false, error: error.message, permission: isPermissionError(error) }
  }
  return { ok: true }
}

export const THREAD_PAGE_SIZE = 50
export const INBOX_LIMIT = 500

export async function fetchThread(meId, peerId, options = {}) {
  const { before, limit = THREAD_PAGE_SIZE } = options
  let query = supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) {
    return { ok: false, error: error.message, messages: [], hasMore: false, oldest: null, permission: isPermissionError(error) }
  }
  const rows = data || []
  const messages = rows.map(mapMessage).sort((a, b) => a.time - b.time)
  return {
    ok: true,
    messages,
    hasMore: rows.length === limit,
    oldest: rows.length ? rows[rows.length - 1].created_at : null,
  }
}

export async function fetchInbox(meId, limit = INBOX_LIMIT) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${meId},receiver_id.eq.${meId}`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    return { ok: false, error: error.message, messages: [], permission: isPermissionError(error) }
  }
  return { ok: true, messages: (data || []).map(mapMessage).sort((a, b) => a.time - b.time) }
}

export function involvesUser(msg, userId) {
  return Boolean(msg && userId && (msg.fromId === userId || msg.toId === userId))
}

export function peerIdOf(msg, meId) {
  if (!msg || !meId) return ''
  return msg.fromId === meId ? msg.toId : msg.fromId
}

export function isPairMessage(msg, a, b) {
  if (!msg || !a || !b) return false
  return (msg.fromId === a && msg.toId === b) || (msg.fromId === b && msg.toId === a)
}

export function mergeMessages(prev, incoming) {
  const list = [...(prev || [])]
  ;(incoming || []).forEach((msg) => {
    if (!msg?.id) return
    const idx = list.findIndex((item) => item.id === msg.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...msg }
    else list.push(msg)
  })
  return list.sort((a, b) => a.time - b.time)
}

export function groupConversations(meId, messages) {
  const map = new Map()
  messages.forEach((msg) => {
    const peerId = msg.fromId === meId ? msg.toId : msg.fromId
    if (!peerId || peerId === meId) return
    const prev = map.get(peerId)
    if (!prev || msg.time >= prev.time) map.set(peerId, msg)
  })
  return [...map.entries()]
    .map(([peerId, last]) => ({ peerId, last }))
    .sort((a, b) => (b.last?.time || 0) - (a.last?.time || 0))
}

import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export function isUuid(id = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
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
    raw: row,
  }
}

export async function insertMessage({ senderId, receiverId, content }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, receiver_id: receiverId, content })
    .select('*')
    .single()
  if (error) {
    return { ok: false, error: error.message, permission: isPermissionError(error) }
  }
  return { ok: true, message: mapMessage(data) }
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
    if (!list.some((item) => item.id === msg.id)) list.push(msg)
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

import { upsertFriend } from './friends'
import { isMissingColumn, isPermissionError } from './profiles'
import { supabase } from './supabase'

export function mapRequest(row) {
  if (!row) return null
  return {
    id: row.id,
    fromId: row.from_id || '',
    toId: row.to_id || '',
    status: row.status || 'pending',
    source: row.source || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}

export function splitRequests(rows, meId) {
  const pending = (rows || []).filter((r) => r && r.status === 'pending')
  return {
    incoming: pending.filter((r) => r.toId === meId).sort((a, b) => b.createdAt - a.createdAt),
    outgoing: pending.filter((r) => r.fromId === meId).sort((a, b) => b.createdAt - a.createdAt),
  }
}

function isDuplicatePending(error) {
  return error?.code === '23505' && String(error?.message || '').includes('friend_requests_pending_uq')
}

export async function fetchPendingReverse(meId, targetId) {
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('from_id', targetId)
      .eq('to_id', meId)
      .eq('status', 'pending')
      .maybeSingle()
    if (error) return null
    return data ? mapRequest(data) : null
  } catch {
    return null
  }
}

export async function sendFriendRequest(meId, targetId, source = 'id') {
  if (!meId || !targetId || meId === targetId) return { ok: false, error: '无法添加' }
  try {
    let result = await supabase
      .from('friend_requests')
      .insert({ from_id: meId, to_id: targetId, status: 'pending', source })
      .select('*')
      .single()
    if (result.error && isMissingColumn(result.error, 'source')) {
      result = await supabase
        .from('friend_requests')
        .insert({ from_id: meId, to_id: targetId, status: 'pending' })
        .select('*')
        .single()
    }
    const { data, error } = result
    if (error) {
      if (isDuplicatePending(error)) {
        const reverse = await fetchPendingReverse(meId, targetId)
        if (reverse) return { ok: false, duplicate: true, reversePending: true, request: reverse }
        return { ok: false, duplicate: true, error: '已发送过好友请求，等待对方处理' }
      }
      return { ok: false, error: error.message, permission: isPermissionError(error) }
    }
    return { ok: true, request: mapRequest(data) }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}


export async function fetchFriendRequests(meId) {
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`from_id.eq.${meId},to_id.eq.${meId}`)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      return { ok: false, error: error.message, incoming: [], outgoing: [], permission: isPermissionError(error) }
    }
    const { incoming, outgoing } = splitRequests((data || []).map(mapRequest), meId)
    return { ok: true, incoming, outgoing }
  } catch {
    return { ok: false, error: '网络异常', incoming: [], outgoing: [] }
  }
}

async function updateStatus(requestId, status) {
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
  if (!data) return { ok: false, error: '请求已被处理' }
  return { ok: true, request: mapRequest(data) }
}

export async function acceptFriendRequest(request) {
  const result = await updateStatus(request.id, 'accepted')
  if (!result.ok) return result
  await upsertFriend(request.toId, request.fromId, { source: request.source })
  await upsertFriend(request.fromId, request.toId, { source: request.source })
  return result
}

export async function declineFriendRequest(requestId) {
  return updateStatus(requestId, 'declined')
}

export async function cancelFriendRequest(requestId) {
  return updateStatus(requestId, 'canceled')
}

import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export function mapCursor(row) {
  if (!row) return null
  return {
    userId: row.user_id || '',
    peerId: row.peer_id || '',
    readAt: row.read_at ? new Date(row.read_at).getTime() : 0,
  }
}

export async function upsertReadCursor(meId, peerId) {
  try {
    const { error } = await supabase
      .from('read_cursors')
      .upsert(
        { user_id: meId, peer_id: peerId, read_at: new Date().toISOString() },
        { onConflict: 'user_id,peer_id' }
      )
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function fetchCursorsFor(meId) {
  try {
    const { data, error } = await supabase.from('read_cursors').select('*')
    if (error) {
      return { ok: false, error: error.message, mine: [], peers: [], permission: isPermissionError(error) }
    }
    const rows = (data || []).map(mapCursor).filter(Boolean)
    return {
      ok: true,
      mine: rows.filter((c) => c.userId === meId),
      peers: rows.filter((c) => c.peerId === meId && c.userId !== meId),
    }
  } catch {
    return { ok: false, error: '网络异常', mine: [], peers: [] }
  }
}

export function buildCursorMaps({ mine = [], peers = [] } = {}) {
  const mineMap = {}
  const peersMap = {}
  mine.forEach((cursor) => {
    if (!cursor?.peerId) return
    mineMap[cursor.peerId] = Math.max(mineMap[cursor.peerId] || 0, cursor.readAt || 0)
  })
  peers.forEach((cursor) => {
    if (!cursor?.userId) return
    peersMap[cursor.userId] = Math.max(peersMap[cursor.userId] || 0, cursor.readAt || 0)
  })
  return { mine: mineMap, peers: peersMap }
}

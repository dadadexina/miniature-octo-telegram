import { supabase } from './supabase'

export function mapConversationPref(row) {
  if (!row) return null
  return { peerId: row.peer_id, pinned: Boolean(row.pinned), muted: Boolean(row.muted) }
}

export async function fetchConversationPrefs(userId) {
  if (!userId) return { ok: true, prefs: [] }
  try {
    const { data, error } = await supabase
      .from('conversation_prefs')
      .select('*')
      .eq('user_id', userId)
    if (error) return { ok: false, error: error.message, prefs: [] }
    return { ok: true, prefs: (data || []).map(mapConversationPref).filter(Boolean) }
  } catch {
    return { ok: false, error: '网络异常', prefs: [] }
  }
}

export async function upsertConversationPref({ userId, peerId, pinned, muted }) {
  if (!userId || !peerId) return { ok: false, error: '参数缺失', pref: null }
  const payload = {
    user_id: userId,
    peer_id: peerId,
    pinned: Boolean(pinned),
    muted: Boolean(muted),
    updated_at: new Date().toISOString(),
  }
  try {
    const { data, error } = await supabase
      .from('conversation_prefs')
      .upsert(payload, { onConflict: 'user_id,peer_id' })
      .select()
      .maybeSingle()
    if (error) return { ok: false, error: error.message, pref: null }
    return { ok: true, pref: mapConversationPref(data) }
  } catch {
    return { ok: false, error: '网络异常', pref: null }
  }
}

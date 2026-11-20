import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export async function fetchMyBlocks(meId) {
  try {
    const { data, error } = await supabase.from('blocks').select('*').eq('blocker_id', meId)
    if (error) return { ok: false, error: error.message, ids: [], permission: isPermissionError(error) }
    return { ok: true, ids: (data || []).map((row) => row.blocked_id).filter(Boolean) }
  } catch {
    return { ok: false, error: '网络异常', ids: [] }
  }
}

export async function blockUser(meId, targetId) {
  if (!meId || !targetId || meId === targetId) return { ok: false, error: '无法拉黑' }
  try {
    const { error } = await supabase
      .from('blocks')
      .upsert({ blocker_id: meId, blocked_id: targetId }, { ignoreDuplicates: true, onConflict: 'blocker_id,blocked_id' })
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function unblockUser(meId, targetId) {
  try {
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', meId).eq('blocked_id', targetId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

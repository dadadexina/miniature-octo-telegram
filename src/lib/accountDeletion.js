import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export const DELETION_GRACE_DAYS = 7
export const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000

export function deletionDueAt(deletedAt) {
  const ts = Date.parse(deletedAt || '')
  return Number.isFinite(ts) ? ts + DELETION_GRACE_MS : 0
}

export function isDeletionDue(deletedAt, now = Date.now()) {
  const due = deletionDueAt(deletedAt)
  return due > 0 && now >= due
}

export function formatDeletionDate(deletedAt) {
  const due = deletionDueAt(deletedAt)
  if (!due) return ''
  return new Date(due).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export async function scheduleAccountDeletion(userId, now = Date.now()) {
  if (!userId) return { ok: false, error: '参数错误' }
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date(now).toISOString() })
      .eq('id', userId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function cancelAccountDeletion(userId) {
  if (!userId) return { ok: false, error: '参数错误' }
  try {
    const { error } = await supabase.from('profiles').update({ deleted_at: null }).eq('id', userId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function finalizeAccountDeletion() {
  try {
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error || data?.error) return { ok: false, error: error?.message || data?.error || '注销失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

import { isPermissionError } from './profiles'
import { truncateChars } from './text'
import { supabase } from './supabase'

export const REPORT_REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'harassment', label: '辱骂骚扰' },
  { value: 'porn', label: '色情低俗' },
  { value: 'illegal', label: '违法违规' },
  { value: 'other', label: '其他' },
]

const TARGET_TYPES = new Set(['message', 'moment', 'user'])
const REASON_VALUES = new Set(REPORT_REASONS.map((item) => item.value))
const DETAIL_LIMIT = 500

export function normalizeReport(input) {
  const reporterId = String(input?.reporterId || '').trim()
  const targetType = String(input?.targetType || '').trim()
  const targetId = String(input?.targetId || '').trim()
  const targetUserId = String(input?.targetUserId || '').trim()
  const reason = String(input?.reason || '').trim()
  const detail = truncateChars(String(input?.detail || '').trim(), DETAIL_LIMIT)
  if (!reporterId || !targetId || !TARGET_TYPES.has(targetType) || !REASON_VALUES.has(reason)) return null
  return { reporterId, targetType, targetId, targetUserId, reason, detail }
}

export async function submitReport(input) {
  const report = normalizeReport(input)
  if (!report) return { ok: false, error: '举报信息不完整' }
  try {
    const { error } = await supabase.from('reports').upsert(
      {
        reporter_id: report.reporterId,
        target_type: report.targetType,
        target_id: report.targetId,
        target_user_id: report.targetUserId || null,
        reason: report.reason,
        detail: report.detail,
      },
      { ignoreDuplicates: true, onConflict: 'reporter_id,target_type,target_id' },
    )
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

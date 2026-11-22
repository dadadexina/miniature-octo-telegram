import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, upsert } = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from } }))

const { normalizeReport, submitReport, REPORT_REASONS } = await import('./reports')

beforeEach(() => {
  from.mockReset()
  upsert.mockReset()
  from.mockReturnValue({ upsert })
})

describe('normalizeReport', () => {
  it('规范化合法举报', () => {
    const report = normalizeReport({
      reporterId: ' me ',
      targetType: 'message',
      targetId: 12,
      targetUserId: ' peer ',
      reason: 'spam',
      detail: '  广告  ',
    })
    expect(report).toEqual({
      reporterId: 'me',
      targetType: 'message',
      targetId: '12',
      targetUserId: 'peer',
      reason: 'spam',
      detail: '广告',
    })
  })

  it('超长说明截断到 500 字', () => {
    const report = normalizeReport({ reporterId: 'me', targetType: 'moment', targetId: 'm1', reason: 'other', detail: '字'.repeat(600) })
    expect(report.detail).toHaveLength(500)
  })

  it('拒绝非法类型/原因与缺失字段', () => {
    expect(normalizeReport({ reporterId: 'me', targetType: 'post', targetId: 'x', reason: 'spam' })).toBeNull()
    expect(normalizeReport({ reporterId: 'me', targetType: 'message', targetId: 'x', reason: 'hate' })).toBeNull()
    expect(normalizeReport({ reporterId: '', targetType: 'message', targetId: 'x', reason: 'spam' })).toBeNull()
    expect(normalizeReport({ reporterId: 'me', targetType: 'message', targetId: '', reason: 'spam' })).toBeNull()
  })

  it('内置原因覆盖五大类', () => {
    expect(REPORT_REASONS.map((item) => item.value)).toEqual(['spam', 'harassment', 'porn', 'illegal', 'other'])
  })
})

describe('submitReport', () => {
  it('写入 reports 表并忽略重复举报', async () => {
    upsert.mockResolvedValue({ error: null })
    const result = await submitReport({
      reporterId: 'me',
      targetType: 'moment',
      targetId: 'm1',
      targetUserId: 'peer',
      reason: 'porn',
      detail: '违规图片',
    })
    expect(result).toEqual({ ok: true })
    const [row, options] = upsert.mock.calls[0]
    expect(row).toEqual({
      reporter_id: 'me',
      target_type: 'moment',
      target_id: 'm1',
      target_user_id: 'peer',
      reason: 'porn',
      detail: '违规图片',
    })
    expect(options).toEqual({ ignoreDuplicates: true, onConflict: 'reporter_id,target_type,target_id' })
  })

  it('缺少 targetUserId 时写入 null', async () => {
    upsert.mockResolvedValue({ error: null })
    await submitReport({ reporterId: 'me', targetType: 'user', targetId: 'u1', reason: 'harassment' })
    expect(upsert.mock.calls[0][0].target_user_id).toBeNull()
  })

  it('参数不完整时不发起请求', async () => {
    const result = await submitReport({ reporterId: 'me', targetType: 'message', targetId: '1', reason: '' })
    expect(result.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('权限错误标记 permission', async () => {
    upsert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    const result = await submitReport({ reporterId: 'me', targetType: 'message', targetId: '1', reason: 'spam' })
    expect(result.ok).toBe(false)
    expect(result.permission).toBe(true)
  })
})

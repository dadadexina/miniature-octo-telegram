import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, update, eq, invoke } = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { from, functions: { invoke } } }))

const {
  DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  deletionDueAt,
  finalizeAccountDeletion,
  formatDeletionDate,
  isDeletionDue,
  scheduleAccountDeletion,
} = await import('./accountDeletion')

beforeEach(() => {
  from.mockReset()
  update.mockReset()
  eq.mockReset()
  invoke.mockReset()
  update.mockReturnValue({ eq })
})

describe('冷静期计算', () => {
  it('7 天宽限期', () => {
    expect(DELETION_GRACE_DAYS).toBe(7)
    const start = '2026-01-01T00:00:00.000Z'
    expect(deletionDueAt(start)).toBe(Date.parse(start) + 7 * 24 * 3600 * 1000)
  })

  it('未到期与已到期判断', () => {
    const start = '2026-01-01T00:00:00.000Z'
    const due = Date.parse(start) + 7 * 24 * 3600 * 1000
    expect(isDeletionDue(start, due - 1)).toBe(false)
    expect(isDeletionDue(start, due)).toBe(true)
    expect(isDeletionDue('', Date.now())).toBe(false)
    expect(isDeletionDue('bad-date', Date.now())).toBe(false)
  })

  it('格式化到期日期', () => {
    expect(formatDeletionDate('2026-01-01T00:00:00.000Z')).toMatch(/2026/)
    expect(formatDeletionDate('')).toBe('')
  })
})

describe('注销申请', () => {
  it('写入 deleted_at', async () => {
    from.mockReturnValue({ update })
    eq.mockResolvedValue({ error: null })
    const now = Date.parse('2026-02-01T00:00:00.000Z')
    const result = await scheduleAccountDeletion('u1', now)
    expect(result).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ deleted_at: '2026-02-01T00:00:00.000Z' })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('撤销写入 null', async () => {
    from.mockReturnValue({ update })
    eq.mockResolvedValue({ error: null })
    const result = await cancelAccountDeletion('u1')
    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ deleted_at: null })
  })

  it('权限错误透传', async () => {
    from.mockReturnValue({ update })
    eq.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
    const result = await scheduleAccountDeletion('u1')
    expect(result.ok).toBe(false)
    expect(result.permission).toBe(true)
  })

  it('到期后调用删除函数', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await finalizeAccountDeletion()).toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith('delete-account')
  })

  it('删除函数失败返回错误', async () => {
    invoke.mockResolvedValue({ data: { error: 'invalid token' }, error: null })
    const result = await finalizeAccountDeletion()
    expect(result).toEqual({ ok: false, error: 'invalid token' })
  })
})

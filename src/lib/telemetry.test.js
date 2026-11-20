// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ insert }) },
}))

const {
  CLIENT_ERRORS_SQL,
  buildRow,
  captureError,
  createLimiter,
  normalizeError,
} = await import('./telemetry')

describe('normalizeError', () => {
  it('Error 实例取 message 与 stack', () => {
    const err = new Error('boom')
    const { message, stack } = normalizeError(err)
    expect(message).toBe('boom')
    expect(stack).toContain('boom')
  })

  it('字符串原样作为 message', () => {
    expect(normalizeError('plain text')).toEqual({ message: 'plain text', stack: '' })
  })

  it('对象序列化为 message', () => {
    expect(normalizeError({ code: 500 }).message).toContain('500')
  })
})

describe('createLimiter', () => {
  it('同键冷却期内拒绝，不同键放行', () => {
    const lim = createLimiter({ max: 5, windowMs: 60000, cooldownMs: 5000 })
    expect(lim.allow('a')).toBe(true)
    expect(lim.allow('a')).toBe(false)
    expect(lim.allow('b')).toBe(true)
  })

  it('达到窗口上限后拒绝，窗口滚动后恢复', () => {
    const now = Date.now()
    const lim = createLimiter({ max: 2, windowMs: 1000, cooldownMs: 10 })
    expect(lim.allow('x', now)).toBe(true)
    expect(lim.allow('y', now + 20)).toBe(true)
    expect(lim.allow('z', now + 40)).toBe(false)
    expect(lim.allow('z', now + 1200)).toBe(true)
  })
})

describe('buildRow', () => {
  it('截断超长 message 与 stack 并带默认字段', () => {
    const err = new Error('a'.repeat(500))
    err.stack = 's'.repeat(5000)
    const row = buildRow(err, { route: '/chat/x', kind: 'render' })
    expect(row.route).toBe('/chat/x')
    expect(row.kind).toBe('render')
    expect(row.message).toHaveLength(400)
    expect(row.stack).toHaveLength(4000)
    expect(row.session_id).toBeTruthy()
    expect(row.app_version).toBeTruthy()
  })
})

describe('captureError', () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null })
  })

  it('写入 client_errors 行', async () => {
    const res = await captureError(new Error('boom-unique-1'), { kind: 'render', route: '/c1' })
    expect(res.ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/c1', kind: 'render', message: 'boom-unique-1' }),
    )
  })

  it('同内容重复错误冷却期内跳过', async () => {
    await captureError(new Error('dup-err-2'), { route: '/c2' })
    insert.mockClear()
    const second = await captureError(new Error('dup-err-2'), { route: '/c2' })
    expect(second).toEqual({ ok: true, skipped: true })
    expect(insert).not.toHaveBeenCalled()
  })

  it('数据库写入失败返回错误信息', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'insert failed' } })
    const res = await captureError(new Error('err-unique-3'), { route: '/c3' })
    expect(res).toEqual({ ok: false, error: 'insert failed' })
  })
})

describe('CLIENT_ERRORS_SQL', () => {
  it('包含建表、写入授权与仅插入策略', () => {
    expect(CLIENT_ERRORS_SQL).toContain('create table if not exists public.client_errors')
    expect(CLIENT_ERRORS_SQL).toContain('grant insert on table public.client_errors to anon, authenticated')
    expect(CLIENT_ERRORS_SQL).toContain('client_errors_insert')
    expect(CLIENT_ERRORS_SQL).not.toContain('grant select')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const or = vi.fn()
const del = vi.fn(() => ({ or }))
const from = vi.fn(() => ({ delete: del }))

vi.mock('./supabase', () => ({ supabase: { rpc, from } }))

const { deleteFriend, healFriendPair } = await import('./friends')

beforeEach(() => {
  rpc.mockReset()
  from.mockClear()
  del.mockClear()
  or.mockReset()
  or.mockResolvedValue({ error: null })
})

describe('deleteFriend', () => {
  it('优先调用 unfriend RPC,成功后不再直接删表', async () => {
    rpc.mockResolvedValue({ error: null })
    const res = await deleteFriend('me', 'peer')
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('unfriend', { peer: 'peer' })
    expect(from).not.toHaveBeenCalled()
  })

  it('RPC 不存在时退回成对删除', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Could not find the function public.unfriend' } })
    const res = await deleteFriend('me', 'peer')
    expect(res.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('friends')
    expect(del).toHaveBeenCalled()
    expect(or).toHaveBeenCalledWith(
      'and(owner_id.eq.me,friend_id.eq.peer),and(owner_id.eq.peer,friend_id.eq.me)'
    )
  })

  it('RPC 权限错误直接返回,不再尝试直接删除', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'row-level security' } })
    const res = await deleteFriend('me', 'peer')
    expect(res.ok).toBe(false)
    expect(res.permission).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('RPC 抛异常时退回成对删除', async () => {
    rpc.mockRejectedValue(new Error('network'))
    const res = await deleteFriend('me', 'peer')
    expect(res.ok).toBe(true)
    expect(or).toHaveBeenCalled()
  })
})

describe('healFriendPair', () => {
  it('调用 heal_friend_pair RPC 由服务端补齐两侧好友边', async () => {
    rpc.mockResolvedValue({ error: null })
    const res = await healFriendPair('me', 'peer')
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('heal_friend_pair', { peer: 'peer' })
  })

  it('RPC 权限错误直接返回,不做本地补边', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'row-level security' } })
    const res = await healFriendPair('me', 'peer')
    expect(res.ok).toBe(false)
    expect(res.permission).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('参数非法时直接失败', async () => {
    const res = await healFriendPair('me', 'me')
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

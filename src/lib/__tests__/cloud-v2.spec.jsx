import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const { supabase } = await import('../supabase')
const { canRecall, mergeMessages, recallMessage, hideMessage, fetchHiddenIds, RECALL_WINDOW_MS } = await import('../messages')
const { mergeReadAtMaps, recomputeUnreadCounts, friendlyInsertError } = await import('../syncHelpers')
const { mapCursor, buildCursorMaps, upsertReadCursor, fetchCursorsFor } = await import('../readCursors')
const { fetchMyBlocks, blockUser, unblockUser } = await import('../blocks')
const { mapRequest, splitRequests, sendFriendRequest, acceptFriendRequest, declineFriendRequest } = await import('../friendRequests')
const { deleteFriend } = await import('../friends')
const { deletePairMessages } = await import('../messages')

function okChain(result, capture = {}) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn((r) => {
      capture.insert = r
      return chain
    }),
    update: vi.fn((r) => {
      capture.update = r
      return chain
    }),
    upsert: vi.fn((r) => {
      capture.upsert = r
      return chain
    }),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

const NOW = Date.now()

function msg(overrides = {}) {
  return {
    id: 'm1',
    fromId: 'me',
    toId: 'alice',
    text: '你好',
    time: NOW - 30_000,
    recalledAt: null,
    ...overrides,
  }
}

describe('canRecall 撤回窗口', () => {
  it('2 分钟内自己发出的消息可撤回', () => {
    expect(canRecall(msg({ time: NOW - 60_000 }), 'me', NOW)).toBe(true)
    expect(canRecall(msg({ time: NOW - (RECALL_WINDOW_MS - 1000) }), 'me', NOW)).toBe(true)
  })
  it('超过 2 分钟不可撤回', () => {
    expect(canRecall(msg({ time: NOW - (RECALL_WINDOW_MS + 1000) }), 'me', NOW)).toBe(false)
  })
  it('他人消息 / 已撤回 / pending 乐观消息不可撤回', () => {
    expect(canRecall(msg({ fromId: 'alice' }), 'me', NOW)).toBe(false)
    expect(canRecall(msg({ recalledAt: NOW }), 'me', NOW)).toBe(false)
    expect(canRecall(msg({ pending: true }), 'me', NOW)).toBe(false)
  })
  it('空消息安全返回 false', () => {
    expect(canRecall(null, 'me', NOW)).toBe(false)
  })
})

describe('mergeMessages 同 id 覆盖合并', () => {
  it('撤回标记随云端更新传播到已有消息', () => {
    const prev = [msg({ id: 'm1' })]
    const merged = mergeMessages(prev, [msg({ id: 'm1', text: '', recalledAt: NOW })])
    expect(merged).toHaveLength(1)
    expect(merged[0].recalledAt).toBe(NOW)
    expect(merged[0].text).toBe('')
  })
  it('新消息合入并按时间升序,无 id 忽略', () => {
    const merged = mergeMessages([msg({ id: 'a', time: 200 })], [msg({ id: 'b', time: 100 }), null, {}])
    expect(merged.map((m) => m.id)).toEqual(['b', 'a'])
  })
})

describe('recallMessage 云端撤回', () => {
  it('RLS 拒绝映射为窗口超时文案', async () => {
    supabase.from.mockImplementationOnce(() =>
      okChain({ data: null, error: { message: 'new row violates row-level security policy for table "messages"' } })
    )
    const res = await recallMessage('m1')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('超过 2 分钟的消息不能撤回')
  })
  it('命中 0 行同样按窗口超时处理', async () => {
    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }))
    const res = await recallMessage('stale-id')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('超过 2 分钟的消息不能撤回')
  })
  it('成功返回映射后的已撤回消息', async () => {
    supabase.from.mockImplementationOnce(() =>
      okChain({
        data: { id: 'm1', sender_id: 'me', receiver_id: 'alice', content: '', created_at: new Date(NOW).toISOString(), recalled_at: new Date(NOW).toISOString() },
        error: null,
      })
    )
    const res = await recallMessage('m1')
    expect(res.ok).toBe(true)
    expect(res.message.recalledAt).toBe(NOW)
  })
})

describe('hideMessage / fetchHiddenIds 单方删除', () => {
  it('hideMessage 写入隐藏记录', async () => {
    const capture = {}
    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }, capture))
    const res = await hideMessage('m1', 'me')
    expect(res.ok).toBe(true)
    expect(capture.upsert).toEqual({ message_id: 'm1', user_id: 'me' })
  })
  it('fetchHiddenIds 返回自己隐藏的 id 列表', async () => {
    supabase.from.mockImplementationOnce(() => okChain({ data: [{ message_id: 'm1' }, { message_id: 'm2' }], error: null }))
    const res = await fetchHiddenIds('me')
    expect(res.ok).toBe(true)
    expect(res.ids).toEqual(['m1', 'm2'])
  })
})

describe('syncHelpers 纯函数', () => {
  it('mergeReadAtMaps 同端取较新水位', () => {
    expect(mergeReadAtMaps({ a: 100 }, { a: 80, b: 50 })).toEqual({ a: 100, b: 50 })
    expect(mergeReadAtMaps(null, { b: 50 })).toEqual({ b: 50 })
    expect(mergeReadAtMaps({ b: 50 }, null)).toEqual({ b: 50 })
  })

  it('recomputeUnreadCounts 确定性重算未读', () => {
    const messages = [
      msg({ id: '1', fromId: 'alice', toId: 'me', time: 10 }),
      msg({ id: '2', fromId: 'alice', toId: 'me', time: 30 }),
      msg({ id: '3', fromId: 'me', toId: 'alice', time: 40 }),
      msg({ id: '4', fromId: 'bob', toId: 'me', time: 50, recalledAt: 60 }),
    ]
    // 无读水位:alice 2 条,bob 的撤回消息不计数
    expect(recomputeUnreadCounts({ messages, meId: 'me' })).toEqual({ alice: 2 })
    // 读水位 20:alice 只剩 1 条
    expect(recomputeUnreadCounts({ messages, meId: 'me', readAtMap: { alice: 20 } })).toEqual({ alice: 1 })
    // 激活会话不计数
    expect(recomputeUnreadCounts({ messages, meId: 'me', activePeerId: 'alice' })).toEqual({})
  })

  it('friendlyInsertError 区分拉黑/非好友与其他错误', () => {
    expect(friendlyInsertError('new row violates row-level security policy')).toContain('拉黑')
    expect(friendlyInsertError('insert ... 42501 ...')).toContain('拉黑')
    expect(friendlyInsertError('boom', true)).toContain('拉黑')
    expect(friendlyInsertError('网络异常')).toBe('网络异常')
    expect(friendlyInsertError('')).toBe('发送失败')
  })
})

describe('readCursors 读水位', () => {
  it('mapCursor 将 ISO 时间转毫秒', () => {
    const cursor = mapCursor({ user_id: 'me', peer_id: 'alice', read_at: new Date(NOW).toISOString() })
    expect(cursor).toEqual({ userId: 'me', peerId: 'alice', readAt: NOW })
    expect(mapCursor(null)).toBeNull()
  })

  it('buildCursorMaps 分别聚合我与对端水位且取最大值', () => {
    const { mine, peers } = buildCursorMaps({
      mine: [
        { userId: 'me', peerId: 'alice', readAt: 100 },
        { userId: 'me', peerId: 'alice', readAt: 200 },
      ],
      peers: [{ userId: 'alice', peerId: 'me', readAt: 50 }],
    })
    expect(mine).toEqual({ alice: 200 })
    expect(peers).toEqual({ alice: 50 })
  })

  it('upsertReadCursor 成功与权限失败', async () => {
    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }))
    expect((await upsertReadCursor('me', 'alice')).ok).toBe(true)
    supabase.from.mockImplementationOnce(() =>
      okChain({ data: null, error: { message: 'permission denied for table read_cursors' } })
    )
    const denied = await upsertReadCursor('me', 'alice')
    expect(denied.ok).toBe(false)
    expect(denied.permission).toBe(true)
  })

  it('fetchCursorsFor 拆分我的水位与对端对我的水位', async () => {
    supabase.from.mockImplementationOnce(() =>
      okChain({
        data: [
          { user_id: 'me', peer_id: 'alice', read_at: new Date(NOW).toISOString() },
          { user_id: 'alice', peer_id: 'me', read_at: new Date(NOW - 1000).toISOString() },
          { user_id: 'bob', peer_id: 'carol', read_at: new Date(NOW).toISOString() },
        ],
        error: null,
      })
    )
    const res = await fetchCursorsFor('me')
    expect(res.ok).toBe(true)
    expect(res.mine).toHaveLength(1)
    expect(res.peers).toHaveLength(1)
    expect(res.peers[0]).toEqual({ userId: 'alice', peerId: 'me', readAt: NOW - 1000 })
  })
})

describe('blocks 拉黑', () => {
  it('blockUser 自拉黑直接拒绝且不请求云端', async () => {
    supabase.from.mockClear()
    const res = await blockUser('me', 'me')
    expect(res.ok).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('blockUser 写入 blocker/blocked 关系', async () => {
    const capture = {}
    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }, capture))
    const res = await blockUser('me', 'alice')
    expect(res.ok).toBe(true)
    expect(capture.upsert).toEqual({ blocker_id: 'me', blocked_id: 'alice' })
  })

  it('fetchMyBlocks 返回我拉黑的 id;unblockUser 走删除链', async () => {
    supabase.from.mockImplementationOnce(() =>
      okChain({ data: [{ blocked_id: 'alice' }, { blocked_id: 'bob' }], error: null })
    )
    const res = await fetchMyBlocks('me')
    expect(res.ok).toBe(true)
    expect(res.ids).toEqual(['alice', 'bob'])

    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }))
    expect((await unblockUser('me', 'alice')).ok).toBe(true)

    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: { message: '网络抖动' } }))
    const failed = await fetchMyBlocks('me')
    expect(failed.ok).toBe(false)
    expect(failed.ids).toEqual([])
  })
})

describe('friendRequests 好友请求', () => {
  it('mapRequest 默认 pending 且时间转毫秒', () => {
    const req = mapRequest({ id: 'r1', from_id: 'alice', to_id: 'me', created_at: new Date(NOW).toISOString() })
    expect(req).toEqual({ id: 'r1', fromId: 'alice', toId: 'me', status: 'pending', createdAt: NOW })
    expect(mapRequest(null)).toBeNull()
  })

  it('splitRequests 仅保留 pending 并按时间倒序分组', () => {
    const rows = [
      mapRequest({ id: 'r1', from_id: 'alice', to_id: 'me', created_at: new Date(NOW - 2000).toISOString() }),
      mapRequest({ id: 'r2', from_id: 'bob', to_id: 'me', created_at: new Date(NOW - 1000).toISOString() }),
      mapRequest({ id: 'r3', from_id: 'me', to_id: 'carol', created_at: new Date(NOW).toISOString() }),
      mapRequest({ id: 'r4', from_id: 'dave', to_id: 'me', status: 'accepted', created_at: new Date(NOW).toISOString() }),
    ]
    const { incoming, outgoing } = splitRequests(rows, 'me')
    expect(incoming.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(outgoing.map((r) => r.id)).toEqual(['r3'])
  })

  it('sendFriendRequest 重复请求时探测反向 pending 并提示', async () => {
    const reverseRow = { id: 'r9', from_id: 'alice', to_id: 'me', status: 'pending', created_at: new Date(NOW).toISOString() }
    let calls = 0
    supabase.from.mockImplementation((table) => {
      expect(table).toBe('friend_requests')
      calls += 1
      if (calls === 1) {
        return okChain({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "friend_requests_pending_uq"' } })
      }
      return okChain({ data: reverseRow, error: null })
    })
    const res = await sendFriendRequest('me', 'alice')
    expect(res.ok).toBe(false)
    expect(res.duplicate).toBe(true)
    expect(res.reversePending).toBe(true)
    expect(res.request.id).toBe('r9')
    supabase.from.mockReset()
  })

  it('acceptFriendRequest 通过后写入双向好友边', async () => {
    const acceptedRow = { id: 'r1', from_id: 'alice', to_id: 'me', status: 'accepted', created_at: new Date(NOW).toISOString() }
    const friendInserts = []
    supabase.from.mockImplementation((table) => {
      if (table === 'friends') {
        const chain = okChain({ data: null, error: null })
        chain.upsert = vi.fn((row) => {
          friendInserts.push(row)
          return chain
        })
        return chain
      }
      return okChain({ data: acceptedRow, error: null })
    })
    const res = await acceptFriendRequest(mapRequest({ id: 'r1', from_id: 'alice', to_id: 'me' }))
    expect(res.ok).toBe(true)
    expect(res.request.status).toBe('accepted')
    expect(friendInserts).toEqual([
      { owner_id: 'me', friend_id: 'alice' },
      { owner_id: 'alice', friend_id: 'me' },
    ])
    supabase.from.mockReset()
  })

  it('declineFriendRequest 命中 0 行提示已被处理', async () => {
    supabase.from.mockImplementationOnce(() => okChain({ data: null, error: null }))
    const res = await declineFriendRequest('r1')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('请求已被处理')
  })

  it('deleteFriend 双向删除两侧好友边', async () => {
    const chain = okChain({ error: null })
    supabase.from.mockImplementationOnce(() => chain)
    const res = await deleteFriend('me', 'alice')
    expect(res.ok).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('friends')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.or).toHaveBeenCalledWith(
      'and(owner_id.eq.me,friend_id.eq.alice),and(owner_id.eq.alice,friend_id.eq.me)'
    )
    supabase.from.mockReset()
  })

  it('deletePairMessages 按会话双方删除全部消息', async () => {
    const chain = okChain({ error: null })
    supabase.from.mockImplementationOnce(() => chain)
    const res = await deletePairMessages('me', 'alice')
    expect(res.ok).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('messages')
    expect(chain.or).toHaveBeenCalledWith(
      'and(sender_id.eq.me,receiver_id.eq.alice),and(sender_id.eq.alice,receiver_id.eq.me)'
    )
    supabase.from.mockReset()
  })

  it('deletePairMessages 拒绝自己与自己', async () => {
    const res = await deletePairMessages('me', 'me')
    expect(res.ok).toBe(false)
  })
})

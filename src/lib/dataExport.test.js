// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildMediaArchive,
  collectUserData,
  downloadBlob,
  downloadTextFile,
  exportFileName,
  serializeExport,
  summarizeExport,
} from './dataExport'

function createClient({ tables = {}, storage = {}, failTable = '', failBucket = '' } = {}) {
  const calls = []
  const client = {
    from(table) {
      const state = { table, filters: [], nots: [], order: null, ranged: null }
      calls.push(state)
      const chain = {
        select: () => chain,
        eq: (column, value) => {
          state.filters.push([column, value])
          return chain
        },
        not: (column, operator, value) => {
          state.nots.push([column, operator, value])
          return chain
        },
        order: (column, options) => {
          state.order = [column, options]
          return chain
        },
        range: async (from, to) => {
          state.ranged = [from, to]
          if (failTable === table) return { data: null, error: { message: 'boom' } }
          const rows = (tables[table] || []).filter((row) =>
            state.filters.every(([column, value]) => row[column] === value) &&
            state.nots.every(([column, , value]) => !(row[column] || []).includes(value.slice(1, -1)))
          )
          return { data: rows.slice(from, to + 1), error: null }
        },
        maybeSingle: async () => {
          if (failTable === table) return { data: null, error: { message: 'boom' } }
          const rows = (tables[table] || []).filter((row) =>
            state.filters.every(([column, value]) => row[column] === value)
          )
          return { data: rows[0] || null, error: null }
        },
      }
      return chain
    },
    storage: {
      from(bucket) {
        return {
          getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
          createSignedUrl: async (path) => {
            if (failBucket === bucket) return { data: null, error: { message: 'sign boom' } }
            return { data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null }
          },
          list: async (prefix, options = {}) => {
            if (failBucket === bucket) return { data: null, error: { message: 'storage boom' } }
            const all = (storage[bucket] || []).map((name) => ({
              name,
              metadata: { size: 10 },
              updated_at: '2026-01-01T00:00:00Z',
            }))
            const offset = options.offset || 0
            const limit = options.limit || all.length
            return { data: all.slice(offset, offset + limit), error: null }
          },
        }
      },
    },
  }
  return { client, calls }
}

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('dataExport 数据聚合', () => {
  it('按归属拆分消息并汇总计数', async () => {
    const { client } = createClient({
      tables: {
        profiles: [{ id: USER_ID, nickname: '我' }],
        messages: [
          { id: 1, sender_id: USER_ID, receiver_id: 'peer', content: 'hi' },
          { id: 2, sender_id: 'peer', receiver_id: USER_ID, content: 'yo' },
        ],
        friends: [{ id: 'f1', owner_id: USER_ID, friend_id: 'peer' }],
      },
      storage: { avatars: ['me.png'], moments: ['m1.jpg'] },
    })
    const result = await collectUserData(client, USER_ID, { email: 'me@example.com' })
    expect(result.ok).toBe(true)
    const { payload } = result
    expect(payload.format).toBe(EXPORT_FORMAT)
    expect(payload.version).toBe(EXPORT_VERSION)
    expect(payload.account).toEqual({ id: USER_ID, email: 'me@example.com' })
    expect(payload.data.profile.nickname).toBe('我')
    expect(payload.data.messagesSent.map((row) => row.id)).toEqual([1])
    expect(payload.data.messagesReceived.map((row) => row.id)).toEqual([2])
    expect(payload.counts.friends).toBe(1)
    expect(payload.storage.files.avatars).toEqual([
      { path: `${USER_ID}/me.png`, size: 10, updatedAt: '2026-01-01T00:00:00Z' },
    ])
    expect(payload.storage.files.momentImages[0].path).toBe(`${USER_ID}/m1.jpg`)
  })

  it('分页读取直至最后一页', async () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      sender_id: USER_ID,
      receiver_id: 'peer',
      content: `m${index}`,
    }))
    const { client, calls } = createClient({ tables: { messages } })
    const result = await collectUserData(client, USER_ID, { pageSize: 2 })
    expect(result.ok).toBe(true)
    expect(result.payload.data.messagesSent).toHaveLength(5)
    const sentCalls = calls.filter((call) => call.table === 'messages')
    expect(sentCalls).toHaveLength(4)
    expect(sentCalls.slice(0, 3).map((call) => call.ranged)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
    expect(sentCalls[3].ranged).toEqual([0, 1])
  })

  it('收集消息附件路径并去重', async () => {
    const { client } = createClient({
      tables: {
        messages: [
          { id: 1, sender_id: USER_ID, attachments: { type: 'image', path: 'pair/a.jpg' } },
          { id: 2, receiver_id: USER_ID, attachments: { type: 'image', path: 'pair/a.jpg' } },
          { id: 3, receiver_id: USER_ID, attachments: { type: 'image', path: 'pair/b.jpg' } },
        ],
      },
    })
    const result = await collectUserData(client, USER_ID)
    expect(result.payload.storage.files.messageMedia).toEqual(['pair/a.jpg', 'pair/b.jpg'])
  })

  it('表格读取失败时中止并返回错误', async () => {
    const { client } = createClient({ failTable: 'friends' })
    const result = await collectUserData(client, USER_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('friends')
  })

  it('存储读取失败不阻断整体导出', async () => {
    const { client } = createClient({ failBucket: 'avatars' })
    const result = await collectUserData(client, USER_ID)
    expect(result.ok).toBe(true)
    expect(result.payload.storage.errors[0]).toContain('storage.avatars')
  })

  it('未登录或未配置时拒绝导出', async () => {
    expect((await collectUserData(null, USER_ID)).ok).toBe(false)
    const { client } = createClient()
    expect((await collectUserData(client, '')).ok).toBe(false)
  })
})

describe('dataExport 输出', () => {
  it('文件名包含日期与账号短标识', () => {
    expect(exportFileName(USER_ID, new Date('2026-11-22T08:00:00Z'))).toBe(
      'zhimo-export-2026-11-22-11111111.json'
    )
  })

  it('序列化为带缩进的 JSON', () => {
    const text = serializeExport({ a: 1 })
    expect(text).toBe('{\n  "a": 1\n}')
  })

  it('汇总记录数与媒体数', () => {
    const summary = summarizeExport({
      counts: { friends: 2, messagesSent: 3 },
      storage: { files: { avatars: [{}], momentImages: [], messageMedia: [{}, {}] } },
    })
    expect(summary).toEqual({ total: 5, mediaCount: 3 })
  })

  it('浏览器可用时触发下载并释放地址', () => {
    const anchor = { click: vi.fn(), remove: vi.fn() }
    const doc = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } }
    const urlApi = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }
    expect(downloadTextFile('a.json', '{}', { doc, urlApi })).toBe(true)
    expect(anchor.download).toBe('a.json')
    expect(anchor.click).toHaveBeenCalled()
  })

  it('无 document 时返回 false', () => {
    expect(downloadTextFile('a.json', '{}', { doc: null, urlApi: {} })).toBe(false)
  })

  it('downloadBlob 触发文件下载', () => {
    const anchor = { click: vi.fn(), remove: vi.fn() }
    const doc = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } }
    const urlApi = { createObjectURL: vi.fn(() => 'blob:zip'), revokeObjectURL: vi.fn() }
    expect(downloadBlob('a.zip', new Blob(['x']), { doc, urlApi })).toBe(true)
    expect(anchor.download).toBe('a.zip')
    expect(anchor.click).toHaveBeenCalled()
  })
})

describe('buildMediaArchive', () => {
  const basePayload = {
    account: { id: USER_ID },
    storage: {
      files: {
        avatars: [{ path: `${USER_ID}/me.png` }],
        momentImages: [{ path: `${USER_ID}/m1.jpg` }],
        messageMedia: ['pair-1/a.jpg'],
      },
    },
  }

  function mediaClient(options) {
    const { client } = createClient(options)
    return client
  }

  it('打包 data.json 与三类媒体', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    }))
    const result = await buildMediaArchive(mediaClient(), basePayload, {
      fetchImpl,
      now: new Date('2026-11-22T08:00:00Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.included).toBe(3)
    expect(result.skipped).toEqual([])
    expect(result.fileName).toBe('zhimo-export-2026-11-22-11111111-media.zip')
    expect(result.bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      `https://cdn.test/avatars/${USER_ID}/me.png`,
      `https://cdn.test/moments/${USER_ID}/m1.jpg`,
      'https://signed.test/message_media/pair-1/a.jpg',
    ])
  })

  it('单个媒体失败时跳过并继续', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('m1.jpg')) throw new Error('network')
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer }
    })
    const result = await buildMediaArchive(mediaClient(), basePayload, { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.included).toBe(2)
    expect(result.skipped).toEqual([{ path: `${USER_ID}/m1.jpg`, reason: '下载失败' }])
  })

  it('超过单文件上限时跳过', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(2048).buffer,
    }))
    const result = await buildMediaArchive(mediaClient(), basePayload, {
      fetchImpl,
      maxFileBytes: 1024,
    })
    expect(result.included).toBe(0)
    expect(result.skipped).toHaveLength(3)
    expect(result.skipped[0].reason).toBe('单个文件超过上限')
  })

  it('签名失败计入跳过', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    }))
    const result = await buildMediaArchive(
      mediaClient({ failBucket: 'message_media' }),
      basePayload,
      { fetchImpl }
    )
    expect(result.skipped[0].path).toBe('pair-1/a.jpg')
    expect(result.skipped[0].reason).toBe('sign boom')
  })
})

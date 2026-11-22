// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DIGEST_MAX_ITEMS,
  clearDigestQueue,
  queueDigestItem,
  readDigestQueue,
  summarizeDigest,
} from './notificationDigest'

beforeEach(() => {
  localStorage.clear()
})

describe('notificationDigest', () => {
  it('按用户隔离排队并读取', () => {
    queueDigestItem('u1', { fromId: 'a', fromName: '阿甲' })
    queueDigestItem('u2', { fromId: 'b', fromName: '阿乙' })
    expect(readDigestQueue('u1')).toEqual([
      expect.objectContaining({ fromId: 'a', fromName: '阿甲' }),
    ])
    expect(readDigestQueue('u2')).toHaveLength(1)
  })

  it('忽略缺少来源的记录', () => {
    expect(queueDigestItem('u1', { fromName: '无来源' })).toBe(0)
    expect(readDigestQueue('u1')).toEqual([])
  })

  it('超过上限时保留最近的记录', () => {
    for (let index = 0; index < DIGEST_MAX_ITEMS + 5; index += 1) {
      queueDigestItem('u1', { fromId: `p${index}`, fromName: `人${index}` })
    }
    const queue = readDigestQueue('u1')
    expect(queue).toHaveLength(DIGEST_MAX_ITEMS)
    expect(queue[queue.length - 1].fromId).toBe(`p${DIGEST_MAX_ITEMS + 4}`)
  })

  it('汇总未读数量与来源人数', () => {
    queueDigestItem('u1', { fromId: 'a', fromName: '阿甲' })
    queueDigestItem('u1', { fromId: 'a', fromName: '阿甲' })
    queueDigestItem('u1', { fromId: 'b', fromName: '阿乙' })
    const summary = summarizeDigest(readDigestQueue('u1'))
    expect(summary).toEqual({
      total: 3,
      senders: 2,
      title: '收件摘要',
      body: '你有 3 条未读，来自 2 人：阿甲、阿乙',
    })
  })

  it('来源过多时只列前三并加等字', () => {
    for (const [id, name] of [
      ['a', '甲'],
      ['b', '乙'],
      ['c', '丙'],
      ['d', '丁'],
    ]) {
      queueDigestItem('u1', { fromId: id, fromName: name })
    }
    expect(summarizeDigest(readDigestQueue('u1')).body).toBe('你有 4 条未读，来自 4 人：甲、乙、丙 等')
  })

  it('来源缺少昵称时只报数量', () => {
    queueDigestItem('u1', { fromId: 'a' })
    expect(summarizeDigest(readDigestQueue('u1')).body).toBe('你有 1 条未读，来自 1 人')
  })

  it('空队列返回 null 且可清空', () => {
    expect(summarizeDigest([])).toBeNull()
    queueDigestItem('u1', { fromId: 'a' })
    clearDigestQueue('u1')
    expect(readDigestQueue('u1')).toEqual([])
  })
})

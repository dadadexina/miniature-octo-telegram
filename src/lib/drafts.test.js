// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DRAFTS_KEY, applyDraft, loadDrafts, saveDrafts } from './drafts'

describe('drafts 会话草稿持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applyDraft 写入/覆盖/删除键', () => {
    let d = applyDraft({}, 'p1', '你好')
    expect(d).toEqual({ p1: '你好' })
    d = applyDraft(d, 'p1', '你好呀')
    expect(d.p1).toBe('你好呀')
    d = applyDraft(d, 'p1', '')
    expect(d).toEqual({})
    d = applyDraft(d, 'p1', undefined)
    expect(d).toEqual({})
  })

  it('applyDraft 不可变更新', () => {
    const prev = { p1: 'a' }
    const next = applyDraft(prev, 'p2', 'b')
    expect(prev).toEqual({ p1: 'a' })
    expect(next).toEqual({ p1: 'a', p2: 'b' })
  })

  it('save/load 按用户隔离往返', () => {
    saveDrafts('me1', { p1: '草稿一' })
    saveDrafts('me2', { p2: '草稿二' })
    expect(loadDrafts('me1')).toEqual({ p1: '草稿一' })
    expect(loadDrafts('me2')).toEqual({ p2: '草稿二' })
    expect(loadDrafts('me3')).toEqual({})
    expect(localStorage.getItem(DRAFTS_KEY + 'me1')).toBe(JSON.stringify({ p1: '草稿一' }))
  })

  it('loadDrafts 容忍脏数据', () => {
    localStorage.setItem(DRAFTS_KEY + 'me1', '{{{not-json')
    expect(loadDrafts('me1')).toEqual({})
    localStorage.setItem(DRAFTS_KEY + 'me1', '[1,2,3]')
    expect(loadDrafts('me1')).toEqual({})
    localStorage.setItem(DRAFTS_KEY + 'me1', 'null')
    expect(loadDrafts('me1')).toEqual({})
  })
})

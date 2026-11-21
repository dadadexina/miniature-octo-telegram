import { describe, expect, it } from 'vitest'

import { mergeSearchResults } from './searchResults'

const uuid = '75afb679-ca74-4604-bd2a-4c74f5bca58e'

describe('搜索结果合并', () => {
  it('云端为空时不再返回本地缓存的云端账号(注销后应显示不存在)', () => {
    const local = [{ id: uuid, nickname: '已注销', username: 'abcd1234' }]
    expect(mergeSearchResults([], local)).toEqual([])
  })

  it('保留本地演示账号', () => {
    const local = [{ id: 'u_demo_xiaoming', nickname: '小明', username: '12345' }]
    expect(mergeSearchResults([], local)).toHaveLength(1)
  })

  it('云端结果优先且按 ID 去重', () => {
    const cloud = [{ id: uuid, nickname: '云端', username: 'abcd1234' }]
    const local = [{ id: uuid, nickname: '本地', username: 'abcd1234' }]
    expect(mergeSearchResults(cloud, local)).toEqual(cloud)
  })
})

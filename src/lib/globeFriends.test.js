import { describe, expect, it } from 'vitest'
import { focusLinks, locationAgeLabel, mutualFriendIds } from './globeFriends'

const LINKS = [
  ['me', 'a'],
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'c'],
  ['bad'],
  ['me', 'd'],
]

describe('地球好友聚焦', () => {
  it('未选中好友时保留全部有效关系线', () => {
    expect(focusLinks(LINKS, '')).toBe(LINKS)
    expect(focusLinks(null, '')).toEqual([])
  })

  it('只保留选中好友作为端点的关系线', () => {
    expect(focusLinks(LINKS, 'a')).toEqual([
      ['me', 'a'],
      ['a', 'b'],
      ['a', 'c'],
    ])
  })

  it('共同好友排除我与被选中好友本人', () => {
    expect(mutualFriendIds(LINKS, 'me', 'a')).toEqual(['b', 'c'])
    expect(mutualFriendIds(LINKS, 'me', 'd')).toEqual([])
    expect(mutualFriendIds(LINKS, 'me', '')).toEqual([])
  })

  it('位置更新时间按距离当前时间生成文案', () => {
    const now = Date.parse('2026-11-24T10:00:00.000Z')
    expect(locationAgeLabel('2026-11-24T09:59:30.000Z', now)).toBe('刚刚更新')
    expect(locationAgeLabel('2026-11-24T09:35:00.000Z', now)).toBe('25 分钟前更新')
    expect(locationAgeLabel('2026-11-24T07:00:00.000Z', now)).toBe('3 小时前更新')
    expect(locationAgeLabel('2026-11-22T10:00:00.000Z', now)).toBe('2 天前更新')
    expect(locationAgeLabel('', now)).toBe('')
    expect(locationAgeLabel('not-a-date', now)).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import {
  focusLinks,
  groupCities,
  linksForCity,
  locationAgeLabel,
  mutualFriendIds,
} from './globeFriends'

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

  it('按城市聚合已共享位置的好友并计算中心点', () => {
    const cities = groupCities([
      { id: 'a', name: '阿哲', located: true, place: '上海', lat: 31.2, lng: 121.4 },
      { id: 'b', name: '阿敏', located: true, place: '上海', lat: 31.4, lng: 121.6 },
      { id: 'c', name: '阿远', located: true, place: '北京', lat: 39.9, lng: 116.4 },
      { id: 'd', name: '小未', located: false, place: '上海' },
    ])
    expect(cities.map((city) => city.name)).toEqual(['上海', '北京'])
    expect(cities[0].count).toBe(2)
    expect(cities[0].lat).toBeCloseTo(31.3)
    expect(cities[0].lng).toBeCloseTo(121.5)
    expect(cities[0].people.map((person) => person.id)).toEqual(['a', 'b'])
  })

  it('城市聚焦时保留城市好友参与的关系线', () => {
    const nodes = [
      { id: 'me', place: '北京' },
      { id: 'a', place: '上海' },
      { id: 'b', place: '上海' },
      { id: 'c', place: '北京' },
    ]
    const links = [
      ['me', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['me', 'c'],
    ]
    expect(linksForCity(links, nodes, '上海')).toEqual([
      ['me', 'a'],
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect(linksForCity(links, nodes, '')).toBe(links)
    expect(linksForCity(links, nodes, '广州')).toEqual([])
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

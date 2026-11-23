// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Discover from './Discover'

const FRIEND_A = '22222222-2222-4222-8222-222222222222'

const users = vi.hoisted(() => ({
  '11111111-1111-4111-8111-111111111111': { id: '11111111-1111-4111-8111-111111111111', nickname: '我', avatarUrl: '' },
  '22222222-2222-4222-8222-222222222222': { id: '22222222-2222-4222-8222-222222222222', nickname: '阿哲', avatarUrl: '' },
}))
const storeState = vi.hoisted(() => ({ friends: [] }))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: users['11111111-1111-4111-8111-111111111111'],
    profile: { nickname: '我', avatarUrl: '', signature: '见字如面' },
    avatarColor: () => '#191919',
    getUser: (id) => users[id] || null,
    upsertUsers: vi.fn(),
    syncTick: 0,
    displayNameOf: (id) => users[id]?.nickname || '',
    friendsOf: () => storeState.friends,
    momentsFeed: () => [],
    publishMoment: vi.fn(() => ({ ok: true })),
  }),
}))

vi.mock('../lib/locations', () => ({
  fetchLocations: vi.fn(() => Promise.resolve({ ok: true, locations: [] })),
}))

function setup() {
  render(
    <MemoryRouter initialEntries={['/discover']}>
      <Discover />
    </MemoryRouter>
  )
}

let writeText

beforeEach(() => {
  localStorage.clear()
  storeState.friends = [users[FRIEND_A]]
  vi.stubGlobal('WebGLRenderingContext', undefined)
  writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Discover 关系网页', () => {
  it('展示关系地球、标题与实时天气，且移除信息流互动', async () => {
    setup()
    expect(await screen.findByTestId('relationship-globe')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '关系网' })).toBeTruthy()
    expect(screen.getByTestId('globe-weather').textContent).toContain('此刻')
    expect(screen.queryByTestId('like-btn')).toBeNull()
    expect(screen.queryByTestId('comment-btn')).toBeNull()
    expect(screen.queryByTestId('discover-write')).toBeNull()
    expect(screen.queryByTestId('route-card')).toBeNull()
  })

  it('复制按钮把经纬度写入剪贴板', async () => {
    setup()
    const copy = await screen.findByTestId('globe-copy-coords')
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('°')
    await waitFor(() => expect(screen.getByTestId('globe-copy-coords').textContent).toBe('已复制'))
  })

  it('不支持地图渲染时以关系列表兜底展示好友', async () => {
    setup()
    expect(await screen.findByTestId('globe-fallback')).toBeTruthy()
    expect(screen.getByText('阿哲')).toBeTruthy()
  })
})

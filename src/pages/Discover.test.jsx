// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Discover from './Discover'
import { createMoment, fetchMoments } from '../lib/moments'
import { fetchProfilesByIds } from '../lib/profiles'

const ME = '11111111-1111-4111-8111-111111111111'
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

vi.mock('../lib/moments', () => ({
  fetchMoments: vi.fn(),
  createMoment: vi.fn(),
  uploadMomentImage: vi.fn(),
}))

vi.mock('../lib/momentImage', () => ({
  downscaleMomentImage: vi.fn(),
}))

vi.mock('../lib/profiles', () => ({
  fetchProfilesByIds: vi.fn(),
}))

vi.mock('../lib/locations', () => ({
  fetchLocations: vi.fn(() => Promise.resolve({ ok: true, locations: [] })),
}))

vi.mock('../components/Avatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{(name || '?').slice(0, 1)}</div>,
}))

function ChatProbe() {
  const { peerId } = useParams()
  return <div data-testid="chat-page">{peerId}</div>
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/discover']}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
        <Route path="/chat/:peerId" element={<ChatProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  storeState.friends = [users[FRIEND_A]]
  fetchMoments.mockReset()
  fetchProfilesByIds.mockReset()
  createMoment.mockReset()
  fetchMoments.mockResolvedValue({ ok: true, moments: [], hasMore: false, oldest: null })
  fetchProfilesByIds.mockResolvedValue({ ok: true, profiles: [] })
  createMoment.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe('Discover 地球页', () => {
  it('展示关系地球并移除信息流互动', async () => {
    setup()
    expect(await screen.findByTestId('relationship-globe')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '地球关系网' })).toBeTruthy()
    expect(screen.getByTestId('discover-write')).toBeTruthy()
    await screen.findByTestId('routes-empty')
    expect(screen.queryByTestId('like-btn')).toBeNull()
    expect(screen.queryByTestId('comment-btn')).toBeNull()
    expect(screen.queryByTestId('moments-pull-indicator')).toBeNull()
    expect(screen.queryByTestId('moments-cover')).toBeNull()
  })

  it('本周航线只展示每位朋友最新的一页', async () => {
    fetchMoments.mockResolvedValue({
      ok: true,
      moments: [
        { id: 'm1', authorId: FRIEND_A, content: '新的一页', imageUrl: '', createdAt: Date.now() },
        { id: 'm2', authorId: FRIEND_A, content: '旧的一页', imageUrl: '', createdAt: Date.now() - 86400000 },
        { id: 'm3', authorId: ME, content: '我自己的动态', imageUrl: '', createdAt: Date.now() },
      ],
      hasMore: false,
      oldest: null,
    })
    setup()

    const cards = await screen.findAllByTestId('route-card')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('新的一页')).toBeTruthy()
    expect(screen.queryByText('旧的一页')).toBeNull()
    expect(screen.queryByText('我自己的动态')).toBeNull()
  })

  it('点击航线打开信笺并可回信进入单聊', async () => {
    fetchMoments.mockResolvedValue({
      ok: true,
      moments: [{ id: 'm1', authorId: FRIEND_A, content: '最近搬了新家', imageUrl: '', createdAt: Date.now() }],
      hasMore: false,
      oldest: null,
    })
    setup()

    fireEvent.click(await screen.findByTestId('route-card'))
    const sheet = screen.getByTestId('moment-sheet')
    expect(sheet).toBeTruthy()
    expect(within(sheet).getByText('最近搬了新家')).toBeTruthy()

    fireEvent.click(screen.getByTestId('moment-reply'))
    await waitFor(() => expect(screen.getByTestId('chat-page').textContent).toBe(FRIEND_A))
  })

  it('写一页后调用发布接口并刷新航线', async () => {
    setup()
    await screen.findByTestId('routes-empty')
    fireEvent.click(screen.getByTestId('discover-write'))
    fireEvent.change(screen.getByPlaceholderText('这一周，想留下什么？'), {
      target: { value: '这周去看海了' },
    })
    fireEvent.click(screen.getByText('寄出'))

    await waitFor(() =>
      expect(createMoment).toHaveBeenCalledWith({ authorId: ME, content: '这周去看海了', imageUrl: '' })
    )
    await waitFor(() => expect(fetchMoments).toHaveBeenCalledTimes(2))
  })

  it('读取失败时展示提示', async () => {
    fetchMoments.mockResolvedValue({ ok: false, error: '没有权限', moments: [] })
    setup()
    expect((await screen.findByTestId('routes-error')).textContent).toBe('没有权限')
  })

  it('支持按城市和经纬度跳转', async () => {
    setup()
    await screen.findByTestId('routes-empty')

    fireEvent.click(screen.getByTestId('globe-jump'))
    const input = screen.getByTestId('jump-input')
    fireEvent.change(input, { target: { value: '西安' } })
    expect(screen.getByTestId('jump-result').textContent).toContain('西安')
    fireEvent.click(screen.getByTestId('jump-result'))
    expect(screen.queryByTestId('jump-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('globe-jump'))
    fireEvent.change(screen.getByTestId('jump-input'), { target: { value: '34.3416, 108.9398' } })
    expect(screen.getByTestId('jump-coords').textContent).toContain('34.3416')
    fireEvent.click(screen.getByTestId('jump-coords'))
    expect(screen.queryByTestId('jump-sheet')).toBeNull()
  })
})

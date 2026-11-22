// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FriendMoments from './FriendMoments'
import {
  addMomentComment,
  fetchMomentInteractions,
  fetchMoments,
  likeMoment,
  unlikeMoment,
} from '../lib/moments'
import { fetchProfilesByIds } from '../lib/profiles'

const ME = '11111111-1111-4111-8111-111111111111'
const FRIEND = '22222222-2222-4222-8222-222222222222'

const storeHolder = {
  currentUser: null,
  users: {},
  momentsFeed: () => [],
}

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: storeHolder.currentUser,
    profile: { nickname: '我' },
    avatarColor: () => '#191919',
    getUser: (id) => storeHolder.users[id] || null,
    upsertUsers: vi.fn(),
    syncTick: 0,
    momentsFeed: () => storeHolder.momentsFeed(),
    displayNameOf: (id) => storeHolder.users[id]?.nickname || '',
  }),
}))

vi.mock('../lib/messages', () => ({
  isUuid: (id = '') => /^[0-9a-f]{8}-/.test(String(id)),
}))

vi.mock('../lib/profiles', () => ({
  fetchProfilesByIds: vi.fn(),
}))

vi.mock('../lib/moments', () => ({
  fetchMoments: vi.fn(),
  fetchMomentInteractions: vi.fn(),
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
  addMomentComment: vi.fn(),
  deleteMomentComment: vi.fn(),
}))

vi.mock('../components/Avatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{(name || '?').slice(0, 1)}</div>,
}))

beforeEach(() => {
  storeHolder.currentUser = { id: ME, nickname: '我', avatarUrl: '' }
  storeHolder.users = { [FRIEND]: { id: FRIEND, nickname: '李四', publicId: 'lisi', avatarUrl: '' } }
  storeHolder.momentsFeed = () => []
  fetchMoments.mockReset()
  fetchProfilesByIds.mockReset()
  fetchProfilesByIds.mockResolvedValue({ ok: true, profiles: [] })
  fetchMomentInteractions.mockReset()
  fetchMomentInteractions.mockResolvedValue({ ok: true, likes: [], comments: [] })
  likeMoment.mockReset()
  likeMoment.mockResolvedValue({ ok: true })
  unlikeMoment.mockReset()
  unlikeMoment.mockResolvedValue({ ok: true })
  addMomentComment.mockReset()
  addMomentComment.mockImplementation(({ momentId, userId, content }) =>
    Promise.resolve({ ok: true, comment: { id: `srv-${Date.now()}`, momentId, userId, content, createdAt: Date.now() } })
  )
})

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter initialEntries={[`/friend/${FRIEND}/moments`]}>
      <Routes>
        <Route path="/friend/:userId/moments" element={<FriendMoments />} />
        <Route path="/friend/:userId" element={<div data-testid="profile-page">PROFILE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const momentRow = (id, content) => ({
  id,
  authorId: FRIEND,
  content,
  imageUrl: '',
  createdAt: Date.now(),
})

describe('FriendMoments 好友朋友圈流', () => {
  it('按 authorId 过滤拉取好友动态并渲染', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [momentRow('m1', '第一条动态')], hasMore: false, oldest: null })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-moment-item')).toBeTruthy())
    expect(fetchMoments).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: FRIEND })
    )
    expect(screen.getByText('第一条动态')).toBeTruthy()
    expect(screen.getByText('纸墨信笺')).toBeTruthy()
    expect(screen.getByTestId('moments-cover').dataset.raised).toBe('true')
    expect(screen.queryByTestId('change-cover')).toBeNull()
  })

  it('空结果展示空态', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [], hasMore: false, oldest: null })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-moments-empty')).toBeTruthy())
  })

  it('权限错误展示不可查看提示且不渲染错误条', async () => {
    fetchMoments.mockResolvedValue({ ok: false, error: 'permission denied', permission: true, moments: [], hasMore: false, oldest: null })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-moments-denied')).toBeTruthy())
    expect(screen.queryByTestId('friend-moments-error')).toBeNull()
  })

  it('点赞为纯前端状态切换', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [momentRow('m1', 'hi')], hasMore: false, oldest: null })
    setup()
    const btn = await screen.findByTestId('fm-like-btn')
    fireEvent.click(btn)
    expect(screen.getByText('取消赞 1')).toBeTruthy()
    expect(screen.getByText('赞：我')).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.getByText('赞')).toBeTruthy()
    expect(screen.queryByText('赞：我')).toBeNull()
  })

  it('评论提交后本地渲染并清空输入', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [momentRow('m1', 'hi')], hasMore: false, oldest: null })
    setup()
    await screen.findByTestId('friend-moment-item')
    fireEvent.click(screen.getByTestId('fm-comment-btn'))
    const input = await screen.findByPlaceholderText('说点什么...')
    fireEvent.change(input, { target: { value: '写得好' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(screen.getByTestId('fm-comment')).toBeTruthy())
    expect(screen.getByText('写得好')).toBeTruthy()
    expect(input.value).toBe('')
  })

  it('hasMore 时展示加载更多并 append 分页', async () => {
    fetchMoments
      .mockResolvedValueOnce({ ok: true, moments: [momentRow('m1', '第一页')], hasMore: true, oldest: '2026-01-01' })
      .mockResolvedValueOnce({ ok: true, moments: [momentRow('m2', '第二页')], hasMore: false, oldest: '2025-01-01' })
    setup()
    const more = await screen.findByTestId('fm-load-more')
    fireEvent.click(more)
    await waitFor(() => expect(screen.getByText('第二页')).toBeTruthy())
    expect(screen.getByText('第一页')).toBeTruthy()
    expect(fetchMoments).toHaveBeenLastCalledWith(expect.objectContaining({ before: '2026-01-01', authorId: FRIEND }))
  })

  it('返回按钮回到好友资料页', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [], hasMore: false, oldest: null })
    setup()
    await screen.findByTestId('friend-moments-empty')
    fireEvent.click(screen.getByLabelText('返回'))
    expect(screen.getByTestId('profile-page')).toBeTruthy()
  })

  it('下拉松手触发重新拉取并显示刷新提示', async () => {
    fetchMoments.mockResolvedValue({ ok: true, moments: [], hasMore: false, oldest: null })
    setup()
    await screen.findByTestId('friend-moments-empty')
    expect(fetchMoments).toHaveBeenCalledTimes(1)

    const scroller = screen.getByTestId('fm-scroll')
    fireEvent.touchStart(scroller, { touches: [{ clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientY: 200 }] })
    expect(screen.getByTestId('fm-pull-indicator').textContent).toBe('松手刷新')

    fireEvent.touchEnd(scroller, { changedTouches: [{ clientY: 200 }] })
    await waitFor(() => expect(fetchMoments).toHaveBeenCalledTimes(2))
  })

  it('本地演示模式按 userId 过滤种子动态', async () => {
    storeHolder.currentUser = { id: 'u_demo_me', nickname: '演示我', avatarUrl: '' }
    storeHolder.users[FRIEND] = null
    storeHolder.users['u_demo_x'] = { id: 'u_demo_x', nickname: '小明', avatarUrl: '' }
    storeHolder.momentsFeed = () => [
      { id: 'm1', userId: 'u_demo_x', text: '小明说的', time: Date.now() },
      { id: 'm2', userId: 'u_demo_y', text: '别人的', time: Date.now() },
    ]
    render(
      <MemoryRouter initialEntries={['/friend/u_demo_x/moments']}>
        <Routes>
          <Route path="/friend/:userId/moments" element={<FriendMoments />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('小明说的')).toBeTruthy())
    expect(screen.queryByText('别人的')).toBeNull()
    expect(fetchMoments).not.toHaveBeenCalled()
  })
})

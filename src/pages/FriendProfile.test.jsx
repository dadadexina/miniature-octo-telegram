// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProfileById } from '../lib/profiles'
import FriendProfile from './FriendProfile'

const storeHolder = { friends: {} }

vi.mock('../store', () => ({
  useStore: () => ({
    getUser: (id) => storeHolder.friends[id] || null,
    avatarColor: () => '#191919',
  }),
}))

vi.mock('../lib/profiles', () => ({
  fetchProfileById: vi.fn(),
}))

vi.mock('../components/Avatar', () => ({
  default: ({ name, size }) => <div data-testid="avatar">{(name || '?').slice(0, 1)}-{size}</div>,
}))

beforeEach(() => {
  storeHolder.friends = {}
  fetchProfileById.mockReset()
})

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter initialEntries={['/friend/u1']}>
      <Routes>
        <Route path="/friend/:userId" element={<FriendProfile />} />
        <Route path="/friend/:userId/moments" element={<div data-testid="moments-page">MOMENTS_PLACEHOLDER</div>} />
        <Route path="/chat/:peerId" element={<div data-testid="chat-page">CHAT_PAGE</div>} />
        <Route path="/contacts" element={<div>CONTACTS</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('FriendProfile 好友资料页', () => {
  it('按 userId 拉取 profiles 并展示昵称与自定义 ID', async () => {
    fetchProfileById.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', nickname: '李四', username: 'lisi_42', avatarUrl: '' },
    })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-nickname').textContent).toBe('李四'))
    expect(screen.getByTestId('friend-id').textContent).toContain('lisi_42')
    expect(fetchProfileById).toHaveBeenCalledWith('u1')
    expect(screen.getByTestId('avatar').textContent).toContain('88')
  })

  it('云端失败时回退展示 store 内缓存的好友信息', async () => {
    storeHolder.friends.u1 = { id: 'u1', nickname: '缓存名', publicId: 'cached_id', avatarUrl: '' }
    fetchProfileById.mockResolvedValue({ ok: false, error: '网络异常', profile: null })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-nickname').textContent).toBe('缓存名'))
    expect(screen.getByTestId('friend-id').textContent).toContain('cached_id')
  })

  it('云端与缓存都没有时显示无法读取', async () => {
    fetchProfileById.mockResolvedValue({ ok: false, error: '无权限', profile: null })
    setup()
    await waitFor(() => expect(screen.getByText('无法读取该用户的资料')).toBeTruthy())
  })

  it('点击发送信息跳转到聊天详情页并携带 userId', async () => {
    fetchProfileById.mockResolvedValue({ ok: true, profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '' } })
    setup()
    await waitFor(() => expect(screen.getByTestId('send-message-btn')).toBeTruthy())
    fireEvent.click(screen.getByTestId('send-message-btn'))
    expect(screen.getByTestId('chat-page')).toBeTruthy()
  })

  it('点击朋友圈入口跳转到带 userId 的占位页', async () => {
    fetchProfileById.mockResolvedValue({ ok: true, profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '' } })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-moments-entry')).toBeTruthy())
    fireEvent.click(screen.getByTestId('friend-moments-entry'))
    expect(screen.getByTestId('moments-page')).toBeTruthy()
  })
})

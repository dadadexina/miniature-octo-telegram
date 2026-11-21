// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProfileById } from '../lib/profiles'
import FriendProfile from './FriendProfile'

const storeHolder = { friends: {}, meta: null }

const setFriendRemarkMock = vi.fn(async (friendId, remark) => {
  storeHolder.meta = { ...(storeHolder.meta || {}), remark }
  return { ok: true }
})

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: { id: 'me' },
    getUser: (id) => storeHolder.friends[id] || null,
    avatarColor: () => '#191919',
    friendMetaOf: () => storeHolder.meta,
    displayNameOf: (id) => storeHolder.meta?.remark || storeHolder.friends[id]?.nickname || '',
    setFriendRemark: setFriendRemarkMock,
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
  storeHolder.meta = null
  setFriendRemarkMock.mockClear()
  fetchProfileById.mockReset()
})

afterEach(cleanup)

function setup(initialEntries = ['/friend/u1']) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/friend/:userId" element={<FriendProfile />} />
        <Route path="/friend/:userId/moments" element={<div data-testid="moments-page">MOMENTS_PLACEHOLDER</div>} />
        <Route path="/chat/:peerId" element={<div data-testid="chat-page">CHAT_PAGE</div>} />
        <Route path="/contacts" element={<div data-testid="contacts-page">CONTACTS</div>} />
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

  it('有应用内历史时返回按钮回到上一页(通讯录)', async () => {
    fetchProfileById.mockResolvedValue({ ok: true, profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '' } })
    setup(['/contacts', '/friend/u1'])
    await waitFor(() => expect(screen.getByTestId('friend-nickname')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByTestId('contacts-page')).toBeTruthy()
  })

  it('展示性别、加好友时间方式与来纸墨天数', async () => {
    const now = new Date().toISOString()
    storeHolder.meta = { createdAt: now, source: 'phone', remark: '' }
    fetchProfileById.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '', gender: 'female', createdAt: now },
    })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-gender').textContent).toBe('女'))
    expect(screen.getByTestId('friend-days').textContent).toBe('1 天')
    expect(screen.getByTestId('friend-since').textContent).toContain('通过手机号搜索添加')
    expect(screen.getByTestId('friend-since').textContent).toMatch(/\d{4}年\d{1,2}月\d{1,2}日/)
  })

  it('备注保存后更新页面称呼并展示原昵称', async () => {
    fetchProfileById.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '', gender: 'male', createdAt: new Date().toISOString() },
    })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-nickname').textContent).toBe('李四'))
    fireEvent.click(screen.getByTestId('friend-remark-edit'))
    fireEvent.change(screen.getByTestId('friend-remark-input'), { target: { value: '老李' } })
    fireEvent.click(screen.getByTestId('friend-remark-save'))
    await waitFor(() => expect(screen.getByTestId('friend-nickname').textContent).toBe('老李'))
    expect(setFriendRemarkMock).toHaveBeenCalledWith('u1', '老李')
    expect(screen.getByTestId('friend-original-nickname').textContent).toContain('李四')
  })

  it('历史好友缺少来源时显示未知', async () => {
    storeHolder.meta = { createdAt: '', source: '', remark: '' }
    fetchProfileById.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '', gender: 'secret' },
    })
    setup()
    await waitFor(() => expect(screen.getByTestId('friend-since').textContent).toContain('未知'))
    expect(screen.getByTestId('friend-days').textContent).toBe('未知')
  })

  it('直接打开资料页(无应用内历史)时返回按钮兜底回通讯录', async () => {
    fetchProfileById.mockResolvedValue({ ok: true, profile: { id: 'u1', nickname: '李四', username: 'lisi', avatarUrl: '' } })
    setup(['/friend/u1'])
    await waitFor(() => expect(screen.getByTestId('friend-nickname')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByTestId('contacts-page')).toBeTruthy()
  })
})

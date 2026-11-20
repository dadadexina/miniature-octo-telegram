// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats'

const storeHolder = {
  conversations: () => [],
  drafts: {},
  users: {},
  convPrefs: {},
  setConversationPref: () => Promise.resolve({ ok: true }),
  unreadOf: () => 0,
}

vi.mock('../store', () => ({
  useStore: () => ({
    conversations: () => storeHolder.conversations(),
    avatarColor: () => '#191919',
    currentUser: { id: 'u_demo_me', nickname: '演示我', avatarUrl: '' },
    getUser: (id) => storeHolder.users[id] || null,
    upsertUsers: vi.fn(),
    inbox: [],
    mergeInbox: vi.fn(),
    unreadOf: (id) => storeHolder.unreadOf(id),
    convPrefs: storeHolder.convPrefs,
    setConversationPref: storeHolder.setConversationPref,
    syncTick: 0,
    hiddenIds: new Set(),
    removeThread: vi.fn(),
    drafts: storeHolder.drafts,
  }),
}))

vi.mock('../lib/messages', () => ({
  fetchInbox: vi.fn(),
  groupConversations: vi.fn(() => []),
  isUuid: (id = '') => /^[0-9a-f]{8}-/.test(String(id)),
}))

vi.mock('../lib/profiles', () => ({
  fetchProfilesByIds: vi.fn(),
}))

vi.mock('../components/Avatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{(name || '?').slice(0, 1)}</div>,
}))

beforeEach(() => {
  storeHolder.conversations = () => []
  storeHolder.drafts = {}
  storeHolder.users = {}
  storeHolder.convPrefs = {}
  storeHolder.setConversationPref = vi.fn(() => Promise.resolve({ ok: true }))
  storeHolder.unreadOf = () => 0
})

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter>
      <Chats />
    </MemoryRouter>
  )
}

const friend = (id, nickname) => ({ id, nickname, publicId: id, avatarUrl: '' })

describe('Chats 会话列表草稿前缀', () => {
  it('有草稿的会话显示 [草稿] 前缀与草稿内容', () => {
    storeHolder.conversations = () => [
      { friend: friend('u1', '李四'), last: { fromId: 'u1', text: '上次聊的', time: Date.now() } },
    ]
    storeHolder.drafts = { u1: '在吗？我想问' }
    setup()
    const prefix = screen.getByTestId('draft-prefix')
    expect(prefix.textContent).toBe('[草稿]')
    expect(screen.getByText('在吗？我想问')).toBeTruthy()
    expect(screen.queryByText(/上次聊的/)).toBeNull()
  })

  it('无草稿时正常显示最后一条消息预览', () => {
    storeHolder.conversations = () => [
      { friend: friend('u1', '李四'), last: { fromId: 'u1', text: '你好啊', time: Date.now() } },
    ]
    storeHolder.drafts = {}
    setup()
    expect(screen.queryByTestId('draft-prefix')).toBeNull()
    expect(screen.getByText('你好啊')).toBeTruthy()
  })

  it('无草稿且无消息时显示引导文案', () => {
    storeHolder.conversations = () => [{ friend: friend('u1', '李四'), last: null }]
    setup()
    expect(screen.getByText('点击开始聊天')).toBeTruthy()
  })

  it('导航标题为产品独立命名而非微信', () => {
    storeHolder.conversations = () => []
    setup()
    expect(screen.getByText('消息')).toBeTruthy()
    expect(screen.queryByText('微信')).toBeNull()
  })
})

describe('Chats 置顶与免打扰', () => {
  const rows = () => [
    { friend: friend('u1', '李四'), last: { fromId: 'u1', text: '旧消息', time: 1000 } },
    { friend: friend('u2', '王五'), last: { fromId: 'u2', text: '新消息', time: 5000 } },
  ]

  it('置顶会话排在最前且不随时间改变', () => {
    storeHolder.conversations = rows
    storeHolder.convPrefs = { u1: { pinned: true, muted: false } }
    setup()
    const names = screen.getAllByText(/^(李四|王五)$/).map((el) => el.textContent)
    expect(names[0]).toBe('李四')
    const link = screen.getByText('李四').closest('a')
    expect(link.className).toContain('border-eink-ink')
  })

  it('免打扰会话隐藏数字角标并显示灰点', () => {
    storeHolder.conversations = rows
    storeHolder.convPrefs = { u1: { pinned: false, muted: true } }
    storeHolder.unreadOf = (id) => (id === 'u1' ? 3 : 0)
    setup()
    expect(screen.getByTestId('muted-dot')).toBeTruthy()
  })

  it('右键会话行打开操作面板并可切换置顶', async () => {
    storeHolder.conversations = rows
    setup()
    fireEvent.contextMenu(screen.getByText('王五'))
    await waitFor(() => expect(screen.getByTestId('row-actions')).toBeTruthy())
    fireEvent.click(screen.getByTestId('action-pin'))
    expect(storeHolder.setConversationPref).toHaveBeenCalledWith('u2', { pinned: true })
    await waitFor(() => expect(screen.queryByTestId('row-actions')).toBeNull())
  })

  it('操作面板可切换免打扰并可取消关闭', async () => {
    storeHolder.conversations = rows
    storeHolder.convPrefs = { u2: { pinned: false, muted: true } }
    setup()
    fireEvent.contextMenu(screen.getByText('王五'))
    await screen.findByTestId('row-actions')
    expect(screen.getByTestId('action-mute').textContent).toBe('取消免打扰')
    fireEvent.click(screen.getByTestId('action-cancel'))
    await waitFor(() => expect(screen.queryByTestId('row-actions')).toBeNull())
    expect(storeHolder.setConversationPref).not.toHaveBeenCalled()
  })

  it('操作面板删除会话调用 removeThread', async () => {
    storeHolder.conversations = rows
    setup()
    fireEvent.contextMenu(screen.getByText('李四'))
    await screen.findByTestId('row-actions')
    fireEvent.click(screen.getByTestId('action-delete'))
    await waitFor(() => expect(screen.queryByTestId('row-actions')).toBeNull())
  })
})

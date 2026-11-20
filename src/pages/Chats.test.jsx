// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chats from './Chats'

const storeHolder = {
  conversations: () => [],
  drafts: {},
  users: {},
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
    unreadOf: () => 0,
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

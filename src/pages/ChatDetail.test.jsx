// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatDetail from './ChatDetail'
import { readImageFile } from '../lib/imagePipeline'
import { uploadMessageBlob } from '../lib/messageMedia'

const ME = '11111111-1111-4111-8111-111111111111'
const PEER = '22222222-2222-4222-8222-222222222222'
const PEER_USER = { id: PEER, nickname: '小红', publicId: '23456', avatarUrl: '' }

const storeHolder = {
  inbox: [],
  drafts: {},
  blockedIds: [],
}

const stableMocks = {
  messagesWith: () => [],
  sendMessage: vi.fn(),
  receiveMessage: vi.fn(),
  avatarColor: () => '#191919',
  logout: vi.fn(),
  mergeInbox: vi.fn(),
  sendKnock: vi.fn(async () => ({ ok: true })),
  openPeer: vi.fn(),
  readReceiptOf: () => 0,
  isBlocked: (id) => storeHolder.blockedIds.includes(id),
  setBlockedFor: vi.fn(),
  setDraft: vi.fn(),
}
const meUser = { id: ME, nickname: '小明', avatarUrl: '' }

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: meUser,
    profile: meUser,
    getUser: (id) => (id === PEER ? PEER_USER : null),
    ...stableMocks,
    inbox: storeHolder.inbox,
    syncTick: 0,
    drafts: storeHolder.drafts,
    displayNameOf: () => PEER_USER.nickname,
  }),
}))

vi.mock('../lib/messages', () => ({
  canRecall: () => false,
  fetchHiddenIds: vi.fn(() => Promise.resolve({ ok: true, ids: [] })),
  fetchThread: vi.fn(() =>
    Promise.resolve({ ok: true, messages: storeHolder.inbox, hasMore: false, oldest: null })
  ),
  hideMessage: vi.fn(),
  insertMessageWithFriendHeal: vi.fn(),
  isPairMessage: (msg, me, peer) =>
    (msg.fromId === me && msg.toId === peer) || (msg.fromId === peer && msg.toId === me),
  isUuid: (id) => /^[0-9a-f]{8}-/.test(String(id)),
  recallMessage: vi.fn(),
  searchThreadMessages: vi.fn(() => Promise.resolve({ ok: true, messages: [] })),
}))

vi.mock('../lib/imagePipeline', () => ({
  readImageFile: vi.fn(),
}))

vi.mock('../lib/messageMedia', () => ({
  MESSAGE_MEDIA_LIMITS: { maxSourceBytes: 25 * 1024 * 1024 },
  uploadMessageBlob: vi.fn(),
}))

vi.mock('../lib/supabase', () => {
  const makeChannel = () => {
    const ch = {
      presenceState: () => ({}),
      track: vi.fn(() => Promise.resolve()),
      untrack: vi.fn(() => Promise.resolve()),
      subscribe: vi.fn(() => ch),
      on: vi.fn(() => ch),
    }
    return ch
  }
  return {
    supabase: {
      channel: vi.fn(makeChannel),
      removeChannel: vi.fn(),
      auth: { signOut: vi.fn(() => Promise.resolve()) },
    },
  }
})

vi.mock('../components/AuthBar', () => ({ default: () => <div data-testid="auth-bar" /> }))
vi.mock('../components/Avatar', () => ({ default: () => <div data-testid="avatar" /> }))
vi.mock('../components/CopySql', () => ({ default: () => <div data-testid="copy-sql" /> }))
vi.mock('../components/LongTextBody', () => ({
  default: ({ text }) => (text ? <span>{text}</span> : null),
}))
vi.mock('../components/SignedImage', () => ({
  default: ({ attachment }) => <img data-testid="signed-image" data-path={attachment?.path || ''} alt="" />,
}))
vi.mock('../components/SignedAudio', () => ({
  default: ({ attachment }) => (
    <div data-testid="signed-audio" data-path={attachment?.path || ''} data-duration={attachment?.duration || 0} />
  ),
}))

function setup() {
  render(
    <MemoryRouter initialEntries={[`/chat/${PEER}`]}>
      <Routes>
        <Route path="/chat/:peerId" element={<ChatDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  storeHolder.inbox = []
  storeHolder.drafts = {}
  storeHolder.blockedIds = []
  stableMocks.setBlockedFor.mockReset()
  stableMocks.setBlockedFor.mockResolvedValue({ ok: true })
  readImageFile.mockReset()
  uploadMessageBlob.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview-image')
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

describe('ChatDetail 图片消息不额外套气泡边框', () => {
  it('图片与文字一起发送时，图片独立展示，文字在自己的气泡内', async () => {
    storeHolder.inbox = [
      {
        id: 'm-img-text',
        fromId: ME,
        toId: PEER,
        text: '配文',
        time: Date.now(),
        attachments: { type: 'image', path: 'chat/p1.jpg', width: 120, height: 120 },
      },
    ]
    setup()

    const image = await screen.findByTestId('signed-image')
    const bubble = screen.getByText('配文').closest('.chat-bubble-text')
    expect(bubble).toBeTruthy()
    expect(bubble.contains(image)).toBe(false)
    expect(image.closest('.chat-bubble-text')).toBeNull()
  })

  it('纯图片消息不渲染文字气泡', async () => {
    storeHolder.inbox = [
      {
        id: 'm-img-only',
        fromId: ME,
        toId: PEER,
        text: '',
        time: Date.now(),
        attachments: { type: 'image', path: 'chat/p2.jpg', width: 120, height: 120 },
      },
    ]
    setup()

    const image = await screen.findByTestId('signed-image')
    expect(image.closest('.chat-bubble-text')).toBeNull()
    expect(document.querySelectorAll('.chat-bubble-text')).toHaveLength(0)
  })

  it('图片上传中不显示气泡边框，文字单独成气泡', async () => {
    storeHolder.drafts = { [PEER]: '图片说明' }
    readImageFile.mockResolvedValue({
      ok: true,
      blob: new Blob(['image'], { type: 'image/png' }),
      width: 120,
      height: 120,
    })
    uploadMessageBlob.mockReturnValue(new Promise(() => {}))
    setup()

    const input = screen.getByTestId('attach-input')
    fireEvent.change(input, { target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] } })

    await screen.findByAltText('附件预览')
    expect(screen.getByTestId('attach-preview').className).not.toContain('border')
    const send = screen.getByRole('button', { name: '发送' })
    await waitFor(() => expect(send.disabled).toBe(false))
    fireEvent.click(send)

    const pending = await screen.findByTestId('pending-image')
    expect(pending.closest('.chat-bubble-text')).toBeNull()
    const bubble = screen.getByText('图片说明').closest('.chat-bubble-text')
    expect(bubble).toBeTruthy()
    expect(bubble.contains(pending)).toBe(false)
  })
})

describe('ChatDetail 语音消息', () => {
  it('语音与文字切换按钮位于输入框最左侧', async () => {
    setup()

    const input = await screen.findByPlaceholderText('发送消息')
    const toggle = screen.getByTestId('voice-mode-toggle')
    expect(toggle.parentElement.contains(input)).toBe(true)
    expect(toggle.className).toContain('left-0')

    fireEvent.click(toggle)
    expect(screen.getByTestId('voice-hold').textContent).toContain('按住 说话')
    expect(screen.queryByPlaceholderText('发送消息')).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByPlaceholderText('发送消息')).toBeTruthy()
  })

  it('语音消息展示播放器且不额外套文字气泡', async () => {
    storeHolder.inbox = [
      {
        id: 'm-audio',
        fromId: PEER,
        toId: ME,
        text: '',
        time: Date.now(),
        attachments: { type: 'audio', path: 'chat/a.webm', duration: 3, mime: 'audio/webm' },
      },
    ]
    setup()

    const audio = await screen.findByTestId('signed-audio')
    expect(audio.getAttribute('data-duration')).toBe('3')
    expect(audio.closest('.chat-bubble-text')).toBeNull()
    expect(document.querySelectorAll('.chat-bubble-text')).toHaveLength(0)
  })

  it('浏览器不支持录音时按住说话给出提示', async () => {
    setup()

    fireEvent.click(await screen.findByTestId('voice-mode-toggle'))
    fireEvent.pointerDown(screen.getByTestId('voice-hold'))

    await screen.findByText('当前浏览器不支持录音')
  })
})

describe('ChatDetail 敲一敲', () => {
  it('收到敲一敲时展示提示文案，不渲染普通文字气泡', async () => {
    storeHolder.inbox = [
      {
        id: 'm-knock',
        fromId: PEER,
        toId: ME,
        text: '敲了敲你',
        time: Date.now(),
        attachments: { type: 'knock', at: Date.now() },
      },
    ]
    setup()

    const event = await screen.findByTestId('knock-event')
    expect(event.textContent).toBe('小红 敲了敲你')
    expect(document.querySelectorAll('.chat-bubble-text')).toHaveLength(0)
  })

  it('聊天菜单可以敲一敲对方', async () => {
    setup()

    fireEvent.click(await screen.findByTestId('chat-menu'))
    fireEvent.click(screen.getByTestId('chat-knock'))
    await waitFor(() => expect(stableMocks.sendKnock).toHaveBeenCalledWith(PEER))
  })
})

describe('ChatDetail 拉黑确认', () => {
  it('点击拉黑先弹确认，取消后不执行拉黑', async () => {
    setup()

    fireEvent.click(await screen.findByTestId('chat-menu'))
    fireEvent.click(screen.getByTestId('block-toggle'))

    expect(screen.getByTestId('block-confirm-dialog')).toBeTruthy()
    expect(screen.getByText(/将无法再给你发消息，聊天记录会保留/)).toBeTruthy()
    expect(stableMocks.setBlockedFor).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('block-cancel'))
    expect(screen.queryByTestId('block-confirm-dialog')).toBeNull()
    expect(stableMocks.setBlockedFor).not.toHaveBeenCalled()
  })

  it('确认后执行拉黑并给出提示', async () => {
    setup()

    fireEvent.click(await screen.findByTestId('chat-menu'))
    fireEvent.click(screen.getByTestId('block-toggle'))
    fireEvent.click(screen.getByTestId('block-confirm'))

    expect(stableMocks.setBlockedFor).toHaveBeenCalledWith(PEER, true)
    await screen.findByText('已拉黑，对方无法再给你发消息')
    expect(screen.queryByTestId('block-confirm-dialog')).toBeNull()
  })

  it('已拉黑时取消拉黑无需二次确认', async () => {
    storeHolder.blockedIds = [PEER]
    setup()

    fireEvent.click(await screen.findByTestId('chat-menu'))
    expect(screen.getByTestId('block-toggle').textContent).toBe('取消拉黑')
    fireEvent.click(screen.getByTestId('block-toggle'))

    expect(screen.queryByTestId('block-confirm-dialog')).toBeNull()
    expect(stableMocks.setBlockedFor).toHaveBeenCalledWith(PEER, false)
    await screen.findByText('已取消拉黑')
  })
})

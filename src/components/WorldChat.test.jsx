// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorldChat from './WorldChat'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  fetchWorldMessages: vi.fn(),
  sendWorldMessage: vi.fn(),
  subscribeWorldMessages: vi.fn(() => () => {}),
  fetchProfilesByIds: vi.fn(),
  submitReport: vi.fn(),
  setBlockedFor: vi.fn(),
}))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: { id: ME, nickname: '我', email: 'me@example.com' },
    profile: { nickname: '我', avatarUrl: '' },
    avatarColor: () => '#191919',
    blockedIds: [],
    setBlockedFor: mocks.setBlockedFor,
    displayNameOf: (id) => (id === ME ? '我' : '阿哲'),
  }),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))

vi.mock('../lib/profiles', () => ({
  fetchProfilesByIds: mocks.fetchProfilesByIds,
}))

vi.mock('../lib/reports', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, submitReport: mocks.submitReport }
})

vi.mock('../lib/worldChat', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchWorldMessages: mocks.fetchWorldMessages,
    sendWorldMessage: mocks.sendWorldMessage,
    subscribeWorldMessages: mocks.subscribeWorldMessages,
  }
})

function message(overrides = {}) {
  return {
    id: '1',
    authorId: OTHER,
    channel: 'world',
    content: '晚上好',
    time: Date.parse('2026-11-24T20:00:00.000Z'),
    createdAt: '2026-11-24T20:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.fetchWorldMessages.mockResolvedValue({ ok: true, messages: [message()] })
  mocks.sendWorldMessage.mockImplementation(async (channel, body) => ({
    ok: true,
    message: message({ id: '9', authorId: ME, content: body }),
  }))
  mocks.subscribeWorldMessages.mockReturnValue(() => {})
  mocks.fetchProfilesByIds.mockResolvedValue({
    ok: true,
    profiles: [{ id: OTHER, nickname: '阿哲', avatarUrl: '' }],
  })
  mocks.submitReport.mockResolvedValue({ ok: true })
  mocks.setBlockedFor.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WorldChat', () => {
  it('加载世界频道消息与频道说明', async () => {
    render(<WorldChat onClose={() => {}} />)
    expect(screen.getByText('世界频道')).toBeTruthy()
    expect(screen.getByTestId('world-chat-notice').textContent).toContain('不能加好友')
    await waitFor(() => expect(screen.getByText('晚上好')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('阿哲')).toBeTruthy())
    expect(mocks.fetchWorldMessages).toHaveBeenCalledWith('world')
  })

  it('切换频道后按新频道拉取消息', async () => {
    render(<WorldChat onClose={() => {}} />)
    await waitFor(() => expect(mocks.fetchWorldMessages).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('world-chat-tab-asia'))
    await waitFor(() => expect(mocks.fetchWorldMessages).toHaveBeenLastCalledWith('asia'))
  })

  it('发送消息后立即出现在列表并清空输入', async () => {
    render(<WorldChat onClose={() => {}} />)
    const input = await screen.findByTestId('world-chat-input')
    fireEvent.change(input, { target: { value: '大家好' } })
    fireEvent.click(screen.getByTestId('world-chat-send'))
    await waitFor(() => expect(mocks.sendWorldMessage).toHaveBeenCalledWith('world', '大家好'))
    expect(await screen.findByText('大家好')).toBeTruthy()
    expect(input.value).toBe('')
  })

  it('可以在举报面板提交消息举报', async () => {
    render(<WorldChat onClose={() => {}} />)
    await screen.findByText('晚上好')
    fireEvent.click(screen.getByTestId('world-chat-more'))
    fireEvent.click(screen.getByTestId('world-chat-report'))
    fireEvent.click(await screen.findByTestId('report-reason-spam'))
    fireEvent.click(screen.getByTestId('report-submit'))
    await waitFor(() =>
      expect(mocks.submitReport).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: ME, targetType: 'message', targetId: '1', targetUserId: OTHER })
      )
    )
  })

  it('可以屏蔽消息作者', async () => {
    render(<WorldChat onClose={() => {}} />)
    await screen.findByText('晚上好')
    fireEvent.click(screen.getByTestId('world-chat-more'))
    fireEvent.click(screen.getByTestId('world-chat-block'))
    await waitFor(() => expect(mocks.setBlockedFor).toHaveBeenCalledWith(OTHER, true))
    expect(screen.queryByText('晚上好')).toBeNull()
    expect(screen.getByTestId('world-chat-status').textContent).toContain('已屏蔽')
  })
})

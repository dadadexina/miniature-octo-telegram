// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Discover from './Discover'
import { fetchMoments } from '../lib/moments'
import { fetchProfilesByIds } from '../lib/profiles'

const ME = '11111111-1111-4111-8111-111111111111'

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: { id: '11111111-1111-4111-8111-111111111111', nickname: '我', avatarUrl: '' },
    profile: { nickname: '我', avatarUrl: '', signature: '见字如面' },
    avatarColor: () => '#191919',
    getUser: () => null,
    upsertUsers: vi.fn(),
    syncTick: 0,
    displayNameOf: () => '',
  }),
}))

vi.mock('../lib/moments', () => ({
  fetchMoments: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  momentStoragePath: () => '',
  removeMomentImage: vi.fn(),
  uploadMomentImage: vi.fn(),
}))

vi.mock('../lib/profiles', () => ({
  fetchProfilesByIds: vi.fn(),
}))

vi.mock('../components/Avatar', () => ({
  default: ({ name }) => <div data-testid="avatar">{(name || '?').slice(0, 1)}</div>,
}))

beforeEach(() => {
  localStorage.clear()
  fetchMoments.mockReset()
  fetchProfilesByIds.mockReset()
  fetchProfilesByIds.mockResolvedValue({ ok: true, profiles: [] })
  fetchMoments.mockResolvedValue({ ok: true, moments: [], hasMore: false, oldest: null })
})

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter>
      <Discover />
    </MemoryRouter>
  )
}

describe('Discover 朋友圈页', () => {
  it('移除刷新按钮与封面相机入口，保留下拉刷新指示器', async () => {
    setup()
    await screen.findByTestId('moments-empty')
    expect(screen.queryByTestId('moments-refresh')).toBeNull()
    expect(screen.queryByTestId('change-cover')).toBeNull()
    expect(screen.getByTestId('moments-cover').dataset.raised).toBe('true')
    expect(screen.getByTestId('moments-pull-indicator')).toBeTruthy()
  })

  it('顶部标题为纸墨信笺，头像无圆形白底并展示个性签名', async () => {
    setup()
    await screen.findByTestId('moments-empty')
    expect(screen.getByRole('heading', { name: '纸墨信笺' })).toBeTruthy()
    const link = screen.getByTestId('moments-avatar-link')
    expect(link.className).not.toContain('rounded-full')
    expect(link.className).not.toContain('ring-')
    expect(screen.getByTestId('moments-signature').textContent).toBe('见字如面')
  })

  it('在顶部下拉松手后重新拉取动态', async () => {
    setup()
    await screen.findByTestId('moments-empty')
    expect(fetchMoments).toHaveBeenCalledTimes(1)

    const scroller = screen.getByTestId('moments-scroll')
    fireEvent.touchStart(scroller, { touches: [{ clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientY: 200 }] })
    expect(screen.getByTestId('moments-pull-indicator').textContent).toBe('松手刷新')

    fireEvent.touchEnd(scroller, { changedTouches: [{ clientY: 200 }] })
    await waitFor(() => expect(fetchMoments).toHaveBeenCalledTimes(2))
  })

  it('渲染动态正文时带上字体缩放标记', async () => {
    fetchMoments.mockResolvedValue({
      ok: true,
      moments: [{ id: 'm1', authorId: ME, content: '第一条动态', imageUrl: '', createdAt: Date.now() }],
      hasMore: false,
      oldest: null,
    })
    setup()
    const text = await screen.findByText('第一条动态')
    expect(text.className).toContain('moment-text')
  })
})

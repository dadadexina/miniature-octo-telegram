// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResetPassword from './ResetPassword'

const authMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { auth: authMocks } }))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPassword />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('ResetPassword', () => {
  it('链接已由 supabase 处理过时，仍能凭已建立的恢复会话进入设置表单', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    renderPage()
    await waitFor(() => expect(screen.getByText('新密码')).toBeTruthy())
    expect(screen.getByRole('button', { name: '设置新密码' })).toBeTruthy()
  })

  it('既无会话也无令牌时提示链接无效', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } })
    renderPage()
    await waitFor(() => expect(screen.getByText('链接无效或已过期。')).toBeTruthy())
  })
})

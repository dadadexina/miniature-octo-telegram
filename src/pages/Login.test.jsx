// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { auth } }))

const storeMocks = vi.hoisted(() => ({ loginWithSupabaseUser: vi.fn() }))

vi.mock('../store', () => ({
  useStore: () => ({ loginWithSupabaseUser: storeMocks.loginWithSupabaseUser }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login phone channel', () => {
  it('sends a login OTP and shows the cooldown notice', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: { session: null }, error: null })
    renderLogin()
    fireEvent.click(screen.getByTestId('login-channel-phone'))
    fireEvent.change(screen.getByTestId('login-phone'), { target: { value: '13800138000' } })
    fireEvent.click(screen.getByTestId('login-send-phone-code'))

    await waitFor(() =>
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+8613800138000',
        options: { shouldCreateUser: true },
      })
    )
    expect(await screen.findByText(/验证码已发送至 138\*\*\*\*8000/)).toBeTruthy()
  })

  it('logs in with phone OTP', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1', phone: '+8613800138000' } }, error: null })
    renderLogin()
    fireEvent.click(screen.getByTestId('login-channel-phone'))
    fireEvent.change(screen.getByTestId('login-phone'), { target: { value: '13800138000' } })
    fireEvent.change(screen.getByTestId('login-phone-code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('login-phone-submit'))

    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '123456',
      type: 'sms',
    }))
    expect(storeMocks.loginWithSupabaseUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' })
    )
  })

  it('rejects an invalid phone number before calling Supabase', async () => {
    renderLogin()
    fireEvent.click(screen.getByTestId('login-channel-phone'))
    fireEvent.change(screen.getByTestId('login-phone'), { target: { value: '123' } })
    fireEvent.click(screen.getByTestId('login-send-phone-code'))

    expect(await screen.findByTestId('login-error')).toBeTruthy()
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })
})

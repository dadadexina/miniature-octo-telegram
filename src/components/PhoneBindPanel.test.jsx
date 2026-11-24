// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PhoneBindPanel from './PhoneBindPanel'

const phoneMocks = vi.hoisted(() => ({
  sendPhoneBindCode: vi.fn(),
  verifyPhoneBindCode: vi.fn(),
}))

vi.mock('../lib/phoneAuth', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ...phoneMocks }
})

const profileMocks = vi.hoisted(() => ({
  updateProfileSettings: vi.fn(),
}))

vi.mock('../lib/profiles', () => ({
  updateProfileSettings: profileMocks.updateProfileSettings,
}))

const storeState = vi.hoisted(() => ({
  authUser: { id: 'u1', phone: '' },
  profile: { allowEmailSearch: true, allowPhoneSearch: true },
  setCloudProfile: vi.fn(),
}))

vi.mock('../store', () => ({
  useStore: () => ({
    authUser: storeState.authUser,
    currentUser: { id: 'u1' },
    profile: storeState.profile,
    setCloudProfile: storeState.setCloudProfile,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  storeState.authUser = { id: 'u1', phone: '' }
  storeState.profile = { allowEmailSearch: true, allowPhoneSearch: true }
  phoneMocks.sendPhoneBindCode.mockResolvedValue({ ok: true })
  phoneMocks.verifyPhoneBindCode.mockResolvedValue({ ok: true, user: { id: 'u1', phone: '+8613800138000' } })
  profileMocks.updateProfileSettings.mockResolvedValue({
    ok: true,
    profile: { phone: '13800138000', allowEmailSearch: true, allowPhoneSearch: true },
  })
})

afterEach(cleanup)

describe('PhoneBindPanel', () => {
  it('binds a phone number and syncs the searchable profile field', async () => {
    render(<PhoneBindPanel />)
    expect(screen.getByTestId('phone-bind-status').textContent).toContain('未绑定')

    fireEvent.click(screen.getByTestId('phone-bind-start'))
    fireEvent.change(screen.getByTestId('phone-bind-input'), { target: { value: '13800138000' } })
    fireEvent.click(screen.getByTestId('phone-bind-send'))
    await waitFor(() => expect(phoneMocks.sendPhoneBindCode).toHaveBeenCalledWith('13800138000'))
    expect(await screen.findByText(/验证码已发送/)).toBeTruthy()

    fireEvent.change(screen.getByTestId('phone-bind-code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('phone-bind-submit'))

    await waitFor(() => expect(phoneMocks.verifyPhoneBindCode).toHaveBeenCalledWith('13800138000', '123456'))
    expect(profileMocks.updateProfileSettings).toHaveBeenCalledWith('u1', {
      phone: '13800138000',
      allowEmailSearch: true,
      allowPhoneSearch: true,
    })
    expect(await screen.findByText(/手机号已绑定/)).toBeTruthy()
    expect(screen.queryByTestId('phone-bind-form')).toBeNull()
  })

  it('shows the bound phone and allows replacement', () => {
    storeState.authUser = { id: 'u1', phone: '+8613800138000' }
    render(<PhoneBindPanel />)
    expect(screen.getByTestId('phone-bind-status').textContent).toContain('138****8000')
    fireEvent.click(screen.getByTestId('phone-bind-start'))
    expect(screen.getByTestId('phone-bind-form')).toBeTruthy()
  })

  it('keeps the form open when verification fails', async () => {
    phoneMocks.verifyPhoneBindCode.mockResolvedValue({ ok: false, error: '验证码已过期，请重新获取' })
    render(<PhoneBindPanel />)
    fireEvent.click(screen.getByTestId('phone-bind-start'))
    fireEvent.change(screen.getByTestId('phone-bind-input'), { target: { value: '13800138000' } })
    fireEvent.change(screen.getByTestId('phone-bind-code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByTestId('phone-bind-submit'))

    expect(await screen.findByText('验证码已过期，请重新获取')).toBeTruthy()
    expect(screen.getByTestId('phone-bind-form')).toBeTruthy()
    expect(profileMocks.updateProfileSettings).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditProfile from './EditProfile'

const PROFILE = {
  id: 'me-uuid',
  nickname: '我',
  username: 'me_12345',
  avatarUrl: '',
  gender: 'secret',
  createdAt: '2026-01-02T12:00:00',
  phone: '',
  allowEmailSearch: true,
  allowPhoneSearch: true,
  idChangeCount: 0,
}

const storeHolder = {
  profile: { ...PROFILE },
}

const updateProfileGender = vi.fn()
const updateProfileNickname = vi.fn()

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: { id: 'me-uuid', nickname: '我', avatarUrl: '', createdAt: '2026-01-02T12:00:00' },
    authUser: { id: 'me-uuid' },
    profile: storeHolder.profile,
    avatarColor: () => '#191919',
    applyProfileToUser: vi.fn(),
    setCloudProfile: vi.fn(),
    saveLocalProfile: vi.fn(),
  }),
}))

vi.mock('../lib/profiles', () => ({
  insertProfile: vi.fn(),
  updateProfileAvatar: vi.fn(),
  updateProfileGender: (...args) => updateProfileGender(...args),
  updateProfileNickname: (...args) => updateProfileNickname(...args),
  updateProfileSettings: vi.fn(),
  updatePublicId: vi.fn(),
  uploadAvatarFile: vi.fn(),
}))

vi.mock('../components/Avatar', () => ({
  default: () => <div data-testid="avatar" />,
}))

beforeEach(() => {
  storeHolder.profile = { ...PROFILE }
  updateProfileGender.mockReset()
  updateProfileNickname.mockReset()
  updateProfileGender.mockResolvedValue({ ok: true, profile: { ...PROFILE, gender: 'female' } })
  updateProfileNickname.mockResolvedValue({ ok: true, profile: { ...PROFILE, gender: 'female' } })
})

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter initialEntries={['/profile/edit']}>
      <Routes>
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/me" element={<div data-testid="me-page">ME</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EditProfile 性别与注册日期', () => {
  it('注册日期以只读文本展示', () => {
    setup()
    expect(screen.getByTestId('profile-created-at').textContent).toBe('2026年1月2日')
    expect(screen.getByText('注册日期固定保存，不可修改。')).toBeTruthy()
  })

  it('选择性别并保存后同步资料', async () => {
    setup()
    fireEvent.click(screen.getByTestId('profile-gender-female'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateProfileGender).toHaveBeenCalledWith('me-uuid', 'female'))
    await waitFor(() => expect(screen.getByTestId('me-page')).toBeTruthy())
  })
})

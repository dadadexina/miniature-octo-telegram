// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PendingDeletionGate from './PendingDeletionGate'

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'u1' },
  profile: null,
}))
const storeMocks = vi.hoisted(() => ({
  purgeAccount: vi.fn(),
  logout: vi.fn(),
  setCloudProfile: vi.fn(),
}))
const deletionMocks = vi.hoisted(() => ({
  cancelAccountDeletion: vi.fn(),
  finalizeAccountDeletion: vi.fn(),
}))
const authMock = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: storeState.currentUser,
    profile: storeState.profile,
    purgeAccount: storeMocks.purgeAccount,
    logout: storeMocks.logout,
    setCloudProfile: storeMocks.setCloudProfile,
  }),
}))

vi.mock('../lib/accountDeletion', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ...deletionMocks }
})

vi.mock('../lib/supabase', () => ({ supabase: { auth: authMock } }))

function setup() {
  render(
    <MemoryRouter>
      <PendingDeletionGate />
    </MemoryRouter>,
  )
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  storeState.profile = null
  deletionMocks.cancelAccountDeletion.mockResolvedValue({ ok: true })
  deletionMocks.finalizeAccountDeletion.mockResolvedValue({ ok: true })
  authMock.signOut.mockResolvedValue({ error: null })
})

afterEach(cleanup)

describe('PendingDeletionGate', () => {
  it('未申请注销时不渲染', () => {
    storeState.profile = { id: 'u1', deletedAt: '' }
    setup()
    expect(screen.queryByTestId('pending-deletion-gate')).toBeNull()
  })

  it('冷静期内显示到期日期并可撤销', async () => {
    storeState.profile = { id: 'u1', deletedAt: daysAgo(1) }
    setup()
    expect(screen.getByTestId('pending-deletion-gate')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cancel-deletion'))
    await waitFor(() => expect(deletionMocks.cancelAccountDeletion).toHaveBeenCalledWith('u1'))
    expect(storeMocks.setCloudProfile).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: '' }))
    expect(deletionMocks.finalizeAccountDeletion).not.toHaveBeenCalled()
  })

  it('超过 7 天自动删除并退出', async () => {
    storeState.profile = { id: 'u1', deletedAt: daysAgo(8) }
    setup()
    await waitFor(() => expect(deletionMocks.finalizeAccountDeletion).toHaveBeenCalled())
    expect(storeMocks.purgeAccount).toHaveBeenCalled()
    expect(storeMocks.logout).toHaveBeenCalled()
  })
})

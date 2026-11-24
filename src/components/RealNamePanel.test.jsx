// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RealNamePanel from './RealNamePanel'

const realNameMocks = vi.hoisted(() => ({
  fetchMyRealName: vi.fn(),
  submitRealName: vi.fn(),
  uploadRealNamePhoto: vi.fn(),
  removeRealNamePhoto: vi.fn(),
  isRealNameAdmin: vi.fn(),
  fetchAdminRealNames: vi.fn(),
  reviewRealName: vi.fn(),
  signedRealNameUrl: vi.fn(),
}))

vi.mock('../lib/realName', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ...realNameMocks }
})

const storeState = vi.hoisted(() => ({ currentUser: { id: 'u1', nickname: '我' } }))

vi.mock('../store', () => ({
  useStore: () => ({ currentUser: storeState.currentUser }),
}))

const VALID_ID = '11010519491231002X'

beforeEach(() => {
  vi.clearAllMocks()
  storeState.currentUser = { id: 'u1', nickname: '我' }
  realNameMocks.fetchMyRealName.mockResolvedValue({
    ok: true,
    status: { status: 'unverified', realName: '', idNumberMasked: '', reviewNote: '' },
  })
  realNameMocks.isRealNameAdmin.mockResolvedValue(false)
  realNameMocks.fetchAdminRealNames.mockResolvedValue({ ok: true, rows: [] })
  realNameMocks.signedRealNameUrl.mockResolvedValue('')
  realNameMocks.uploadRealNamePhoto.mockImplementation(async (userId, side) => ({
    ok: true,
    path: `${userId}/${side}.jpg`,
  }))
  realNameMocks.submitRealName.mockResolvedValue({
    ok: true,
    status: { status: 'pending', realName: '张三', idNumberMasked: '110105********002X' },
  })
  realNameMocks.removeRealNamePhoto.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe('RealNamePanel', () => {
  it('shows the current status and submits name, id and photos', async () => {
    render(<RealNamePanel />)

    expect(await screen.findByText('未实名')).toBeTruthy()
    fireEvent.change(screen.getByTestId('real-name-input'), { target: { value: ' 张三 ' } })
    fireEvent.change(screen.getByTestId('real-name-id'), { target: { value: '11010519491231002x' } })
    fireEvent.change(screen.getByTestId('real-name-front'), {
      target: { files: [new File(['a'], 'front.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.change(screen.getByTestId('real-name-back'), {
      target: { files: [new File(['b'], 'back.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(screen.getByTestId('real-name-submit'))

    await waitFor(() => expect(realNameMocks.submitRealName).toHaveBeenCalled())
    expect(realNameMocks.uploadRealNamePhoto).toHaveBeenNthCalledWith(
      1,
      'u1',
      'front',
      expect.objectContaining({ name: 'front.jpg' })
    )
    expect(realNameMocks.submitRealName).toHaveBeenCalledWith({
      realName: '张三',
      idNumber: VALID_ID,
      frontPath: 'u1/front.jpg',
      backPath: 'u1/back.jpg',
    })
    expect(await screen.findByText('审核中')).toBeTruthy()
  })

  it('blocks submission when photos are missing', async () => {
    render(<RealNamePanel />)
    await screen.findByText('未实名')
    fireEvent.change(screen.getByTestId('real-name-input'), { target: { value: '张三' } })
    fireEvent.change(screen.getByTestId('real-name-id'), { target: { value: VALID_ID } })
    fireEvent.click(screen.getByTestId('real-name-submit'))

    expect(await screen.findByText('请上传身份证人像面和国徽面')).toBeTruthy()
    expect(realNameMocks.submitRealName).not.toHaveBeenCalled()
  })

  it('shows pending state without the submit form', async () => {
    realNameMocks.fetchMyRealName.mockResolvedValue({
      ok: true,
      status: { status: 'pending', realName: '张三', idNumberMasked: '110105********002X', reviewNote: '' },
    })
    render(<RealNamePanel />)
    expect(await screen.findByText('审核中')).toBeTruthy()
    expect(screen.queryByTestId('real-name-form')).toBeNull()
  })

  it('lets admins approve pending applications', async () => {
    realNameMocks.fetchMyRealName.mockResolvedValue({
      ok: true,
      status: { status: 'verified', realName: '我', idNumberMasked: '', reviewNote: '' },
    })
    realNameMocks.isRealNameAdmin.mockResolvedValue(true)
    realNameMocks.fetchAdminRealNames.mockResolvedValue({
      ok: true,
      rows: [
        {
          userId: 'u2',
          realName: '李四',
          idNumber: VALID_ID,
          status: 'pending',
          frontPath: 'u2/front.jpg',
          backPath: 'u2/back.jpg',
          email: 'lisi@example.com',
        },
      ],
    })
    realNameMocks.reviewRealName.mockResolvedValue({ ok: true })
    render(<RealNamePanel />)

    expect(await screen.findByTestId('real-name-admin-list')).toBeTruthy()
    fireEvent.click(screen.getByTestId('real-name-approve-u2'))
    await waitFor(() => expect(realNameMocks.reviewRealName).toHaveBeenCalledWith('u2', true, ''))
  })
})

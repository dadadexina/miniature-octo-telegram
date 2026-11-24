import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAdminRealNames,
  fetchMyRealName,
  isRealNameAdmin,
  maskIdNumber,
  normalizeRealNameRow,
  realNameErrorText,
  realNamePhotoError,
  reviewRealName,
  submitRealName,
  uploadRealNamePhoto,
  validateChineseId,
  validateRealName,
} from './realName'

const rpc = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
const createSignedUrl = vi.fn()
const from = vi.fn(() => ({ upload, remove, createSignedUrl }))

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    storage: { from: (...args) => from(...args) },
  },
}))

const VALID_ID = '11010519491231002X'

beforeEach(() => {
  vi.clearAllMocks()
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null })
})

describe('real-name validators', () => {
  it('accepts a valid 18-digit id and normalizes lowercase x', () => {
    expect(validateChineseId(' 11010519491231002x ')).toEqual({ ok: true, id: VALID_ID, error: '' })
  })

  it('rejects bad checksum, bad format and impossible birthday', () => {
    expect(validateChineseId('110105194912310021').ok).toBe(false)
    expect(validateChineseId('11010519491231002').ok).toBe(false)
    expect(validateChineseId('110105194902310021').ok).toBe(false)
  })

  it('validates real names and masks id numbers', () => {
    expect(validateRealName('张三').ok).toBe(true)
    expect(validateRealName('张').ok).toBe(false)
    expect(validateRealName('张3').ok).toBe(false)
    expect(maskIdNumber(VALID_ID)).toBe('110105********002X')
  })

  it('normalizes status rows and unknown values', () => {
    expect(normalizeRealNameRow({ status: 'pending', real_name: '张三' })).toMatchObject({
      status: 'pending',
      realName: '张三',
    })
    expect(normalizeRealNameRow([{ status: 'verified' }]).status).toBe('verified')
    expect(normalizeRealNameRow(null).status).toBe('unverified')
    expect(normalizeRealNameRow({ status: 'weird' }).status).toBe('unverified')
  })

  it('maps known backend errors', () => {
    expect(realNameErrorText({ message: 'id_already_used' })).toContain('已被其他账号提交')
    expect(realNameErrorText({ message: 'not_admin' })).toContain('没有实名审核权限')
  })
})

describe('real-name data layer', () => {
  it('reads my real-name status through the RPC', async () => {
    rpc.mockResolvedValue({ data: { status: 'pending', real_name: '张三' }, error: null })
    const result = await fetchMyRealName()
    expect(rpc).toHaveBeenCalledWith('my_real_name')
    expect(result.ok).toBe(true)
    expect(result.status.status).toBe('pending')
  })

  it('submits normalized name and id', async () => {
    rpc.mockResolvedValue({ data: { status: 'pending' }, error: null })
    const result = await submitRealName({
      realName: ' 张三 ',
      idNumber: '11010519491231002x',
      frontPath: 'u1/front.jpg',
      backPath: 'u1/back.jpg',
    })
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('submit_real_name', {
      p_real_name: '张三',
      p_id_number: VALID_ID,
      p_front_path: 'u1/front.jpg',
      p_back_path: 'u1/back.jpg',
    })
  })

  it('blocks invalid submissions before calling the RPC', async () => {
    const result = await submitRealName({
      realName: '张三',
      idNumber: '110105194912310021',
      frontPath: 'a',
      backPath: 'b',
    })
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('detects admin flag', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await expect(isRealNameAdmin()).resolves.toBe(true)
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(isRealNameAdmin()).resolves.toBe(false)
  })

  it('maps admin applications and reviews decisions', async () => {
    rpc.mockImplementation((name) => {
      if (name === 'admin_list_real_names') {
        return Promise.resolve({
          data: [{ user_id: 'u2', real_name: '李四', id_number: VALID_ID, status: 'pending', front_path: 'a', back_path: 'b' }],
          error: null,
        })
      }
      return Promise.resolve({ data: { ok: true, status: 'verified' }, error: null })
    })
    const list = await fetchAdminRealNames()
    expect(list.rows[0]).toMatchObject({ userId: 'u2', realName: '李四', status: 'pending' })
    await reviewRealName('u2', true, ' ok ')
    expect(rpc).toHaveBeenCalledWith('admin_review_real_name', {
      p_user_id: 'u2',
      p_approve: true,
      p_note: 'ok',
    })
  })
})

describe('real-name photo uploads', () => {
  it('rejects unsupported files', () => {
    expect(realNamePhotoError(null)).toContain('请选择')
    expect(realNamePhotoError({ type: 'text/plain', size: 10 })).toContain('必须是图片')
    expect(realNamePhotoError({ type: 'image/png', size: 6 * 1024 * 1024 })).toContain('5MB')
  })

  it('uploads into the owner folder', async () => {
    const file = { type: 'image/jpeg', size: 100 }
    const result = await uploadRealNamePhoto('u1', 'front', file)
    expect(result.ok).toBe(true)
    expect(result.path.startsWith('u1/front-')).toBe(true)
    expect(from).toHaveBeenCalledWith('realname')
    expect(upload).toHaveBeenCalledWith(
      result.path,
      file,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false })
    )
  })
})

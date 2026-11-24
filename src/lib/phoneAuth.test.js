import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  maskPhoneNumber,
  normalizePhone,
  phoneAuthErrorText,
  profilePhoneOf,
  sendPhoneBindCode,
  sendPhoneLoginCode,
  verifyPhoneBindCode,
  verifyPhoneLoginCode,
} from './phoneAuth'

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { auth } }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('phone helpers', () => {
  it('normalizes mainland and international numbers', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000')
    expect(normalizePhone('+86 13800138000')).toBe('+8613800138000')
    expect(normalizePhone('+14155552671')).toBe('+14155552671')
    expect(normalizePhone('123')).toBe('')
    expect(profilePhoneOf('+8613800138000')).toBe('13800138000')
    expect(maskPhoneNumber('+8613800138000')).toBe('138****8000')
  })

  it('maps auth errors', () => {
    expect(phoneAuthErrorText({ message: 'Invalid token' })).toContain('验证码不正确')
    expect(phoneAuthErrorText({ message: 'Token has expired' })).toContain('已过期')
    expect(phoneAuthErrorText({ message: 'Phone provider not configured' })).toContain('短信通道')
  })
})

describe('phone auth actions', () => {
  it('sends login otp with create-user enabled', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: { session: null }, error: null })
    const result = await sendPhoneLoginCode('13800138000')
    expect(result.ok).toBe(true)
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      options: { shouldCreateUser: true },
    })
  })

  it('verifies login otp and returns the user', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const result = await verifyPhoneLoginCode('13800138000', '123456')
    expect(result).toMatchObject({ ok: true, user: { id: 'u1' } })
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '123456',
      type: 'sms',
    })
  })

  it('binds a phone through updateUser and phone_change verification', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect((await sendPhoneBindCode('13800138000')).ok).toBe(true)
    expect(auth.updateUser).toHaveBeenCalledWith({ phone: '+8613800138000' })
    const verified = await verifyPhoneBindCode('13800138000', '654321')
    expect(verified.ok).toBe(true)
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '654321',
      type: 'phone_change',
    })
  })
})

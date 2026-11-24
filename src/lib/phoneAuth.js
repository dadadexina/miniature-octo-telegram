import { supabase } from './supabase'

export const PHONE_CODE_LENGTH = 6
export const PHONE_RESEND_SECONDS = 60

export function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '')
  if (!raw) return ''
  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '')
    return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : ''
  }
  const digits = raw.replace(/\D/g, '')
  if (/^1[3-9]\d{9}$/.test(digits)) return `+86${digits}`
  if (/^86[3-9]\d{9}$/.test(digits)) return `+${digits}`
  if (digits.length >= 6 && digits.length <= 15) return `+${digits}`
  return ''
}

export function profilePhoneOf(value) {
  const normalized = normalizePhone(value)
  if (!normalized) return ''
  const digits = normalized.slice(1)
  if (normalized.startsWith('+86') && /^1[3-9]\d{9}$/.test(digits.slice(2))) return digits.slice(2)
  return digits
}

export function maskPhoneNumber(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  if (digits.length <= 4) return digits ? '****' : ''
  if (digits.length === 11) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  return `${digits.slice(0, 2)}****${digits.slice(-3)}`
}

export function validPhoneCode(value) {
  return new RegExp(`^\\d{${PHONE_CODE_LENGTH}}$`).test(String(value || '').trim())
}

export function phoneAuthErrorText(error) {
  const raw = `${error?.message || ''}`.toLowerCase()
  if (raw.includes('phone provider') || raw.includes('unsupported phone provider')) return '短信通道尚未配置，请联系管理员'
  if (raw.includes('sms') && (raw.includes('disabled') || raw.includes('not enabled'))) return '手机号登录暂未开放'
  if (raw.includes('invalid') && raw.includes('phone')) return '手机号格式不正确'
  if (raw.includes('expired')) return '验证码已过期，请重新获取'
  if (raw.includes('invalid') && (raw.includes('token') || raw.includes('otp'))) return '验证码不正确'
  if (raw.includes('already registered') || raw.includes('already been registered')) return '该手机号已注册，请直接登录'
  if (raw.includes('rate limit') || raw.includes('too many')) return '请求太频繁，请稍后再试'
  if (raw.includes('sms') && raw.includes('send')) return '短信发送失败，请稍后再试'
  return error?.message || '手机号操作失败，请稍后再试'
}

export async function sendPhoneLoginCode(value) {
  const phone = normalizePhone(value)
  if (!phone) return { ok: false, error: '请输入正确的手机号', session: null }
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    })
    if (error) return { ok: false, error: phoneAuthErrorText(error), session: null }
    return { ok: true, error: '', session: data?.session || null }
  } catch {
    return { ok: false, error: '网络异常，验证码未发送', session: null }
  }
}

export async function verifyPhoneLoginCode(value, token) {
  const phone = normalizePhone(value)
  if (!phone) return { ok: false, error: '请输入正确的手机号', user: null }
  if (!validPhoneCode(token)) return { ok: false, error: `请输入 ${PHONE_CODE_LENGTH} 位验证码`, user: null }
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: String(token).trim(),
      type: 'sms',
    })
    if (error) return { ok: false, error: phoneAuthErrorText(error), user: null }
    if (!data?.user) return { ok: false, error: '验证失败，请重新获取验证码', user: null }
    return { ok: true, error: '', user: data.user }
  } catch {
    return { ok: false, error: '网络异常，验证码未验证', user: null }
  }
}

export async function sendPhoneBindCode(value) {
  const phone = normalizePhone(value)
  if (!phone) return { ok: false, error: '请输入正确的手机号' }
  try {
    const { error } = await supabase.auth.updateUser({ phone })
    if (error) return { ok: false, error: phoneAuthErrorText(error) }
    return { ok: true, error: '' }
  } catch {
    return { ok: false, error: '网络异常，验证码未发送' }
  }
}

export async function verifyPhoneBindCode(value, token) {
  const phone = normalizePhone(value)
  if (!phone) return { ok: false, error: '请输入正确的手机号', user: null }
  if (!validPhoneCode(token)) return { ok: false, error: `请输入 ${PHONE_CODE_LENGTH} 位验证码`, user: null }
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: String(token).trim(),
      type: 'phone_change',
    })
    if (error) return { ok: false, error: phoneAuthErrorText(error), user: null }
    if (!data?.user) return { ok: false, error: '绑定失败，请重新获取验证码', user: null }
    return { ok: true, error: '', user: data.user }
  } catch {
    return { ok: false, error: '网络异常，手机号未绑定', user: null }
  }
}

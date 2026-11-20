export function authErrorText(error) {
  const msg = error?.message || ''
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误'
  if (lower.includes('email not confirmed')) return '邮箱尚未验证。到 Supabase Authentication 关闭 Confirm email，或点邮件链接后再登录'
  if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录'
  if (lower.includes('password should be at least')) return '密码至少 6 位'
  if (lower.includes('unable to validate email')) return '邮箱格式不正确'
  if (lower.includes('rate limit')) return '尝试太频繁，请稍后再试'
  return msg || '登录失败'
}

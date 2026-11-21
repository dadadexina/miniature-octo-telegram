export const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'secret', label: '保密' },
]

export const GENDER_VALUES = GENDER_OPTIONS.map((item) => item.value)
export const DEFAULT_GENDER = 'secret'

export const ADD_SOURCE_LABELS = {
  id: '通过搜索 ID 添加',
  email: '通过邮箱搜索添加',
  phone: '通过手机号搜索添加',
  recommend: '通过推荐好友添加',
}

export function normalizeGender(value) {
  return GENDER_VALUES.includes(value) ? value : DEFAULT_GENDER
}

export function genderLabel(value) {
  return GENDER_OPTIONS.find((item) => item.value === normalizeGender(value))?.label || '保密'
}

export function addSourceLabel(source) {
  return ADD_SOURCE_LABELS[source] || '未知'
}

export function formatRegistrationDate(createdAt) {
  const date = new Date(createdAt)
  if (!createdAt || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function registrationDays(createdAt, now = Date.now()) {
  const created = new Date(createdAt)
  const current = new Date(now)
  if (!createdAt || Number.isNaN(created.getTime()) || Number.isNaN(current.getTime())) return null
  const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  const diff = dayNumber(current) - dayNumber(created)
  if (diff < 0) return 1
  return diff + 1
}

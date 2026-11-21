export const PUBLIC_ID_MIN = 8
export const PUBLIC_ID_MAX = 15
export const PUBLIC_ID_CHANGE_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000

const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALPHABET = LETTERS + DIGITS

export function isValidPublicId(value) {
  const id = String(value || '').trim()
  if (id.length < PUBLIC_ID_MIN || id.length > PUBLIC_ID_MAX) return false
  if (!/^[A-Za-z0-9]+$/.test(id)) return false
  return /[A-Za-z]/.test(id) && /[0-9]/.test(id)
}

export function publicIdError(value) {
  const id = String(value || '').trim()
  if (!id) return '请填写唯一 ID'
  if (id.length < PUBLIC_ID_MIN || id.length > PUBLIC_ID_MAX) {
    return `ID 需为 ${PUBLIC_ID_MIN}-${PUBLIC_ID_MAX} 位`
  }
  if (!/^[A-Za-z0-9]+$/.test(id)) return 'ID 只能包含字母和数字'
  if (!/[A-Za-z]/.test(id) || !/[0-9]/.test(id)) return 'ID 需同时包含字母和数字'
  return ''
}

function pickRandom(source, length) {
  const bytes = new Uint32Array(length)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 2 ** 32)
  }
  return Array.from(bytes, (value) => source[value % source.length]).join('')
}

export function randomPublicId(length = 10) {
  const size = Math.min(PUBLIC_ID_MAX, Math.max(PUBLIC_ID_MIN, Number(length) || 10))
  const head = pickRandom(LETTERS, 1) + pickRandom(DIGITS, 1)
  const rest = pickRandom(ALPHABET, size - 2)
  const merged = (head + rest).split('')
  for (let i = merged.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[merged[i], merged[j]] = [merged[j], merged[i]]
  }
  return merged.join('')
}

function toTime(value) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export function nextPublicIdChangeAt(profile, now = Date.now()) {
  const count = Number(profile?.idChangeCount || 0)
  if (count <= 0) return 0
  const base = Math.max(toTime(profile?.createdAt), toTime(profile?.idChangedAt))
  if (!base) return now
  return base + PUBLIC_ID_CHANGE_INTERVAL_MS
}

export function canChangePublicId(profile, now = Date.now()) {
  const count = Number(profile?.idChangeCount || 0)
  if (count <= 0) return true
  const next = nextPublicIdChangeAt(profile, now)
  return next <= now
}

export function formatChangeDate(time) {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

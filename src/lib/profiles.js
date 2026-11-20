import { supabase } from './supabase'

const USERNAME_KEYS = ['username', 'custom_id', 'public_id', 'user_id']
const NICKNAME_KEYS = ['nickname', 'display_name', 'name']

function pick(row, keys) {
  for (const key of keys) {
    if (row && row[key]) return row[key]
  }
  return ''
}

export function isMissingColumn(error, column) {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  const col = column.toLowerCase()
  return (
    msg.includes(`column "${col}"`) ||
    msg.includes(`'${col}' column`) ||
    msg.includes(`${col} does not exist`)
  )
}

export function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    nickname: pick(row, NICKNAME_KEYS),
    username: pick(row, USERNAME_KEYS),
    raw: row,
  }
}

export function isPermissionError(error) {
  const code = error?.code || ''
  const msg = `${error?.message || ''}`.toLowerCase()
  return code === '42501' || code === '401' || msg.includes('permission denied') || msg.includes('row-level security')
}

export async function fetchProfileById(userId) {
  try {
    const query = supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    const { data, error } = await Promise.race([
      query,
      new Promise((_, reject) => setTimeout(() => reject(new Error('读取资料超时')), 8000)),
    ])
    if (error) return { ok: false, error: error.message, code: error.code, profile: null }
    return { ok: true, profile: mapProfile(data) }
  } catch (err) {
    return { ok: false, error: err.message || '读取资料失败', profile: null }
  }
}

export async function usernameTaken(username, exceptId) {
  let query = supabase.from('profiles').select('id, username').eq('username', username)
  let { data, error } = await query.maybeSingle()
  if (error && isMissingColumn(error, 'username')) {
    const retry = await supabase.from('profiles').select('id').eq('custom_id', username).maybeSingle()
    data = retry.data
    error = retry.error
  }
  if (error) return { ok: false, error: error.message, taken: false, permission: isPermissionError(error) }
  return { ok: true, taken: Boolean(data && data.id !== exceptId) }
}

async function tryInsert(payload) {
  return supabase.from('profiles').insert(payload).select('*').single()
}

export async function insertProfile({ id, nickname, username }) {
  const attempts = [
    { id, nickname, username },
    { id, nickname, custom_id: username },
    { id, display_name: nickname, username },
    { id, name: nickname, username },
    { id, username },
  ]
  let lastError = null
  for (const payload of attempts) {
    const { data, error } = await tryInsert(payload)
    if (!error) return { ok: true, profile: mapProfile(data) }
    lastError = error
    const missing = USERNAME_KEYS.concat(NICKNAME_KEYS).some((col) => isMissingColumn(error, col))
    if (!missing) break
  }
  return {
    ok: false,
    error: lastError?.message || '保存失败',
    permission: isPermissionError(lastError),
  }
}

export async function updateProfileNickname(userId, nickname) {
  const attempts = [{ nickname }, { display_name: nickname }, { name: nickname }]
  let lastError = null
  for (const payload of attempts) {
    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('*')
      .maybeSingle()
    if (!error) return { ok: true, profile: mapProfile(data) }
    lastError = error
    const missing = NICKNAME_KEYS.some((col) => isMissingColumn(error, col))
    if (!missing) break
  }
  return {
    ok: false,
    error: lastError?.message || '保存失败',
    permission: isPermissionError(lastError),
  }
}

export async function fetchProfilesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return { ok: true, profiles: [] }
  const { data, error } = await supabase.from('profiles').select('*').in('id', unique)
  if (error) return { ok: false, error: error.message, profiles: [], permission: isPermissionError(error) }
  return { ok: true, profiles: (data || []).map(mapProfile) }
}

export async function searchProfileByUsername(username) {
  let { data, error } = await supabase.from('profiles').select('*').eq('username', username)
  if (error && isMissingColumn(error, 'username')) {
    const retry = await supabase.from('profiles').select('*').eq('custom_id', username)
    data = retry.data
    error = retry.error
  }
  if (error) return { ok: false, error: error.message, profiles: [], permission: isPermissionError(error) }
  return { ok: true, profiles: (data || []).map(mapProfile) }
}

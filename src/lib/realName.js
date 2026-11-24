import { supabase } from './supabase'

export const REAL_NAME_PHOTO_LIMIT = 5 * 1024 * 1024
export const REAL_NAME_STATUSES = ['unverified', 'pending', 'verified', 'rejected']

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CODES = '10X98765432'

const STATUS_TEXT = {
  unverified: '未实名',
  pending: '审核中',
  verified: '已实名',
  rejected: '审核未通过',
}

const ERROR_TEXT = {
  not_authenticated: '登录后才能提交实名信息',
  bad_real_name: '姓名需为 2-40 个字符',
  bad_id_number: '身份证号格式或校验位不正确',
  bad_photo: '证件照上传不完整，请重新上传',
  id_already_used: '该身份证号已被其他账号提交',
  already_verified: '当前账号已完成实名认证',
  not_admin: '没有实名审核权限',
  not_pending: '该申请已处理或不存在',
  permission: '暂无实名认证权限，请先执行云初始化 SQL',
}

export function realNameStatusText(status) {
  return STATUS_TEXT[normalizeRealNameStatus(status)] || STATUS_TEXT.unverified
}

export function normalizeRealNameStatus(status) {
  const value = String(status || '').trim()
  return REAL_NAME_STATUSES.includes(value) ? value : 'unverified'
}

export function normalizeRealNameRow(row) {
  const value = Array.isArray(row) ? row[0] : row
  if (!value || typeof value !== 'object') {
    return { status: 'unverified', realName: '', idNumberMasked: '', reviewNote: '', submittedAt: '', reviewedAt: '' }
  }
  return {
    status: normalizeRealNameStatus(value.status),
    realName: String(value.real_name || value.realName || ''),
    idNumberMasked: String(value.id_number_masked || value.idNumberMasked || ''),
    reviewNote: String(value.review_note || value.reviewNote || ''),
    submittedAt: value.submitted_at || value.submittedAt || '',
    reviewedAt: value.reviewed_at || value.reviewedAt || '',
  }
}

export function normalizeAdminRealNameRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    userId: String(row.user_id || row.userId || ''),
    realName: String(row.real_name || row.realName || ''),
    idNumber: String(row.id_number || row.idNumber || ''),
    frontPath: String(row.front_path || row.frontPath || ''),
    backPath: String(row.back_path || row.backPath || ''),
    status: normalizeRealNameStatus(row.status),
    reviewNote: String(row.review_note || row.reviewNote || ''),
    submittedAt: row.submitted_at || row.submittedAt || '',
    reviewedAt: row.reviewed_at || row.reviewedAt || '',
    email: String(row.email || ''),
    nickname: String(row.nickname || ''),
    username: String(row.username || ''),
  }
}

export function maskIdNumber(value) {
  const id = String(value || '').trim().toUpperCase()
  if (id.length !== 18) return id ? `${id.slice(0, 3)}***` : ''
  return `${id.slice(0, 6)}********${id.slice(-4)}`
}

export function normalizeIdNumber(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase()
}

export function validateChineseId(value) {
  const id = normalizeIdNumber(value)
  if (!/^[0-9]{17}[0-9X]$/.test(id)) {
    return { ok: false, id, error: ERROR_TEXT.bad_id_number }
  }
  if (id.slice(0, 6) === '000000') {
    return { ok: false, id, error: ERROR_TEXT.bad_id_number }
  }
  const birth = id.slice(6, 14)
  const year = Number(birth.slice(0, 4))
  const month = Number(birth.slice(4, 6))
  const day = Number(birth.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1900 ||
    year > new Date().getUTCFullYear() ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, id, error: ERROR_TEXT.bad_id_number }
  }
  let total = 0
  for (let i = 0; i < 17; i += 1) total += Number(id[i]) * ID_WEIGHTS[i]
  if (ID_CODES[total % 11] !== id[17]) {
    return { ok: false, id, error: ERROR_TEXT.bad_id_number }
  }
  return { ok: true, id, error: '' }
}

export function validateRealName(value) {
  const name = String(value || '').trim().normalize('NFC')
  if (!/^[\p{L}·.\-\s]{2,40}$/u.test(name)) {
    return { ok: false, name, error: ERROR_TEXT.bad_real_name }
  }
  return { ok: true, name, error: '' }
}

export function canSubmitRealName(status) {
  const value = normalizeRealNameStatus(status)
  return value === 'unverified' || value === 'rejected'
}

export function realNameErrorText(error) {
  const raw = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  const key = Object.keys(ERROR_TEXT).find((item) => raw.includes(item))
  if (key) return ERROR_TEXT[key]
  if (raw.includes('permission') || raw.includes('row-level security')) return ERROR_TEXT.permission
  return error?.message || '实名认证操作失败，请稍后再试'
}

export async function fetchMyRealName() {
  try {
    const { data, error } = await supabase.rpc('my_real_name')
    if (error) return { ok: false, error: realNameErrorText(error), status: null }
    return { ok: true, error: '', status: normalizeRealNameRow(data) }
  } catch {
    return { ok: false, error: '网络异常，无法读取实名状态', status: null }
  }
}

export async function submitRealName({ realName, idNumber, frontPath, backPath }) {
  const name = validateRealName(realName)
  if (!name.ok) return { ok: false, error: name.error, status: null }
  const id = validateChineseId(idNumber)
  if (!id.ok) return { ok: false, error: id.error, status: null }
  if (!frontPath || !backPath || frontPath === backPath) {
    return { ok: false, error: ERROR_TEXT.bad_photo, status: null }
  }
  try {
    const { data, error } = await supabase.rpc('submit_real_name', {
      p_real_name: name.name,
      p_id_number: id.id,
      p_front_path: frontPath,
      p_back_path: backPath,
    })
    if (error) return { ok: false, error: realNameErrorText(error), status: null }
    return { ok: true, error: '', status: normalizeRealNameRow(data) }
  } catch {
    return { ok: false, error: '网络异常，实名信息未提交', status: null }
  }
}

export async function isRealNameAdmin() {
  try {
    const { data, error } = await supabase.rpc('is_app_admin')
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

export async function fetchAdminRealNames() {
  try {
    const { data, error } = await supabase.rpc('admin_list_real_names')
    if (error) return { ok: false, error: realNameErrorText(error), rows: [] }
    const rows = (data || []).map(normalizeAdminRealNameRow).filter(Boolean)
    return { ok: true, error: '', rows }
  } catch {
    return { ok: false, error: '网络异常，无法读取实名申请', rows: [] }
  }
}

export async function reviewRealName(userId, approve, note = '') {
  if (!userId) return { ok: false, error: '缺少申请人' }
  try {
    const { data, error } = await supabase.rpc('admin_review_real_name', {
      p_user_id: userId,
      p_approve: Boolean(approve),
      p_note: String(note || '').trim().slice(0, 200),
    })
    if (error) return { ok: false, error: realNameErrorText(error) }
    return { ok: true, error: '', result: data }
  } catch {
    return { ok: false, error: '网络异常，审核未提交' }
  }
}

export function realNamePhotoError(file) {
  if (!file) return '请选择证件照'
  if (!String(file.type || '').startsWith('image/')) return '证件照必须是图片'
  if (Number(file.size || 0) > REAL_NAME_PHOTO_LIMIT) return '单张证件照不能超过 5MB'
  return ''
}

export async function uploadRealNamePhoto(userId, side, file) {
  if (!userId) return { ok: false, error: '登录后才能上传证件照', path: '' }
  const invalid = realNamePhotoError(file)
  if (invalid) return { ok: false, error: invalid, path: '' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  try {
    const { error } = await supabase.storage.from('realname').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) return { ok: false, error: error.message || '证件照上传失败', path: '' }
    return { ok: true, error: '', path }
  } catch {
    return { ok: false, error: '网络异常，证件照上传失败', path: '' }
  }
}

export async function removeRealNamePhoto(path) {
  if (!path) return { ok: true }
  try {
    const { error } = await supabase.storage.from('realname').remove([path])
    return { ok: !error, error: error?.message || '' }
  } catch {
    return { ok: false, error: '删除证件照失败' }
  }
}

export async function signedRealNameUrl(path, expires = 600) {
  if (!path) return ''
  try {
    const { data, error } = await supabase.storage.from('realname').createSignedUrl(path, expires)
    if (error) return ''
    return data?.signedUrl || ''
  } catch {
    return ''
  }
}

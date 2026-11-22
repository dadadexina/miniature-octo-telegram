import { PLACES } from './places'
import { supabase } from './supabase'

export const LOCATION_PRECISION = 2
export const LOCATION_COLUMNS = 'user_id, lat, lng, label, precision, visible, updated_at'

function isMissingTable(error) {
  const code = error?.code || ''
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('profile_locations') && (msg.includes('does not exist') || msg.includes('schema cache')))
  )
}

function finiteInRange(value, min, max) {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function normalizeLocationRow(row) {
  if (!row || !row.user_id) return null
  const lat = finiteInRange(row.lat, -90, 90)
  const lng = finiteInRange(row.lng, -180, 180)
  if (lat === null || lng === null) return null
  return {
    userId: row.user_id,
    lat,
    lng,
    label: String(row.label || '').trim().slice(0, 40),
    precision: LOCATION_PRECISION,
    visible: row.visible === true,
    updatedAt: row.updated_at || '',
  }
}

export function cityLocation(cityId) {
  const place = PLACES.find((item) => item.id === cityId || item.name === cityId)
  if (!place) return null
  return {
    lat: place.lat,
    lng: place.lng,
    label: place.name,
    precision: LOCATION_PRECISION,
  }
}

function withTimeout(query, ms = 8000) {
  return Promise.race([
    query,
    new Promise((_, reject) => setTimeout(() => reject(new Error('读取位置超时')), ms)),
  ])
}

export async function fetchLocations(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return { ok: true, locations: [] }
  try {
    const { data, error } = await withTimeout(
      supabase.from('profile_locations').select(LOCATION_COLUMNS).in('user_id', ids)
    )
    if (error) {
      return {
        ok: false,
        missing: isMissingTable(error),
        error: isMissingTable(error) ? '云端未升级位置表，位置共享暂不可用' : error.message || '读取位置失败',
        locations: [],
      }
    }
    return { ok: true, locations: (data || []).map(normalizeLocationRow).filter(Boolean) }
  } catch (err) {
    return { ok: false, error: err?.message || '读取位置失败', locations: [] }
  }
}

export async function saveMyLocation(userId, { lat, lng, label, visible }) {
  if (!userId) return { ok: false, error: '请先登录后再设置位置' }
  const safeLat = finiteInRange(lat, -90, 90)
  const safeLng = finiteInRange(lng, -180, 180)
  if (safeLat === null || safeLng === null) return { ok: false, error: '位置坐标无效' }
  try {
    const { data, error } = await supabase
      .from('profile_locations')
      .upsert(
        {
          user_id: userId,
          lat: safeLat,
          lng: safeLng,
          label: String(label || '').trim().slice(0, 40),
          precision: LOCATION_PRECISION,
          visible: visible === true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select(LOCATION_COLUMNS)
      .maybeSingle()
    if (error) {
      return {
        ok: false,
        missing: isMissingTable(error),
        error: isMissingTable(error) ? '云端未升级位置表，请先执行云初始化 SQL' : error.message || '保存位置失败',
      }
    }
    return { ok: true, location: normalizeLocationRow(data) }
  } catch (err) {
    return { ok: false, error: err?.message || '保存位置失败' }
  }
}

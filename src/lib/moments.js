import { isPermissionError } from './profiles'
import { supabase } from './supabase'

export const MOMENT_PAGE_SIZE = 20

export function mapMoment(row) {
  if (!row) return null
  return {
    id: row.id,
    authorId: row.author_id || '',
    content: row.content || '',
    imageUrl: row.image_url || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    raw: row,
  }
}

export function mapLike(row) {
  if (!row) return null
  return { momentId: row.moment_id || '', userId: row.user_id || '' }
}

export function mapComment(row) {
  if (!row) return null
  return {
    id: row.id,
    momentId: row.moment_id || '',
    userId: row.user_id || '',
    content: row.content || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

export async function fetchMoments({ before, limit = MOMENT_PAGE_SIZE, authorId = '' } = {}) {
  try {
    let query = supabase
      .from('moments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (authorId) query = query.eq('author_id', authorId)
    if (before) query = query.lt('created_at', before)
    const { data, error } = await query
    if (error) {
      return { ok: false, error: error.message, moments: [], hasMore: false, oldest: null, permission: isPermissionError(error) }
    }
    const rows = data || []
    return {
      ok: true,
      moments: rows.map(mapMoment),
      hasMore: rows.length === limit,
      oldest: rows.length ? rows[rows.length - 1].created_at : null,
    }
  } catch {
    return { ok: false, error: '网络异常', moments: [], hasMore: false, oldest: null }
  }
}

export async function fetchMomentInteractions(momentIds) {
  const ids = [...new Set((momentIds || []).filter(Boolean))]
  if (!ids.length) return { ok: true, likes: [], comments: [] }
  try {
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from('moment_likes').select('*').in('moment_id', ids),
      supabase.from('moment_comments').select('*').in('moment_id', ids).order('created_at', { ascending: true }),
    ])
    if (likesRes.error) return { ok: false, error: likesRes.error.message, likes: [], comments: [] }
    if (commentsRes.error) return { ok: false, error: commentsRes.error.message, likes: [], comments: [] }
    return {
      ok: true,
      likes: (likesRes.data || []).map(mapLike),
      comments: (commentsRes.data || []).map(mapComment),
    }
  } catch {
    return { ok: false, error: '网络异常', likes: [], comments: [] }
  }
}

export async function createMoment({ authorId, content, imageUrl = '' }) {
  const text = String(content || '').trim()
  if (!text && !imageUrl) return { ok: false, error: '请输入内容' }
  try {
    const { data, error } = await supabase
      .from('moments')
      .insert({ author_id: authorId, content: text.slice(0, 2000), image_url: imageUrl || null })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true, moment: mapMoment(data) }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function deleteMoment(momentId) {
  try {
    const { error } = await supabase.from('moments').delete().eq('id', momentId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function likeMoment(momentId, userId) {
  try {
    const { error } = await supabase
      .from('moment_likes')
      .upsert({ moment_id: momentId, user_id: userId }, { ignoreDuplicates: true, onConflict: 'moment_id,user_id' })
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function unlikeMoment(momentId, userId) {
  try {
    const { error } = await supabase.from('moment_likes').delete().eq('moment_id', momentId).eq('user_id', userId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function addMomentComment({ momentId, userId, content }) {
  const text = String(content || '').trim().slice(0, 500)
  if (!text) return { ok: false, error: '评论不能为空' }
  try {
    const { data, error } = await supabase
      .from('moment_comments')
      .insert({ moment_id: momentId, user_id: userId, content: text })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true, comment: mapComment(data) }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export async function deleteMomentComment(commentId) {
  try {
    const { error } = await supabase.from('moment_comments').delete().eq('id', commentId)
    if (error) return { ok: false, error: error.message, permission: isPermissionError(error) }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络异常' }
  }
}

export function momentStoragePath(publicUrl) {
  const marker = '/object/public/moments/'
  const idx = String(publicUrl || '').indexOf(marker)
  if (idx < 0) return null
  return decodeURIComponent(String(publicUrl).slice(idx + marker.length)) || null
}

export async function uploadMomentImage(userId, blob, contentType = 'image/jpeg') {
  const path = `${userId}/m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  try {
    const { error } = await supabase.storage.from('moments').upload(path, blob, { contentType })
    if (error) return { ok: false, error: error.message, path: null, url: '' }
    const { data } = supabase.storage.from('moments').getPublicUrl(path)
    return { ok: true, path, url: data?.publicUrl || '' }
  } catch (err) {
    return { ok: false, error: err?.message || '上传图片失败', path: null, url: '' }
  }
}

export async function removeMomentImage(path) {
  if (!path) return { ok: false }
  try {
    await supabase.storage.from('moments').remove([path])
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

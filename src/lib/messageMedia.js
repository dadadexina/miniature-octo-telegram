import { readImageFile } from './imagePipeline'
import { supabase } from './supabase'

export const MESSAGE_MEDIA_BUCKET = 'message_media'

export const MESSAGE_MEDIA_LIMITS = {
  maxSourceBytes: 25 * 1024 * 1024,
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
}

export function pairFolder(a, b) {
  return [String(a || ''), String(b || '')].sort().join('__')
}

export function extensionForMime(type) {
  const value = String(type || '').split(';')[0].trim().toLowerCase()
  return MIME_EXT[value] || 'jpg'
}

export function buildMediaPath(folder, nowMs, rand, ext = 'jpg') {
  const suffix = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  return `${folder}/${nowMs}-${rand}.${suffix}`
}

export function makeMediaRand() {
  return Math.random().toString(36).slice(2, 8)
}

export async function uploadMessageBlob({ blob, width = 0, height = 0, meId, peerId, contentType }) {
  if (!blob) return { ok: false, error: '缺少媒体数据' }
  const type = contentType || blob.type || 'image/jpeg'
  const path = buildMediaPath(pairFolder(meId, peerId), Date.now(), makeMediaRand(), extensionForMime(type))
  try {
    const { error } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(path, blob, { contentType: type })
    if (error) return { ok: false, error: error.message }
  } catch (err) {
    return { ok: false, error: err?.message || '上传失败' }
  }
  return { ok: true, path, width, height, contentType: type }
}

// 发送原图:readImageFile 只读取尺寸,blob 保持原始字节,不做任何压缩。
export async function uploadMessageImage({ file, meId, peerId }) {
  const prepared = await readImageFile(file, MESSAGE_MEDIA_LIMITS)
  if (!prepared.ok) return { ok: false, error: prepared.error }
  return uploadMessageBlob({
    blob: prepared.blob,
    width: prepared.width,
    height: prepared.height,
    meId,
    peerId,
    contentType: prepared.contentType,
  })
}

export async function signedMediaUrl(path, expiresIn = 900) {
  if (!path) return { ok: false, error: '缺少媒体路径' }
  try {
    const { data, error } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .createSignedUrl(path, expiresIn)
    if (error || !data?.signedUrl) return { ok: false, error: error?.message || '获取签名链接失败' }
    return { ok: true, url: data.signedUrl }
  } catch (err) {
    return { ok: false, error: err?.message || '获取签名链接失败' }
  }
}

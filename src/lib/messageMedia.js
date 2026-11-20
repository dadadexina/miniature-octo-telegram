import { downscaleImageFile } from './imagePipeline'
import { supabase } from './supabase'

export const MESSAGE_MEDIA_BUCKET = 'message_media'

export const MESSAGE_MEDIA_LIMITS = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSide: 1280,
  jpegQuality: 0.78,
}

export function pairFolder(a, b) {
  return [String(a || ''), String(b || '')].sort().join('__')
}

export function buildMediaPath(folder, nowMs, rand) {
  return `${folder}/${nowMs}-${rand}.jpg`
}

export function makeMediaRand() {
  return Math.random().toString(36).slice(2, 8)
}

export async function uploadMessageBlob({ blob, width = 0, height = 0, meId, peerId }) {
  if (!blob) return { ok: false, error: '缺少图片数据' }
  const path = buildMediaPath(pairFolder(meId, peerId), Date.now(), makeMediaRand())
  try {
    const { error } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg' })
    if (error) return { ok: false, error: error.message }
  } catch (err) {
    return { ok: false, error: err?.message || '上传失败' }
  }
  return { ok: true, path, width, height }
}

export async function uploadMessageImage({ file, meId, peerId }) {
  const scaled = await downscaleImageFile(file, MESSAGE_MEDIA_LIMITS)
  if (!scaled.ok) return { ok: false, error: scaled.error }
  return uploadMessageBlob({
    blob: scaled.blob,
    width: scaled.width,
    height: scaled.height,
    meId,
    peerId,
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

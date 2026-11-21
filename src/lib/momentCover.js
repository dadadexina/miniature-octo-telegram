import { downscaleImageFile } from './imagePipeline'

export const MOMENT_COVER_LIMITS = {
  maxSourceBytes: 12 * 1024 * 1024,
  maxSide: 1600,
  jpegQuality: 0.82,
}

const KEY_PREFIX = 'momentCover:'

export function coverStorageKey(userId) {
  return `${KEY_PREFIX}${userId || 'guest'}`
}

export function loadMomentCover(userId) {
  try {
    const raw = globalThis.localStorage?.getItem(coverStorageKey(userId))
    return typeof raw === 'string' && raw.startsWith('data:image/') ? raw : ''
  } catch {
    return ''
  }
}

export function clearMomentCover(userId) {
  try {
    globalThis.localStorage?.removeItem(coverStorageKey(userId))
  } catch {
    // 存储不可用时忽略
  }
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'function') {
      reject(new Error('当前环境不支持读取本地图片'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export async function saveMomentCover(userId, file) {
  const scaled = await downscaleImageFile(file, MOMENT_COVER_LIMITS)
  if (!scaled.ok) return { ok: false, error: scaled.error || '处理图片失败' }
  try {
    const dataUrl = await toDataUrl(scaled.blob)
    if (!dataUrl) return { ok: false, error: '读取图片失败' }
    globalThis.localStorage?.setItem(coverStorageKey(userId), dataUrl)
    try {
      if (typeof CustomEvent === 'function') {
        globalThis.dispatchEvent?.(new CustomEvent('moment-cover-updated', { detail: { userId } }))
      }
    } catch {
      // 事件通知失败不影响已保存的背景
    }
    return { ok: true, url: dataUrl }
  } catch (err) {
    const quota = err?.name === 'QuotaExceededError' || /quota/i.test(err?.message || '')
    return {
      ok: false,
      error: quota ? '本地存储空间不足，请换一张更小的图片' : err?.message || '保存背景失败',
    }
  }
}

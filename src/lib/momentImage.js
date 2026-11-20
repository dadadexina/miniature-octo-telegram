export const MOMENT_IMAGE_LIMITS = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSide: 1280,
  jpegQuality: 0.8,
}

export function validateMomentFile(file) {
  if (!file || typeof file !== 'object') return { ok: false, error: '请选择图片文件' }
  if (file.type && !file.type.startsWith('image/')) return { ok: false, error: '仅支持图片文件' }
  if (typeof file.size === 'number' && file.size > MOMENT_IMAGE_LIMITS.maxSourceBytes) {
    return { ok: false, error: '图片过大，请选择 10MB 以内的文件' }
  }
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, error: '文件为空' }
  return { ok: true }
}

async function canvasToBlob(canvas) {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', MOMENT_IMAGE_LIMITS.jpegQuality)
    })
  }
  return null
}

export async function downscaleMomentImage(file) {
  const validation = validateMomentFile(file)
  if (!validation.ok) return { ok: false, error: validation.error }

  try {
    const canvas =
      typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
    if (!ctx) return { ok: true, blob: file, contentType: file.type || 'image/jpeg', fallback: true }

    let source =
      typeof createImageBitmap === 'function' ? await createImageBitmap(file).catch(() => null) : null
    let revokeUrl = null
    if (!source && typeof Image === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      source = await new Promise((resolve) => {
        const img = new Image()
        revokeUrl = URL.createObjectURL(file)
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = revokeUrl
      })
    }
    if (!source) {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
      return { ok: true, blob: file, contentType: file.type || 'image/jpeg', fallback: true }
    }

    const width = source.width || MOMENT_IMAGE_LIMITS.maxSide
    const height = source.height || MOMENT_IMAGE_LIMITS.maxSide
    const scale = Math.min(1, MOMENT_IMAGE_LIMITS.maxSide / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    if (revokeUrl) URL.revokeObjectURL(revokeUrl)

    const blob = await canvasToBlob(canvas)
    if (blob) return { ok: true, blob, contentType: 'image/jpeg' }
    return { ok: true, blob: file, contentType: file.type || 'image/jpeg', fallback: true }
  } catch (err) {
    return { ok: false, error: err?.message || '处理图片失败' }
  }
}

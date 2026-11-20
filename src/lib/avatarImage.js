export const AVATAR_LIMITS = {
  maxSourceBytes: 8 * 1024 * 1024,
  targetSize: 256,
  jpegQuality: 0.82,
}

export function validateAvatarFile(file) {
  if (!file || typeof file !== 'object') return { ok: false, error: '请选择图片文件' }
  if (file.type && !file.type.startsWith('image/')) return { ok: false, error: '仅支持图片文件' }
  if (typeof file.size === 'number' && file.size > AVATAR_LIMITS.maxSourceBytes) {
    return { ok: false, error: '图片过大，请选择 8MB 以内的文件' }
  }
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, error: '文件为空' }
  return { ok: true }
}

function drawCover(ctx, source, size) {
  const width = source.width || source.naturalWidth || size
  const height = source.height || source.naturalHeight || size
  const scale = Math.max(size / width, size / height)
  const w = width * scale
  const h = height * scale
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h)
}

async function canvasToBlob(canvas) {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', AVATAR_LIMITS.jpegQuality)
    })
  }
  return null
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export async function downscaleAvatar(file) {
  const validation = validateAvatarFile(file)
  if (!validation.ok) return { ok: false, error: validation.error }

  try {
    const canvas =
      typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null

    // 无 canvas 能力（如 jsdom / 老环境）：直接降级为原始 dataURL，避免无谓解码
    if (!ctx) {
      const dataUrl = await fileToDataUrl(file)
      return { ok: true, blob: file, dataUrl, contentType: file.type || 'image/jpeg', fallback: true }
    }

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

    const size = AVATAR_LIMITS.targetSize
    if (!source) {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
      const dataUrl = await fileToDataUrl(file)
      return { ok: true, blob: file, dataUrl, contentType: file.type || 'image/jpeg', fallback: true }
    }

    canvas.width = size
    canvas.height = size
    drawCover(ctx, source, size)
    if (revokeUrl) URL.revokeObjectURL(revokeUrl)

    const blob = await canvasToBlob(canvas)
    const dataUrl =
      typeof canvas.toDataURL === 'function'
        ? canvas.toDataURL('image/jpeg', AVATAR_LIMITS.jpegQuality)
        : ''
    if (blob || dataUrl) {
      return { ok: true, blob: blob || null, dataUrl, contentType: 'image/jpeg' }
    }
    return { ok: false, error: '处理图片失败' }
  } catch (err) {
    return { ok: false, error: err?.message || '处理图片失败' }
  }
}

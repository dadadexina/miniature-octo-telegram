const MAX_DIMENSION_PROBE_BYTES = 15 * 1024 * 1024

export const IMAGE_PIPELINE_DEFAULTS = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSide: 1280,
  jpegQuality: 0.8,
}

export function validateImageFile(file, limits = IMAGE_PIPELINE_DEFAULTS) {
  if (!file || typeof file !== 'object') return { ok: false, error: '请选择图片文件' }
  if (file.type && !file.type.startsWith('image/')) return { ok: false, error: '仅支持图片文件' }
  if (typeof file.size === 'number' && file.size > limits.maxSourceBytes) {
    return { ok: false, error: `图片过大，请选择 ${Math.round(limits.maxSourceBytes / 1024 / 1024)}MB 以内的文件` }
  }
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, error: '文件为空' }
  return { ok: true }
}

async function canvasToBlob(canvas, quality) {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', quality)
    })
  }
  return null
}

async function readImageDimensions(file) {
  if (typeof file?.size === 'number' && file.size > MAX_DIMENSION_PROBE_BYTES) {
    return { width: 0, height: 0 }
  }
  let revokeUrl = null
  try {
    if (typeof createImageBitmap === 'function') {
      const source = await createImageBitmap(file).catch(() => null)
      if (source) {
        const info = { width: source.width || 0, height: source.height || 0 }
        source.close?.()
        return info
      }
    }
    if (typeof Image === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const img = await new Promise((resolve) => {
        const el = new Image()
        revokeUrl = URL.createObjectURL(file)
        el.onload = () => resolve(el)
        el.onerror = () => resolve(null)
        el.src = revokeUrl
      })
      if (img) return { width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 }
    }
  } catch {
    // 尺寸读取失败时返回 0,展示端按自然比例渲染
  } finally {
    if (revokeUrl) URL.revokeObjectURL(revokeUrl)
  }
  return { width: 0, height: 0 }
}

// 原图上传:只校验与读取尺寸,不对图片做任何重编码或压缩。
export async function readImageFile(file, limits = IMAGE_PIPELINE_DEFAULTS) {
  const validation = validateImageFile(file, limits)
  if (!validation.ok) return { ok: false, error: validation.error }
  const { width, height } = await readImageDimensions(file)
  return {
    ok: true,
    blob: file,
    contentType: file.type || 'application/octet-stream',
    width,
    height,
    fallback: true,
  }
}

export async function downscaleImageFile(file, limits = IMAGE_PIPELINE_DEFAULTS) {
  const validation = validateImageFile(file, limits)
  if (!validation.ok) return { ok: false, error: validation.error }

  try {
    const canvas =
      typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
    if (!ctx) {
      return {
        ok: true,
        blob: file,
        contentType: file.type || 'image/jpeg',
        width: 0,
        height: 0,
        fallback: true,
      }
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
    if (!source) {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
      return {
        ok: true,
        blob: file,
        contentType: file.type || 'image/jpeg',
        width: 0,
        height: 0,
        fallback: true,
      }
    }

    const width = source.width || limits.maxSide
    const height = source.height || limits.maxSide
    const scale = Math.min(1, limits.maxSide / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    if (revokeUrl) URL.revokeObjectURL(revokeUrl)

    const blob = await canvasToBlob(canvas, limits.jpegQuality)
    if (blob) return { ok: true, blob, contentType: 'image/jpeg', width: canvas.width, height: canvas.height }
    return {
      ok: true,
      blob: file,
      contentType: file.type || 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
      fallback: true,
    }
  } catch (err) {
    return { ok: false, error: err?.message || '处理图片失败' }
  }
}

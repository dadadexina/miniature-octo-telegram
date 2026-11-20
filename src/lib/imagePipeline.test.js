import { describe, expect, it } from 'vitest'

import { IMAGE_PIPELINE_DEFAULTS, validateImageFile } from './imagePipeline'

describe('validateImageFile', () => {
  it('拒绝空值与非对象', () => {
    expect(validateImageFile(null).ok).toBe(false)
    expect(validateImageFile('str').ok).toBe(false)
  })

  it('拒绝非图片类型', () => {
    const res = validateImageFile({ type: 'text/plain', size: 100 })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('仅支持图片文件')
  })

  it('拒绝超过大小限制的文件', () => {
    const res = validateImageFile(
      { type: 'image/png', size: IMAGE_PIPELINE_DEFAULTS.maxSourceBytes + 1 }
    )
    expect(res.ok).toBe(false)
  })

  it('拒绝空文件', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 }).ok).toBe(false)
  })

  it('接受合法图片并支持自定义限额', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 }).ok).toBe(true)
    const strict = validateImageFile({ type: 'image/jpeg', size: 1024 }, { maxSourceBytes: 512, maxSide: 10, jpegQuality: 0.5 })
    expect(strict.ok).toBe(false)
  })
})

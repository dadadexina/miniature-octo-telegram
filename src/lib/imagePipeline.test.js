import { describe, expect, it } from 'vitest'

import { IMAGE_PIPELINE_DEFAULTS, readImageFile, validateImageFile } from './imagePipeline'

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

describe('readImageFile 原图读取', () => {
  it('返回原始 blob,不做重编码', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', { type: 'image/png' })
    const res = await readImageFile(file, { maxSourceBytes: 1024 })
    expect(res.ok).toBe(true)
    expect(res.blob).toBe(file)
    expect(res.contentType).toBe('image/png')
    expect(res.blob.size).toBe(4)
  })

  it('超过上限时拒绝', async () => {
    const file = new File([new Uint8Array(2048)], 'big.png', { type: 'image/png' })
    const res = await readImageFile(file, { maxSourceBytes: 1024 })
    expect(res.ok).toBe(false)
  })

  it('非图片类型时拒绝', async () => {
    const file = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })
    const res = await readImageFile(file, { maxSourceBytes: 1024 })
    expect(res.ok).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { IMAGE_PIPELINE_DEFAULTS, isHeicFile, readImageFile, validateImageFile } from './imagePipeline'

const heic2anyMock = vi.hoisted(() =>
  vi.fn(async () => new Blob([new Uint8Array([9])], { type: 'image/jpeg' }))
)
vi.mock('heic2any', () => ({ default: heic2anyMock }))

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

describe('isHeicFile', () => {
  it('按 MIME 识别 HEIC/HEIF', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'a.bin' })).toBe(true)
    expect(isHeicFile({ type: 'image/heif', name: 'a.bin' })).toBe(true)
    expect(isHeicFile({ type: 'image/heic-sequence', name: 'a.bin' })).toBe(true)
  })

  it('MIME 缺失时按扩展名识别', () => {
    expect(isHeicFile({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(isHeicFile({ type: '', name: 'photo.heif' })).toBe(true)
    expect(isHeicFile({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false)
    expect(isHeicFile(null)).toBe(false)
  })
})

describe('HEIC 转换', () => {
  it('上传前把 HEIC 转为 JPEG', async () => {
    heic2anyMock.mockClear()
    const file = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: 'image/heic' })
    const res = await readImageFile(file, { maxSourceBytes: 1024 })
    expect(res.ok).toBe(true)
    expect(res.contentType).toBe('image/jpeg')
    expect(res.blob.type).toBe('image/jpeg')
    expect(heic2anyMock).toHaveBeenCalledTimes(1)
  })

  it('转换失败时返回友好错误', async () => {
    heic2anyMock.mockRejectedValueOnce(new Error('decode failed'))
    const file = new File([new Uint8Array([1])], 'IMG_0002.HEIC', { type: 'image/heic' })
    const res = await readImageFile(file, { maxSourceBytes: 1024 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('HEIC')
  })
})

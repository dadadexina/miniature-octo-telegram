// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { AVATAR_LIMITS, downscaleAvatar, validateAvatarFile } from './avatarImage'

function makeFile({ type = 'image/png', size = 1024, name = 'a.png' } = {}) {
  const file = new File([new Uint8Array(Math.min(size, 64))], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('validateAvatarFile', () => {
  it('接受正常图片', () => {
    expect(validateAvatarFile(makeFile()).ok).toBe(true)
  })

  it('拒绝非图片类型', () => {
    const res = validateAvatarFile(makeFile({ type: 'application/pdf', name: 'a.pdf' }))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('仅支持图片')
  })

  it('拒绝超过 8MB', () => {
    const res = validateAvatarFile(makeFile({ size: AVATAR_LIMITS.maxSourceBytes + 1 }))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('8MB')
  })

  it('拒绝空文件与非对象', () => {
    expect(validateAvatarFile(makeFile({ size: 0 })).ok).toBe(false)
    expect(validateAvatarFile(null).ok).toBe(false)
  })
})

describe('downscaleAvatar', () => {
  it('校验失败直接返回错误', async () => {
    const res = await downscaleAvatar(makeFile({ type: 'text/plain' }))
    expect(res.ok).toBe(false)
  })

  it('jsdom 无 canvas 时降级为原始 dataURL', async () => {
    const res = await downscaleAvatar(makeFile())
    expect(res.ok).toBe(true)
    expect(res.fallback).toBe(true)
    expect(res.blob).toBeTruthy()
    expect(res.dataUrl.startsWith('data:')).toBe(true)
  })
})

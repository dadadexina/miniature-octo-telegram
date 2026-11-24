import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { MESSAGE_MEDIA_BUCKET, buildMediaPath, extensionForMime, pairFolder } = await import('./messageMedia')

describe('pairFolder', () => {
  it('与顺序无关且用 __ 连接', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    expect(pairFolder(a, b)).toBe(pairFolder(b, a))
    expect(pairFolder(a, b)).toBe(`${a}__${b}`)
  })

  it('缺参时降级为空串参与排序', () => {
    expect(pairFolder('x', '')).toBe('__x')
    expect(pairFolder(undefined, 'y')).toBe('__y')
  })
})

describe('buildMediaPath', () => {
  it('路径为「配对目录/时间戳-随机数.jpg」', () => {
    const p = buildMediaPath('a__b', 1700000000000, 'r4nd0m')
    expect(p).toBe('a__b/1700000000000-r4nd0m.jpg')
    expect(p.startsWith('a__b/')).toBe(true)
  })

  it('桶名固定为 message_media', () => {
    expect(MESSAGE_MEDIA_BUCKET).toBe('message_media')
  })

  it('按原图 MIME 生成扩展名', () => {
    expect(buildMediaPath('a__b', 1, 'r', extensionForMime('image/png'))).toBe('a__b/1-r.png')
    expect(buildMediaPath('a__b', 1, 'r', extensionForMime('image/jpeg'))).toBe('a__b/1-r.jpg')
    expect(extensionForMime('image/webp; charset=binary')).toBe('webp')
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForMime('audio/mp4')).toBe('m4a')
    expect(extensionForMime('audio/ogg; codecs=opus')).toBe('ogg')
    expect(extensionForMime('application/octet-stream')).toBe('jpg')
    expect(extensionForMime('')).toBe('jpg')
    expect(buildMediaPath('a__b', 1, 'r', '../x')).toBe('a__b/1-r.x')
  })
})

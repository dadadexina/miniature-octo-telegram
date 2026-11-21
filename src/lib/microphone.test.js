import { describe, expect, it, vi } from 'vitest'

import { MIC_ERROR_TEXT, micPermissionState, requestMicStream } from './microphone'

function fakeWin({ state = 'prompt', getUserMedia, hasApi = true } = {}) {
  return {
    navigator: {
      permissions: hasApi
        ? {
            query: async () => ({ state }),
          }
        : undefined,
      mediaDevices: getUserMedia ? { getUserMedia } : {},
    },
  }
}

const fakeStream = () => ({ getTracks: () => [], getAudioTracks: () => [] })

describe('micPermissionState', () => {
  it('读取浏览器授权状态', async () => {
    expect(await micPermissionState(fakeWin({ state: 'granted' }))).toBe('granted')
    expect(await micPermissionState(fakeWin({ state: 'denied' }))).toBe('denied')
  })

  it('不支持权限查询时返回 unknown', async () => {
    expect(await micPermissionState(fakeWin({ hasApi: false }))).toBe('unknown')
    expect(await micPermissionState(null)).toBe('unknown')
  })
})

describe('requestMicStream', () => {
  it('已拒绝时直接报错,不再触发系统询问', async () => {
    const getUserMedia = vi.fn()
    await expect(requestMicStream(fakeWin({ state: 'denied', getUserMedia }))).rejects.toMatchObject({
      code: 'denied',
      message: MIC_ERROR_TEXT.denied,
    })
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('首次询问(状态 prompt)只调用一次 getUserMedia', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    const stream = await requestMicStream(fakeWin({ state: 'prompt', getUserMedia }))
    expect(stream).toBeTruthy()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('已授权时直接取流,不会弹窗', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    await requestMicStream(fakeWin({ state: 'granted', getUserMedia }))
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('把浏览器错误映射为可读原因', async () => {
    const notAllowed = vi.fn(async () => {
      const err = new Error('denied')
      err.name = 'NotAllowedError'
      throw err
    })
    await expect(requestMicStream(fakeWin({ state: 'prompt', getUserMedia: notAllowed }))).rejects.toMatchObject({
      code: 'denied',
    })

    const notFound = vi.fn(async () => {
      const err = new Error('no device')
      err.name = 'NotFoundError'
      throw err
    })
    await expect(requestMicStream(fakeWin({ state: 'prompt', getUserMedia: notFound }))).rejects.toMatchObject({
      code: 'unavailable',
    })

    const notReadable = vi.fn(async () => {
      const err = new Error('busy')
      err.name = 'NotReadableError'
      throw err
    })
    await expect(requestMicStream(fakeWin({ state: 'prompt', getUserMedia: notReadable }))).rejects.toMatchObject({
      code: 'busy',
    })
  })

  it('没有 getUserMedia 时提示非安全连接', async () => {
    await expect(requestMicStream(fakeWin({ hasApi: false }))).rejects.toMatchObject({ code: 'insecure' })
  })
})

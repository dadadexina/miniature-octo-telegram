// @vitest-environment jsdom
import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useVoiceRecorder, {
  blobToDataUrl,
  canRecordVoice,
  formatRecordingTime,
  pickVoiceMimeType,
  voiceDurationSeconds,
} from './useVoiceRecorder'

describe('语音录制工具', () => {
  it('按浏览器支持选择录音格式', () => {
    const Recorder = { isTypeSupported: (type) => type === 'audio/mp4' }
    expect(pickVoiceMimeType(Recorder)).toBe('audio/mp4')
    expect(pickVoiceMimeType({ isTypeSupported: () => false })).toBe('')
    expect(pickVoiceMimeType(null)).toBe('')
  })

  it('录音时长格式化为分秒并至少记 1 秒', () => {
    expect(formatRecordingTime(0)).toBe('00:00')
    expect(formatRecordingTime(65000)).toBe('01:05')
    expect(voiceDurationSeconds(1200)).toBe(1)
    expect(voiceDurationSeconds(2400)).toBe(2)
  })

  it('检测录音能力需要 MediaRecorder 与麦克风接口', () => {
    const win = { MediaRecorder: function Recorder() {}, navigator: { mediaDevices: { getUserMedia: () => {} } } }
    expect(canRecordVoice(win)).toBe(true)
    expect(canRecordVoice({ navigator: win.navigator })).toBe(false)
    expect(canRecordVoice({ MediaRecorder: win.MediaRecorder, navigator: {} })).toBe(false)
  })

  it('把录音 Blob 转成可本地播放的 data URL', async () => {
    const blob = new Blob(['voice'], { type: 'audio/webm' })
    const url = await blobToDataUrl(blob)
    expect(url.startsWith('data:audio/webm;base64,')).toBe(true)
    expect(await blobToDataUrl(null)).toBe('')
  })
})

describe('useVoiceRecorder 录音流程', () => {
  it('按住开始、松开后生成语音 Blob', async () => {
    const { act, renderHook } = await import('@testing-library/react')
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const getUserMedia = vi.fn(() => Promise.resolve(stream))

    class FakeRecorder {
      static isTypeSupported = (type) => type === 'audio/webm;codecs=opus'

      constructor(_stream, options = {}) {
        this.state = 'inactive'
        this.mimeType = options.mimeType || ''
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
        this.onstop?.()
      }
    }

    const originRecorder = globalThis.MediaRecorder
    const originDevices = navigator.mediaDevices
    globalThis.MediaRecorder = FakeRecorder
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    const onRecorded = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onRecorded, onError, minMs: 0 }))

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.recording).toBe(true)
    expect(getUserMedia).toHaveBeenCalled()

    act(() => result.current.stop(false))
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const clip = onRecorded.mock.calls[0][0]
    expect(clip.mime).toBe('audio/webm;codecs=opus')
    expect(clip.blob.size).toBeGreaterThan(0)
    expect(track.stop).toHaveBeenCalled()
    expect(result.current.recording).toBe(false)
    expect(onError).not.toHaveBeenCalled()

    globalThis.MediaRecorder = originRecorder
    Object.defineProperty(navigator, 'mediaDevices', { value: originDevices, configurable: true })
  })
})

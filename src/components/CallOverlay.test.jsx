// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CallOverlay from './CallOverlay'

afterEach(cleanup)

describe('CallOverlay', () => {
  it('语音呼叫中展示对方昵称与状态', () => {
    render(<CallOverlay state="calling" peer={{ nickname: '小明' }} onHangup={() => {}} />)
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('正在呼叫对方...')).toBeTruthy()
  })

  it('接通后状态行显示计时而非文案', () => {
    render(<CallOverlay state="connected" seconds={0} peer={{ nickname: '小红' }} onHangup={() => {}} />)
    expect(screen.getByTestId('call-status').textContent).toBe('0:00')
  })

  it('未传 peer 时兜底显示用户', () => {
    render(<CallOverlay />)
    expect(screen.getAllByText('用户').length).toBeGreaterThan(0)
    expect(screen.getByText('正在呼叫对方...')).toBeTruthy()
  })

  it('点击挂断触发回调', () => {
    let hungUp = false
    render(
      <CallOverlay
        peer={{ nickname: '老王' }}
        onHangup={() => {
          hungUp = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '挂断' }))
    expect(hungUp).toBe(true)
  })

  it('来电振铃显示接听与拒绝并触发回调', () => {
    let answered = 0
    let declined = 0
    render(
      <CallOverlay
        state="ringing"
        peer={{ nickname: '小明' }}
        onAnswer={() => { answered += 1 }}
        onDecline={() => { declined += 1 }}
      />,
    )
    expect(screen.getByText('邀请你语音通话')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '接听' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(answered).toBe(1)
    expect(declined).toBe(1)
  })

  it('接通后展示通话计时', () => {
    render(<CallOverlay state="connected" seconds={75} peer={{ nickname: '小明' }} onHangup={() => {}} />)
    expect(screen.getByTestId('call-status').textContent).toBe('1:15')
  })

  it('静音开关展示当前状态并可切换', () => {
    let toggled = 0
    const { rerender } = render(
      <CallOverlay state="connected" muted={false} peer={{ nickname: '小明' }} onToggleMute={() => { toggled += 1 }} onHangup={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '静音' }))
    expect(toggled).toBe(1)
    rerender(
      <CallOverlay state="connected" muted peer={{ nickname: '小明' }} onToggleMute={() => {}} onHangup={() => {}} />,
    )
    expect(screen.getByTestId('call-muted-hint')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消静音' })).toBeTruthy()
  })

  it('失败态展示错误文案并可关闭', () => {
    let closed = 0
    render(
      <CallOverlay state="failed" error="对方无应答" peer={{ nickname: '小明' }} onHangup={() => { closed += 1 }} />,
    )
    expect(screen.getByTestId('call-status').textContent).toBe('对方无应答')
    fireEvent.click(screen.getByTestId('call-dismiss'))
    expect(closed).toBe(1)
  })

  it('接通后把远端音频流挂到 audio 元素上', () => {
    const track = { kind: 'audio', enabled: true, stop: () => {} }
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
    render(<CallOverlay state="connected" remoteStream={stream} peer={{ nickname: '小明' }} onHangup={() => {}} />)
    const audio = screen.getByTestId('remote-audio')
    expect(audio.srcObject).toBe(stream)
    expect(audio.getAttribute('playsinline')).not.toBeNull()
  })

  it('自动播放被拦截时在用户手势后重试播放远端音频', async () => {
    const originalPlay = Object.getOwnPropertyDescriptor(globalThis.HTMLMediaElement.prototype, 'play')
    const play = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(undefined)
    Object.defineProperty(globalThis.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: play,
    })
    const track = { kind: 'audio', enabled: true, stop: () => {} }
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
    try {
      render(<CallOverlay state="connected" remoteStream={stream} peer={{ nickname: '小明' }} onHangup={() => {}} />)
      await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
      fireEvent.click(document.body)
      await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
      expect(play.mock.results[1].value).toBeInstanceOf(Promise)
    } finally {
      if (originalPlay) Object.defineProperty(globalThis.HTMLMediaElement.prototype, 'play', originalPlay)
      else delete globalThis.HTMLMediaElement.prototype.play
    }
  })

  describe('免提切换', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      localStorage.clear()
      Object.defineProperty(globalThis.HTMLMediaElement.prototype, 'setSinkId', {
        configurable: true,
        value: vi.fn(async () => {}),
      })
      globalThis.navigator.mediaDevices = {
        enumerateDevices: vi.fn(async () => [
          { kind: 'audiooutput', deviceId: 'earpiece', label: '听筒' },
          { kind: 'audiooutput', deviceId: 'speaker', label: 'Speaker' },
        ]),
        getUserMedia: vi.fn(),
      }
    })

    afterEach(() => {
      delete globalThis.HTMLMediaElement.prototype.setSinkId
      delete globalThis.navigator.mediaDevices
    })

    it('默认免提,优先切到扬声器设备;关闭后回到默认输出', async () => {
      render(<CallOverlay state="connected" peer={{ nickname: '小明' }} onHangup={() => {}} />)
      const audio = screen.getByTestId('remote-audio')
      await waitFor(() => expect(audio.setSinkId).toHaveBeenCalledWith('speaker'))
      const toggle = screen.getByTestId('call-speaker')
      expect(toggle.getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(toggle)
      await waitFor(() => expect(audio.setSinkId).toHaveBeenCalledWith(''))
      expect(screen.getByTestId('call-speaker').getAttribute('aria-pressed')).toBe('false')
    })

    it('设备不支持外放时给出提示', async () => {
      globalThis.navigator.mediaDevices.enumerateDevices = vi.fn(async () => [
        { kind: 'audiooutput', deviceId: 'earpiece', label: '听筒' },
      ])
      render(<CallOverlay state="connected" peer={{ nickname: '小明' }} onHangup={() => {}} />)
      await waitFor(() => expect(screen.getByTestId('remote-audio').setSinkId).toHaveBeenCalledWith('earpiece'))
      fireEvent.click(screen.getByTestId('call-speaker'))
      await waitFor(() => expect(screen.getByText('当前设备无法切换到外放')).toBeTruthy())
    })
  })
})

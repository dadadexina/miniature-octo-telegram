// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SignedAudio from './SignedAudio'

const audioInstances = []

class FakeAudio {
  constructor(src) {
    this.src = src
    this.paused = true
    this.duration = 4
    this.listeners = {}
    this.playCalls = 0
    audioInstances.push(this)
  }

  addEventListener(type, fn) {
    this.listeners[type] = fn
  }

  removeEventListener(type) {
    delete this.listeners[type]
  }

  play() {
    this.playCalls += 1
    this.paused = false
    this.listeners.play?.()
    return Promise.resolve()
  }

  pause() {
    this.paused = true
    this.listeners.pause?.()
  }
}

beforeEach(() => {
  audioInstances.length = 0
  globalThis.Audio = FakeAudio
})

afterEach(cleanup)

describe('SignedAudio 语音消息', () => {
  it('展示语音时长并支持播放', async () => {
    render(
      <SignedAudio
        mine
        attachment={{ type: 'audio', url: 'data:audio/webm;base64,AAA', duration: 3 }}
      />
    )

    const card = await screen.findByTestId('msg-audio')
    expect(card.textContent).toContain('3"')
    expect(audioInstances[0].src).toBe('data:audio/webm;base64,AAA')

    fireEvent.click(screen.getByTestId('audio-toggle'))
    await waitFor(() => expect(audioInstances[0].playCalls).toBe(1))
    expect(screen.getByTestId('audio-toggle').getAttribute('aria-label')).toBe('暂停语音')
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SOUND_ID,
  NOTIFICATION_SOUNDS,
  playNotificationSound,
  soundById,
} from './notificationSounds'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notificationSounds', () => {
  it('ships ten unique bundled sounds with stable ids', () => {
    expect(NOTIFICATION_SOUNDS).toHaveLength(10)
    const ids = NOTIFICATION_SOUNDS.map((sound) => sound.id)
    expect(new Set(ids).size).toBe(10)
    NOTIFICATION_SOUNDS.forEach((sound) => {
      expect(sound.name.length).toBeGreaterThan(0)
      expect(sound.file).toMatch(/^\/sounds\/[a-z-]+\.mp3$/)
    })
    expect(ids).toContain(DEFAULT_SOUND_ID)
  })

  it('falls back to the default sound for unknown ids', () => {
    expect(soundById('missing').id).toBe(DEFAULT_SOUND_ID)
    expect(soundById('guitar').file).toBe('/sounds/guitar.mp3')
  })

  it('creates and plays an audio element for the selected sound', () => {
    const created = []
    class FakeAudio {
      constructor(src) {
        this.src = src
        this.played = false
        created.push(this)
      }

      play() {
        this.played = true
        return Promise.resolve()
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    const audio = playNotificationSound('positive')
    expect(audio.src).toBe('/sounds/positive.mp3')
    expect(audio.volume).toBe(0.8)
    expect(audio.played).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('returns null when the environment has no Audio support', () => {
    vi.stubGlobal('Audio', undefined)
    expect(playNotificationSound('bell')).toBeNull()
  })
})

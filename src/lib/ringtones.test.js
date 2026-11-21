// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_RINGTONE_ID,
  DEFAULT_RINGTONE_ID,
  RINGTONES,
  playRingtone,
  resolveRingtoneSource,
  ringtoneById,
  stopRingtone,
} from './ringtones'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ringtones', () => {
  it('ships ten bundled ringtones and a valid default', () => {
    expect(RINGTONES).toHaveLength(10)
    expect(new Set(RINGTONES.map((item) => item.id)).size).toBe(10)
    RINGTONES.forEach((item) => {
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.file).toMatch(/^\/ringtones\/[a-z-]+\.mp3$/)
    })
    expect(ringtoneById(DEFAULT_RINGTONE_ID).id).toBe(DEFAULT_RINGTONE_ID)
  })

  it('falls back to the default ringtone for unknown ids', () => {
    expect(ringtoneById('missing').id).toBe(DEFAULT_RINGTONE_ID)
    expect(ringtoneById(CUSTOM_RINGTONE_ID)).toBeNull()
  })

  it('resolves the bundled file for a default ringtone', async () => {
    const source = await resolveRingtoneSource(DEFAULT_RINGTONE_ID)
    expect(source.src).toBe(ringtoneById(DEFAULT_RINGTONE_ID).file)
    source.cleanup()
  })

  it('falls back to the default file when the custom ringtone is missing', async () => {
    const source = await resolveRingtoneSource(CUSTOM_RINGTONE_ID)
    expect(source.src).toBe(ringtoneById(DEFAULT_RINGTONE_ID).file)
    source.cleanup()
  })

  it('plays the selected ringtone on loop', async () => {
    const created = []
    class FakeAudio {
      constructor(src) {
        this.src = src
        this.loop = false
        this.paused = false
        created.push(this)
      }

      play() {
        return Promise.resolve()
      }

      pause() {
        this.paused = true
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    const handle = await playRingtone(DEFAULT_RINGTONE_ID)
    expect(handle.audio.src).toBe(ringtoneById(DEFAULT_RINGTONE_ID).file)
    expect(handle.audio.loop).toBe(true)

    stopRingtone(handle)
    expect(handle.audio.paused).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('returns null when audio playback is unavailable', async () => {
    vi.stubGlobal('Audio', undefined)
    expect(await playRingtone(DEFAULT_RINGTONE_ID)).toBeNull()
  })
})

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_RINGTONE_BYTES,
  formatRingtoneSize,
  isAudioFile,
  loadCustomRingtone,
  removeCustomRingtone,
  saveCustomRingtone,
} from './ringtoneStore'

function audioFile(name = 'my-ring.mp3', size = 3) {
  return new File([new Uint8Array(size)], name, { type: 'audio/mpeg' })
}

beforeEach(() => {
  localStorage.clear()
})

describe('ringtoneStore', () => {
  it('accepts common audio file names and rejects other files', () => {
    expect(isAudioFile(audioFile())).toBe(true)
    expect(isAudioFile(new File(['x'], 'note.m4a', { type: '' }))).toBe(true)
    expect(isAudioFile(new File(['x'], 'cover.png', { type: 'image/png' }))).toBe(false)
    expect(isAudioFile(null)).toBe(false)
  })

  it('formats file sizes for the settings page', () => {
    expect(formatRingtoneSize(512)).toBe('512 B')
    expect(formatRingtoneSize(2048)).toBe('2 KB')
    expect(formatRingtoneSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('saves, loads and removes a custom ringtone', async () => {
    const file = audioFile()
    const saved = await saveCustomRingtone(file)
    expect(saved.name).toBe('my-ring.mp3')

    const loaded = await loadCustomRingtone()
    expect(loaded.name).toBe('my-ring.mp3')
    expect(loaded.size).toBe(3)
    expect(loaded.url).toMatch(/^data:audio\/mpeg;base64,/)

    await removeCustomRingtone()
    expect(await loadCustomRingtone()).toBeNull()
  })

  it('rejects oversized files before reading them', async () => {
    const huge = { name: 'huge.mp3', type: 'audio/mpeg', size: MAX_RINGTONE_BYTES + 1 }
    await expect(saveCustomRingtone(huge)).rejects.toThrow('不能超过 8MB')
  })

  it('rejects non-audio uploads', async () => {
    const image = new File(['x'], 'cover.png', { type: 'image/png' })
    await expect(saveCustomRingtone(image)).rejects.toThrow('请选择音频文件')
  })
})

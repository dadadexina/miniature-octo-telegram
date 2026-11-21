import { loadCustomRingtone } from './ringtoneStore'

export const CUSTOM_RINGTONE_ID = 'custom'

export const RINGTONES = [
  { id: 'vintage-telephone-ring', name: '复古电话铃', file: '/ringtones/vintage-telephone-ring.mp3' },
  { id: 'office-telephone-ring', name: '办公电话', file: '/ringtones/office-telephone-ring.mp3' },
  { id: 'marimba-ringtone', name: '马林巴铃声', file: '/ringtones/marimba-ringtone.mp3' },
  { id: 'waiting-ringtone', name: '等待铃声', file: '/ringtones/waiting-ringtone.mp3' },
  { id: 'old-telephone-ring', name: '老式电话铃', file: '/ringtones/old-telephone-ring.mp3' },
  { id: 'on-hold-ringtone', name: '保持音', file: '/ringtones/on-hold-ringtone.mp3' },
  { id: 'marimba-waiting-ringtone', name: '马林巴等待音', file: '/ringtones/marimba-waiting-ringtone.mp3' },
  { id: 'toy-telephone-ring', name: '玩具电话铃', file: '/ringtones/toy-telephone-ring.mp3' },
  { id: 'dial-phone-tone', name: '拨号音', file: '/ringtones/dial-phone-tone.mp3' },
  { id: 'phone-ring-bell', name: '电话铃钟', file: '/ringtones/phone-ring-bell.mp3' },
]

export const DEFAULT_RINGTONE_ID = 'marimba-ringtone'

export function ringtoneById(id) {
  if (id === CUSTOM_RINGTONE_ID) return null
  return RINGTONES.find((ringtone) => ringtone.id === id) || RINGTONES.find((ringtone) => ringtone.id === DEFAULT_RINGTONE_ID)
}

export async function resolveRingtoneSource(id) {
  if (id === CUSTOM_RINGTONE_ID) {
    const record = await loadCustomRingtone()
    if (!record) return { src: ringtoneById(DEFAULT_RINGTONE_ID).file, cleanup: () => {} }
    if (record.url) return { src: record.url, cleanup: () => {} }
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
    const url = URL.createObjectURL(record.blob)
    return { src: url, cleanup: () => URL.revokeObjectURL(url) }
  }
  return { src: ringtoneById(id).file, cleanup: () => {} }
}

export async function playRingtone(id, { volume = 0.9 } = {}) {
  let resolved
  try {
    resolved = await resolveRingtoneSource(id)
  } catch {
    return null
  }
  if (!resolved) return null
  if (typeof globalThis.Audio !== 'function') {
    resolved.cleanup()
    return null
  }
  try {
    const audio = new globalThis.Audio(resolved.src)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = volume
    const played = audio.play?.()
    if (played?.catch) played.catch(() => {})
    return {
      audio,
      cleanup: () => {
        try {
          audio.pause()
        } catch {
          // 忽略停止失败
        }
        resolved.cleanup()
      },
    }
  } catch {
    resolved.cleanup()
    return null
  }
}

export function stopRingtone(handle) {
  try {
    handle?.cleanup?.()
  } catch {
    // 忽略停止失败
  }
}

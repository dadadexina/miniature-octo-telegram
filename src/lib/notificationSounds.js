export const NOTIFICATION_SOUNDS = [
  { id: 'bell', name: '清脆铃声', file: '/sounds/bell.mp3' },
  { id: 'happy-bells', name: '欢快铃音', file: '/sounds/happy-bells.mp3' },
  { id: 'positive', name: '轻快提示', file: '/sounds/positive.mp3' },
  { id: 'message-pop', name: '消息气泡', file: '/sounds/message-pop.mp3' },
  { id: 'bubble-pop', name: '气泡弹出', file: '/sounds/bubble-pop.mp3' },
  { id: 'magic-ring', name: '魔法铃环', file: '/sounds/magic-ring.mp3' },
  { id: 'guitar', name: '吉他提示', file: '/sounds/guitar.mp3' },
  { id: 'clear-tone', name: '清亮提示', file: '/sounds/clear-tone.mp3' },
  { id: 'uplifting-flute', name: '悠扬长笛', file: '/sounds/uplifting-flute.mp3' },
  { id: 'melodic-flute', name: '花式长笛', file: '/sounds/melodic-flute.mp3' },
]

export const DEFAULT_SOUND_ID = NOTIFICATION_SOUNDS[0].id

export function soundById(id) {
  return NOTIFICATION_SOUNDS.find((sound) => sound.id === id) || NOTIFICATION_SOUNDS[0]
}

export function playNotificationSound(id, { volume = 0.8 } = {}) {
  if (typeof globalThis.Audio !== 'function') return null
  const sound = soundById(id)
  try {
    const audio = new globalThis.Audio(sound.file)
    audio.preload = 'auto'
    audio.volume = volume
    const played = audio.play?.()
    if (played?.catch) played.catch(() => {})
    return audio
  } catch {
    return null
  }
}

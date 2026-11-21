import { DEFAULT_SOUND_ID, NOTIFICATION_SOUNDS, playNotificationSound } from './notificationSounds'

const SETTINGS_KEY = 'eink:app-settings:v1'

export const DEFAULT_SETTINGS = Object.freeze({
  notifyMessages: true,
  notifySound: true,
  notifyVibrate: true,
  notifySoundId: DEFAULT_SOUND_ID,
  theme: 'light',
  fontScale: 'standard',
})

const FONT_SCALES = ['small', 'standard', 'large']

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    notifyMessages: parsed.notifyMessages !== false,
    notifySound: parsed.notifySound !== false,
    notifyVibrate: parsed.notifyVibrate !== false,
    notifySoundId: NOTIFICATION_SOUNDS.some((sound) => sound.id === parsed.notifySoundId)
      ? parsed.notifySoundId
      : DEFAULT_SOUND_ID,
    theme: parsed.theme === 'dark' ? 'dark' : 'light',
    fontScale: FONT_SCALES.includes(parsed.fontScale) ? parsed.fontScale : 'standard',
  }
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY)
    return normalize(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(patch, storage = globalThis.localStorage) {
  const next = normalize({ ...loadSettings(storage), ...patch })
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // 存储空间不足时仍应用设置，仅放弃持久化
  }
  applySettings(next)
  return next
}

export function applySettings(settings) {
  const root = globalThis.document?.documentElement
  if (!root) return
  root.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light'
  root.dataset.fontScale = FONT_SCALES.includes(settings.fontScale) ? settings.fontScale : 'standard'
}

export function initSettings() {
  const settings = loadSettings()
  applySettings(settings)
  return settings
}

export function requestNotificationPermission() {
  const NotificationApi = globalThis.Notification
  if (!NotificationApi || typeof NotificationApi.requestPermission !== 'function') {
    return Promise.resolve('unsupported')
  }
  if (NotificationApi.permission !== 'default') return Promise.resolve(NotificationApi.permission)
  try {
    return NotificationApi.requestPermission()
  } catch {
    return Promise.resolve('denied')
  }
}

function playBeep() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AudioCtx) return
  try {
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close?.()
  } catch {
    // 浏览器限制自动播放时忽略提示音
  }
}

export function notifyIncoming({ title = '新消息', body = '' } = {}) {
  const settings = loadSettings()
  if (!settings.notifyMessages) return
  if (settings.notifyVibrate) {
    try {
      globalThis.navigator?.vibrate?.(30)
    } catch {
      // 设备不支持震动时忽略
    }
  }
  if (settings.notifySound) {
    const audio = playNotificationSound(settings.notifySoundId)
    if (!audio) playBeep()
  }
  const NotificationApi = globalThis.Notification
  if (NotificationApi && NotificationApi.permission === 'granted') {
    try {
      new NotificationApi(title, { body, tag: 'eink-message' })
    } catch {
      // 通知构造失败不影响消息同步
    }
  }
}

export { SETTINGS_KEY }

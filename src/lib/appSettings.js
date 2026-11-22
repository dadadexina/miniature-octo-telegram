import { DEFAULT_SOUND_ID, NOTIFICATION_SOUNDS, playNotificationSound } from './notificationSounds'
import {
  clearDigestQueue,
  queueDigestItem,
  readDigestQueue,
  summarizeDigest,
} from './notificationDigest'
import { CUSTOM_RINGTONE_ID, DEFAULT_RINGTONE_ID, RINGTONES } from './ringtones'
import { DEFAULT_THEME_ID, THEME_IDS, themeById } from './themes'

const SETTINGS_KEY = 'eink:app-settings:v1'

export const DEFAULT_SETTINGS = Object.freeze({
  notifyMessages: true,
  notifySound: true,
  notifyVibrate: true,
  notifySoundId: DEFAULT_SOUND_ID,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '08:00',
  digestEnabled: true,
  callRingtoneId: DEFAULT_RINGTONE_ID,
  customRingtoneName: '',
  theme: DEFAULT_THEME_ID,
  fontScale: 'standard',
})

const FONT_SCALES = ['small', 'standard', 'large']
const VIBRATE_PATTERN = [120, 60, 120]
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function validRingtoneId(id) {
  return id === CUSTOM_RINGTONE_ID || RINGTONES.some((ringtone) => ringtone.id === id)
}

function validTime(value, fallback) {
  return TIME_PATTERN.test(String(value || '')) ? value : fallback
}

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
    dndEnabled: parsed.dndEnabled === true,
    dndStart: validTime(parsed.dndStart, DEFAULT_SETTINGS.dndStart),
    dndEnd: validTime(parsed.dndEnd, DEFAULT_SETTINGS.dndEnd),
    digestEnabled: parsed.digestEnabled !== false,
    callRingtoneId: validRingtoneId(parsed.callRingtoneId) ? parsed.callRingtoneId : DEFAULT_RINGTONE_ID,
    customRingtoneName: typeof parsed.customRingtoneName === 'string' ? parsed.customRingtoneName : '',
    theme: THEME_IDS.includes(parsed.theme) ? parsed.theme : DEFAULT_THEME_ID,
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
  root.dataset.theme = THEME_IDS.includes(settings.theme) ? settings.theme : DEFAULT_THEME_ID
  root.dataset.fontScale = FONT_SCALES.includes(settings.fontScale) ? settings.fontScale : 'standard'
  const meta = globalThis.document?.querySelector?.('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', themeById(root.dataset.theme).themeColor)
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

export function vibrateNow(pattern = VIBRATE_PATTERN) {
  const vibrate = globalThis.navigator?.vibrate
  if (typeof vibrate !== 'function') return false
  try {
    return vibrate.call(globalThis.navigator, pattern) !== false
  } catch {
    return false
  }
}

function timeToMinutes(value) {
  if (!TIME_PATTERN.test(String(value || ''))) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

export function isQuietTime(settings, date = new Date()) {
  if (!settings?.dndEnabled) return false
  const start = timeToMinutes(settings.dndStart)
  const end = timeToMinutes(settings.dndEnd)
  if (start === null || end === null) return false
  const now = date.getHours() * 60 + date.getMinutes()
  if (start === end) return true
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function deliverNotification(settings, { title = '新消息', body = '', tag = 'eink-message' } = {}) {
  if (settings.notifyVibrate) vibrateNow()
  if (settings.notifySound) {
    const audio = playNotificationSound(settings.notifySoundId)
    if (!audio) playBeep()
  }
  const NotificationApi = globalThis.Notification
  if (NotificationApi && NotificationApi.permission === 'granted') {
    try {
      new NotificationApi(title, { body, tag })
    } catch {
      // 通知构造失败不影响消息同步
    }
  }
}

export function notifyIncoming({
  title = '新消息',
  body = '',
  fromId = '',
  fromName = '',
  muted = false,
  userId = '',
  force = false,
} = {}) {
  const settings = loadSettings()
  if (!settings.notifyMessages) return
  if (muted) return
  if (!force && isQuietTime(settings)) {
    if (settings.digestEnabled && fromId) {
      queueDigestItem(userId, { fromId, fromName })
    }
    return
  }
  deliverNotification(settings, { title, body })
}

export function flushDigestNotification({ userId = '', now = new Date(), storage } = {}) {
  const settings = loadSettings(storage)
  if (!settings.notifyMessages) return null
  if (!settings.digestEnabled) {
    clearDigestQueue(userId, storage)
    return null
  }
  if (isQuietTime(settings, now)) return null
  const summary = summarizeDigest(readDigestQueue(userId, storage))
  if (!summary) return null
  clearDigestQueue(userId, storage)
  deliverNotification(settings, { title: summary.title, body: summary.body, tag: 'eink-digest' })
  return summary
}

export { SETTINGS_KEY }

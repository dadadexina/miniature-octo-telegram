// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  flushDigestNotification,
  initSettings,
  isQuietTime,
  loadSettings,
  notifyIncoming,
  requestNotificationPermission,
  saveSettings,
  vibrateNow,
} from './appSettings'
import { readDigestQueue } from './notificationDigest'
import { THEMES } from './themes'

describe('appSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.fontScale
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists a patch and applies it to the document', () => {
    const next = saveSettings({ theme: 'dark', fontScale: 'large' })
    expect(next.theme).toBe('dark')
    expect(next.fontScale).toBe('large')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY))).toMatchObject({ theme: 'dark', fontScale: 'large' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.fontScale).toBe('large')
  })

  it('accepts every built-in theme and updates the theme-color meta', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)

    THEMES.forEach((theme) => {
      saveSettings({ theme: theme.id })
      expect(document.documentElement.dataset.theme).toBe(theme.id)
      expect(meta.getAttribute('content')).toBe(theme.themeColor)
    })

    meta.remove()
  })

  it('sanitizes invalid theme and font values', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ theme: 'neon', fontScale: 'huge', notifySound: false, notifySoundId: 'missing' })
    )
    const settings = loadSettings()
    expect(settings.theme).toBe('light')
    expect(settings.fontScale).toBe('standard')
    expect(settings.notifySound).toBe(false)
    expect(settings.notifySoundId).toBe('bell')
    expect(settings.notifyMessages).toBe(true)
  })

  it('sanitizes invalid call ringtone ids and keeps custom selection', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ callRingtoneId: 'missing' }))
    expect(loadSettings().callRingtoneId).toBe(DEFAULT_SETTINGS.callRingtoneId)

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ callRingtoneId: 'custom', customRingtoneName: 'my.mp3' }))
    expect(loadSettings().callRingtoneId).toBe('custom')
    expect(loadSettings().customRingtoneName).toBe('my.mp3')
  })

  it('falls back to defaults for broken json', () => {
    localStorage.setItem(SETTINGS_KEY, '{{{bad')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('initSettings applies stored preferences on boot', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark', fontScale: 'small' }))
    initSettings()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.fontScale).toBe('small')
  })

  it('notifyIncoming respects the master switch and vibration preference', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })

    saveSettings({ notifyMessages: false, notifyVibrate: true, notifySound: false })
    notifyIncoming({ body: '关闭提醒' })
    expect(vibrate).not.toHaveBeenCalled()

    saveSettings({ notifyMessages: true, notifySound: false })
    notifyIncoming({ body: '打开提醒' })
    expect(vibrate).toHaveBeenCalledWith([120, 60, 120])
  })

  it('vibrateNow reports whether the device supports vibration', () => {
    vi.stubGlobal('navigator', {})
    expect(vibrateNow()).toBe(false)

    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(vibrateNow([200])).toBe(true)
    expect(vibrate).toHaveBeenCalledWith([200])

    vibrate.mockReturnValue(false)
    expect(vibrateNow()).toBe(false)
  })

  it('notifyIncoming shows a browser notification when permission is granted', () => {
    const shown = []
    class FakeNotification {
      static permission = 'granted'
      constructor(title, options) {
        shown.push({ title, options })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)
    saveSettings({ notifyMessages: true, notifyVibrate: false, notifySound: false })

    notifyIncoming({ body: '你好呀' })
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('新消息')
    expect(shown[0].options.body).toBe('你好呀')
  })

  it('requestNotificationPermission resolves unsupported without a Notification API', async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(requestNotificationPermission()).resolves.toBe('unsupported')
  })

  it('识别跨午夜与全天的免打扰时段', () => {
    const base = { dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' }
    expect(isQuietTime(base, new Date(2026, 0, 1, 23, 30))).toBe(true)
    expect(isQuietTime(base, new Date(2026, 0, 1, 7, 59))).toBe(true)
    expect(isQuietTime(base, new Date(2026, 0, 1, 8, 0))).toBe(false)
    expect(isQuietTime(base, new Date(2026, 0, 1, 12, 0))).toBe(false)
    expect(isQuietTime({ ...base, dndStart: '09:00', dndEnd: '18:00' }, new Date(2026, 0, 1, 12, 0))).toBe(true)
    expect(isQuietTime({ ...base, dndStart: '00:00', dndEnd: '00:00' }, new Date(2026, 0, 1, 3, 0))).toBe(true)
    expect(isQuietTime({ ...base, dndEnabled: false }, new Date(2026, 0, 1, 23, 30))).toBe(false)
  })

  it('免打扰期间不逐条提醒，改为排队摘要', () => {
    const shown = []
    class FakeNotification {
      static permission = 'granted'
      constructor(title, options) {
        shown.push({ title, options })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)
    saveSettings({
      notifyMessages: true,
      notifySound: false,
      notifyVibrate: false,
      dndEnabled: true,
      dndStart: '00:00',
      dndEnd: '00:00',
      digestEnabled: true,
    })

    notifyIncoming({ body: '安静点', fromId: 'p1', fromName: '阿甲', userId: 'u1' })
    expect(shown).toHaveLength(0)
    expect(readDigestQueue('u1')).toHaveLength(1)

    notifyIncoming({ body: '静音会话', fromId: 'p2', fromName: '阿乙', muted: true, userId: 'u1' })
    expect(readDigestQueue('u1')).toHaveLength(1)

    notifyIncoming({ body: '测试通知', force: true })
    expect(shown).toHaveLength(1)
  })

  it('免打扰结束后合并提示一次并清空队列', () => {
    const shown = []
    class FakeNotification {
      static permission = 'granted'
      constructor(title, options) {
        shown.push({ title, options })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)
    saveSettings({
      notifyMessages: true,
      notifySound: false,
      notifyVibrate: false,
      dndEnabled: true,
      dndStart: '00:00',
      dndEnd: '00:00',
      digestEnabled: true,
    })
    notifyIncoming({ body: '一', fromId: 'p1', fromName: '阿甲', userId: 'u1' })
    notifyIncoming({ body: '二', fromId: 'p1', fromName: '阿甲', userId: 'u1' })
    notifyIncoming({ body: '三', fromId: 'p2', fromName: '阿乙', userId: 'u1' })

    saveSettings({ dndEnabled: false })
    const summary = flushDigestNotification({ userId: 'u1', now: new Date(2026, 0, 1, 12, 0) })
    expect(summary).toEqual({
      total: 3,
      senders: 2,
      title: '收件摘要',
      body: '你有 3 条未读，来自 2 人：阿甲、阿乙',
    })
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('收件摘要')
    expect(readDigestQueue('u1')).toEqual([])
    expect(flushDigestNotification({ userId: 'u1', now: new Date(2026, 0, 1, 12, 0) })).toBeNull()
  })

  it('关闭收件摘要时清空排队记录', () => {
    queueForTest()
    saveSettings({ dndEnabled: false, digestEnabled: false })
    expect(flushDigestNotification({ userId: 'u1', now: new Date(2026, 0, 1, 12, 0) })).toBeNull()
    expect(readDigestQueue('u1')).toEqual([])
  })
})

function queueForTest() {
  saveSettings({
    notifyMessages: true,
    dndEnabled: true,
    dndStart: '00:00',
    dndEnd: '00:00',
    digestEnabled: true,
  })
  notifyIncoming({ body: '一', fromId: 'p1', fromName: '阿甲', userId: 'u1' })
}

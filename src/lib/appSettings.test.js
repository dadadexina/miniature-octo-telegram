// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  initSettings,
  loadSettings,
  notifyIncoming,
  requestNotificationPermission,
  saveSettings,
  vibrateNow,
} from './appSettings'

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
})

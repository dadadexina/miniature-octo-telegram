// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { SETTINGS_KEY } from '../lib/appSettings'

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'u1', nickname: '我' },
  authUser: null,
}))
const storeMocks = vi.hoisted(() => ({ purgeAccount: vi.fn(), logout: vi.fn() }))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: storeState.currentUser,
    authUser: storeState.authUser,
    purgeAccount: storeMocks.purgeAccount,
    logout: storeMocks.logout,
  }),
}))

const authMock = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  reauthenticate: vi.fn(),
  updateUser: vi.fn(),
}))
const functionsMock = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: authMock, functions: functionsMock },
}))

const ringtoneStoreMock = vi.hoisted(() => ({
  loadCustomRingtone: vi.fn(async () => null),
  saveCustomRingtone: vi.fn(async (file) => ({ name: file.name, size: file.size })),
  removeCustomRingtone: vi.fn(async () => {}),
  formatRingtoneSize: vi.fn(() => '1 KB'),
}))

vi.mock('../lib/ringtoneStore', () => ringtoneStoreMock)

const ringtonePlayMock = vi.hoisted(() => ({
  playRingtone: vi.fn(async () => ({ audio: { pause: vi.fn() }, cleanup: vi.fn() })),
  stopRingtone: vi.fn(),
}))

vi.mock('../lib/ringtones', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ...ringtonePlayMock }
})

const CLOUD_USER_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.fontScale
  storeState.currentUser = { id: 'u1', nickname: '我' }
  storeState.authUser = null
  vi.clearAllMocks()
  ringtoneStoreMock.loadCustomRingtone.mockResolvedValue(null)
  ringtoneStoreMock.saveCustomRingtone.mockImplementation(async (file) => ({ name: file.name, size: file.size }))
  ringtoneStoreMock.removeCustomRingtone.mockResolvedValue()
  authMock.signInWithPassword.mockResolvedValue({ error: null })
  authMock.reauthenticate.mockResolvedValue({ error: null })
  authMock.updateUser.mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup() {
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )
}

function openView(index) {
  fireEvent.click(screen.getByTestId(`settings-item-${index}`))
}

function useCloudAccount() {
  storeState.currentUser = { id: CLOUD_USER_ID, nickname: '云用户' }
  storeState.authUser = { id: CLOUD_USER_ID, email: 'alice@example.com', phone: '13800001234' }
}

function closeNotice() {
  fireEvent.click(screen.getByRole('button', { name: '确认' }))
}

describe('Settings 设置页', () => {
  it('展示三个设置项与副标题', () => {
    setup()
    expect(screen.getByText('通知')).toBeTruthy()
    expect(screen.getByText('新消息提醒、声音与震动设置')).toBeTruthy()
    expect(screen.getByText('界面显示')).toBeTruthy()
    expect(screen.getByText('深色模式、字体大小调整')).toBeTruthy()
    expect(screen.getByText('账号安全')).toBeTruthy()
    expect(screen.getByText('修改密码、注销账号')).toBeTruthy()
  })

  it('朋友圈背景入口位于界面显示面板', () => {
    setup()
    openView(1)
    expect(screen.getByText('更换朋友圈背景')).toBeTruthy()
    expect(screen.getByText('自定义发现页顶部背景图')).toBeTruthy()
    expect(screen.getByTestId('settings-change-cover')).toBeTruthy()
  })

  it('通知面板可切换并持久化偏好', () => {
    setup()
    openView(0)
    expect(screen.getByTestId('settings-notify')).toBeTruthy()

    const master = screen.getByRole('switch', { name: '新消息提醒' })
    expect(master.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(master)
    expect(master.getAttribute('aria-checked')).toBe('false')

    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))
    expect(saved.notifyMessages).toBe(false)

    fireEvent.click(screen.getByLabelText('返回'))
    expect(screen.getByTestId('settings-list')).toBeTruthy()
  })

  it('通知面板提供十个提示音并支持试听与切换', () => {
    const created = []
    class FakeAudio {
      constructor(src) {
        this.src = src
        created.push(this)
      }

      play() {
        return Promise.resolve()
      }

      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio)

    setup()
    openView(0)

    expect(screen.getByTestId('settings-sound-list').querySelectorAll('button')).toHaveLength(10)
    expect(screen.getByTestId('settings-sound-bell').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('settings-sound-guitar'))
    expect(screen.getByTestId('settings-sound-guitar').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('settings-sound-bell').getAttribute('aria-pressed')).toBe('false')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).notifySoundId).toBe('guitar')
    expect(created.at(-1).src).toBe('/sounds/guitar.mp3')
  })

  it('通知面板可发送测试通知', () => {
    vi.stubGlobal(
      'Audio',
      class {
        play() {
          return Promise.resolve()
        }

        pause() {}
      }
    )

    setup()
    openView(0)
    fireEvent.click(screen.getByTestId('settings-test-notification'))

    expect(screen.getByTestId('settings-notice')).toBeTruthy()
    expect(screen.getByText('测试通知已发送')).toBeTruthy()
  })

  it('关闭新消息提醒后发送测试通知会提示先开启', () => {
    setup()
    openView(0)
    fireEvent.click(screen.getByRole('switch', { name: '新消息提醒' }))
    fireEvent.click(screen.getByTestId('settings-test-notification'))

    expect(screen.getByText('请先开启新消息提醒')).toBeTruthy()
  })

  it('可测试震动并反馈设备支持情况', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })

    setup()
    openView(0)
    fireEvent.click(screen.getByTestId('settings-test-vibration'))
    expect(vibrate).toHaveBeenCalledWith([120, 60, 120])
    expect(screen.getByText('已触发震动')).toBeTruthy()
  })

  it('可请求并展示通知权限状态', async () => {
    const requestPermission = vi.fn(async () => 'granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })

    setup()
    openView(0)
    expect(screen.getByText('尚未授权，开启后才能收到系统通知')).toBeTruthy()

    fireEvent.click(screen.getByTestId('settings-enable-notifications'))
    await waitFor(() => expect(screen.getByText('已开启，可在系统通知栏收到新消息')).toBeTruthy())
    expect(requestPermission).toHaveBeenCalled()
  })

  it('设备不支持震动时给出提示', () => {
    vi.stubGlobal('navigator', {})

    setup()
    openView(0)
    fireEvent.click(screen.getByTestId('settings-test-vibration'))
    expect(screen.getByText('当前设备不支持震动，请使用手机浏览器并保持页面前台')).toBeTruthy()
  })

  it('来电铃声提供十条默认选项并持久化选择', () => {
    setup()
    openView(0)

    expect(screen.getByTestId('settings-ringtone-list').querySelectorAll('button')).toHaveLength(11)
    expect(screen.getByTestId('settings-ringtone-marimba-ringtone').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('settings-ringtone-vintage-telephone-ring'))
    expect(screen.getByTestId('settings-ringtone-vintage-telephone-ring').getAttribute('aria-pressed')).toBe('true')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).callRingtoneId).toBe('vintage-telephone-ring')
    expect(ringtonePlayMock.playRingtone).toHaveBeenCalledWith('vintage-telephone-ring')
  })

  it('支持上传与移除自定义来电铃声', async () => {
    setup()
    openView(0)

    const file = new File(['abc'], 'my-ring.mp3', { type: 'audio/mpeg' })
    fireEvent.change(screen.getByTestId('settings-ringtone-input'), { target: { files: [file] } })

    await waitFor(() => expect(ringtoneStoreMock.saveCustomRingtone).toHaveBeenCalledWith(file))
    await waitFor(() => expect(screen.getByTestId('settings-ringtone-custom')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).callRingtoneId).toBe('custom')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).customRingtoneName).toBe('my-ring.mp3')

    closeNotice()
    fireEvent.click(screen.getByTestId('settings-remove-ringtone'))
    await waitFor(() => expect(screen.queryByTestId('settings-ringtone-custom')).toBeNull())
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).callRingtoneId).toBe('marimba-ringtone')
  })

  it('界面显示面板可切换深色模式与字体大小并立即生效', () => {
    setup()
    openView(1)
    expect(screen.getByTestId('settings-display')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: '深色模式' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).theme).toBe('dark')

    fireEvent.click(screen.getByTestId('settings-font-large'))
    expect(document.documentElement.dataset.fontScale).toBe('large')
    expect(screen.getByTestId('settings-font-large').getAttribute('aria-pressed')).toBe('true')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).fontScale).toBe('large')
  })

  it('账号安全面板对演示账号给出限制提示', () => {
    setup()
    openView(2)
    expect(screen.getByTestId('settings-security')).toBeTruthy()
    expect(screen.getByTestId('settings-demo-security')).toBeTruthy()

    fireEvent.change(screen.getByTestId('settings-new-password'), { target: { value: '123456' } })
    fireEvent.change(screen.getByTestId('settings-confirm-password'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByTestId('settings-save-password').closest('form'))
    expect(screen.getByTestId('settings-notice')).toBeTruthy()
    expect(screen.getByText('演示账号不支持修改密码，请登录云端账号后使用')).toBeTruthy()
  })

  it('云端账号直接提交无法修改密码', () => {
    useCloudAccount()
    setup()
    openView(2)

    fireEvent.change(screen.getByTestId('settings-old-password'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByTestId('settings-new-password'), { target: { value: 'newpass' } })
    fireEvent.change(screen.getByTestId('settings-confirm-password'), { target: { value: 'newpass' } })
    fireEvent.submit(screen.getByTestId('settings-save-password').closest('form'))

    expect(authMock.updateUser).not.toHaveBeenCalled()
    expect(screen.getByText('请先验证当前密码并获取验证码')).toBeTruthy()
  })

  it('修改密码需要验证当前密码并发送验证码', async () => {
    useCloudAccount()
    setup()
    openView(2)

    expect(screen.getByTestId('settings-phone').textContent).toContain('138****1234')

    fireEvent.change(screen.getByTestId('settings-old-password'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByTestId('settings-new-password'), { target: { value: 'newpass' } })
    fireEvent.change(screen.getByTestId('settings-confirm-password'), { target: { value: 'newpass' } })
    fireEvent.click(screen.getByTestId('settings-send-code'))

    await waitFor(() =>
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'oldpass',
      })
    )
    await waitFor(() => expect(authMock.reauthenticate).toHaveBeenCalled())
    expect(screen.getByText('验证码已发送至邮箱 al***@example.com')).toBeTruthy()

    closeNotice()
    fireEvent.change(screen.getByTestId('settings-code'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByTestId('settings-save-password').closest('form'))

    await waitFor(() =>
      expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'newpass', nonce: '123456' })
    )
    expect(screen.getByText('密码已更新')).toBeTruthy()
  })

  it('当前密码错误时不会发送验证码', async () => {
    useCloudAccount()
    authMock.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

    setup()
    openView(2)
    fireEvent.change(screen.getByTestId('settings-old-password'), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByTestId('settings-new-password'), { target: { value: 'newpass' } })
    fireEvent.change(screen.getByTestId('settings-confirm-password'), { target: { value: 'newpass' } })
    fireEvent.click(screen.getByTestId('settings-send-code'))

    await waitFor(() => expect(screen.getByText('当前密码不正确')).toBeTruthy())
    expect(authMock.reauthenticate).not.toHaveBeenCalled()
    expect(authMock.updateUser).not.toHaveBeenCalled()
  })
})

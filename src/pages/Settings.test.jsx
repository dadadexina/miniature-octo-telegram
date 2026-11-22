// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { SETTINGS_KEY } from '../lib/appSettings'
import { THEMES } from '../lib/themes'

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'u1', nickname: '我' },
  authUser: null,
  profile: { nickname: '我' },
}))
const storeMocks = vi.hoisted(() => ({
  purgeAccount: vi.fn(),
  logout: vi.fn(),
  setCloudProfile: vi.fn(),
}))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: storeState.currentUser,
    authUser: storeState.authUser,
    profile: storeState.profile,
    setCloudProfile: storeMocks.setCloudProfile,
    purgeAccount: storeMocks.purgeAccount,
    logout: storeMocks.logout,
  }),
}))

const profileMocks = vi.hoisted(() => ({ updateProfileSignature: vi.fn() }))

vi.mock('../lib/profiles', () => ({ updateProfileSignature: profileMocks.updateProfileSignature }))

const dataExportMock = vi.hoisted(() => ({
  buildMediaArchive: vi.fn(),
  collectUserData: vi.fn(),
  downloadBlob: vi.fn(),
  downloadTextFile: vi.fn(),
  exportFileName: vi.fn(),
  serializeExport: vi.fn(),
  summarizeExport: vi.fn(),
}))

vi.mock('../lib/dataExport', () => dataExportMock)

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
  storeState.profile = { nickname: '我' }
  vi.clearAllMocks()
  ringtoneStoreMock.loadCustomRingtone.mockResolvedValue(null)
  ringtoneStoreMock.saveCustomRingtone.mockImplementation(async (file) => ({ name: file.name, size: file.size }))
  ringtoneStoreMock.removeCustomRingtone.mockResolvedValue()
  authMock.signInWithPassword.mockResolvedValue({ error: null })
  authMock.reauthenticate.mockResolvedValue({ error: null })
  authMock.updateUser.mockResolvedValue({ error: null })
  profileMocks.updateProfileSignature.mockResolvedValue({ ok: true, profile: { nickname: '我' } })
  dataExportMock.collectUserData.mockResolvedValue({ ok: true, payload: { counts: {}, storage: {} } })
  dataExportMock.downloadTextFile.mockReturnValue(true)
  dataExportMock.exportFileName.mockReturnValue('zhimo-export.json')
  dataExportMock.serializeExport.mockReturnValue('{}')
  dataExportMock.summarizeExport.mockReturnValue({ total: 4, mediaCount: 2 })
  dataExportMock.buildMediaArchive.mockResolvedValue({
    ok: true,
    bytes: new Uint8Array([1, 2]),
    fileName: 'zhimo-export-media.zip',
    included: 2,
    skipped: [],
  })
  dataExportMock.downloadBlob.mockReturnValue(true)
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
  it('展示设置项与副标题', () => {
    setup()
    expect(screen.getByText('通知')).toBeTruthy()
    expect(screen.getByText('新消息提醒、声音与震动设置')).toBeTruthy()
    expect(screen.getByText('界面显示')).toBeTruthy()
    expect(screen.getByText('主题、字体大小调整')).toBeTruthy()
    expect(screen.getByText('账号安全')).toBeTruthy()
    expect(screen.getByText('修改密码、注销账号')).toBeTruthy()
    expect(screen.getByText('其他设置')).toBeTruthy()
    expect(screen.getByText('个性签名等更多偏好')).toBeTruthy()
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

  it('通知面板可配置免打扰时段与收件摘要', () => {
    setup()
    openView(0)

    expect(screen.queryByTestId('settings-dnd-start')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: '开启免打扰' }))

    fireEvent.change(screen.getByTestId('settings-dnd-start'), { target: { value: '21:30' } })
    fireEvent.change(screen.getByTestId('settings-dnd-end'), { target: { value: '07:15' } })
    fireEvent.click(screen.getByRole('switch', { name: '收件摘要' }))

    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))
    expect(saved).toMatchObject({
      dndEnabled: true,
      dndStart: '21:30',
      dndEnd: '07:15',
      digestEnabled: false,
    })
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

  it('界面显示面板可选择五种主题并立即生效', () => {
    setup()
    openView(1)
    expect(screen.getByTestId('settings-display')).toBeTruthy()
    expect(screen.getByTestId('settings-theme-light').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('settings-theme-list').querySelectorAll('button')).toHaveLength(THEMES.length)

    fireEvent.click(screen.getByTestId('settings-theme-blue'))
    expect(screen.getByTestId('settings-theme-blue').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('settings-theme-light').getAttribute('aria-pressed')).toBe('false')
    expect(document.documentElement.dataset.theme).toBe('blue')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).theme).toBe('blue')

    fireEvent.click(screen.getByTestId('settings-theme-sepia'))
    expect(document.documentElement.dataset.theme).toBe('sepia')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).theme).toBe('sepia')
  })

  it('界面显示面板可切换字体大小并立即生效', () => {
    setup()
    openView(1)

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

  it('其他设置可保存个性签名到本机并限制 30 字', async () => {
    setup()
    openView(3)
    expect(screen.getByTestId('settings-other')).toBeTruthy()

    const input = screen.getByTestId('settings-signature-input')
    fireEvent.change(input, { target: { value: '  见字如面  ' } })
    expect(input.value).toBe('见字如面')

    fireEvent.change(input, { target: { value: '一'.repeat(40) } })
    expect(input.value).toHaveLength(30)

    fireEvent.change(input, { target: { value: '见字如面，纸短情长' } })
    fireEvent.submit(screen.getByTestId('settings-save-signature').closest('form'))

    await waitFor(() => expect(screen.getByText('个性签名已保存')).toBeTruthy())
    expect(localStorage.getItem('eink:signature:v1:u1')).toBe('见字如面，纸短情长')
    expect(profileMocks.updateProfileSignature).not.toHaveBeenCalled()
    expect(storeMocks.setCloudProfile).toHaveBeenCalledWith(
      expect.objectContaining({ signature: '见字如面，纸短情长' }),
      false
    )
  })

  it('云端账号保存个性签名会同步到资料表', async () => {
    useCloudAccount()
    storeState.profile = { id: CLOUD_USER_ID, nickname: '云用户', signature: '' }
    profileMocks.updateProfileSignature.mockResolvedValue({
      ok: true,
      profile: { id: CLOUD_USER_ID, nickname: '云用户', signature: '云上见' },
    })

    setup()
    openView(3)
    fireEvent.change(screen.getByTestId('settings-signature-input'), { target: { value: '云上见' } })
    fireEvent.submit(screen.getByTestId('settings-save-signature').closest('form'))

    await waitFor(() =>
      expect(profileMocks.updateProfileSignature).toHaveBeenCalledWith(CLOUD_USER_ID, '云上见')
    )
    expect(screen.getByText('个性签名已保存')).toBeTruthy()
    expect(storeMocks.setCloudProfile).toHaveBeenCalledWith(
      expect.objectContaining({ signature: '云上见' }),
      true
    )
  })

  it('云端账号可导出个人数据并提示结果', async () => {
    useCloudAccount()
    setup()
    openView(2)

    fireEvent.click(screen.getByTestId('settings-export-data'))

    await waitFor(() =>
      expect(dataExportMock.collectUserData).toHaveBeenCalledWith(
        expect.anything(),
        CLOUD_USER_ID,
        { email: 'alice@example.com' }
      )
    )
    expect(dataExportMock.downloadTextFile).toHaveBeenCalledWith('zhimo-export.json', '{}')
    expect(screen.getByTestId('settings-notice').textContent).toContain('导出完成：4 条记录、2 个媒体文件清单')
  })

  it('云端账号可导出含媒体的压缩包', async () => {
    useCloudAccount()
    dataExportMock.buildMediaArchive.mockResolvedValue({
      ok: true,
      bytes: new Uint8Array([1, 2]),
      fileName: 'zhimo-export-media.zip',
      included: 2,
      skipped: [{ path: 'a', reason: '下载失败' }],
    })
    setup()
    openView(2)

    fireEvent.click(screen.getByTestId('settings-export-archive'))

    await waitFor(() => expect(dataExportMock.buildMediaArchive).toHaveBeenCalled())
    expect(dataExportMock.downloadBlob).toHaveBeenCalledWith(
      'zhimo-export-media.zip',
      expect.any(Blob)
    )
    expect(screen.getByTestId('settings-notice').textContent).toContain('2 个媒体文件，跳过 1 个')
  })

  it('导出失败时展示错误提示且不触发下载', async () => {
    useCloudAccount()
    dataExportMock.collectUserData.mockResolvedValue({ ok: false, error: 'messages: denied' })
    setup()
    openView(2)

    fireEvent.click(screen.getByTestId('settings-export-data'))

    await waitFor(() => expect(screen.getByTestId('settings-notice').textContent).toContain('messages: denied'))
    expect(dataExportMock.downloadTextFile).not.toHaveBeenCalled()
  })

  it('演示账号导出时提示无云端数据', () => {
    setup()
    openView(2)

    fireEvent.click(screen.getByTestId('settings-export-data'))

    expect(screen.getByTestId('settings-notice').textContent).toContain('演示账号没有云端数据可导出')
    expect(dataExportMock.collectUserData).not.toHaveBeenCalled()
  })
})

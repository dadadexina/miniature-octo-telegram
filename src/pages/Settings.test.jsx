// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { SETTINGS_KEY } from '../lib/appSettings'

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: { id: 'u1', nickname: '我' },
    authUser: null,
    purgeAccount: vi.fn(),
    logout: vi.fn(),
  }),
}))

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.fontScale
})

afterEach(cleanup)

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
})

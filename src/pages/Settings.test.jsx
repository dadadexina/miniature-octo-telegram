// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Settings from './Settings'

afterEach(cleanup)

function setup() {
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )
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

  it('点击选项弹出开发中提示，确认后留在设置页', () => {
    setup()
    fireEvent.click(screen.getByTestId('settings-item-0'))
    expect(screen.getByTestId('settings-notice')).toBeTruthy()
    expect(screen.getByText('该功能正在开发中，敬请期待')).toBeTruthy()

    fireEvent.click(screen.getByText('确认'))
    expect(screen.queryByTestId('settings-notice')).toBeNull()
    expect(screen.getByTestId('settings-list')).toBeTruthy()
  })
})

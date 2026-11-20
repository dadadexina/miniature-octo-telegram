// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CallOverlay from './CallOverlay'

afterEach(cleanup)

describe('CallOverlay', () => {
  it('语音呼叫中展示对方昵称与状态', () => {
    render(<CallOverlay kind="audio" state="calling" peer={{ nickname: '小明' }} onHangup={() => {}} />)
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('正在呼叫对方...')).toBeTruthy()
  })

  it('视频接通后展示通话中状态', () => {
    render(<CallOverlay kind="video" state="connected" peer={{ nickname: '小红' }} onHangup={() => {}} />)
    expect(screen.getByText('视频通话中')).toBeTruthy()
  })

  it('未传 peer 时兜底显示用户', () => {
    render(<CallOverlay />)
    expect(screen.getAllByText('用户').length).toBeGreaterThan(0)
    expect(screen.getByText('正在呼叫对方...')).toBeTruthy()
  })

  it('点击挂断触发回调', () => {
    let hungUp = false
    render(
      <CallOverlay
        peer={{ nickname: '老王' }}
        onHangup={() => {
          hungUp = true
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '挂断' }))
    expect(hungUp).toBe(true)
  })
})

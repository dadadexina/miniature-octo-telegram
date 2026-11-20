// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CallOverlay from './CallOverlay'

afterEach(cleanup)

describe('CallOverlay', () => {
  it('语音呼叫中展示对方昵称与状态', () => {
    render(<CallOverlay state="calling" peer={{ nickname: '小明' }} onHangup={() => {}} />)
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('正在呼叫对方...')).toBeTruthy()
  })

  it('接通后状态行显示计时而非文案', () => {
    render(<CallOverlay state="connected" seconds={0} peer={{ nickname: '小红' }} onHangup={() => {}} />)
    expect(screen.getByTestId('call-status').textContent).toBe('0:00')
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

  it('来电振铃显示接听与拒绝并触发回调', () => {
    let answered = 0
    let declined = 0
    render(
      <CallOverlay
        state="ringing"
        peer={{ nickname: '小明' }}
        onAnswer={() => { answered += 1 }}
        onDecline={() => { declined += 1 }}
      />,
    )
    expect(screen.getByText('邀请你语音通话')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '接听' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(answered).toBe(1)
    expect(declined).toBe(1)
  })

  it('接通后展示通话计时', () => {
    render(<CallOverlay state="connected" seconds={75} peer={{ nickname: '小明' }} onHangup={() => {}} />)
    expect(screen.getByTestId('call-status').textContent).toBe('1:15')
  })

  it('静音开关展示当前状态并可切换', () => {
    let toggled = 0
    const { rerender } = render(
      <CallOverlay state="connected" muted={false} peer={{ nickname: '小明' }} onToggleMute={() => { toggled += 1 }} onHangup={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '静音' }))
    expect(toggled).toBe(1)
    rerender(
      <CallOverlay state="connected" muted peer={{ nickname: '小明' }} onToggleMute={() => {}} onHangup={() => {}} />,
    )
    expect(screen.getByTestId('call-muted-hint')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消静音' })).toBeTruthy()
  })

  it('失败态展示错误文案并可关闭', () => {
    let closed = 0
    render(
      <CallOverlay state="failed" error="对方无应答" peer={{ nickname: '小明' }} onHangup={() => { closed += 1 }} />,
    )
    expect(screen.getByTestId('call-status').textContent).toBe('对方无应答')
    fireEvent.click(screen.getByTestId('call-dismiss'))
    expect(closed).toBe(1)
  })
})

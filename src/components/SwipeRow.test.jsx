// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SwipeRow from './SwipeRow'

afterEach(cleanup)

function LocationEcho() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

function setup({ swipedControl = false } = {}) {
  const onOpen = vi.fn()
  const onClose = vi.fn()
  const onDelete = vi.fn()
  function Host() {
    const [swiped, setSwiped] = useState(swipedControl)
    return (
      <SwipeRow
        rowId="peer1"
        to="/chat/peer1"
        swiped={swiped}
        onOpen={() => {
          setSwiped(true)
          onOpen()
        }}
        onClose={() => {
          setSwiped(false)
          onClose()
        }}
        onDelete={onDelete}
      >
        <span>张三</span>
      </SwipeRow>
    )
  }
  render(
    <MemoryRouter initialEntries={['/']}>
      <LocationEcho />
      <Routes>
        <Route path="/" element={<Host />} />
        <Route path="/chat/peer1" element={<div>CHAT_DETAIL_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  const row = document.querySelector('[data-swipe-row="peer1"]')
  const link = row.querySelector('a')
  return { row, link, onOpen, onClose, onDelete }
}

const TOUCH_EVENTS = { touchstart: 'touchStart', touchmove: 'touchMove', touchend: 'touchEnd' }

function touch(el, type, x, y = 100) {
  fireEvent[TOUCH_EVENTS[type]](el, { touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] })
}

describe('SwipeRow 左滑删除', () => {
  it('左滑超过阈值吸附展开并触发 onOpen', () => {
    const { row, link, onOpen } = setup()
    touch(row, 'touchstart', 300)
    touch(row, 'touchmove', 250)
    expect(link.style.transform).toBe('translateX(-50px)')
    touch(row, 'touchend', 250)
    expect(link.style.transform).toBe('translateX(-72px)')
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('swipe-delete')).toBeTruthy()
  })

  it('滑动距离不够时松手弹回原位', () => {
    const { row, link, onOpen } = setup()
    touch(row, 'touchstart', 300)
    touch(row, 'touchmove', 280)
    touch(row, 'touchend', 280)
    expect(link.style.transform).toBe('translateX(0px)')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('纵向手势不触发横滑', () => {
    const { row, link, onOpen } = setup()
    touch(row, 'touchstart', 300, 100)
    touch(row, 'touchmove', 298, 200)
    touch(row, 'touchend', 298, 200)
    expect(link.style.transform).toBe('translateX(0px)')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('展开状态点击行体收回且不跳转', () => {
    const { row, link, onClose } = setup()
    touch(row, 'touchstart', 300)
    touch(row, 'touchmove', 230)
    touch(row, 'touchend', 230)
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('CHAT_DETAIL_PAGE')).toBeNull()
    expect(screen.getByTestId('loc').textContent).toBe('/')
  })

  it('收起状态点击行体正常进入聊天', () => {
    const { link } = setup()
    fireEvent.click(link)
    expect(screen.getByText('CHAT_DETAIL_PAGE')).toBeTruthy()
  })

  it('点击删除按钮触发 onDelete', () => {
    const { row, onDelete } = setup()
    touch(row, 'touchstart', 300)
    touch(row, 'touchmove', 230)
    touch(row, 'touchend', 230)
    fireEvent.click(screen.getByTestId('swipe-delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('左滑不能拖过极限位置', () => {
    const { row, link } = setup()
    touch(row, 'touchstart', 300)
    touch(row, 'touchmove', 100)
    expect(link.style.transform).toBe('translateX(-88px)')
  })

  it('初始即展开时渲染为吸附位置', () => {
    const { link } = setup({ swipedControl: true })
    expect(link.style.transform).toBe('translateX(-72px)')
  })
})

function setupLongPress({ pinned = false } = {}) {
  const onLongPress = vi.fn()
  render(
    <MemoryRouter initialEntries={['/']}>
      <LocationEcho />
      <Routes>
        <Route
          path="/"
          element={
            <SwipeRow rowId="peer1" to="/chat/peer1" swiped={false} onOpen={() => {}} onClose={() => {}} onDelete={() => {}} onLongPress={onLongPress} pinned={pinned}>
              <span>张三</span>
            </SwipeRow>
          }
        />
        <Route path="/chat/peer1" element={<div>CHAT_DETAIL_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { onLongPress }
}

const touchAt = (x, y) => ({ touches: [{ clientX: x, clientY: y }] })

describe('SwipeRow 长按与置顶', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('按住 500ms 触发长按', () => {
    vi.useFakeTimers()
    const { onLongPress } = setupLongPress()
    fireEvent.touchStart(screen.getByText('张三'), touchAt(300, 100))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('未满 500ms 松手不触发长按', () => {
    vi.useFakeTimers()
    const { onLongPress } = setupLongPress()
    fireEvent.touchStart(screen.getByText('张三'), touchAt(300, 100))
    vi.advanceTimersByTime(300)
    fireEvent.touchEnd(screen.getByText('张三'))
    vi.advanceTimersByTime(300)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('横向滑动取消长按计时', () => {
    vi.useFakeTimers()
    const { onLongPress } = setupLongPress()
    fireEvent.touchStart(screen.getByText('张三'), touchAt(300, 100))
    fireEvent.touchMove(screen.getByText('张三'), touchAt(280, 100))
    vi.advanceTimersByTime(600)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('桌面端右键菜单立即触发长按', () => {
    const { onLongPress } = setupLongPress()
    fireEvent.contextMenu(screen.getByText('张三'))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('长按触发后的点击不跳转', () => {
    const { onLongPress } = setupLongPress()
    fireEvent.contextMenu(screen.getByText('张三'))
    expect(onLongPress).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('张三'))
    expect(screen.getByTestId('loc').textContent).toBe('/')
  })

  it('置顶行渲染深色左侧条', () => {
    setupLongPress({ pinned: true })
    const link = screen.getByText('张三').closest('a')
    expect(link.className).toContain('border-eink-ink')
    expect(link.className).toContain('bg-[#E9E7DF]')
  })
})

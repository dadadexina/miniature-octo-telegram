// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useSwipeBack from './useSwipeBack'

const touch = (clientX, clientY) => ({ clientX, clientY })

function swipe(startX, startY, moveX, moveY) {
  fireEvent.touchStart(window, { touches: [touch(startX, startY)] })
  fireEvent.touchMove(window, { touches: [touch(moveX, moveY)] })
  fireEvent.touchEnd(window, { changedTouches: [touch(moveX, moveY)] })
}

afterEach(() => {
  fireEvent.touchCancel(window, { touches: [] })
})

describe('useSwipeBack', () => {
  it('从左边缘向右滑动触发返回', () => {
    const onBack = vi.fn()
    renderHook(() => useSwipeBack(onBack))
    swipe(5, 120, 90, 125)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('非边缘起手不触发', () => {
    const onBack = vi.fn()
    renderHook(() => useSwipeBack(onBack))
    swipe(120, 120, 260, 120)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('纵向滑动不触发返回', () => {
    const onBack = vi.fn()
    renderHook(() => useSwipeBack(onBack))
    swipe(5, 40, 40, 220)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('滑动距离不足不触发', () => {
    const onBack = vi.fn()
    renderHook(() => useSwipeBack(onBack))
    swipe(5, 80, 40, 82)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('禁用时不监听', () => {
    const onBack = vi.fn()
    renderHook(({ enabled }) => useSwipeBack(onBack, { enabled }), { initialProps: { enabled: false } })
    swipe(5, 120, 120, 120)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('卸载后移除监听', () => {
    const onBack = vi.fn()
    const { unmount } = renderHook(() => useSwipeBack(onBack))
    unmount()
    swipe(5, 120, 120, 120)
    expect(onBack).not.toHaveBeenCalled()
  })
})

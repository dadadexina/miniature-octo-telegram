// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useLongPress from './useLongPress'

function pointerEvent(overrides = {}) {
  const target = document.createElement('div')
  return { button: 0, clientX: 0, clientY: 0, target, ...overrides }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLongPress', () => {
  it('按住超过阈值触发长按', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 500 }))

    act(() => result.current.begin(pointerEvent(), 'm1'))
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).toHaveBeenCalledWith('m1')
    expect(result.current.consume()).toBe(true)
    expect(result.current.consume()).toBe(false)
  })

  it('按住时间不足不触发', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 500 }))

    act(() => result.current.begin(pointerEvent(), 'm1'))
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current.end())
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('移动超过容差会取消', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 500, moveTolerance: 10 }))

    act(() => result.current.begin(pointerEvent({ clientX: 10, clientY: 10 }), 'm1'))
    act(() => result.current.move({ clientX: 30, clientY: 10 }))
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('忽略按钮等交互元素与右键', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 500 }))

    const button = document.createElement('button')
    act(() => result.current.begin(pointerEvent({ target: button }), 'm1'))
    act(() => result.current.begin(pointerEvent({ button: 2 }), 'm1'))
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('长按后的短时间点击被抑制', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress, delay: 500 }))

    expect(result.current.isSuppressed()).toBe(false)
    act(() => result.current.begin(pointerEvent(), 'm1'))
    act(() => vi.advanceTimersByTime(500))
    expect(result.current.isSuppressed()).toBe(true)

    act(() => vi.advanceTimersByTime(400))
    expect(result.current.isSuppressed()).toBe(false)
  })

  it('右键菜单作为长按替代入口', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress({ onLongPress }))
    const preventDefault = vi.fn()

    act(() => result.current.contextMenu(pointerEvent({ preventDefault }), 'm1'))

    expect(preventDefault).toHaveBeenCalled()
    expect(onLongPress).toHaveBeenCalledWith('m1')
  })
})

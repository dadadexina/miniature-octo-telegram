// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadCoreRoutes, preloadRoute } from '../lib/routePreload'
import useRoutePreload from './useRoutePreload'

vi.mock('../lib/routePreload', () => ({
  preloadRoute: vi.fn(),
  preloadCoreRoutes: vi.fn(),
}))

function anchor(href) {
  const el = document.createElement('a')
  el.href = href
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('useRoutePreload', () => {
  it('悬停或按下站内链接时预加载目标路由', () => {
    const el = anchor('/chat/peer-1')
    renderHook(() => useRoutePreload(true))

    act(() => {
      el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })

    expect(preloadRoute).toHaveBeenCalledWith('/chat/peer-1')
  })

  it('忽略站外链接与新窗口链接', () => {
    const external = anchor('https://example.com/chat/peer-1')
    const blank = anchor('/chat/peer-2')
    blank.target = '_blank'
    renderHook(() => useRoutePreload(true))

    act(() => {
      external.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      blank.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })

    expect(preloadRoute).not.toHaveBeenCalled()
  })

  it('未登录等禁用场景不预加载', () => {
    const el = anchor('/contacts')
    renderHook(() => useRoutePreload(false))

    act(() => {
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })

    expect(preloadRoute).not.toHaveBeenCalled()
  })

  it('空闲时预加载核心路由', () => {
    vi.useFakeTimers()
    renderHook(() => useRoutePreload(true))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(preloadCoreRoutes).toHaveBeenCalledTimes(1)
  })
})

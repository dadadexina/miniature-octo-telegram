// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canGoBack, goBackOr } from './navigation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canGoBack', () => {
  it('应用内历史索引大于 0 时可返回', () => {
    expect(canGoBack({ idx: 1 })).toBe(true)
    expect(canGoBack({ idx: 3 })).toBe(true)
  })

  it('应用首条记录或缺少索引时回退到浏览器历史长度判断', () => {
    expect(canGoBack({ idx: 0 })).toBe(false)
    vi.stubGlobal('history', { state: {}, length: 1 })
    expect(canGoBack()).toBe(false)
    vi.stubGlobal('history', { state: {}, length: 3 })
    expect(canGoBack()).toBe(true)
  })
})

describe('goBackOr', () => {
  it('有应用内历史时后退一步', () => {
    vi.stubGlobal('history', { state: { idx: 2 }, length: 3 })
    const navigate = vi.fn()
    goBackOr(navigate, '/contacts')
    expect(navigate).toHaveBeenCalledWith(-1)
  })

  it('无历史时替换到兜底路由', () => {
    vi.stubGlobal('history', { state: { idx: 0 }, length: 1 })
    const navigate = vi.fn()
    goBackOr(navigate, '/contacts')
    expect(navigate).toHaveBeenCalledWith('/contacts', { replace: true })
  })

  it('允许关闭 replace', () => {
    vi.stubGlobal('history', { state: { idx: 0 }, length: 1 })
    const navigate = vi.fn()
    goBackOr(navigate, '/contacts', { replace: false })
    expect(navigate).toHaveBeenCalledWith('/contacts', { replace: false })
  })
})

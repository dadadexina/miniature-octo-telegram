// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/telemetry', () => ({
  captureError: vi.fn(() => Promise.resolve({ ok: true })),
}))

const { captureError } = await import('../lib/telemetry')
const ErrorBoundary = (await import('./ErrorBoundary')).default

function Boom() {
  throw new Error('测试异常')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    captureError.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <p>正常内容</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('正常内容')).toBeTruthy()
  })

  it('子组件抛错时展示恢复界面', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('页面出现了意外问题')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { kind: 'render' })
  })
})

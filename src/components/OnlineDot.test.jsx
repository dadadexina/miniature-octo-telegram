// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import OnlineDot from './OnlineDot'

afterEach(cleanup)

describe('OnlineDot', () => {
  it('在线时显示可访问的状态点', () => {
    render(<OnlineDot online />)
    expect(screen.getByTestId('online-dot').getAttribute('aria-label')).toBe('在线')
  })

  it('离线时不渲染', () => {
    render(<OnlineDot online={false} />)
    expect(screen.queryByTestId('online-dot')).toBeNull()
  })
})

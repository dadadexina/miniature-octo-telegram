// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LongTextBody from './LongTextBody'

afterEach(cleanup)

const SHORT = '短消息'
const LONG = '纸'.repeat(300)

describe('LongTextBody', () => {
  it('短文本原样渲染,无展开按钮', () => {
    render(<LongTextBody text={SHORT} />)
    expect(screen.getByText(SHORT)).toBeTruthy()
    expect(screen.queryByTestId('long-text-toggle')).toBeNull()
    expect(screen.queryByTestId('long-text-preview')).toBeNull()
  })

  it('长文本折叠为预览并显示展开按钮', () => {
    render(<LongTextBody text={LONG} />)
    const preview = screen.getByTestId('long-text-preview')
    expect(preview.textContent.endsWith('…')).toBe(true)
    expect(preview.textContent.length).toBeLessThan(LONG.length)
    expect(screen.getByTestId('long-text-toggle').textContent).toContain('展开全文 · 共 300 字')
  })

  it('点击展开全文,再点击收起', () => {
    render(<LongTextBody text={LONG} />)
    fireEvent.click(screen.getByTestId('long-text-toggle'))
    expect(screen.getByTestId('long-text-full').textContent).toBe(LONG)
    expect(screen.getByTestId('long-text-toggle').textContent).toBe('收起')
    fireEvent.click(screen.getByTestId('long-text-toggle'))
    expect(screen.getByTestId('long-text-preview')).toBeTruthy()
  })

  it('点击按钮不冒泡(不触发气泡 onClick)', () => {
    let bubbleTapped = false
    render(
      <div onClick={() => { bubbleTapped = true }}>
        <LongTextBody text={LONG} />
      </div>
    )
    fireEvent.click(screen.getByTestId('long-text-toggle'))
    expect(bubbleTapped).toBe(false)
  })

  it('空文本渲染为空且无按钮', () => {
    const { container } = render(<LongTextBody text="" />)
    expect(container.textContent).toBe('')
    expect(screen.queryByTestId('long-text-toggle')).toBeNull()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ImageViewer from './ImageViewer'

afterEach(cleanup)

function scaleOf(el) {
  const match = /scale\(([^)]+)\)/.exec(el.style.transform || '')
  return Number(match?.[1])
}

describe('ImageViewer 缩放查看器', () => {
  it('展示原图并支持关闭按钮', () => {
    const onClose = vi.fn()
    render(<ImageViewer url="https://example.com/a.jpg" onClose={onClose} />)
    expect(screen.getByTestId('image-viewer-img').getAttribute('src')).toBe('https://example.com/a.jpg')
    fireEvent.click(screen.getByTestId('image-viewer-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击空白关闭,点击图片不关闭', () => {
    const onClose = vi.fn()
    render(<ImageViewer url="https://example.com/a.jpg" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('image-viewer-img'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('image-viewer'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('双击在原始与放大之间切换', () => {
    render(<ImageViewer url="https://example.com/a.jpg" onClose={() => {}} />)
    const img = screen.getByTestId('image-viewer-img')
    expect(scaleOf(img)).toBe(1)
    fireEvent.doubleClick(img)
    expect(scaleOf(img)).toBeGreaterThan(1)
    fireEvent.doubleClick(img)
    expect(scaleOf(img)).toBe(1)
  })

  it('双指拉开放大、捏合缩小', () => {
    render(<ImageViewer url="https://example.com/a.jpg" onClose={() => {}} />)
    const overlay = screen.getByTestId('image-viewer')
    const img = screen.getByTestId('image-viewer-img')

    fireEvent.touchStart(overlay, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
    })
    fireEvent.touchMove(overlay, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 200, clientY: 0 },
      ],
    })
    expect(scaleOf(img)).toBeCloseTo(2, 1)

    fireEvent.touchStart(overlay, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 200, clientY: 0 },
      ],
    })
    fireEvent.touchMove(overlay, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
    })
    expect(scaleOf(img)).toBeCloseTo(1, 1)
    fireEvent.touchEnd(overlay, { touches: [] })
  })

  it('滚轮放大并限制最大倍数', () => {
    render(<ImageViewer url="https://example.com/a.jpg" onClose={() => {}} />)
    const overlay = screen.getByTestId('image-viewer')
    const img = screen.getByTestId('image-viewer-img')
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(overlay, { deltaY: -100 })
    expect(scaleOf(img)).toBeLessThanOrEqual(5)
  })

  it('按 Escape 关闭', () => {
    const onClose = vi.fn()
    render(<ImageViewer url="https://example.com/a.jpg" onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

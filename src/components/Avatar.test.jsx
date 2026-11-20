// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Avatar from './Avatar'

afterEach(cleanup)

describe('Avatar', () => {
  it('显示名称首字', () => {
    render(<Avatar name="小明" />)
    expect(screen.getByText('小')).toBeTruthy()
  })

  it('空名称显示问号', () => {
    render(<Avatar name="" />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('徽标数小于等于 99 原样显示', () => {
    render(<Avatar name="阿" badge={5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('徽标数超过 99 封顶为 99+', () => {
    render(<Avatar name="阿" badge={120} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('有 src 时渲染图片并附灰度滤镜', () => {
    const { container } = render(<Avatar name="小明" src="https://x/a.jpg" />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://x/a.jpg')
    expect(img.getAttribute('alt')).toBe('小明')
    expect(screen.queryByText('小')).toBeNull()
  })

  it('图片加载失败回退到首字', () => {
    const { container } = render(<Avatar name="小明" src="https://x/broken.jpg" />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('小')).toBeTruthy()
  })

  it('src 切换后重置失败态', () => {
    const { container, rerender } = render(<Avatar name="小明" src="https://x/a.jpg" />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    rerender(<Avatar name="小明" src="https://x/b.jpg" />)
    expect(container.querySelector('img')).toBeTruthy()
  })

  it('空 src 不渲染图片', () => {
    const { container } = render(<Avatar name="小明" src="" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('小')).toBeTruthy()
  })
})

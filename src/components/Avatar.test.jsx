// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
})

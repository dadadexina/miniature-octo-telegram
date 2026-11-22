// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportSheet from './ReportSheet'

afterEach(cleanup)

describe('ReportSheet', () => {
  it('未选原因时不能提交', () => {
    render(<ReportSheet onClose={() => {}} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('report-submit').disabled).toBe(true)
    fireEvent.click(screen.getByTestId('report-reason-spam'))
    expect(screen.getByTestId('report-submit').disabled).toBe(false)
  })

  it('提交原因与补充说明并关闭', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue({ ok: true })
    render(<ReportSheet onClose={onClose} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('report-reason-harassment'))
    fireEvent.change(screen.getByTestId('report-detail'), { target: { value: '持续辱骂' } })
    fireEvent.click(screen.getByTestId('report-submit'))
    expect(onSubmit).toHaveBeenCalledWith('harassment', '持续辱骂')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('提交失败时展示错误且不关闭', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: '网络异常' })
    render(<ReportSheet onClose={onClose} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('report-reason-other'))
    fireEvent.click(screen.getByTestId('report-submit'))
    expect((await screen.findByTestId('report-error')).textContent).toBe('网络异常')
    expect(onClose).not.toHaveBeenCalled()
  })
})

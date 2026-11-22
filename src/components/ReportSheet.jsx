import { useState } from 'react'
import { REPORT_REASONS } from '../lib/reports'

export default function ReportSheet({ title, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!reason || busy) return
    setBusy(true)
    setError('')
    const result = await onSubmit(reason, detail)
    setBusy(false)
    if (!result?.ok) {
      setError(result?.error || '提交失败，请稍后再试')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => !busy && onClose()}>
      <form
        data-testid="report-sheet"
        className="safe-bottom w-full border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="mb-1 flex items-center justify-between">
          <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={onClose} disabled={busy}>
            取消
          </button>
          <span className="text-[16px] font-medium">举报</span>
          <button
            type="submit"
            data-testid="report-submit"
            className="px-1 text-[15px] font-medium text-eink-ink disabled:opacity-40"
            disabled={!reason || busy}
          >
            {busy ? '提交中...' : '提交'}
          </button>
        </div>
        <p className="mb-3 text-[12px] text-eink-sub">{title || '请选择举报原因，我们会尽快核实处理。'}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {REPORT_REASONS.map((item) => (
            <button
              key={item.value}
              type="button"
              data-testid={`report-reason-${item.value}`}
              aria-pressed={reason === item.value}
              className={`border px-3 py-1.5 text-[13px] ${
                reason === item.value
                  ? 'border-eink-ink bg-eink-ink text-eink-paper'
                  : 'border-eink-divider bg-eink-surface text-eink-sub'
              }`}
              onClick={() => {
                setReason(item.value)
                setError('')
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <textarea
          data-testid="report-detail"
          className="h-20 w-full resize-none border border-eink-divider bg-eink-paper p-2 text-[14px] outline-none"
          placeholder="补充说明（选填，最多 500 字）"
          maxLength={500}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
        {error ? (
          <p data-testid="report-error" className="mt-2 text-[13px] font-medium text-[#8C2F22]">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}

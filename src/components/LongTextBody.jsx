import { useState } from 'react'

import { splitLongText } from '../lib/longText'

export default function LongTextBody({ text }) {
  const [open, setOpen] = useState(false)
  const info = splitLongText(text)

  if (!info.isLong) return <>{text}</>

  return (
    <span className="block">
      <span
        data-testid={open ? 'long-text-full' : 'long-text-preview'}
        className="whitespace-pre-wrap"
      >
        {open ? text : `${info.preview}…`}
      </span>
      <button
        type="button"
        data-testid="long-text-toggle"
        className="mt-1.5 block w-full text-center text-[12px] underline opacity-75"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {open ? '收起' : `展开全文 · 共 ${info.length} 字`}
      </button>
    </span>
  )
}

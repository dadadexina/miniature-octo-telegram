import { useState } from 'react'
import { CLOUD_SQL, SQL_EDITOR_URL } from '../lib/sql'

export default function CopySql({ compact = false }) {
  const [copied, setCopied] = useState(false)

  // 生产构建不暴露数据库脚本入口；仅开发/预览环境显示
  if (!import.meta.env.DEV) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CLOUD_SQL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  if (compact) {
    return (
      <p className="px-4 py-2 text-center text-[12px] leading-5 text-eink-sub">
        云端权限未开。到【我的】复制 SQL，或
        <a className="font-medium text-eink-ink underline underline-offset-2" href={SQL_EDITOR_URL} target="_blank" rel="noreferrer">
          打开 SQL Editor
        </a>
      </p>
    )
  }

  return (
    <section className="mt-3 border-y border-eink-divider bg-eink-bar px-4 py-4">
      <div className="text-[16px]">云端权限</div>
      <p className="mt-2 text-[12px] leading-5 text-eink-sub">
        把下面 SQL 贴到 Supabase SQL Editor 跑一次，资料、好友和聊天就能写入云端。
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="h-9 rounded-none bg-eink-ink px-3 text-[13px] text-eink-paper active:bg-eink-pressed"
          onClick={copy}
        >
          {copied ? '已复制' : '复制 SQL'}
        </button>
        <a
          className="flex h-9 items-center rounded-none border border-eink-divider bg-eink-surface px-3 text-[13px] text-eink-ink"
          href={SQL_EDITOR_URL}
          target="_blank"
          rel="noreferrer"
        >
          打开 SQL Editor
        </a>
      </div>
      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-none border border-eink-divider bg-eink-surface p-3 text-[11px] leading-4 text-eink-sub">
        {CLOUD_SQL}
      </pre>
    </section>
  )
}

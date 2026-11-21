import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'

const ITEMS = [
  { title: '通知', desc: '新消息提醒、声音与震动设置' },
  { title: '界面显示', desc: '深色模式、字体大小调整' },
  { title: '账号安全', desc: '修改密码、注销账号' },
]

export default function Settings() {
  const navigate = useNavigate()
  const [toast, setToast] = useState('')
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const showDeveloping = () => {
    setToast('该功能正在开发中，敬请期待')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(''), 1800)
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar
        title="设置"
        left={
          <button
            type="button"
            className="-ml-1 flex h-9 w-9 items-center justify-start"
            onClick={() => navigate('/me')}
            aria-label="返回"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14.5 6 9 12l5.5 6" stroke="#191919" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="mt-3 border-y border-eink-divider bg-eink-bar" data-testid="settings-list">
          {ITEMS.map((item, index) => (
            <li key={item.title} className={index ? 'border-t border-eink-divider' : ''}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-[#E7E5DD]"
                onClick={showDeveloping}
                data-testid={`settings-item-${index}`}
              >
                <span className="min-w-0">
                  <span className="block text-[16px] text-eink-text">{item.title}</span>
                  <span className="mt-0.5 block text-[12px] text-eink-sub">{item.desc}</span>
                </span>
                <span className="ml-3 shrink-0 text-[18px] text-eink-faint">›</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center" role="status">
          <span className="bg-eink-ink px-4 py-2 text-[13px] text-eink-paper">{toast}</span>
        </div>
      ) : null}
    </div>
  )
}

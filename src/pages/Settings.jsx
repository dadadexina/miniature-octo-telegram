import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'

const ITEMS = [
  { title: '通知', desc: '新消息提醒、声音与震动设置' },
  { title: '界面显示', desc: '深色模式、字体大小调整' },
  { title: '账号安全', desc: '修改密码、注销账号' },
]

export default function Settings() {
  const navigate = useNavigate()
  const [notice, setNotice] = useState(false)

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
                onClick={() => setNotice(true)}
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

      {notice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8"
          role="dialog"
          aria-modal="true"
          onClick={() => setNotice(false)}
        >
          <div
            className="w-full max-w-[280px] border border-eink-divider bg-eink-paper px-5 pb-4 pt-5 text-center"
            data-testid="settings-notice"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[14px] leading-6 text-eink-text">该功能正在开发中，敬请期待</p>
            <button
              type="button"
              className="mt-4 h-10 w-full bg-eink-ink text-[14px] text-eink-paper active:bg-eink-pressed"
              onClick={() => setNotice(false)}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

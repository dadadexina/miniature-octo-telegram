import { NavLink } from 'react-router-dom'
import { useStore } from '../store'

const tabs = [
  { to: '/chats', label: '消息', icon: ChatIcon },
  { to: '/contacts', label: '通讯录', icon: ContactIcon },
  { to: '/discover', label: '发现', icon: DiscoverIcon },
  { to: '/me', label: '我的', icon: MeIcon },
]

function ChatIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 3.2V6.5Z"
        stroke={active ? '#191919' : '#8A8A85'}
        strokeWidth="1.7"
        fill={active ? '#191919' : 'none'}
      />
    </svg>
  )
}

function ContactIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.2" stroke={active ? '#191919' : '#8A8A85'} strokeWidth="1.7" fill={active ? '#191919' : 'none'} />
      <path
        d="M5.5 18.5c.8-3 3.3-4.6 6.5-4.6s5.7 1.6 6.5 4.6"
        stroke={active ? '#191919' : '#8A8A85'}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MeIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8.2" r="3" stroke={active ? '#191919' : '#8A8A85'} strokeWidth="1.7" fill={active ? '#191919' : 'none'} />
      <path
        d="M6 18.2c.7-2.8 3-4.3 6-4.3s5.3 1.5 6 4.3"
        stroke={active ? '#191919' : '#8A8A85'}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DiscoverIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke={active ? '#191919' : '#8A8A85'} strokeWidth="1.7" />
      <path
        d="M9.2 14.8 10.6 10.6 14.8 9.2 13.4 13.4 9.2 14.8Z"
        fill={active ? '#191919' : '#8A8A85'}
      />
    </svg>
  )
}

export default function TabBar() {
  const { unreadTotal } = useStore()
  const total = unreadTotal()
  return (
    <nav className="safe-bottom shrink-0 border-t border-eink-divider bg-eink-bar">
      <div className="grid h-[52px] grid-cols-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center justify-center gap-0.5"
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <tab.icon active={isActive} />
                  {tab.to === '/chats' && total ? (
                    <span className="absolute -right-2 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-eink-ink px-1 text-[10px] leading-none text-eink-paper">
                      {total > 99 ? '99+' : total}
                    </span>
                  ) : null}
                </span>
                <span className={`text-[10px] ${isActive ? 'text-eink-ink font-medium' : 'text-eink-sub'}`}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

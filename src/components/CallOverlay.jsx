import Avatar from './Avatar'

const STATUS_TEXT = {
  audio: {
    calling: '正在呼叫对方...',
    connected: '通话中',
  },
  video: {
    calling: '视频呼叫中...',
    connected: '视频通话中',
  },
}

export default function CallOverlay({ kind = 'audio', state = 'calling', peer, color, onHangup }) {
  const texts = STATUS_TEXT[kind] || STATUS_TEXT.audio
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-eink-ink/95 text-eink-paper">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
        <div className="ring-1 ring-eink-paper/40">
          <Avatar name={peer?.nickname || '用户'} color={color || '#4A4A4A'} size={88} src={peer?.avatarUrl || ''} />
        </div>
        <div className="text-[20px] font-medium">{peer?.nickname || '用户'}</div>
        <div className="text-[14px] text-eink-paper/70">{texts[state] || texts.calling}</div>
        <div data-testid="call-demo-badge" className="border border-eink-paper/40 px-2 py-0.5 text-[12px] text-eink-paper/70">
          演示功能 · 不会真实接通
        </div>
      </div>
      <div className="pb-10">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onHangup}
            aria-label="挂断"
            className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-eink-paper active:bg-white"
          >
            <HangupIcon />
          </button>
          <span className="text-[13px] text-eink-paper/70">挂断</span>
        </div>
      </div>
    </div>
  )
}

function HangupIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 9.5C4 7.2 6.8 5.7 10 5.5c.5 0 .9.3 1 .8l.4 2c.1.5-.2 1-.7 1.1l-1.6.5c-.3.1-.5.3-.6.6-.2.7-.1 1.4.1 2 .1.3.1.7-.2.9L7 14.6c-.4.3-.9.3-1.2-.1-1.1-1.4-1.5-3.2-1.2-5l1.9-.1ZM13.2 12.4l1.9-1.9 2.2 2.2 1.9-1.9a.9.9 0 0 1 1.3 0l1.4 1.4a.9.9 0 0 1 0 1.3l-2.6 2.6c-2.3 2.3-5.8 2.7-8.6 1.3"
        stroke="#191919"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19.8 15.8 15.8 19.8" stroke="#191919" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

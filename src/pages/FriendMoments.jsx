import { useNavigate, useParams } from 'react-router-dom'
import NavBar from '../components/NavBar'
import { useStore } from '../store'

export default function FriendMoments() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { getUser } = useStore()
  const friend = getUser(userId)

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="朋友圈" left={<Back onClick={() => navigate(`/friend/${userId}`)} />} />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-[15px] text-[#191919]">
          {friend?.nickname ? `「${friend.nickname}」的朋友圈` : '该好友的朋友圈'}
        </p>
        <p className="mt-2 text-[13px] leading-6 text-eink-sub">按好友查看的朋友圈列表建设中，敬请期待</p>
        <p data-testid="moments-user-id" className="mt-1 text-[12px] text-eink-faint">
          userId: {userId}
        </p>
      </div>
    </div>
  )
}

function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="#191919" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

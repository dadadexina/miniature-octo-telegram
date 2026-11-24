import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import OnlineDot from '../components/OnlineDot'
import useSwipeBack from '../hooks/useSwipeBack'
import { REMARK_MAX, normalizeRemark } from '../lib/friends'
import { goBackOr } from '../lib/navigation'
import {
  addSourceLabel,
  formatRegistrationDate,
  genderLabel,
  registrationDays,
} from '../lib/profileMeta'
import { fetchProfileById } from '../lib/profiles'
import { useCallCenter } from '../lib/callContext'
import { useStore } from '../store'

export default function FriendProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { currentUser, getUser, avatarColor, friendMetaOf, displayNameOf, setFriendRemark, sendKnock } = useStore()
  const { onlineIds } = useCallCenter()
  const cached = getUser(userId)
  const meta = friendMetaOf(currentUser?.id, userId)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingFor, setEditingFor] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [remarkSaving, setRemarkSaving] = useState(false)
  const [remarkHint, setRemarkHint] = useState('')
  const [knockBusy, setKnockBusy] = useState(false)
  const [knockHint, setKnockHint] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchProfileById(userId).then((res) => {
      if (!alive) return
      setLoading(false)
      if (res.ok && res.profile) {
        setProfile(res.profile)
        return
      }
      setError(res.error || '读取资料失败')
    })
    return () => {
      alive = false
    }
  }, [userId])

  const info = profile
    ? {
        nickname: profile.nickname,
        publicId: profile.username,
        avatarUrl: profile.avatarUrl || '',
        gender: profile.gender,
        createdAt: profile.createdAt,
      }
    : cached
      ? {
          nickname: cached.nickname,
          publicId: cached.publicId || cached.username || '',
          avatarUrl: cached.avatarUrl || '',
          gender: cached.gender,
          createdAt: cached.createdAt,
        }
      : null

  const goBack = () => {
    goBackOr(navigate, '/contacts')
  }

  useSwipeBack(goBack)

  const originalName = info?.nickname || '用户'
  const editingRemark = editingFor === userId
  const heading = meta?.remark || displayNameOf(userId) || originalName
  const days = registrationDays(info?.createdAt)
  const friendSince = meta?.createdAt
    ? `${formatRegistrationDate(meta.createdAt)} · ${addSourceLabel(meta.source)}`
    : '未知'

  const openRemark = () => {
    setRemarkDraft(meta?.remark || '')
    setRemarkHint('')
    setEditingFor(userId)
  }

  const onKnock = async () => {
    if (knockBusy || !meta) return
    setKnockBusy(true)
    setKnockHint('')
    const result = await sendKnock(userId)
    setKnockBusy(false)
    setKnockHint(result.ok ? `已敲了敲 ${heading}` : result.error || '敲一敲失败')
  }

  const submitRemark = async (e) => {
    e.preventDefault()
    if (remarkSaving) return
    setRemarkSaving(true)
    const result = await setFriendRemark(userId, normalizeRemark(remarkDraft))
    setRemarkSaving(false)
    if (!result.ok) {
      setRemarkHint(result.error || '保存备注失败')
      return
    }
    setRemarkHint(result.localOnly ? result.error || '备注已保存到本机' : '')
    setEditingFor('')
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title="个人资料" left={<Back onClick={goBack} />} />

      {info ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar">
          <div className="flex flex-col items-center px-6 pb-2 pt-10">
            <Avatar name={heading} color={avatarColor(userId)} size={88} src={info.avatarUrl} />
            <h2 data-testid="friend-nickname" className="mt-4 text-center text-[22px] font-medium text-[#191919]">
              {heading}
            </h2>
            {meta && onlineIds.has(userId) ? (
              <p data-testid="friend-online" className="mt-1 flex items-center gap-1 text-[11px] text-eink-sub">
                <OnlineDot online />
                在线
              </p>
            ) : null}
            {meta?.remark ? (
              <p data-testid="friend-original-nickname" className="mt-1 text-center text-[12px] text-eink-faint">
                昵称：{originalName}
              </p>
            ) : null}
            <p data-testid="friend-id" className="mt-1.5 text-center text-[13px] text-eink-faint">
              ID: {info.publicId || '未设置'}
            </p>
          </div>

          <div className="mt-8 border-y border-eink-divider bg-eink-paper">
            <div className="flex min-h-[52px] items-center gap-3 border-b border-eink-divider px-4 py-3">
              <span className="shrink-0 text-[15px] text-eink-sub">备注</span>
              {editingRemark ? (
                <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={submitRemark}>
                  <input
                    data-testid="friend-remark-input"
                    className="h-9 min-w-0 flex-1 border border-eink-line/30 bg-eink-bar px-2 text-[15px] outline-none"
                    maxLength={REMARK_MAX}
                    placeholder="输入备注（最多 20 字）"
                    value={remarkDraft}
                    onChange={(e) => setRemarkDraft(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    data-testid="friend-remark-save"
                    disabled={remarkSaving}
                    className="shrink-0 bg-eink-ink px-3 py-1.5 text-[13px] text-eink-paper disabled:bg-eink-disabled"
                  >
                    {remarkSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    data-testid="friend-remark-cancel"
                    className="shrink-0 text-[13px] text-eink-sub"
                    onClick={() => setEditingFor('')}
                  >
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-eink-text">
                    {meta?.remark || '未设置'}
                  </span>
                  <button
                    type="button"
                    data-testid="friend-remark-edit"
                    className="shrink-0 text-[13px] text-eink-ink underline underline-offset-2"
                    onClick={openRemark}
                  >
                    修改
                  </button>
                </>
              )}
            </div>

            <InfoRow label="性别" value={genderLabel(info.gender)} testId="friend-gender" />
            <InfoRow label="来纸墨" value={days ? `${days} 天` : '未知'} testId="friend-days" />
            <InfoRow label="加好友" value={friendSince} testId="friend-since" />

            {remarkHint ? (
              <p
                data-testid="friend-remark-hint"
                className="border-t border-eink-divider px-4 py-2 text-[12px] leading-5 text-eink-sub"
              >
                {remarkHint}
              </p>
            ) : null}

            <button
              type="button"
              data-testid="friend-moments-entry"
              className="flex w-full items-center justify-between border-t border-eink-divider px-4 py-3.5 text-left active:bg-[#E7E5DD]"
              onClick={() => navigate(`/friend/${userId}/moments`)}
            >
              <span className="text-[15px] text-[#191919]">朋友圈</span>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
                <path d="M1 1l6 6-6 6" stroke="#9A9A94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {loading ? <p className="mt-3 text-center text-[12px] text-eink-faint">正在同步最新资料...</p> : null}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-[14px] text-eink-sub">正在读取资料...</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-[14px] text-eink-sub">无法读取该用户的资料</p>
          {error ? <p className="text-[12px] text-eink-faint">{error}</p> : null}
        </div>
      )}

      <div className="shrink-0 border-t border-eink-divider bg-eink-bar p-4 safe-bottom">
        {meta ? (
          <div className="space-y-2">
            {knockHint ? (
              <p data-testid="knock-hint" className="text-center text-[11px] text-eink-faint">
                {knockHint}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="knock-btn"
                disabled={knockBusy || !userId}
                className="h-12 rounded-none border border-eink-line/40 bg-eink-bar text-[15px] font-medium text-eink-ink active:bg-eink-pressed disabled:text-eink-disabled"
                onClick={onKnock}
              >
                {knockBusy ? '敲响中...' : '敲一敲'}
              </button>
              <button
                type="button"
                data-testid="send-message-btn"
                disabled={!userId}
                className="h-12 rounded-none bg-eink-ink text-[16px] font-medium text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
                onClick={() => navigate(`/chat/${userId}`)}
              >
                发送信息
              </button>
            </div>
          </div>
        ) : info ? (
          <p data-testid="not-friend-hint" className="text-center text-[13px] leading-5 text-eink-sub">
            你们还不是好友，无法发送消息
          </p>
        ) : null}
      </div>
    </div>
  )
}

function InfoRow({ label, value, testId }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 border-b border-eink-divider px-4 py-3">
      <span className="shrink-0 text-[15px] text-eink-sub">{label}</span>
      <span data-testid={testId} className="min-w-0 flex-1 text-right text-[14px] text-eink-text">
        {value}
      </span>
    </div>
  )
}

function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

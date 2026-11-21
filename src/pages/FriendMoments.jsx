import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import MomentCover from '../components/MomentCover'
import NavBar from '../components/NavBar'
import { fetchProfilesByIds } from '../lib/profiles'
import { isUuid } from '../lib/messages'
import {
  addMomentComment,
  deleteMomentComment,
  fetchMomentInteractions,
  fetchMoments,
  likeMoment,
  unlikeMoment,
} from '../lib/moments'
import { useStore } from '../store'
import { formatRelativeTime } from '../utils'

export default function FriendMoments() {
  const { currentUser } = useStore()
  if (!currentUser) return null
  return isUuid(currentUser.id) ? <CloudFriendMoments /> : <LocalFriendMoments />
}

function CloudFriendMoments() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { currentUser, profile, avatarColor, getUser, upsertUsers, syncTick } = useStore()
  const meId = currentUser.id
  const meName = profile?.nickname || currentUser.nickname
  const friend = getUser(userId)
  const friendName = friend?.nickname || '好友'

  const [feed, setFeed] = useState([])
  const [likes, setLikes] = useState([])
  const [comments, setComments] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [oldestAt, setOldestAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [commentText, setCommentText] = useState({})
  const hydratedRef = useRef(new Set())

  const hydrateUsers = useCallback(
    async (ids) => {
      const missing = [...new Set((ids || []).filter((id) => id && !hydratedRef.current.has(id) && !getUser(id)))]
      if (!missing.length) return
      missing.forEach((id) => hydratedRef.current.add(id))
      const res = await fetchProfilesByIds(missing)
      if (res.ok && res.profiles?.length) {
        upsertUsers(
          res.profiles.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            publicId: p.username,
            avatarUrl: p.avatarUrl || '',
          }))
        )
      }
    },
    [getUser, upsertUsers]
  )

  const load = useCallback(
    async ({ append = false, before = null } = {}) => {
      setBusy(true)
      const res = await fetchMoments({ authorId: userId, before })
      if (!res.ok) {
        setBusy(false)
        setLoading(false)
        setDenied(Boolean(res.permission))
        setError(res.permission ? '' : res.error || '读取动态失败')
        return
      }
      setDenied(false)
      setFeed((prev) =>
        append ? [...prev, ...res.moments.filter((m) => !prev.some((x) => x.id === m.id))] : res.moments
      )
      setHasMore(res.hasMore)
      if (res.oldest) setOldestAt(res.oldest)
      const ids = res.moments.map((m) => m.id)
      if (ids.length) {
        const inter = await fetchMomentInteractions(ids)
        if (inter.ok) {
          setLikes((prev) => (append ? [...prev, ...inter.likes] : inter.likes))
          setComments((prev) => (append ? [...prev, ...inter.comments] : inter.comments))
        }
        await hydrateUsers(inter.ok ? inter.comments.map((c) => c.userId).concat(inter.likes.map((l) => l.userId)) : [])
      } else if (!append) {
        setLikes([])
        setComments([])
      }
      setBusy(false)
      setLoading(false)
      setError('')
    },
    [userId, hydrateUsers]
  )

  useEffect(() => {
    setLoading(true)
    load()
  }, [userId, syncTick])

  useEffect(() => {
    if (friend || !userId) return
    const res = { cancel: false }
    fetchProfilesByIds([userId]).then((r) => {
      if (res.cancel) return
      if (r.ok && r.profiles?.length) {
        const p = r.profiles[0]
        upsertUsers([{ id: p.id, nickname: p.nickname, publicId: p.username, avatarUrl: p.avatarUrl || '' }])
      }
    })
    return () => {
      res.cancel = true
    }
  }, [userId, friend, upsertUsers])

  const nameOf = (id) => {
    if (id === meId) return meName
    return getUser(id)?.nickname || '用户'
  }

  const toggleLike = async (moment) => {
    const liked = likes.some((l) => l.momentId === moment.id && l.userId === meId)
    if (liked) {
      setLikes((prev) => prev.filter((l) => !(l.momentId === moment.id && l.userId === meId)))
      const res = await unlikeMoment(moment.id, meId)
      if (!res.ok) {
        setError(res.error || '操作失败')
        await load()
      }
      return
    }
    setLikes((prev) => [...prev, { momentId: moment.id, userId: meId }])
    const res = await likeMoment(moment.id, meId)
    if (!res.ok) {
      setError(res.error || '操作失败')
      await load()
    }
  }

  const submitComment = async (momentId, e) => {
    e.preventDefault()
    const content = (commentText[momentId] || '').trim()
    if (!content) return
    const res = await addMomentComment({ momentId, userId: meId, content })
    if (!res.ok) {
      setError(res.error || '评论失败')
      return
    }
    setComments((prev) => [...prev, res.comment])
    setCommentText((prev) => ({ ...prev, [momentId]: '' }))
  }

  const removeComment = async (comment) => {
    setComments((prev) => prev.filter((c) => c.id !== comment.id))
    const res = await deleteMomentComment(comment.id)
    if (!res.ok) {
      setError(res.error || '删除失败')
      await load()
    }
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar
        title={`${friendName}的朋友圈`}
        left={<Back onClick={() => navigate(`/friend/${userId}`)} />}
        right={
          <button
            type="button"
            className="text-[13px] text-eink-sub disabled:opacity-50"
            onClick={() => load()}
            disabled={busy}
            data-testid="friend-moments-refresh"
          >
            {busy ? '...' : '刷新'}
          </button>
        }
      />
      <div data-testid="moments-user-id" className="hidden">{userId}</div>
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <MomentCover
          userId={userId}
          name={friendName}
          avatarSrc={friend?.avatarUrl || ''}
          avatarColor={avatarColor(userId)}
          profileHref={`/friend/${userId}`}
        />
        <div className="h-20" />

        {error ? <p data-testid="friend-moments-error" className="px-4 py-2 text-[12px] text-eink-sub">{error}</p> : null}

        {loading ? (
          <p className="px-6 py-12 text-center text-[14px] text-eink-sub">正在读取动态...</p>
        ) : denied ? (
          <p data-testid="friend-moments-denied" className="px-6 py-12 text-center text-[14px] text-eink-sub">
            暂无法查看对方的动态
          </p>
        ) : feed.length === 0 ? (
          <p data-testid="friend-moments-empty" className="px-6 py-12 text-center text-[14px] text-eink-sub">
            对方还没有发布动态
          </p>
        ) : (
          feed.map((moment) => {
            const momentLikes = likes.filter((l) => l.momentId === moment.id)
            const momentComments = comments.filter((c) => c.momentId === moment.id)
            const liked = momentLikes.some((l) => l.userId === meId)
            const canDeleteComment = (c) => c.userId === meId
            return (
              <article
                key={moment.id}
                data-testid="friend-moment-item"
                className="flex gap-3 border-b border-eink-divider px-3 py-3.5"
              >
                <Avatar name={friendName} color={avatarColor(userId)} size={42} src={friend?.avatarUrl || ''} />
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-[15px] font-medium text-eink-ink">{nameOf(moment.authorId)}</div>
                  {moment.content ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[#191919]">
                      {moment.content}
                    </p>
                  ) : null}
                  {moment.imageUrl ? (
                    <img
                      data-testid="friend-moment-image"
                      src={moment.imageUrl}
                      alt="动态图片"
                      loading="lazy"
                      className="mt-2 max-h-[320px] w-auto max-w-[240px] border border-eink-divider object-cover"
                      style={{ filter: 'grayscale(1) contrast(1.05)' }}
                    />
                  ) : null}
                  <div className="mt-2.5 flex items-center gap-3 text-[12px] text-eink-faint">
                    <span>{formatRelativeTime(moment.createdAt)}</span>
                    <button
                      type="button"
                      data-testid="fm-like-btn"
                      className={`font-medium ${liked ? 'text-eink-ink underline underline-offset-2' : 'text-eink-sub'}`}
                      onClick={() => toggleLike(moment)}
                    >
                      {liked ? '取消赞' : '赞'}
                      {momentLikes.length ? ` ${momentLikes.length}` : ''}
                    </button>
                    <button
                      type="button"
                      data-testid="fm-comment-btn"
                      className="font-medium text-eink-sub"
                      onClick={() => setExpanded((prev) => ({ ...prev, [moment.id]: !prev[moment.id] }))}
                    >
                      评论{momentComments.length ? ` ${momentComments.length}` : ''}
                    </button>
                  </div>
                  {momentLikes.length ? (
                    <div className="mt-1.5 border-t border-eink-divider pt-1.5 text-[12px] leading-5 text-eink-sub">
                      赞：{momentLikes.map((l) => nameOf(l.userId)).join('，')}
                    </div>
                  ) : null}
                  {momentComments.map((c) => (
                    <div key={c.id} data-testid="fm-comment" className="mt-1 text-[13px] leading-5 text-[#191919]">
                      <span className="font-medium text-eink-sub">{nameOf(c.userId)}</span>
                      <span className="text-eink-faint">：</span>
                      <span className="break-words">{c.content}</span>
                      {canDeleteComment(c) ? (
                        <button
                          type="button"
                          className="ml-2 text-[12px] text-eink-faint underline underline-offset-2"
                          onClick={() => removeComment(c)}
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {expanded[moment.id] ? (
                    <form className="mt-2 flex items-center gap-2" onSubmit={(e) => submitComment(moment.id, e)}>
                      <input
                        className="h-8 min-w-0 flex-1 border border-eink-line/25 bg-eink-bar px-2 text-[14px] outline-none"
                        placeholder="说点什么..."
                        maxLength={500}
                        value={commentText[moment.id] || ''}
                        onChange={(e) => setCommentText((prev) => ({ ...prev, [moment.id]: e.target.value }))}
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="h-8 shrink-0 bg-eink-ink px-3 text-[13px] text-eink-paper active:bg-eink-pressed"
                      >
                        发送
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            )
          })
        )}

        {!loading && !denied && hasMore ? (
          <div className="py-4 text-center">
            <button
              type="button"
              data-testid="fm-load-more"
              className="border border-eink-line/30 px-4 py-1.5 text-[13px] text-eink-sub active:bg-eink-pressed"
              disabled={busy}
              onClick={() => load({ append: true, before: oldestAt })}
            >
              {busy ? '读取中...' : '加载更多'}
            </button>
          </div>
        ) : null}
        <div className="h-6" />
      </div>
    </div>
  )
}

function LocalFriendMoments() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { getUser, avatarColor, momentsFeed } = useStore()
  const friend = getUser(userId)
  const friendName = friend?.nickname || '好友'
  const items = momentsFeed().filter((m) => m.userId === userId)

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title={`${friendName}的朋友圈`} left={<Back onClick={() => navigate(`/friend/${userId}`)} />} />
      <div data-testid="moments-user-id" className="hidden">{userId}</div>
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <MomentCover
          userId={userId}
          name={friendName}
          avatarSrc={friend?.avatarUrl || ''}
          avatarColor={avatarColor(userId)}
          profileHref={`/friend/${userId}`}
        />
        <div className="h-20" />
        {items.length === 0 ? (
          <p data-testid="friend-moments-empty" className="px-6 py-12 text-center text-[14px] text-eink-sub">
            对方还没有发布动态
          </p>
        ) : (
          items.map((m) => (
            <article key={m.id} data-testid="friend-moment-item" className="flex gap-3 border-b border-eink-divider px-3 py-3.5">
              <Avatar name={friendName} color={avatarColor(userId)} size={42} src="" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-eink-ink">{friendName}</div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[#191919]">{m.text}</p>
                <div className="mt-2.5 text-[12px] text-eink-faint">{formatRelativeTime(m.time)}</div>
              </div>
            </article>
          ))
        )}
        <div className="h-6" />
      </div>
    </div>
  )
}

function Back({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-9 w-9 items-center justify-start" aria-label="返回">
      <svg width="10" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 1 1 9l8 8" stroke="#191919" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

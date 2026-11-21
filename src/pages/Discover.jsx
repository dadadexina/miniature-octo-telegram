import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import MomentCover from '../components/MomentCover'
import { isUuid } from '../lib/messages'
import { downscaleMomentImage } from '../lib/momentImage'
import {
  addMomentComment,
  createMoment,
  deleteMoment,
  deleteMomentComment,
  fetchMomentInteractions,
  fetchMoments,
  likeMoment,
  momentStoragePath,
  removeMomentImage,
  unlikeMoment,
  uploadMomentImage,
} from '../lib/moments'
import { fetchProfilesByIds } from '../lib/profiles'
import { useStore } from '../store'
import { formatRelativeTime } from '../utils'

export default function Discover() {
  const { currentUser } = useStore()
  if (!currentUser) return null
  return isUuid(currentUser.id) ? <CloudDiscover /> : <LocalDiscover />
}

function CloudDiscover() {
  const { currentUser, profile, avatarColor, getUser, upsertUsers, syncTick } = useStore()
  const meName = profile?.nickname || currentUser.nickname
  const meId = currentUser.id
  const [feed, setFeed] = useState([])
  const [likes, setLikes] = useState([])
  const [comments, setComments] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [oldestAt, setOldestAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({})
  const [commentText, setCommentText] = useState({})
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const hydratedRef = useRef(new Set())

  const hydrateAuthors = useCallback(
    async (moments) => {
      const missing = [
        ...new Set(
          (moments || [])
            .map((m) => m.authorId)
            .concat((comments || []).map((c) => c.userId))
            .filter((id) => id && !hydratedRef.current.has(id) && !getUser(id))
        ),
      ]
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
    [getUser, upsertUsers, comments]
  )

  const load = useCallback(
    async ({ append = false, before = null } = {}) => {
      setBusy(true)
      const res = await fetchMoments({ before })
      if (!res.ok) {
        setBusy(false)
        setLoading(false)
        setError(res.error || '读取动态失败')
        return
      }
      let nextIds = res.moments.map((m) => m.id)
      setFeed((prev) =>
        append ? [...prev, ...res.moments.filter((m) => !prev.some((x) => x.id === m.id))] : res.moments
      )
      setHasMore(res.hasMore)
      if (res.oldest) setOldestAt(res.oldest)
      if (nextIds.length) {
        const inter = await fetchMomentInteractions(nextIds)
        if (inter.ok) {
          setLikes((prev) => (append ? [...prev, ...inter.likes] : inter.likes))
          setComments((prev) => (append ? [...prev, ...inter.comments] : inter.comments))
        }
      } else if (!append) {
        setLikes([])
        setComments([])
      }
      setBusy(false)
      setLoading(false)
      setError('')
      await hydrateAuthors(res.moments)
    },
    [hydrateAuthors]
  )

  useEffect(() => {
    setLoading(true)
    load()
  }, [meId, syncTick])

  useEffect(() => {
    const prev = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const nameOf = (userId) => {
    if (userId === meId) return meName
    return getUser(userId)?.nickname || '用户'
  }

  const submit = async (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content && !imageFile) {
      setError('请输入内容或选择图片')
      return
    }
    setPublishing(true)
    setError('')
    try {
      let imageUrl = ''
      if (imageFile) {
        const scaled = await downscaleMomentImage(imageFile)
        if (!scaled.ok) throw new Error(scaled.error)
        const up = await uploadMomentImage(meId, scaled.blob, scaled.contentType)
        if (!up.ok) throw new Error(up.error || '上传图片失败')
        imageUrl = up.url
      }
      const res = await createMoment({ authorId: meId, content, imageUrl })
      if (!res.ok) throw new Error(res.error || '发布失败')
    } catch (err) {
      setError(err?.message || '发布失败')
      setPublishing(false)
      return
    }
    setPublishing(false)
    setOpen(false)
    setText('')
    setImageFile(null)
    setImagePreview('')
    await load()
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
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

  const removeMoment = async (moment) => {
    const path = momentStoragePath(moment.imageUrl)
    setFeed((prev) => prev.filter((m) => m.id !== moment.id))
    const res = await deleteMoment(moment.id)
    if (path) removeMomentImage(path)
    if (!res.ok) {
      setError(res.error || '删除失败')
      await load()
    }
  }

  const pickImage = (file) => {
    if (!file) return
    setImageFile(file)
    try {
      setImagePreview(URL.createObjectURL(file))
    } catch {
      setImagePreview('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center border-b border-eink-divider bg-eink-bar px-3">
        <div className="flex w-16 items-center">
          <button
            type="button"
            className="text-[13px] text-eink-sub disabled:opacity-50"
            onClick={() => load()}
            disabled={busy}
            data-testid="moments-refresh"
          >
            {busy ? '...' : '刷新'}
          </button>
        </div>
        <h1 className="flex-1 truncate text-center text-[17px] font-medium">朋友圈</h1>
        <div className="flex w-16 justify-end">
          <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => setOpen(true)} aria-label="发布">
            <CameraIcon />
          </button>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <MomentCover
          userId={meId}
          name={meName}
          avatarSrc={profile?.avatarUrl || currentUser.avatarUrl || ''}
          avatarColor={avatarColor(meId)}
        />

        <div className="h-20" />

        {error ? <p className="px-4 py-2 text-[12px] text-eink-sub">{error}</p> : null}

        {loading ? (
          <p className="px-6 py-12 text-center text-[14px] text-eink-sub">正在读取动态...</p>
        ) : feed.length === 0 ? (
          <p data-testid="moments-empty" className="px-6 py-12 text-center text-[14px] text-eink-sub">
            还没有动态，发布第一条吧
          </p>
        ) : (
          feed.map((moment) => {
            const author = getUser(moment.authorId) || { id: moment.authorId, nickname: '用户', avatarUrl: '' }
            const authorName = nameOf(moment.authorId)
            const momentLikes = likes.filter((l) => l.momentId === moment.id)
            const momentComments = comments.filter((c) => c.momentId === moment.id)
            const liked = momentLikes.some((l) => l.userId === meId)
            const canDeleteComment = (c) => c.userId === meId || moment.authorId === meId
            return (
              <article key={moment.id} data-testid="moment-item" className="flex gap-3 border-b border-eink-divider px-3 py-3.5">
                <Avatar name={authorName} color={avatarColor(author.id)} size={42} src={author.avatarUrl || ''} />
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-[15px] font-medium text-eink-ink">{authorName}</div>
                  {moment.content ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[#191919]">
                      {moment.content}
                    </p>
                  ) : null}
                  {moment.imageUrl ? (
                    <img
                      data-testid="moment-image"
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
                      data-testid="like-btn"
                      className={`font-medium ${liked ? 'text-eink-ink underline underline-offset-2' : 'text-eink-sub'}`}
                      onClick={() => toggleLike(moment)}
                    >
                      {liked ? '取消赞' : '赞'}
                      {momentLikes.length ? ` ${momentLikes.length}` : ''}
                    </button>
                    <button
                      type="button"
                      data-testid="comment-btn"
                      className="font-medium text-eink-sub"
                      onClick={() => setExpanded((prev) => ({ ...prev, [moment.id]: !prev[moment.id] }))}
                    >
                      评论{momentComments.length ? ` ${momentComments.length}` : ''}
                    </button>
                    {moment.authorId === meId ? (
                      <button
                        type="button"
                        data-testid="delete-moment"
                        className="font-medium text-eink-sub"
                        onClick={() => removeMoment(moment)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                  {momentLikes.length ? (
                    <div className="mt-1.5 border-t border-eink-divider pt-1.5 text-[12px] leading-5 text-eink-sub">
                      赞：{momentLikes.map((l) => nameOf(l.userId)).join('，')}
                    </div>
                  ) : null}
                  {momentComments.map((c) => (
                    <div key={c.id} data-testid="moment-comment" className="mt-1 text-[13px] leading-5 text-[#191919]">
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

        {!loading && hasMore ? (
          <div className="flex justify-center py-4">
            <button
              type="button"
              data-testid="moments-more"
              className="border border-eink-divider bg-eink-bar px-4 py-1.5 text-[13px] text-eink-sub disabled:opacity-60"
              disabled={busy}
              onClick={() => load({ append: true, before: oldestAt })}
            >
              {busy ? '正在加载...' : '查看更早的动态'}
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => !publishing && setOpen(false)}>
          <form
            className="safe-bottom w-full rounded-t-none border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={() => setOpen(false)}>
                取消
              </button>
              <span className="text-[16px] font-medium">发布动态</span>
              <button type="submit" className="px-1 text-[15px] font-medium text-eink-ink" disabled={publishing}>
                {publishing ? '发布中...' : '发表'}
              </button>
            </div>
            <textarea
              className="h-28 w-full resize-none rounded-none border border-eink-divider bg-eink-paper p-3 text-[15px] outline-none"
              placeholder="这一刻的想法..."
              maxLength={2000}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
              autoFocus
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                data-testid="pick-image"
                className="border border-eink-divider bg-eink-surface px-3 py-1.5 text-[13px] text-eink-sub active:bg-eink-pressed"
                onClick={() => fileRef.current?.click()}
              >
                {imageFile ? '更换图片' : '添加图片'}
              </button>
              {imageFile ? (
                <button
                  type="button"
                  className="text-[13px] text-eink-sub underline underline-offset-2"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview('')
                  }}
                >
                  移除图片
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="待发布图片预览"
                className="mt-2 max-h-[160px] w-auto max-w-[160px] border border-eink-divider object-cover"
                style={{ filter: 'grayscale(1) contrast(1.05)' }}
              />
            ) : null}
            {error ? <p className="mt-2 text-[13px] font-medium text-eink-ink">{error}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}

const PLACEHOLDER_COLORS = [
  ['#4A4A4A', '#2E2E2E'],
  ['#6E6E6E', '#525252'],
  ['#8A8A85', '#6B6B66'],
  ['#3A3A3A', '#222222'],
  ['#5C5C5C', '#404040'],
  ['#7A7A75', '#5B5B57'],
  ['#9A9A94', '#787872'],
  ['#2B2B2B', '#151515'],
  ['#686863', '#4C4C48'],
]

function gridClass(count) {
  if (count <= 1) return 'grid-cols-1 w-[180px]'
  if (count === 2) return 'grid-cols-2 w-[154px]'
  if (count === 4) return 'grid-cols-2 w-[154px]'
  return 'grid-cols-3 w-[232px]'
}

function PhotoGrid({ count, seed = '' }) {
  const n = Math.min(Math.max(count, 0), 9)
  if (!n) return null
  return (
    <div className={`mt-2.5 grid gap-[4px] ${gridClass(n)}`}>
      {Array.from({ length: n }).map((_, i) => {
        const [from, to] = PLACEHOLDER_COLORS[(seed.length + i) % PLACEHOLDER_COLORS.length]
        return (
          <div
            key={i}
            className="relative aspect-square overflow-hidden rounded-none"
            style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[12px] text-white/80">
              图{i + 1}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LocalDiscover() {
  const { currentUser, momentsFeed, publishMoment, getUser, avatarColor, profile } = useStore()
  const meName = profile?.nickname || currentUser.nickname
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState(4)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const feed = momentsFeed()

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const submit = (e) => {
    e.preventDefault()
    const result = publishMoment({ text, images })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText('')
    setImages(4)
    setError('')
    setOpen(false)
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center border-b border-eink-divider bg-eink-bar px-3">
        <div className="w-16" />
        <h1 className="flex-1 truncate text-center text-[17px] font-medium">朋友圈</h1>
        <div className="flex w-16 justify-end">
          <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => setOpen(true)} aria-label="发布">
            <CameraIcon />
          </button>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <MomentCover
          userId={currentUser.id}
          name={meName}
          avatarSrc={profile?.avatarUrl || currentUser.avatarUrl || ''}
          avatarColor={avatarColor(currentUser.id)}
        />

        <div className="h-20" />

        <p className="mx-3 mb-2 border border-eink-divider bg-eink-bar px-3 py-1.5 text-center text-[12px] text-eink-sub">
          演示数据 · 登录云端账号后同步真实朋友圈
        </p>

        {feed.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] text-eink-sub">还没有动态，发布第一条吧</p>
        ) : (
          feed.map((moment) => {
            const author = getUser(moment.userId)
            if (!author) return null
            const authorName = author.id === currentUser.id ? meName : author.nickname
            return (
              <article key={moment.id} className="flex gap-3 border-b border-eink-divider px-3 py-3.5">
                <Avatar name={authorName} color={avatarColor(author.id)} size={42} src={author.avatarUrl || ''} />
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-[15px] font-medium text-eink-ink">{authorName}</div>
                  {moment.text ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-[#191919]">
                      {moment.text}
                    </p>
                  ) : null}
                  <PhotoGrid count={moment.images} seed={moment.id} />
                  <div className="mt-2.5 text-[12px] text-eink-faint">{formatRelativeTime(moment.time)}</div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(false)}>
          <form
            className="safe-bottom w-full rounded-t-none border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={() => setOpen(false)}>
                取消
              </button>
              <span className="text-[16px] font-medium">发布动态</span>
              <button type="submit" className="px-1 text-[15px] font-medium text-eink-ink">
                发表
              </button>
            </div>
            <textarea
              className="h-28 w-full resize-none rounded-none border border-eink-divider bg-eink-paper p-3 outline-none"
              placeholder="这一刻的想法..."
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
              autoFocus
            />
            <div className="mt-3">
              <div className="mb-2 text-[13px] text-eink-sub">图片数量</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }).map((_, n) => (
                  <button
                    key={n}
                    type="button"
                    className={`h-8 w-8 rounded-none ${images === n ? 'bg-eink-ink text-eink-paper' : 'border border-eink-divider bg-eink-surface text-eink-sub'}`}
                    onClick={() => setImages(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {images > 0 ? <PhotoGrid count={images} seed="preview" /> : null}
            {error ? <p className="mt-2 text-[13px] font-medium text-eink-ink">{error}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 7.2 10.1 5.5h3.8L15 7.2h2.2A2.3 2.3 0 0 1 19.5 9.5v7.2A2.3 2.3 0 0 1 17.2 19H6.8A2.3 2.3 0 0 1 4.5 16.7V9.5A2.3 2.3 0 0 1 6.8 7.2H9Z" stroke="#191919" strokeWidth="1.6" />
      <circle cx="12" cy="13" r="3.1" stroke="#191919" strokeWidth="1.6" />
    </svg>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiscoverGlobe from '../components/DiscoverGlobe'
import { isUuid } from '../lib/messages'
import { downscaleMomentImage } from '../lib/momentImage'
import { createMoment, fetchMoments, uploadMomentImage } from '../lib/moments'
import { fetchProfilesByIds } from '../lib/profiles'
import { useStore } from '../store'

let feedCache = null

function cacheFor(userId) {
  return feedCache && feedCache.userId === userId ? feedCache : null
}

function formatWeekLabel() {
  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.getMonth() + 1}.${monday.getDate()}—${sunday.getMonth() + 1}.${sunday.getDate()}`
}

function buildPeople({ meId, friends, feed, getUser, displayNameOf, avatarColor }) {
  const map = new Map()
  ;(friends || []).forEach((friend) => {
    if (!friend?.id || friend.id === meId) return
    map.set(friend.id, {
      id: friend.id,
      name: displayNameOf(friend.id) || friend.nickname || '朋友',
      avatarUrl: friend.avatarUrl || '',
      color: avatarColor(friend.id),
    })
  })
  ;(feed || []).forEach((moment) => {
    const id = moment.authorId
    if (!id || id === meId || map.has(id)) return
    const user = getUser(id)
    map.set(id, {
      id,
      name: displayNameOf(id) || user?.nickname || '朋友',
      avatarUrl: user?.avatarUrl || '',
      color: avatarColor(id),
    })
  })
  return [...map.values()]
}

function buildRoutes({ meId, feed, getUser, displayNameOf, avatarColor }) {
  const seen = new Set()
  const routes = []
  const sorted = [...(feed || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  for (const moment of sorted) {
    const authorId = moment.authorId
    if (!authorId || authorId === meId || seen.has(authorId)) continue
    const user = getUser(authorId)
    seen.add(authorId)
    routes.push({
      ...moment,
      name: displayNameOf(authorId) || user?.nickname || '朋友',
      avatarUrl: user?.avatarUrl || '',
      color: avatarColor(authorId),
    })
    if (routes.length === 3) break
  }
  return routes
}

export default function Discover() {
  const navigate = useNavigate()
  const { currentUser } = useStore()
  if (!currentUser) return null
  const onReply = (peerId) => navigate(`/chat/${peerId}`)
  return isUuid(currentUser.id) ? <CloudDiscover onReply={onReply} /> : <LocalDiscover onReply={onReply} />
}

function DiscoverHeader({ weekLabel, onWrite }) {
  return (
    <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center border-b border-eink-divider bg-eink-bar px-3">
      <div className="w-16 truncate text-[10px] tracking-tight text-eink-faint">{weekLabel}</div>
      <h1 className="flex-1 truncate text-center text-[17px] font-medium">你的地球</h1>
      <div className="flex w-16 justify-end">
        <button
          type="button"
          data-testid="discover-write"
          className="text-[13px] font-medium text-eink-ink underline underline-offset-4"
          onClick={onWrite}
        >
          写一页
        </button>
      </div>
    </header>
  )
}

function CloudDiscover({ onReply }) {
  const {
    currentUser,
    profile,
    avatarColor,
    getUser,
    upsertUsers,
    syncTick,
    displayNameOf,
    friendsOf,
  } = useStore()
  const meName = profile?.nickname || currentUser.nickname
  const meId = currentUser.id
  const initialCache = cacheFor(meId)
  const [feed, setFeed] = useState(() => initialCache?.feed || [])
  const [loading, setLoading] = useState(() => !initialCache)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const fileRef = useRef(null)
  const hydratedRef = useRef(new Set())
  const weekLabel = useMemo(() => formatWeekLabel(), [])

  const hydrateAuthors = useCallback(
    async (moments) => {
      const missing = [
        ...new Set(
          (moments || [])
            .map((m) => m.authorId)
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
    [getUser, upsertUsers]
  )

  const load = useCallback(async () => {
    const res = await fetchMoments({ limit: 50 })
    if (!res.ok) {
      setLoading(false)
      setLoadError(res.error || '读取近况失败')
      return
    }
    setFeed(res.moments)
    setLoading(false)
    setLoadError('')
    await hydrateAuthors(res.moments)
  }, [hydrateAuthors])

  useEffect(() => {
    feedCache = { userId: meId, feed }
  }, [meId, feed])

  useEffect(() => {
    // setState 均在 await fetchMoments 之后发生，不会同步级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // 同步触发后静默刷新，避免覆盖缓存的直接呈现
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, syncTick])

  useEffect(() => {
    const prev = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const friends = useMemo(() => friendsOf(meId), [friendsOf, meId])
  const people = useMemo(
    () => buildPeople({ meId, friends, feed, getUser, displayNameOf, avatarColor }),
    [meId, friends, feed, getUser, displayNameOf, avatarColor]
  )
  const routes = useMemo(
    () => buildRoutes({ meId, feed, getUser, displayNameOf, avatarColor }),
    [meId, feed, getUser, displayNameOf, avatarColor]
  )

  const pickImage = (file) => {
    if (!file) return
    setImageFile(file)
    try {
      setImagePreview(URL.createObjectURL(file))
    } catch {
      setImagePreview('')
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const content = text.trim()
    if (!content && !imageFile) {
      setFormError('请输入内容或选择图片')
      return
    }
    setPublishing(true)
    setFormError('')
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
      setFormError(err?.message || '发布失败')
      setPublishing(false)
      return
    }
    setPublishing(false)
    setOpen(false)
    setText('')
    setImageFile(null)
    setImagePreview('')
    await load()
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <DiscoverHeader
        weekLabel={weekLabel}
        onWrite={() => {
          setFormError('')
          setOpen(true)
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <p className="px-6 pt-3 text-center text-[11px] leading-5 text-eink-sub">
          {meName} 的地球上，只有你认识的人
        </p>
        <DiscoverGlobe
          people={people}
          routes={routes}
          meId={meId}
          loading={loading}
          error={loadError}
          emptyText="本周还没有朋友写信。你可以先写一页。"
          onReply={onReply}
        />
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => !publishing && setOpen(false)}>
          <form
            className="safe-bottom w-full border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={() => setOpen(false)}>
                取消
              </button>
              <span className="text-[16px] font-medium">写一页</span>
              <button type="submit" className="px-1 text-[15px] font-medium text-eink-ink" disabled={publishing}>
                {publishing ? '寄出中...' : '寄出'}
              </button>
            </div>
            <textarea
              className="h-32 w-full resize-none border border-eink-divider bg-eink-paper p-3 text-[16px] leading-7 outline-none"
              placeholder="这一周，想留下什么？"
              maxLength={2000}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setFormError('')
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
                {imageFile ? '更换图片' : '附一张图'}
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
                onChange={(event) => pickImage(event.target.files?.[0])}
              />
            </div>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="待发布图片预览"
                className="mt-2 max-h-[160px] w-auto max-w-[160px] border border-eink-divider object-cover grayscale"
              />
            ) : null}
            {formError ? <p className="mt-2 text-[13px] font-medium text-eink-ink">{formError}</p> : null}
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
            className="relative aspect-square overflow-hidden"
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

function LocalDiscover({ onReply }) {
  const {
    currentUser,
    momentsFeed,
    publishMoment,
    getUser,
    avatarColor,
    profile,
    displayNameOf,
    friendsOf,
  } = useStore()
  const meId = currentUser.id
  const meName = profile?.nickname || currentUser.nickname
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState(4)
  const [formError, setFormError] = useState('')
  const weekLabel = useMemo(() => formatWeekLabel(), [])
  const feed = momentsFeed().map((moment) => ({
    id: moment.id,
    authorId: moment.userId,
    content: moment.text,
    imageUrl: '',
    imageCount: moment.images,
    createdAt: moment.time,
  }))
  const friends = friendsOf(meId)
  const people = buildPeople({ meId, friends, feed, getUser, displayNameOf, avatarColor })
  const routes = buildRoutes({ meId, feed, getUser, displayNameOf, avatarColor })

  useEffect(() => {
    const prev = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const submit = (event) => {
    event.preventDefault()
    const result = publishMoment({ text, images })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setText('')
    setImages(4)
    setFormError('')
    setOpen(false)
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <DiscoverHeader weekLabel={weekLabel} onWrite={() => setOpen(true)} />
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <p className="px-6 pt-3 text-center text-[11px] leading-5 text-eink-sub">
          {meName} 的地球上，只有你认识的人
        </p>
        <DiscoverGlobe
          people={people}
          routes={routes}
          meId={meId}
          loading={false}
          error=""
          emptyText="还没有信。你可以先写一页。"
          onReply={onReply}
        />
        <p className="mx-4 mb-6 border border-eink-divider bg-eink-bar px-3 py-1.5 text-center text-[12px] text-eink-sub">
          演示数据 · 登录云端账号后同步真实近况
        </p>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(false)}>
          <form
            className="safe-bottom w-full border-t-2 border-eink-ink bg-eink-bar px-4 pb-5 pt-3"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submit}
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" className="px-1 text-[15px] text-eink-sub" onClick={() => setOpen(false)}>
                取消
              </button>
              <span className="text-[16px] font-medium">写一页</span>
              <button type="submit" className="px-1 text-[15px] font-medium text-eink-ink">
                寄出
              </button>
            </div>
            <textarea
              className="h-32 w-full resize-none border border-eink-divider bg-eink-paper p-3 text-[16px] leading-7 outline-none"
              placeholder="这一周，想留下什么？"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setFormError('')
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
                    className={`h-8 w-8 ${images === n ? 'bg-eink-ink text-eink-paper' : 'border border-eink-divider bg-eink-surface text-eink-sub'}`}
                    onClick={() => setImages(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {images > 0 ? <PhotoGrid count={images} seed="preview" /> : null}
            {formError ? <p className="mt-2 text-[13px] font-medium text-eink-ink">{formError}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}

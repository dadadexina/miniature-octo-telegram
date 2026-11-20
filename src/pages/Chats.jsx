import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import CopySql from '../components/CopySql'
import NavBar from '../components/NavBar'
import { fetchInbox, groupConversations, isUuid } from '../lib/messages'
import { fetchProfilesByIds } from '../lib/profiles'
import { useStore } from '../store'
import { formatTime } from '../utils'

export default function Chats() {
  const { conversations, avatarColor, currentUser, getUser, upsertUsers, inbox, mergeInbox, unreadOf, syncTick } = useStore()
  const [hint, setHint] = useState('')
  const [needSql, setNeedSql] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cloudOk, setCloudOk] = useState(false)
  const localList = conversations()

  useEffect(() => {
    if (!currentUser?.id || !cloudOk) return undefined
    const missing = groupConversations(currentUser.id, inbox)
      .map((item) => item.peerId)
      .filter((id) => id && !getUser(id))
    if (!missing.length) return undefined
    let alive = true
    fetchProfilesByIds(missing).then((profiles) => {
      if (!alive || !profiles.ok) return
      upsertUsers(
        profiles.profiles.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          publicId: p.username,
          avatarUrl: p.avatarUrl || '',
        }))
      )
    })
    return () => {
      alive = false
    }
  }, [inbox, cloudOk, currentUser?.id])

  useEffect(() => {
    let alive = true
    if (!currentUser?.id) return undefined
    if (!isUuid(currentUser.id)) {
      setCloudOk(false)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    fetchInbox(currentUser.id).then(async (result) => {
      if (!alive) return
      if (!result.ok) {
        setCloudOk(false)
        setNeedSql(Boolean(result.permission))
        setHint(result.permission ? 'messages 表暂无读取权限，先显示本地会话。' : result.error || '读取会话失败')
        setLoading(false)
        return
      }
      mergeInbox(result.messages)
      const grouped = groupConversations(currentUser.id, result.messages)
      const extras = grouped.map((item) => item.peerId).filter((id) => !getUser(id))
      if (extras.length) {
        const profiles = await fetchProfilesByIds(extras)
        if (alive && profiles.ok) {
          upsertUsers(
            profiles.profiles.map((p) => ({
              id: p.id,
              nickname: p.nickname,
              publicId: p.username,
              avatarUrl: p.avatarUrl || '',
            }))
          )
        }
      }
      if (!alive) return
      setCloudOk(true)
      setNeedSql(false)
      setHint('')
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [currentUser?.id, mergeInbox, syncTick])

  const list = useMemo(() => {
    if (!cloudOk) return localList
    return groupConversations(currentUser.id, inbox).map(({ peerId, last }) => ({
      friend: getUser(peerId) || { id: peerId, nickname: '用户', publicId: '' },
      last,
    }))
  }, [cloudOk, localList, inbox, currentUser?.id, getUser])

  return (
    <div className="flex h-full flex-col">
      <NavBar
        title="微信"
        right={
          <Link to="/me" className="text-[13px] font-medium text-eink-ink underline underline-offset-2">
            我
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-eink-bar no-scrollbar">
        {needSql ? <CopySql compact /> : hint ? <p className="px-4 py-2 text-[12px] leading-5 text-eink-sub">{hint}</p> : null}
        {loading ? (
          <p className="px-6 py-20 text-center text-[14px] text-eink-sub">正在读取会话...</p>
        ) : list.length === 0 ? (
          <div className="px-6 py-20 text-center text-[14px] text-eink-sub">
            暂无会话，去通讯录找好友聊聊
            <div className="mt-4">
              <Link to="/contacts" className="font-medium text-eink-ink underline underline-offset-2">
                打开通讯录
              </Link>
            </div>
          </div>
        ) : (
          list.map(({ friend, last }) => (
            <Link
              key={friend.id}
              to={`/chat/${friend.id}`}
              className="flex items-center gap-3 border-b border-eink-divider px-4 py-3 active:bg-[#E7E5DD]"
            >
              <Avatar name={friend.nickname} color={avatarColor(friend.id)} size={48} badge={unreadOf(friend.id)} src={friend.avatarUrl || ''} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-[16px] text-[#191919]">{friend.nickname}</span>
                  <span className="ml-3 shrink-0 text-[12px] text-eink-faint">
                    {last ? formatTime(last.time) : ''}
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] text-eink-sub">
                  {last ? `${last.fromId === currentUser.id ? '我: ' : ''}${last.text}` : '点击开始聊天'}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

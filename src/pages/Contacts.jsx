import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import NavBar from '../components/NavBar'
import { searchProfileByUsername } from '../lib/profiles'
import { useStore } from '../store'

export default function Contacts() {
  const { currentUser, avatarColor, profile, friendsOf, isFriend, addFriendFromProfile, searchUser, suggestedUsers } = useStore()
  const [keyword, setKeyword] = useState('')
  const [queried, setQueried] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [toast, setToast] = useState('')
  const friends = friendsOf(currentUser.id)
  const suggested = suggestedUsers()

  const showToast = (text) => {
    setToast(text)
    setTimeout(() => setToast(''), 1600)
  }

  const onSearch = async (e) => {
    e.preventDefault()
    const q = keyword.trim()
    if (!q) {
      showToast('请输入要搜索的 ID')
      return
    }
    setSearching(true)
    setQueried(q)
    const local = searchUser(q).map((u) => ({
      id: u.id,
      nickname: u.nickname,
      username: u.publicId,
    }))
    const result = await searchProfileByUsername(q)
    setSearching(false)
    if (!result.ok) {
      setResults(local)
      showToast(local.length ? '云端暂无权限，已显示本地结果' : result.error || '搜索失败')
      return
    }
    const cloud = result.profiles.filter((p) => p.id !== currentUser.id)
    const merged = [...cloud]
    local.forEach((u) => {
      if (!merged.some((p) => p.id === u.id || p.username === u.username)) merged.push(u)
    })
    setResults(merged)
  }

  const onAdd = (user) => {
    const added = addFriendFromProfile(user)
    if (!added.ok) {
      showToast(added.error || '添加失败')
      return
    }
    showToast('已添加')
  }

  const clearSearch = () => {
    setKeyword('')
    setQueried('')
    setResults(null)
  }

  const meName = profile?.nickname || currentUser.nickname
  const meId = profile?.username || ''

  return (
    <div className="flex h-full flex-col">
      <NavBar
        title="通讯录"
        right={
          <Link to="/me" className="text-[13px] font-medium text-eink-ink underline underline-offset-2">
            我
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-eink-paper no-scrollbar">
        <form className="border-b border-eink-divider bg-eink-paper px-3 py-2" onSubmit={onSearch}>
          <div className="flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-none border border-eink-line/25 bg-eink-bar px-3">
              <svg className="mr-2 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#8A8A85" strokeWidth="1.8" />
                <path d="M16 16l5 5" stroke="#8A8A85" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                className="h-full w-full bg-transparent text-[14px] outline-none"
                placeholder="输入用户名 ID 搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value.replace(/\s/g, ''))}
              />
              {keyword ? (
                <button type="button" className="ml-1 text-[12px] text-eink-sub" onClick={clearSearch}>
                  清除
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              className="h-9 shrink-0 rounded-none bg-eink-ink px-3 text-[14px] text-eink-paper active:bg-eink-pressed disabled:bg-eink-disabled"
              disabled={searching}
            >
              {searching ? '...' : '搜索'}
            </button>
          </div>
        </form>

        {results ? (
          <section className="mt-2 border-y border-eink-divider bg-eink-bar">
            <div className="px-4 py-2 text-[13px] text-eink-sub">搜索结果</div>
            {results.length === 0 ? (
              <p className="px-4 py-6 text-[14px] text-eink-sub">未找到 ID 为 {queried} 的用户</p>
            ) : (
              results.map((user) => (
                <div key={user.id} className="border-t border-eink-divider px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.nickname} color={avatarColor(user.id)} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px]">{user.nickname}</div>
                      <div className="mt-0.5 truncate text-[12px] text-eink-sub">ID: {user.username}</div>
                    </div>
                    {isFriend(currentUser.id, user.id) ? (
                      <span className="text-[13px] text-eink-sub">已添加</span>
                    ) : (
                      <button
                        type="button"
                        className="rounded-none bg-eink-ink px-3 py-1.5 text-[13px] text-eink-paper active:bg-eink-pressed"
                        onClick={() => onAdd(user)}
                      >
                        添加
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        ) : null}

        <section className="mt-2 border-y border-eink-divider bg-eink-bar">
          <Link to="/me" className="flex items-center gap-3 px-4 py-3.5 active:bg-[#E7E5DD]">
            <Avatar name={meName} color={avatarColor(currentUser.id)} size={52} />
            <div className="min-w-0">
              <div className="truncate text-[17px]">{meName}</div>
              <div className="mt-0.5 text-[13px] text-eink-sub">我的 ID：{meId}</div>
            </div>
          </Link>
        </section>

        {suggested.length ? (
          <section className="mt-2 border-y border-eink-divider bg-eink-bar">
            <div className="px-4 py-2 text-[13px] text-eink-sub">推荐好友</div>
            {suggested.map((user) => (
              <div key={user.id} className="flex items-center gap-3 border-t border-eink-divider px-4 py-3">
                <Avatar name={user.nickname} color={avatarColor(user.id)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px]">{user.nickname}</div>
                  <div className="truncate text-[12px] text-eink-sub">ID: {user.publicId}</div>
                </div>
                <button
                  type="button"
                  className="rounded-none bg-eink-ink px-3 py-1.5 text-[13px] text-eink-paper active:bg-eink-pressed"
                  onClick={() => onAdd({ id: user.id, nickname: user.nickname, username: user.publicId })}
                >
                  添加
                </button>
              </div>
            ))}
          </section>
        ) : null}

        <section className="mt-2 border-y border-eink-divider bg-eink-bar">
          <div className="px-4 py-2 text-[13px] text-eink-sub">我的好友 ({friends.length})</div>
          {friends.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14px] text-eink-sub">暂无好友，快去搜索添加吧</p>
          ) : (
            friends.map((friend) => (
              <Link
                key={friend.id}
                to={`/chat/${friend.id}`}
                className="flex items-center gap-3 border-t border-eink-divider px-4 py-3 active:bg-[#E7E5DD]"
              >
                <Avatar name={friend.nickname} color={avatarColor(friend.id)} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[16px]">{friend.nickname}</div>
                  <div className="truncate text-[12px] text-eink-sub">ID: {friend.publicId || friend.username || ''}</div>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
          <span className="rounded-none bg-eink-ink px-4 py-2 text-[13px] text-eink-paper">{toast}</span>
        </div>
      ) : null}
    </div>
  )
}

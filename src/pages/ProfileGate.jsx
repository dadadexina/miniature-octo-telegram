import { useEffect, useState } from 'react'
import SetupProfile from './SetupProfile'
import { fetchProfileById, updateProfileNickname } from '../lib/profiles'
import { useStore } from '../store'

export default function ProfileGate({ children }) {
  const { authUser, currentUser, profile, profileReady, setCloudProfile, localProfileOf, applyProfileToUser } = useStore()
  const [fetchError, setFetchError] = useState('')
  const userId = authUser?.id || currentUser?.id

  useEffect(() => {
    let alive = true
    if (!userId) {
      setCloudProfile(null, false)
      return undefined
    }
    const cached = localProfileOf(userId)
    fetchProfileById(userId).then((result) => {
      if (!alive) return
      if (result.ok && result.profile) {
        setFetchError('')
        applyProfileToUser(userId, result.profile)
        setCloudProfile(result.profile, true)
        if (!result.profile.nickname && cached?.nickname) {
          updateProfileNickname(userId, cached.nickname).then((updated) => {
            if (!alive) return
            if (updated.ok && updated.profile?.nickname) {
              applyProfileToUser(userId, updated.profile)
              setCloudProfile(updated.profile, true)
            }
          })
        }
        return
      }
      if (cached) {
        setFetchError(result.ok ? '' : result.error || '')
        applyProfileToUser(userId, cached)
        setCloudProfile(cached, false)
        return
      }
      setFetchError(result.ok ? '' : result.error || '读取资料失败')
      setCloudProfile(null, false)
    })
    return () => {
      alive = false
    }
  }, [userId, setCloudProfile])

  if (!profileReady) {
    return (
      <div className="flex h-full items-center justify-center bg-eink-paper text-[14px] text-eink-sub">
        正在读取资料...
      </div>
    )
  }

  if (!profile) {
    if (!userId) {
      return (
        <div className="flex h-full items-center justify-center bg-eink-paper text-[14px] text-eink-sub">
          登录状态异常，请重新登录
        </div>
      )
    }
    return <SetupProfile userId={userId} fetchError={fetchError} />
  }

  return children
}

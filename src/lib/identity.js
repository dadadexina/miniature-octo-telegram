import { isUuid } from './messages'

// 云端账号以 uuid 唯一定位;邮箱匹配仅用于本地演示账号(非 uuid),
// 避免注销后用同一邮箱注册的新账号继承旧账号的本地资料。
export function findAuthIdentity(users, authUser) {
  if (!authUser?.id) return null
  const list = Array.isArray(users) ? users : []
  const sameId = list.find((u) => u.id === authUser.id)
  if (sameId) return sameId
  const email = String(authUser.email || '').trim().toLowerCase()
  if (!email) return null
  return (
    list.find(
      (u) => String(u.email || '').trim().toLowerCase() === email && !isUuid(u.id)
    ) || null
  )
}

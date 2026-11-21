import { isUuid } from './messages'

// 云端结果优先;本地缓存只补充演示账号。
// 云端账号一旦注销,资料不复存在,不能再从本地缓存被搜出来。
export function mergeSearchResults(cloud, local) {
  const merged = Array.isArray(cloud) ? [...cloud] : []
  ;(Array.isArray(local) ? local : []).forEach((user) => {
    if (!user?.id || isUuid(user.id)) return
    if (merged.some((item) => item.id === user.id)) return
    merged.push(user)
  })
  return merged
}

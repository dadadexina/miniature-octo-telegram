export const ACCOUNT_STORAGE_PREFIX = 'wechat-chat-app-v3'

// 注销后需一并清理的按账号缓存:个性签名、朋友圈封面、通知摘要队列
const ACCOUNT_CACHE_PREFIXES = [
  'eink:signature:v1:',
  'momentCover:',
  'eink:notification-digest:v1:',
]

// 注销账号后清理本机所有与账号相关的缓存:主状态、按用户 id 记录的未读/已读/草稿等
export function clearAccountStorage({
  local = globalThis.localStorage,
  session = globalThis.sessionStorage,
} = {}) {
  try {
    if (local) {
      Object.keys(local)
        .filter(
          (key) =>
            key === ACCOUNT_STORAGE_PREFIX ||
            key.startsWith(`${ACCOUNT_STORAGE_PREFIX}:`) ||
            ACCOUNT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
        )
        .forEach((key) => local.removeItem(key))
    }
  } catch {
    // 本地存储不可用时忽略
  }
  try {
    session?.removeItem?.(`${ACCOUNT_STORAGE_PREFIX}:call-tab`)
  } catch {
    // 会话存储不可用时忽略
  }
}

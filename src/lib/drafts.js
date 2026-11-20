export const DRAFTS_KEY = 'wechat-chat-app-v3:drafts:'

export function loadDrafts(meId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY + meId) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function saveDrafts(meId, value) {
  try {
    localStorage.setItem(DRAFTS_KEY + meId, JSON.stringify(value || {}))
  } catch {
    /* 存储不可用时仅保留内存态 */
  }
}

export function applyDraft(prev, peerId, text) {
  const next = { ...(prev || {}) }
  if (text) next[peerId] = text
  else delete next[peerId]
  return next
}

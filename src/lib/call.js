export const CALL_STATUS = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
}

export const CALL_PEER_PREFIX = 'inkline-call-'
export const CALL_PRESENCE_CHANNEL = 'inkline-call:presence'
export const CALL_TAB_STORAGE_KEY = 'wechat-chat-app-v3:call-tab'
export const CALL_TIMEOUT_MS = 30000

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function peerIdFor(userId, suffix = '') {
  const id = String(userId || '').trim()
  if (!id) return ''
  const tail = String(suffix || '').trim()
  return tail ? `${CALL_PEER_PREFIX}${id}-${tail}` : `${CALL_PEER_PREFIX}${id}`
}

export function newCallSuffix(random = Math.random) {
  const value = Math.floor(random() * 36 ** 6)
  return value.toString(36).padStart(6, '0')
}

export function readCallSuffix(storage) {
  const fallback = newCallSuffix()
  if (!storage) return fallback
  try {
    const saved = String(storage.getItem(CALL_TAB_STORAGE_KEY) || '').trim()
    if (saved) return saved
    storage.setItem(CALL_TAB_STORAGE_KEY, fallback)
  } catch {
    /* ignore */
  }
  return fallback
}

export function writeCallSuffix(storage, suffix) {
  const tail = String(suffix || '').trim()
  if (!tail || !storage) return
  try {
    storage.setItem(CALL_TAB_STORAGE_KEY, tail)
  } catch {
    /* ignore */
  }
}

export function userIdFromPeerId(peerId) {
  const raw = String(peerId || '').trim()
  if (!raw.startsWith(CALL_PEER_PREFIX)) return ''
  const rest = raw.slice(CALL_PEER_PREFIX.length)
  const match = rest.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0] : ''
}

export function resolveCalleePeerId(presenceState, userId) {
  const id = String(userId || '').trim()
  if (!id) return ''
  const entries = presenceState?.[id]
  if (Array.isArray(entries)) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const candidate = String(entries[i]?.peerId || '').trim()
      if (candidate.startsWith(CALL_PEER_PREFIX)) return candidate
    }
  }
  return peerIdFor(id)
}

export function peerOptions(env = {}) {
  const options = {}
  const host = String(env.VITE_PEER_HOST || '').trim()
  if (!host) return options
  options.host = host
  options.port = Number(env.VITE_PEER_PORT || 443)
  options.path = String(env.VITE_PEER_PATH || '/').trim() || '/'
  options.secure = String(env.VITE_PEER_SECURE || 'true') !== 'false'
  const key = String(env.VITE_PEER_KEY || '').trim()
  if (key) options.key = key
  return options
}

export function mediaConstraints() {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  }
}

export function formatCallDuration(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}

export function callEventText(attachment) {
  const { event, duration } = attachment || {}
  if (event === 'cancelled') return '语音通话已取消'
  if (event === 'declined') return '语音通话被拒绝'
  if (event === 'missed') return '语音通话未接听'
  if (event === 'ended') return `通话时长 ${formatCallDuration(duration)}`
  return '语音通话'
}

const PEER_ERROR_TEXT = {
  'unavailable-id': '通话通道初始化失败，请刷新页面后重试',
  'peer-unavailable': '对方当前不在线，或还没有打开应用',
  network: '网络连接异常，请稍后重试',
  'server-error': '信令服务器连接失败，请稍后重试',
  'socket-error': '信令连接中断，请稍后重试',
  'socket-closed': '信令连接已关闭，请稍后重试',
  webrtc: '音频协商失败，可能受网络环境限制',
  'browser-incompatible': '当前浏览器不支持语音通话',
  'ssl-unavailable': '当前环境不是安全连接，无法使用麦克风',
  'signaling-timeout': '无法连接信令服务器（可能被网络拦截），请稍后重试',
}

export function callErrorMessage(type) {
  return PEER_ERROR_TEXT[type] || '通话连接失败，请稍后重试'
}

export function isPeerFatalError(type) {
  return ['unavailable-id', 'browser-incompatible', 'ssl-unavailable', 'server-error'].includes(type)
}

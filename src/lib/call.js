export const CALL_STATUS = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
}

export const CALL_PEER_PREFIX = 'inkline-call-'
export const CALL_TIMEOUT_MS = 30000

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function peerIdFor(userId) {
  const id = String(userId || '').trim()
  return id ? `${CALL_PEER_PREFIX}${id}` : ''
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

const PEER_ERROR_TEXT = {
  'unavailable-id': '通话功能已在其他窗口启用，请关闭其他窗口后重试',
  'peer-unavailable': '对方暂时无法接听，可能未停留在聊天页',
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

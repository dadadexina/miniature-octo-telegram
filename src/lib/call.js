export const CALL_STATUS = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
}

export const CALL_SIGNAL_CHANNEL = 'inkline-call:signal'
export const CALL_PRESENCE_CHANNEL = 'inkline-call:presence'

// 呼出等待接听上限,以及接听后建立媒体连接的上限
export const CALL_TIMEOUT_MS = 30000
export const CALL_CONNECT_TIMEOUT_MS = 25000
// 来电最长振铃时间,超时自动挂断,避免无人处理时一直响铃
export const CALL_RING_TIMEOUT_MS = 45000

export const SIGNAL_EVENTS = {
  INVITE: 'invite',
  ACCEPTED: 'accepted',
  ANSWER: 'answer',
  ICE: 'ice',
  DECLINE: 'decline',
  BUSY: 'busy',
  CANCEL: 'cancel',
  HANGUP: 'hangup',
}

export const SPEAKER_STORAGE_KEY = 'wechat-chat-app-v3:call-speaker'

// 公共 STUN + OpenRelay 公共 TURN 兜底:移动网络多处于对称 NAT,只有 STUN 时经常协商不出可用链路
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export function peerConnectionConfig() {
  return { iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', iceCandidatePoolSize: 2 }
}

export function mediaConstraints() {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  }
}

export function makeCallId(userId, now = Date.now(), random = Math.random) {
  const who = String(userId || '').trim() || 'anon'
  const rand = Math.floor(random() * 36 ** 5)
    .toString(36)
    .padStart(5, '0')
  return `${who}-${now.toString(36)}-${rand}`
}

export function makeSignal(event, { callId, from, to, sdp = '', candidate = null } = {}) {
  const payload = { event, callId, from, to }
  if (sdp) payload.sdp = sdp
  if (candidate) payload.candidate = candidate
  return payload
}

export function isSignalFor(payload, myId) {
  if (!payload || !myId) return false
  return payload.to === myId && payload.from !== myId
}

export function isSameCall(payload, callId) {
  return Boolean(payload && callId && payload.callId === callId)
}

export function validSdp(sdp) {
  return typeof sdp === 'string' && sdp.includes('v=0')
}

export function validCandidate(candidate) {
  if (!candidate) return false
  if (typeof candidate === 'string') return candidate.length > 0
  return typeof candidate.candidate === 'string' && candidate.candidate.length > 0
}

export function canUseCalls(win = typeof window === 'undefined' ? null : window) {
  return Boolean(
    win &&
      win.RTCPeerConnection &&
      win.navigator &&
      win.navigator.mediaDevices &&
      typeof win.navigator.mediaDevices.getUserMedia === 'function'
  )
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

const ERROR_TEXT = {
  denied: '麦克风权限已被关闭，请在手机系统设置中开启后再试',
  unavailable: '当前设备没有可用的麦克风',
  busyMic: '麦克风被其他应用占用，请关闭后重试',
  insecure: '当前环境不是安全连接，无法使用麦克风',
  mic: '无法获取麦克风权限，请在系统设置中允许麦克风访问',
  offline: '对方当前不在线，或还没有打开应用',
  busy: '对方正在通话中，请稍后再拨',
  timeout: '对方无应答',
  connect: '通话连接失败，可能受网络环境限制，请稍后重试',
  unsupported: '当前浏览器不支持语音通话，请升级浏览器后重试',
  'peer-unavailable': '对方当前不在线，或还没有打开应用',
  network: '网络连接异常，请稍后重试',
  signaling: '通话信令通道尚未连接，请稍后重试',
}

export function callErrorMessage(type) {
  return ERROR_TEXT[type] || '通话连接失败，请稍后重试'
}

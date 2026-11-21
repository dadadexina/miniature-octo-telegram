import { describe, expect, it } from 'vitest'

import {
  CALL_SIGNAL_CHANNEL,
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  ICE_SERVERS,
  SIGNAL_EVENTS,
  callErrorMessage,
  callEventText,
  canUseCalls,
  formatCallDuration,
  isSameCall,
  isSignalFor,
  makeCallId,
  makeSignal,
  mediaConstraints,
  peerConnectionConfig,
  validCandidate,
  validSdp,
} from './call'

describe('makeCallId', () => {
  it('同一用户不同时间生成不同 id', () => {
    const a = makeCallId('u1', 1000, () => 0.1)
    const b = makeCallId('u1', 2000, () => 0.1)
    expect(a).not.toBe(b)
    expect(a.startsWith('u1-')).toBe(true)
  })

  it('空用户兜底 anon 前缀', () => {
    expect(makeCallId('', 1000, () => 0).startsWith('anon-')).toBe(true)
  })
})

describe('makeSignal / isSignalFor', () => {
  const payload = makeSignal(SIGNAL_EVENTS.INVITE, {
    callId: 'c1',
    from: 'a',
    to: 'b',
    sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n',
  })

  it('信令带事件、呼叫 id 与收发人', () => {
    expect(payload.event).toBe('invite')
    expect(payload.callId).toBe('c1')
    expect(payload.from).toBe('a')
    expect(payload.to).toBe('b')
    expect(payload.sdp).toContain('v=0')
  })

  it('只处理发给自己的信令,忽略自己发出的回声', () => {
    expect(isSignalFor(payload, 'b')).toBe(true)
    expect(isSignalFor(payload, 'a')).toBe(false)
    expect(isSignalFor(payload, 'c')).toBe(false)
    expect(isSignalFor(null, 'b')).toBe(false)
  })

  it('同一通话 id 才匹配', () => {
    expect(isSameCall(payload, 'c1')).toBe(true)
    expect(isSameCall(payload, 'c2')).toBe(false)
    expect(isSameCall(payload, '')).toBe(false)
  })
})

describe('SDP / ICE 校验', () => {
  it('拒绝空或非 SDP 内容', () => {
    expect(validSdp('v=0\r\ns=-\r\n')).toBe(true)
    expect(validSdp('')).toBe(false)
    expect(validSdp(null)).toBe(false)
    expect(validSdp('hello')).toBe(false)
  })

  it('接受对象或字符串候选,拒绝空值', () => {
    expect(validCandidate({ candidate: 'candidate:1 1 udp 1 1.2.3.4 5000 typ host' })).toBe(true)
    expect(validCandidate('candidate:1')).toBe(true)
    expect(validCandidate({ candidate: '' })).toBe(false)
    expect(validCandidate(null)).toBe(false)
  })
})

describe('运行环境与配置', () => {
  it('缺少 getUsermedia 时判定不支持通话', () => {
    expect(canUseCalls(null)).toBe(false)
    expect(canUseCalls({ RTCPeerConnection: function () {}, navigator: {} })).toBe(false)
    expect(
      canUseCalls({ RTCPeerConnection: function () {}, navigator: { mediaDevices: { getUserMedia() {} } } })
    ).toBe(true)
  })

  it('ICE 配置包含 STUN 与 TURN 兜底', () => {
    const urls = ICE_SERVERS.flatMap((server) => server.urls)
    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true)
    expect(urls.some((url) => url.startsWith('turn:'))).toBe(true)
    expect(peerConnectionConfig().iceServers).toBe(ICE_SERVERS)
  })

  it('麦克风约束开启回声消除与降噪', () => {
    const { audio } = mediaConstraints()
    expect(audio.echoCancellation).toBe(true)
    expect(audio.noiseSuppression).toBe(true)
    expect(audio.autoGainControl).toBe(true)
  })

  it('信令通道名固定,便于两端对接', () => {
    expect(CALL_SIGNAL_CHANNEL).toContain('inkline-call')
    expect(CALL_TIMEOUT_MS).toBeGreaterThan(0)
    expect(CALL_STATUS.CONNECTED).toBe('connected')
  })
})

describe('通话文案', () => {
  it('时长格式化', () => {
    expect(formatCallDuration(0)).toBe('0:00')
    expect(formatCallDuration(75)).toBe('1:15')
    expect(formatCallDuration(3725)).toBe('1:02:05')
  })

  it('历史消息事件文案', () => {
    expect(callEventText({ event: 'declined' })).toBe('语音通话被拒绝')
    expect(callEventText({ event: 'missed' })).toBe('语音通话未接听')
    expect(callEventText({ event: 'ended', duration: 65 })).toBe('通话时长 1:05')
    expect(callEventText({})).toBe('语音通话')
  })

  it('麦克风被拒绝时提示去系统设置开启', () => {
    expect(callErrorMessage('denied')).toContain('系统设置')
    expect(callErrorMessage('busy')).toContain('通话中')
    expect(callErrorMessage('unknown-type')).toContain('稍后重试')
  })
})

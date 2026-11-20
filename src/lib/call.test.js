import { describe, expect, it } from 'vitest'

import {
  CALL_PEER_PREFIX,
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  ICE_SERVERS,
  callErrorMessage,
  formatCallDuration,
  peerOptions,
  isPeerFatalError,
  mediaConstraints,
  peerIdFor,
} from './call'

describe('peerIdFor', () => {
  it('给 uuid 加固定前缀', () => {
    expect(peerIdFor('331643c8-3e41-49f0-899a-7b1a9ab07770')).toBe(
      `${CALL_PEER_PREFIX}331643c8-3e41-49f0-899a-7b1a9ab07770`
    )
  })

  it('空值返回空串', () => {
    expect(peerIdFor('')).toBe('')
    expect(peerIdFor(null)).toBe('')
    expect(peerIdFor(undefined)).toBe('')
    expect(peerIdFor('   ')).toBe('')
  })

  it('去掉首尾空白', () => {
    expect(peerIdFor(' abc ')).toBe(`${CALL_PEER_PREFIX}abc`)
  })
})

describe('formatCallDuration', () => {
  it('不足一小时显示 分:秒', () => {
    expect(formatCallDuration(0)).toBe('0:00')
    expect(formatCallDuration(5)).toBe('0:05')
    expect(formatCallDuration(65)).toBe('1:05')
    expect(formatCallDuration(600)).toBe('10:00')
  })

  it('超过一小时显示 时:分:秒', () => {
    expect(formatCallDuration(3600)).toBe('1:00:00')
    expect(formatCallDuration(3725)).toBe('1:02:05')
  })

  it('非法值归零', () => {
    expect(formatCallDuration(-3)).toBe('0:00')
    expect(formatCallDuration('abc')).toBe('0:00')
    expect(formatCallDuration(null)).toBe('0:00')
  })
})

describe('callErrorMessage / isPeerFatalError', () => {
  it('已知错误码有中文提示', () => {
    expect(callErrorMessage('peer-unavailable')).toContain('无法接听')
    expect(callErrorMessage('unavailable-id')).toContain('其他窗口')
    expect(callErrorMessage('webrtc')).toContain('协商失败')
  })

  it('未知错误码有兜底文案', () => {
    expect(callErrorMessage('whatever')).toBe('通话连接失败，请稍后重试')
    expect(callErrorMessage(undefined)).toBe('通话连接失败，请稍后重试')
  })

  it('致命错误判定', () => {
    expect(isPeerFatalError('unavailable-id')).toBe(true)
    expect(isPeerFatalError('browser-incompatible')).toBe(true)
    expect(isPeerFatalError('peer-unavailable')).toBe(false)
    expect(isPeerFatalError(undefined)).toBe(false)
  })
})

describe('peerOptions', () => {
  it('未配置 host 时返回空对象(走 PeerJS 云默认)', () => {
    expect(peerOptions({})).toEqual({})
    expect(peerOptions()).toEqual({})
  })

  it('配置 host 后生成自建服务器参数', () => {
    const opts = peerOptions({ VITE_PEER_HOST: 'peer.example.com' })
    expect(opts).toEqual({ host: 'peer.example.com', port: 443, path: '/', secure: true })
    expect(peerOptions({ VITE_PEER_HOST: 'h', VITE_PEER_PORT: '9000', VITE_PEER_PATH: '/call', VITE_PEER_SECURE: 'false', VITE_PEER_KEY: 'k' })).toEqual({
      host: 'h', port: 9000, path: '/call', secure: false, key: 'k',
    })
  })
})

describe('constants', () => {
  it('状态与配置完整', () => {
    expect(Object.values(CALL_STATUS)).toEqual([
      'idle', 'calling', 'ringing', 'connecting', 'connected', 'failed',
    ])
    expect(CALL_TIMEOUT_MS).toBe(30000)
    expect(ICE_SERVERS.length).toBeGreaterThan(0)
    expect(mediaConstraints().video).toBe(false)
    expect(mediaConstraints().audio.echoCancellation).toBe(true)
  })
})

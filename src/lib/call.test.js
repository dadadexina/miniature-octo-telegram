import { describe, expect, it } from 'vitest'

import {
  CALL_PEER_PREFIX,
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  ICE_SERVERS,
  callErrorMessage,
  callEventText,
  formatCallDuration,
  peerOptions,
  isPeerFatalError,
  mediaConstraints,
  newCallSuffix,
  peerIdFor,
  readCallSuffix,
  resolveCalleePeerId,
  userIdFromPeerId,
  writeCallSuffix,
  CALL_TAB_STORAGE_KEY,
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

  it('附加标签页后缀后彼此不冲突', () => {
    expect(peerIdFor('u1', 'abc123')).toBe(`${CALL_PEER_PREFIX}u1-abc123`)
    expect(peerIdFor('u1', 'abc123')).not.toBe(peerIdFor('u1', 'zzz999'))
  })
})

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    data,
  }
}

describe('标签页后缀', () => {
  it('生成的随机后缀为六位', () => {
    expect(newCallSuffix(() => 0)).toBe('000000')
    expect(newCallSuffix(() => 0.999999)).toHaveLength(6)
  })

  it('同一标签页复用已保存的后缀', () => {
    const storage = fakeStorage()
    const first = readCallSuffix(storage)
    expect(readCallSuffix(storage)).toBe(first)
    expect(storage.data[CALL_TAB_STORAGE_KEY]).toBe(first)
  })

  it('轮换后写入新后缀', () => {
    const storage = fakeStorage()
    readCallSuffix(storage)
    writeCallSuffix(storage, 'next01')
    expect(readCallSuffix(storage)).toBe('next01')
  })

  it('storage 不可用时仍返回可用后缀', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readCallSuffix(broken)).toHaveLength(6)
    expect(readCallSuffix(null)).toHaveLength(6)
  })
})

describe('userIdFromPeerId', () => {
  it('从带后缀的 Peer ID 还原用户 uuid', () => {
    expect(userIdFromPeerId(`${CALL_PEER_PREFIX}75afb679-ca74-4604-bd2a-4c74f5bca58e-ab12cd`)).toBe(
      '75afb679-ca74-4604-bd2a-4c74f5bca58e'
    )
    expect(userIdFromPeerId(`${CALL_PEER_PREFIX}75afb679-ca74-4604-bd2a-4c74f5bca58e`)).toBe(
      '75afb679-ca74-4604-bd2a-4c74f5bca58e'
    )
  })

  it('非本应用前缀或非法内容返回空', () => {
    expect(userIdFromPeerId('abc-123')).toBe('')
    expect(userIdFromPeerId(`${CALL_PEER_PREFIX}not-a-uuid`)).toBe('')
    expect(userIdFromPeerId('')).toBe('')
    expect(userIdFromPeerId(null)).toBe('')
  })
})

describe('resolveCalleePeerId', () => {
  it('优先使用 presence 中最近上报的标签页 ID', () => {
    const state = {
      u2: [{ peerId: `${CALL_PEER_PREFIX}u2-aaa111` }, { peerId: `${CALL_PEER_PREFIX}u2-bbb222` }],
    }
    expect(resolveCalleePeerId(state, 'u2')).toBe(`${CALL_PEER_PREFIX}u2-bbb222`)
  })

  it('对方不在线时回退到旧版固定 ID', () => {
    expect(resolveCalleePeerId({}, 'u2')).toBe(`${CALL_PEER_PREFIX}u2`)
    expect(resolveCalleePeerId({ u2: [{ peerId: '' }] }, 'u2')).toBe(`${CALL_PEER_PREFIX}u2`)
  })

  it('忽略非法条目与空用户', () => {
    expect(resolveCalleePeerId({ u2: [{ peerId: 'bad' }] }, 'u2')).toBe(`${CALL_PEER_PREFIX}u2`)
    expect(resolveCalleePeerId({ u2: [{ peerId: `${CALL_PEER_PREFIX}u2-x` }] }, '')).toBe('')
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

describe('callEventText', () => {
  it('按事件生成系统提示文案', () => {
    expect(callEventText({ event: 'cancelled' })).toBe('语音通话已取消')
    expect(callEventText({ event: 'declined' })).toBe('语音通话被拒绝')
    expect(callEventText({ event: 'missed' })).toBe('语音通话未接听')
    expect(callEventText({ event: 'ended', duration: 65 })).toBe('通话时长 1:05')
    expect(callEventText({ event: 'unknown' })).toBe('语音通话')
    expect(callEventText(null)).toBe('语音通话')
  })
})

describe('callErrorMessage / isPeerFatalError', () => {
  it('已知错误码有中文提示', () => {
    expect(callErrorMessage('peer-unavailable')).toContain('不在线')
    expect(callErrorMessage('unavailable-id')).toContain('刷新页面')
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

import { describe, expect, it } from 'vitest'
import { isRecoveryCallback } from './recovery'

describe('isRecoveryCallback', () => {
  it('识别 hash 中的 recovery 回调', () => {
    expect(isRecoveryCallback({ hash: '#access_token=t&type=recovery&refresh_token=r' })).toBe(true)
  })

  it('识别 query 中的 recovery 回调', () => {
    expect(isRecoveryCallback({ search: '?type=recovery&token_hash=abc' })).toBe(true)
  })

  it('普通登录回调不误判', () => {
    expect(isRecoveryCallback({ hash: '#access_token=t&type=bearer' })).toBe(false)
  })

  it('空位置不误判', () => {
    expect(isRecoveryCallback({})).toBe(false)
  })
})

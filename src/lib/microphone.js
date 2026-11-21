import { mediaConstraints } from './call'

export const MIC_ERROR_TEXT = {
  denied: '麦克风权限已被关闭，请在手机系统设置中开启后再试',
  unavailable: '当前设备没有可用的麦克风',
  busy: '麦克风被其他应用占用，请关闭后重试',
  insecure: '当前环境不是安全连接，无法使用麦克风',
  unknown: '无法获取麦克风权限，请检查系统设置',
}

export function micError(code) {
  const err = new Error(MIC_ERROR_TEXT[code] || MIC_ERROR_TEXT.unknown)
  err.code = code
  return err
}

export function micApi(win = typeof window === 'undefined' ? null : window) {
  return win?.navigator?.mediaDevices || null
}

export async function micPermissionState(win = typeof window === 'undefined' ? null : window) {
  try {
    const permissions = win?.navigator?.permissions
    if (!permissions?.query) return 'unknown'
    const status = await permissions.query({ name: 'microphone' })
    return status?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function onMicPermissionChange(handler, win = typeof window === 'undefined' ? null : window) {
  const permissions = win?.navigator?.permissions
  if (!permissions?.query || typeof handler !== 'function') return () => {}
  let status = null
  let disposed = false
  permissions
    .query({ name: 'microphone' })
    .then((result) => {
      if (disposed) return
      status = result
      const listener = () => handler(result.state)
      result.addEventListener?.('change', listener)
      status.__listener = listener
    })
    .catch(() => {})
  return () => {
    disposed = true
    if (status?.__listener) status.removeEventListener?.('change', status.__listener)
  }
}

/**
 * 申请麦克风:
 * - 浏览器已拒绝(权限状态为 denied)时直接抛错,不再触发系统询问,避免反复弹窗;
 * - 首次或已授权时才真正调用 getUserMedia,提示只出现一次。
 */
export async function requestMicStream(win = typeof window === 'undefined' ? null : window) {
  const api = micApi(win)
  if (!api?.getUserMedia) throw micError('insecure')
  const state = await micPermissionState(win)
  if (state === 'denied') throw micError('denied')
  try {
    return await api.getUserMedia(mediaConstraints())
  } catch (err) {
    const name = err?.name || ''
    if (name === 'NotAllowedError' || name === 'SecurityError' || state === 'denied') {
      throw micError('denied')
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      throw micError('unavailable')
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      throw micError('busy')
    }
    throw micError('unknown')
  }
}

export function stopStream(stream) {
  if (!stream?.getTracks) return
  stream.getTracks().forEach((track) => {
    try {
      track.stop()
    } catch {
      /* ignore */
    }
  })
}

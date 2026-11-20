import { useCallback, useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'

import {
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  ICE_SERVERS,
  callErrorMessage,
  isPeerFatalError,
  mediaConstraints,
  peerIdFor,
  peerOptions,
} from '../lib/call'

const MIC_ERROR = '无法获取麦克风权限，请在浏览器设置中允许麦克风访问'
const SIGNAL_OPEN_TIMEOUT_MS = 8000

function waitPeerOpen(peer, timeoutMs = SIGNAL_OPEN_TIMEOUT_MS) {
  if (!peer || peer.destroyed) return Promise.reject(new Error('信号通道不可用'))
  if (peer.open) return Promise.resolve(peer)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, payload) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      peer.off('open', onOpen)
      peer.off('error', onError)
      fn(payload)
    }
    const onOpen = () => finish(resolve, peer)
    const onError = () => finish(reject, new Error(callErrorMessage('signaling-timeout')))
    const timer = setTimeout(() => finish(reject, new Error(callErrorMessage('signaling-timeout'))), timeoutMs)
    peer.on('open', onOpen)
    peer.on('error', onError)
  })
}

export default function useVoiceCall({ myId, remoteId, enabled }) {
  const [status, setStatus] = useState(CALL_STATUS.IDLE)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [remoteStream, setRemoteStream] = useState(null)

  const statusRef = useRef(CALL_STATUS.IDLE)
  const peerRef = useRef(null)
  const callRef = useRef(null)
  const incomingRef = useRef(null)
  const localStreamRef = useRef(null)
  const timerRef = useRef(null)
  const timeoutRef = useRef(null)

  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const stopTracks = useCallback(() => {
    const stream = localStreamRef.current
    localStreamRef.current = null
    if (!stream) return
    stream.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    })
  }, [])

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const teardown = useCallback(
    (next = CALL_STATUS.IDLE) => {
      clearTimers()
      const call = callRef.current
      callRef.current = null
      if (call) {
        try {
          call.close()
        } catch {
          /* ignore */
        }
      }
      const incoming = incomingRef.current
      incomingRef.current = null
      if (incoming) {
        try {
          incoming.close()
        } catch {
          /* ignore */
        }
      }
      stopTracks()
      setRemoteStream(null)
      setSeconds(0)
      setMuted(false)
      applyStatus(next)
    },
    [applyStatus, clearTimers, stopTracks]
  )

  const wireCall = useCallback(
    (call) => {
      callRef.current = call
      call.on('stream', (stream) => {
        clearTimers()
        setRemoteStream(stream)
        setSeconds(0)
        setError('')
        applyStatus(CALL_STATUS.CONNECTED)
        timerRef.current = setInterval(() => setSeconds((v) => v + 1), 1000)
      })
      call.on('close', () => teardown())
      call.on('error', (err) => {
        setError(callErrorMessage(err?.type === 'webrtc' ? 'webrtc' : undefined))
        teardown(CALL_STATUS.FAILED)
      })
    },
    [applyStatus, clearTimers, teardown]
  )

  const ensurePeer = useCallback(() => {
    if (!enabled) return null
    if (peerRef.current) return peerRef.current
    const selfId = peerIdFor(myId)
    if (!selfId) return null
    const peer = new Peer(selfId, {
      config: { iceServers: ICE_SERVERS },
      debug: 0,
      ...peerOptions(import.meta.env || {}),
    })
    peerRef.current = peer

    peer.on('call', (call) => {
      if (statusRef.current !== CALL_STATUS.IDLE) {
        try {
          call.close()
        } catch {
          /* ignore */
        }
        return
      }
      incomingRef.current = call
      setError('')
      applyStatus(CALL_STATUS.RINGING)
      call.on('close', () => {
        if (incomingRef.current === call) teardown()
      })
    })

    peer.on('error', (err) => {
      const type = err?.type
      setError(callErrorMessage(type))
      if (statusRef.current !== CALL_STATUS.IDLE) teardown(CALL_STATUS.FAILED)
      if (isPeerFatalError(type) && peerRef.current === peer) {
        peerRef.current = null
        try {
          peer.destroy()
        } catch {
          /* ignore */
        }
      }
    })

    peer.on('disconnected', () => {
      try {
        peer.reconnect()
      } catch {
        /* ignore */
      }
    })

    return peer
  }, [applyStatus, enabled, myId, teardown])

  const start = useCallback(async () => {
    if (!enabled) {
      setError('登录后才能使用语音通话')
      applyStatus(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.IDLE) return
    const peer = ensurePeer()
    if (!peer) {
      setError('通话功能初始化失败，请刷新后重试')
      applyStatus(CALL_STATUS.FAILED)
      return
    }
    const target = peerIdFor(remoteId)
    if (!target) {
      setError('对方账号无效，无法呼叫')
      applyStatus(CALL_STATUS.FAILED)
      return
    }

    setError('')
    setSeconds(0)
    setMuted(false)
    applyStatus(CALL_STATUS.CALLING)

    try {
      await waitPeerOpen(peer)
    } catch (err) {
      setError((prev) => prev || err?.message || callErrorMessage('signaling-timeout'))
      if (statusRef.current !== CALL_STATUS.FAILED) teardown(CALL_STATUS.FAILED)
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints())
    } catch {
      setError(MIC_ERROR)
      teardown(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.CALLING) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    localStreamRef.current = stream

    let call
    try {
      call = peer.call(target, stream, { metadata: { kind: 'audio' } })
    } catch {
      call = null
    }
    if (!call) {
      setError('呼叫发起失败，请稍后重试')
      teardown(CALL_STATUS.FAILED)
      return
    }
    wireCall(call)
    timeoutRef.current = setTimeout(() => {
      if (statusRef.current === CALL_STATUS.CALLING) {
        setError('对方无应答')
        teardown(CALL_STATUS.FAILED)
      }
    }, CALL_TIMEOUT_MS)
  }, [applyStatus, enabled, ensurePeer, remoteId, teardown, wireCall])

  const answer = useCallback(async () => {
    const call = incomingRef.current
    if (!call) return
    incomingRef.current = null
    applyStatus(CALL_STATUS.CONNECTING)
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints())
    } catch {
      setError(MIC_ERROR)
      teardown(CALL_STATUS.FAILED)
      return
    }
    localStreamRef.current = stream
    wireCall(call)
    try {
      call.answer(stream)
    } catch {
      setError('接听失败，请稍后重试')
      teardown(CALL_STATUS.FAILED)
    }
  }, [applyStatus, teardown, wireCall])

  const decline = useCallback(() => {
    teardown()
  }, [teardown])

  const hangup = useCallback(() => {
    teardown()
  }, [teardown])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const tracks = stream.getAudioTracks()
    if (!tracks.length) return
    const nextEnabled = !tracks[0].enabled
    tracks.forEach((track) => {
      track.enabled = nextEnabled
    })
    setMuted(!nextEnabled)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    ensurePeer()
    return () => {
      teardown()
      const peer = peerRef.current
      peerRef.current = null
      if (peer) {
        try {
          peer.destroy()
        } catch {
          /* ignore */
        }
      }
    }
  }, [enabled, ensurePeer, teardown])

  return {
    status,
    error,
    seconds,
    muted,
    remoteStream,
    start,
    answer,
    decline,
    hangup,
    toggleMute,
  }
}

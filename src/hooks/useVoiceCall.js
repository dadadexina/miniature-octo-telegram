import { useCallback, useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'

import { supabase } from '../lib/supabase'
import {
  CALL_PRESENCE_CHANNEL,
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  ICE_SERVERS,
  callErrorMessage,
  isPeerFatalError,
  mediaConstraints,
  newCallSuffix,
  peerIdFor,
  peerOptions,
  readCallSuffix,
  resolveCalleePeerId,
  writeCallSuffix,
} from '../lib/call'

const MIC_ERROR = '无法获取麦克风权限，请在浏览器设置中允许麦克风访问'
const SIGNAL_OPEN_TIMEOUT_MS = 8000
const PRESENCE_WAIT_MS = 2000
const MAX_ID_RETRIES = 3

function tabStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
    const onError = (err) => finish(reject, new Error(callErrorMessage(err?.type || 'signaling-timeout')))
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

  const suffixRef = useRef('')
  const idRetryRef = useRef(0)
  const channelRef = useRef(null)
  const subscribedRef = useRef(false)
  const presenceRef = useRef({})
  const presenceReadyRef = useRef(false)

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

  const trackPresence = useCallback(() => {
    const channel = channelRef.current
    const peer = peerRef.current
    if (!channel || !subscribedRef.current || !peer || peer.destroyed) return
    const peerId = peer.id || peerIdFor(myId, suffixRef.current)
    if (!peerId) return
    try {
      channel.track({ peerId })
    } catch {
      /* ignore */
    }
  }, [myId])

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

  const ensurePeer = useCallback(
    function createPeer() {
      if (!enabled || !myId) return null
      if (peerRef.current) return peerRef.current
      if (!suffixRef.current) {
        suffixRef.current = readCallSuffix(tabStorage())
      }
      const selfId = peerIdFor(myId, suffixRef.current)
      if (!selfId) return null
      const peer = new Peer(selfId, {
        config: { iceServers: ICE_SERVERS },
        debug: 0,
        ...peerOptions(import.meta.env || {}),
      })
      peerRef.current = peer

      peer.on('open', () => {
        idRetryRef.current = 0
        trackPresence()
      })

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
        if (type === 'unavailable-id' && peerRef.current === peer) {
          peerRef.current = null
          try {
            peer.destroy()
          } catch {
            /* ignore */
          }
          if (idRetryRef.current < MAX_ID_RETRIES) {
            idRetryRef.current += 1
            const next = newCallSuffix()
            suffixRef.current = next
            writeCallSuffix(tabStorage(), next)
            createPeer()
            return
          }
        }
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
    },
    [applyStatus, enabled, myId, teardown, trackPresence]
  )

  const resolveTarget = useCallback(async () => {
    const deadline = Date.now() + PRESENCE_WAIT_MS
    while (!presenceReadyRef.current && Date.now() < deadline) {
      await sleep(100)
    }
    return resolveCalleePeerId(presenceRef.current, remoteId)
  }, [remoteId])

  const start = useCallback(async () => {
    if (!enabled) {
      setError('登录后才能使用语音通话')
      applyStatus(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.IDLE) return
    let peer = ensurePeer()
    if (!peer) {
      setError('通话功能初始化失败，请刷新后重试')
      applyStatus(CALL_STATUS.FAILED)
      return
    }

    setError('')
    setSeconds(0)
    setMuted(false)
    applyStatus(CALL_STATUS.CALLING)

    const target = await resolveTarget()
    if (!target) {
      setError('对方账号无效，无法呼叫')
      teardown(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.CALLING) return

    let openError = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await waitPeerOpen(peer)
        openError = null
        break
      } catch (err) {
        openError = err
        const next = peerRef.current
        if (!next || next === peer || next.destroyed) break
        peer = next
      }
    }
    if (openError) {
      setError((prev) => prev || openError.message || callErrorMessage('signaling-timeout'))
      if (statusRef.current !== CALL_STATUS.FAILED) teardown(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.CALLING) return

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
  }, [applyStatus, enabled, ensurePeer, resolveTarget, teardown, wireCall])

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
    if (!enabled || !myId) return undefined
    ensurePeer()
    const channel = supabase.channel(CALL_PRESENCE_CHANNEL, {
      config: { presence: { key: myId, enabled: true } },
    })
    channelRef.current = channel
    channel.on('presence', { event: 'sync' }, () => {
      presenceRef.current = channel.presenceState()
      presenceReadyRef.current = true
    })
    channel.subscribe((state) => {
      subscribedRef.current = state === 'SUBSCRIBED'
      if (subscribedRef.current) trackPresence()
    })
    return () => {
      presenceRef.current = {}
      presenceReadyRef.current = false
      subscribedRef.current = false
      channelRef.current = null
      try {
        supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
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
  }, [enabled, ensurePeer, myId, teardown, trackPresence])

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

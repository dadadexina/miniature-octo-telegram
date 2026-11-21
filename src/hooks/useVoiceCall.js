import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CALL_CONNECT_TIMEOUT_MS,
  CALL_PRESENCE_CHANNEL,
  CALL_RING_TIMEOUT_MS,
  CALL_SIGNAL_CHANNEL,
  CALL_STATUS,
  CALL_TIMEOUT_MS,
  SIGNAL_EVENTS,
  canUseCalls,
  callErrorMessage,
  isSameCall,
  isSignalFor,
  makeCallId,
  makeSignal,
  peerConnectionConfig,
  validCandidate,
  validSdp,
} from '../lib/call'
import { requestMicStream, stopStream } from '../lib/microphone'
import { supabase } from '../lib/supabase'

const SIGNAL_WAIT_MS = 3000
const SIGNAL_EVENTS_LIST = Object.values(SIGNAL_EVENTS)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function useVoiceCall({ myId, remoteId, enabled, onCallEnded }) {
  const [status, setStatus] = useState(CALL_STATUS.IDLE)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [remoteStream, setRemoteStream] = useState(null)
  const [remoteUserId, setRemoteUserId] = useState('')

  const statusRef = useRef(CALL_STATUS.IDLE)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const callIdRef = useRef('')
  const peerIdRef = useRef('')
  const dirRef = useRef('')
  const remoteUserRef = useRef('')
  const connectedAtRef = useRef(0)
  const endedRef = useRef(false)
  const onEndedRef = useRef(null)

  useEffect(() => {
    onEndedRef.current = onCallEnded
  }, [onCallEnded])

  const timerRef = useRef(null)
  const timeoutRef = useRef(null)
  const resendRef = useRef(null)
  const signalChannelRef = useRef(null)
  const signalReadyRef = useRef(false)
  const presenceRef = useRef({})
  const presenceReadyRef = useRef(false)
  const pendingCandidatesRef = useRef([])
  const pendingOfferRef = useRef(null)
  const signalHandlerRef = useRef(null)

  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
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
    if (resendRef.current) {
      clearTimeout(resendRef.current)
      resendRef.current = null
    }
  }, [])

  const stopLocalStream = useCallback(() => {
    const stream = localStreamRef.current
    localStreamRef.current = null
    stopStream(stream)
  }, [])

  const emitEnded = useCallback((reason) => {
    if (endedRef.current) return
    endedRef.current = true
    const cb = onEndedRef.current
    const userId = remoteUserRef.current
    const direction = dirRef.current
    if (!cb || !userId || !direction) return
    const duration = connectedAtRef.current
      ? Math.max(0, Math.round((Date.now() - connectedAtRef.current) / 1000))
      : 0
    cb({ userId, direction, reason, duration })
  }, [])

  const sendSignal = useCallback((event, details) => {
    const channel = signalChannelRef.current
    if (!channel) return
    try {
      channel.send({
        type: 'broadcast',
        event,
        payload: makeSignal(event, details),
      })
    } catch {
      /* 信令通道暂时不可用时依赖超时兜底 */
    }
  }, [])

  const hangupRemote = useCallback(() => {
    const to = peerIdRef.current
    const callId = callIdRef.current
    if (!to || !callId) return
    sendSignal(SIGNAL_EVENTS.HANGUP, { callId, from: myId, to })
  }, [myId, sendSignal])

  const closePc = useCallback(() => {
    const pc = pcRef.current
    pcRef.current = null
    if (!pc) return
    try {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.close()
    } catch {
      /* ignore */
    }
  }, [])

  const teardown = useCallback(
    (next = CALL_STATUS.IDLE) => {
      clearTimers()
      closePc()
      stopLocalStream()
      pendingCandidatesRef.current = []
      pendingOfferRef.current = null
      callIdRef.current = ''
      peerIdRef.current = ''
      dirRef.current = ''
      remoteUserRef.current = ''
      connectedAtRef.current = 0
      setRemoteStream(null)
      setRemoteUserId('')
      setSeconds(0)
      setMuted(false)
      applyStatus(next)
    },
    [applyStatus, clearTimers, closePc, stopLocalStream]
  )

  const markConnected = useCallback(() => {
    if (statusRef.current === CALL_STATUS.RINGING) return
    if (statusRef.current === CALL_STATUS.CONNECTED) return
    clearTimers()
    connectedAtRef.current = Date.now()
    setSeconds(0)
    setError('')
    applyStatus(CALL_STATUS.CONNECTED)
    timerRef.current = setInterval(() => setSeconds((v) => v + 1), 1000)
  }, [applyStatus, clearTimers])

  const fail = useCallback(
    (message) => {
      setError(message || callErrorMessage('connect'))
      teardown(CALL_STATUS.FAILED)
    },
    [teardown]
  )

  const addPendingCandidates = useCallback(async (pc) => {
    const list = pendingCandidatesRef.current
    pendingCandidatesRef.current = []
    for (const candidate of list) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        /* 单条候选失败不阻断通话 */
      }
    }
  }, [])

  const createPeerConnection = useCallback(
    (to) => {
      const pc = new RTCPeerConnection(peerConnectionConfig())
      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        const callId = callIdRef.current
        if (!callId) return
        sendSignal(SIGNAL_EVENTS.ICE, {
          callId,
          from: myId,
          to,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        })
      }
      pc.ontrack = (event) => {
        const [stream] = event.streams || []
        if (!stream) return
        setRemoteStream(stream)
        if (pc.connectionState === 'connected') markConnected()
      }
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return
        if (pc.connectionState === 'connected') markConnected()
        if (pc.connectionState === 'failed') fail(callErrorMessage('connect'))
        if (pc.connectionState === 'closed' && statusRef.current === CALL_STATUS.CONNECTED) teardown()
      }
      pc.oniceconnectionstatechange = () => {
        if (pcRef.current !== pc) return
        if (pc.iceConnectionState === 'failed') fail(callErrorMessage('connect'))
      }
      pcRef.current = pc
      return pc
    },
    [fail, markConnected, myId, sendSignal, teardown]
  )

  const attachLocalTracks = useCallback((pc, stream) => {
    stream.getTracks().forEach((track) => {
      try {
        pc.addTrack(track, stream)
      } catch {
        /* ignore */
      }
    })
  }, [])

  const decline = useCallback(() => {
    const to = peerIdRef.current
    const callId = callIdRef.current
    if (to && callId) sendSignal(SIGNAL_EVENTS.DECLINE, { callId, from: myId, to })
    if (statusRef.current === CALL_STATUS.RINGING || statusRef.current === CALL_STATUS.CONNECTING) {
      emitEnded('declined')
    }
    teardown()
  }, [emitEnded, myId, sendSignal, teardown])

  const hangup = useCallback(() => {
    hangupRemote()
    if (connectedAtRef.current) emitEnded('ended')
    else if (statusRef.current === CALL_STATUS.RINGING) emitEnded('declined')
    else if (statusRef.current === CALL_STATUS.CALLING) emitEnded('cancelled')
    teardown()
  }, [emitEnded, hangupRemote, teardown])

  const abort = useCallback(
    (message) => {
      endedRef.current = true
      hangupRemote()
      setError(message || '通话已结束')
      teardown(CALL_STATUS.FAILED)
    },
    [hangupRemote, teardown]
  )

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

  const answer = useCallback(async () => {
    const pc = pcRef.current
    const callId = callIdRef.current
    const to = peerIdRef.current
    if (!pc || !callId || statusRef.current !== CALL_STATUS.RINGING) return
    clearTimers()
    applyStatus(CALL_STATUS.CONNECTING)
    let stream
    try {
      stream = await requestMicStream()
    } catch (err) {
      sendSignal(SIGNAL_EVENTS.DECLINE, { callId, from: myId, to })
      setError(err?.message || callErrorMessage('mic'))
      teardown(CALL_STATUS.FAILED)
      return
    }
    if (statusRef.current !== CALL_STATUS.CONNECTING || pcRef.current !== pc) {
      stopStream(stream)
      return
    }
    localStreamRef.current = stream
    attachLocalTracks(pc, stream)
    try {
      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)
      sendSignal(SIGNAL_EVENTS.ACCEPTED, { callId, from: myId, to })
      sendSignal(SIGNAL_EVENTS.ANSWER, { callId, from: myId, to, sdp: pc.localDescription.sdp })
    } catch {
      fail(callErrorMessage('connect'))
      return
    }
    timeoutRef.current = setTimeout(() => {
      if (statusRef.current === CALL_STATUS.CONNECTING) {
        hangupRemote()
        fail(callErrorMessage('connect'))
      }
    }, CALL_CONNECT_TIMEOUT_MS)
  }, [applyStatus, attachLocalTracks, clearTimers, fail, hangupRemote, myId, sendSignal, teardown])

  const start = useCallback(
    async (calleeOverride) => {
      if (!enabled) {
        setError('登录后才能使用语音通话')
        applyStatus(CALL_STATUS.FAILED)
        return
      }
      if (statusRef.current !== CALL_STATUS.IDLE) return
      const to = String(calleeOverride || remoteId || '').trim()
      if (!to || to === myId) {
        setError('无法呼叫该用户')
        applyStatus(CALL_STATUS.FAILED)
        return
      }
      if (!canUseCalls()) {
        setError(callErrorMessage('unsupported'))
        applyStatus(CALL_STATUS.FAILED)
        return
      }

      if (presenceReadyRef.current && !presenceRef.current[to]) {
        setError(callErrorMessage('offline'))
        applyStatus(CALL_STATUS.FAILED)
        return
      }

      // 先申请麦克风:点击手势内完成授权,浏览器只会询问这一次
      let stream
      try {
        stream = await requestMicStream()
      } catch (err) {
        setError(err?.message || callErrorMessage('mic'))
        applyStatus(CALL_STATUS.FAILED)
        return
      }

      const deadline = Date.now() + SIGNAL_WAIT_MS
      while (!signalReadyRef.current && Date.now() < deadline) {
        await sleep(80)
      }
      if (!signalReadyRef.current) {
        stopStream(stream)
        setError(callErrorMessage('signaling'))
        applyStatus(CALL_STATUS.FAILED)
        return
      }

      localStreamRef.current = stream
      const callId = makeCallId(myId)
      callIdRef.current = callId
      peerIdRef.current = to
      remoteUserRef.current = to
      dirRef.current = 'out'
      endedRef.current = false
      setError('')
      setSeconds(0)
      setMuted(false)
      applyStatus(CALL_STATUS.CALLING)

      const pc = createPeerConnection(to)
      attachLocalTracks(pc, stream)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendSignal(SIGNAL_EVENTS.INVITE, { callId, from: myId, to, sdp: pc.localDescription.sdp })
      } catch {
        fail(callErrorMessage('connect'))
        return
      }

      // 对方可能刚启动或正在重连,补发一次邀请,避免首帧信令丢失导致一直无人接听
      resendRef.current = setTimeout(() => {
        if (statusRef.current !== CALL_STATUS.CALLING || callIdRef.current !== callId) return
        const sdp = pcRef.current?.localDescription?.sdp
        if (!sdp) return
        sendSignal(SIGNAL_EVENTS.INVITE, { callId, from: myId, to, sdp })
      }, 2500)

      timeoutRef.current = setTimeout(() => {
        if (statusRef.current !== CALL_STATUS.CALLING) return
        sendSignal(SIGNAL_EVENTS.CANCEL, { callId, from: myId, to })
        emitEnded('missed')
        setError(callErrorMessage('timeout'))
        teardown(CALL_STATUS.FAILED)
      }, CALL_TIMEOUT_MS)
    },
    [
      applyStatus,
      attachLocalTracks,
      createPeerConnection,
      emitEnded,
      enabled,
      fail,
      myId,
      remoteId,
      sendSignal,
      teardown,
    ]
  )

  const handleInvite = useCallback(
    async (payload) => {
      if (statusRef.current !== CALL_STATUS.IDLE) {
        // 同一次呼叫的重复邀请直接忽略,避免接听方误报忙线
        if (isSameCall(payload, callIdRef.current) && statusRef.current === CALL_STATUS.RINGING) return
        sendSignal(SIGNAL_EVENTS.BUSY, { callId: payload.callId, from: myId, to: payload.from })
        return
      }
      if (!validSdp(payload.sdp) || !canUseCalls()) {
        sendSignal(SIGNAL_EVENTS.DECLINE, { callId: payload.callId, from: myId, to: payload.from })
        return
      }
      const pc = createPeerConnection(payload.from)
      callIdRef.current = payload.callId
      peerIdRef.current = payload.from
      remoteUserRef.current = payload.from
      dirRef.current = 'in'
      endedRef.current = false
      pendingCandidatesRef.current = []
      setError('')
      setRemoteUserId(payload.from)
      applyStatus(CALL_STATUS.RINGING)
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        await addPendingCandidates(pc)
      } catch {
        sendSignal(SIGNAL_EVENTS.DECLINE, { callId: payload.callId, from: myId, to: payload.from })
        teardown(CALL_STATUS.FAILED)
        return
      }
      clearTimers()
      timeoutRef.current = setTimeout(() => {
        if (statusRef.current !== CALL_STATUS.RINGING) return
        sendSignal(SIGNAL_EVENTS.DECLINE, { callId: payload.callId, from: myId, to: payload.from })
        teardown()
      }, CALL_RING_TIMEOUT_MS)
    },
    [addPendingCandidates, applyStatus, clearTimers, createPeerConnection, myId, sendSignal, teardown]
  )

  const handleAnswer = useCallback(
    async (payload) => {
      const pc = pcRef.current
      if (!pc || !isSameCall(payload, callIdRef.current) || dirRef.current !== 'out') return
      if (!validSdp(payload.sdp)) return
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        await addPendingCandidates(pc)
      } catch {
        fail(callErrorMessage('connect'))
      }
    },
    [addPendingCandidates, fail]
  )

  const handleIce = useCallback(async (payload) => {
    const pc = pcRef.current
    if (!pc || !isSameCall(payload, callIdRef.current)) return
    if (!validCandidate(payload.candidate)) return
    if (!pc.remoteDescription) {
      pendingCandidatesRef.current.push(payload.candidate)
      return
    }
    try {
      await pc.addIceCandidate(payload.candidate)
    } catch {
      /* ignore */
    }
  }, [])

  const handleSignal = useCallback(
    (event, payload) => {
      if (!isSignalFor(payload, myId)) return
      if (event === SIGNAL_EVENTS.INVITE) {
        handleInvite(payload)
        return
      }
      if (!isSameCall(payload, callIdRef.current)) return
      if (event === SIGNAL_EVENTS.ANSWER) {
        handleAnswer(payload)
        return
      }
      if (event === SIGNAL_EVENTS.ICE) {
        handleIce(payload)
        return
      }
      if (event === SIGNAL_EVENTS.ACCEPTED) {
        if (statusRef.current === CALL_STATUS.RINGING) teardown()
        return
      }
      if (event === SIGNAL_EVENTS.DECLINE) {
        if (dirRef.current === 'out' && (statusRef.current === CALL_STATUS.CALLING || statusRef.current === CALL_STATUS.CONNECTING)) {
          emitEnded('declined')
          setError('对方已拒绝通话')
          teardown(CALL_STATUS.FAILED)
        }
        return
      }
      if (event === SIGNAL_EVENTS.BUSY) {
        if (dirRef.current === 'out') {
          emitEnded('missed')
          setError(callErrorMessage('busy'))
          teardown(CALL_STATUS.FAILED)
        }
        return
      }
      if (event === SIGNAL_EVENTS.CANCEL) {
        if (dirRef.current === 'in' && statusRef.current === CALL_STATUS.RINGING) {
          emitEnded('missed')
          teardown()
        }
        return
      }
      if (event === SIGNAL_EVENTS.HANGUP) {
        if (connectedAtRef.current) emitEnded('ended')
        else if (dirRef.current === 'in' && statusRef.current === CALL_STATUS.RINGING) emitEnded('missed')
        else if (dirRef.current === 'out') emitEnded('cancelled')
        teardown()
      }
    },
    [emitEnded, handleAnswer, handleIce, handleInvite, myId, teardown]
  )

  useEffect(() => {
    signalHandlerRef.current = handleSignal
  }, [handleSignal])

  useEffect(() => {
    if (!enabled || !myId) return undefined
    const channel = supabase.channel(CALL_SIGNAL_CHANNEL, {
      config: { broadcast: { self: false } },
    })
    signalChannelRef.current = channel
    SIGNAL_EVENTS_LIST.forEach((event) => {
      channel.on('broadcast', { event }, (message) => {
        signalHandlerRef.current?.(event, message?.payload)
      })
    })
    channel.subscribe((state) => {
      signalReadyRef.current = state === 'SUBSCRIBED'
    })
    return () => {
      signalReadyRef.current = false
      signalChannelRef.current = null
      try {
        supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [enabled, myId])

  useEffect(() => {
    if (!enabled || !myId) return undefined
    const channel = supabase.channel(CALL_PRESENCE_CHANNEL, {
      config: { presence: { key: myId, enabled: true } },
    })
    channel.on('presence', { event: 'sync' }, () => {
      presenceRef.current = channel.presenceState()
      presenceReadyRef.current = true
    })
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        try {
          channel.track({ at: Date.now() })
        } catch {
          /* ignore */
        }
      }
    })
    return () => {
      presenceRef.current = {}
      presenceReadyRef.current = false
      try {
        supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      teardown()
    }
  }, [enabled, myId, teardown])

  return {
    status,
    error,
    seconds,
    muted,
    remoteStream,
    remoteUserId,
    start,
    answer,
    decline,
    hangup,
    abort,
    toggleMute,
  }
}

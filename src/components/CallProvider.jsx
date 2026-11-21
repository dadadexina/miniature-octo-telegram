import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import CallOverlay from './CallOverlay'
import useVoiceCall from '../hooks/useVoiceCall'
import { CALL_STATUS } from '../lib/call'
import { CallContext } from '../lib/callContext'
import { insertMessage, isUuid } from '../lib/messages'
import { useStore } from '../store'

export default function CallProvider({ children }) {
  const { currentUser, getUser, avatarColor, inbox } = useStore()
  const [targetId, setTargetId] = useState('')
  const startedAtRef = useRef(0)
  const myId = currentUser?.id
  const enabled = Boolean(myId) && isUuid(myId)

  const handleCallEnded = useCallback(
    ({ userId, reason, duration }) => {
      if (!isUuid(myId) || !isUuid(userId)) return
      insertMessage({
        senderId: myId,
        receiverId: userId,
        content: '',
        attachments: { type: 'call', event: reason, duration },
      }).catch(() => {})
    },
    [myId]
  )

  const call = useVoiceCall({ myId, remoteId: targetId, enabled, onCallEnded: handleCallEnded })
  const { start } = call
  const incoming = call.status === CALL_STATUS.RINGING
  const activeId = incoming ? call.remoteUserId : targetId
  const peer = getUser(activeId) || (activeId ? { id: activeId, nickname: '用户', publicId: '' } : { id: '', nickname: '用户' })

  const startCall = useCallback(
    (peerUserId) => {
      const id = String(peerUserId || '').trim()
      if (!id) return
      startedAtRef.current = Date.now()
      setTargetId(id)
      start(id)
    },
    [start]
  )

  useEffect(() => {
    const active = call.status === CALL_STATUS.CALLING || call.status === CALL_STATUS.CONNECTED
    if (!active || !targetId) return
    const hit = (inbox || []).find(
      (msg) =>
        msg?.fromId === targetId &&
        msg?.attachments?.type === 'call' &&
        (msg.attachments.event === 'declined' || msg.attachments.event === 'ended') &&
        (msg.time || 0) >= startedAtRef.current - 2000
    )
    if (!hit) return
    call.abort(hit.attachments.event === 'declined' ? '对方已拒绝通话' : '对方已挂断')
  }, [call, inbox, targetId])

  const value = useMemo(() => ({ startCall, status: call.status }), [call.status, startCall])

  return (
    <CallContext.Provider value={value}>
      {children}
      {call.status !== CALL_STATUS.IDLE ? (
        <CallOverlay
          state={call.status}
          seconds={call.seconds}
          muted={call.muted}
          error={call.error}
          peer={peer}
          color={avatarColor(peer.id)}
          remoteStream={call.remoteStream}
          onAnswer={call.answer}
          onDecline={call.decline}
          onHangup={call.hangup}
          onToggleMute={call.toggleMute}
        />
      ) : null}
    </CallContext.Provider>
  )
}

import { useCallback, useMemo, useState } from 'react'

import CallOverlay from './CallOverlay'
import useVoiceCall from '../hooks/useVoiceCall'
import { CALL_STATUS } from '../lib/call'
import { CallContext } from '../lib/callContext'
import { isUuid } from '../lib/messages'
import { useStore } from '../store'

export default function CallProvider({ children }) {
  const { currentUser, getUser, avatarColor } = useStore()
  const [targetId, setTargetId] = useState('')
  const myId = currentUser?.id
  const enabled = Boolean(myId) && isUuid(myId)

  const call = useVoiceCall({ myId, remoteId: targetId, enabled })
  const { start } = call
  const incoming = call.status === CALL_STATUS.RINGING
  const activeId = incoming ? call.remoteUserId : targetId
  const peer = getUser(activeId) || (activeId ? { id: activeId, nickname: '用户', publicId: '' } : { id: '', nickname: '用户' })

  const startCall = useCallback(
    (peerUserId) => {
      const id = String(peerUserId || '').trim()
      if (!id) return
      setTargetId(id)
      start(id)
    },
    [start]
  )

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

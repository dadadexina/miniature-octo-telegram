import { useCallback, useEffect, useRef, useState } from 'react'

import { SPEAKER_STORAGE_KEY, formatCallDuration } from '../lib/call'
import Avatar from './Avatar'

const STATUS_TEXT = {
  calling: '正在呼叫对方...',
  ringing: '邀请你语音通话',
  connecting: '正在接通...',
  connected: '通话中',
}

export default function CallOverlay({
  state = 'calling',
  seconds = 0,
  muted = false,
  error = '',
  peer,
  color,
  remoteStream = null,
  onAnswer,
  onDecline,
  onHangup,
  onToggleMute,
}) {
  const audioRef = useRef(null)
  const [speaker, setSpeaker] = useState(readSpeakerPref)
  const [speakerHint, setSpeakerHint] = useState('')
  const supportsSink =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

  const applySink = useCallback(async () => {
    const el = audioRef.current
    if (!el || !supportsSink) return
    try {
      if (!speaker) {
        await el.setSinkId('')
        setSpeakerHint('')
        return
      }
      const devices = (await navigator.mediaDevices?.enumerateDevices?.()) || []
      const outputs = devices.filter((device) => device.kind === 'audiooutput')
      const speakerLike = outputs.find((device) => /speaker|外放|扬声器/i.test(device.label || ''))
      const fallback = outputs.find((device) => /default|默认/i.test(device.label || '')) || outputs[0]
      const target = speakerLike || fallback
      await el.setSinkId(target?.deviceId || '')
      const canSpeak = Boolean(speakerLike) || Boolean(target && !/earpiece|听筒|receiver/i.test(target.label || ''))
      setSpeakerHint(canSpeak ? '' : '当前设备无法切换到外放')
    } catch {
      setSpeakerHint('当前设备不支持切换外放')
    }
  }, [speaker, supportsSink])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !remoteStream) return undefined
    el.srcObject = remoteStream
    el.muted = false
    el.volume = 1

    let armed = false
    function removeGestureRetry() {
      armed = false
      document.removeEventListener('pointerdown', retryPlay)
      document.removeEventListener('touchstart', retryPlay)
      document.removeEventListener('click', retryPlay)
    }
    function retryPlay() {
      removeGestureRetry()
      const attempt = el.play()
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {})
    }
    function armGestureRetry() {
      if (armed) return
      armed = true
      document.addEventListener('pointerdown', retryPlay, { passive: true })
      document.addEventListener('touchstart', retryPlay, { passive: true })
      document.addEventListener('click', retryPlay, { passive: true })
    }

    const played = el.play()
    if (played && typeof played.catch === 'function') played.catch(armGestureRetry)
    return removeGestureRetry
  }, [remoteStream])

  useEffect(() => {
    applySink()
  }, [applySink])

  const toggleSpeaker = () => {
    const next = !speaker
    setSpeaker(next)
    writeSpeakerPref(next)
  }

  const ringing = state === 'ringing'
  const failed = state === 'failed'
  const connected = state === 'connected'
  const statusLine = failed
    ? error || '通话连接失败'
    : connected
      ? formatCallDuration(seconds)
      : STATUS_TEXT[state] || STATUS_TEXT.calling

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-eink-ink/95 text-eink-paper">
      <audio ref={audioRef} data-testid="remote-audio" autoPlay playsInline className="sr-only" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
        <div className="ring-1 ring-eink-paper/40">
          <Avatar name={peer?.nickname || '用户'} color={color || '#4A4A4A'} size={88} src={peer?.avatarUrl || ''} />
        </div>
        <div className="text-[20px] font-medium">{peer?.nickname || '用户'}</div>
        <div data-testid="call-status" className={`text-[14px] ${failed ? 'text-eink-paper' : 'text-eink-paper/70'}`}>
          {statusLine}
        </div>
        {muted && !failed && !ringing ? (
          <div data-testid="call-muted-hint" className="text-[12px] text-eink-paper/60">麦克风已静音</div>
        ) : null}
        {speakerHint && !failed ? (
          <div className="text-[12px] text-eink-paper/60">{speakerHint}</div>
        ) : null}
      </div>
      <div className="pb-10">
        {ringing ? (
          <div className="flex items-start justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                data-testid="call-decline"
                onClick={onDecline}
                aria-label="拒绝"
                className="flex h-[64px] w-[64px] items-center justify-center rounded-full border border-eink-paper/60 bg-transparent text-eink-paper active:bg-eink-paper/10"
              >
                <HangupIcon />
              </button>
              <span className="text-[13px] text-eink-paper/70">拒绝</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                data-testid="call-answer"
                onClick={onAnswer}
                aria-label="接听"
                className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-eink-paper text-eink-ink active:bg-white"
              >
                <AnswerIcon />
              </button>
              <span className="text-[13px] text-eink-paper/70">接听</span>
            </div>
          </div>
        ) : failed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              data-testid="call-dismiss"
              onClick={onHangup}
              className="border border-eink-paper/60 px-6 py-2 text-[14px] active:bg-eink-paper/10"
            >
              知道了
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-center gap-10">
            {onToggleMute ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  data-testid="call-mute"
                  onClick={onToggleMute}
                  aria-label={muted ? '取消静音' : '静音'}
                  className={`flex h-[64px] w-[64px] items-center justify-center rounded-full border active:bg-eink-paper/10 ${
                    muted ? 'border-eink-paper bg-eink-paper text-eink-ink' : 'border-eink-paper/60 text-eink-paper'
                  }`}
                >
                  <MicIcon muted={muted} />
                </button>
                <span className="text-[13px] text-eink-paper/70">{muted ? '取消静音' : '静音'}</span>
              </div>
            ) : null}
            {supportsSink ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  data-testid="call-speaker"
                  onClick={toggleSpeaker}
                  aria-pressed={speaker}
                  aria-label={speaker ? '关闭免提' : '打开免提'}
                  className={`flex h-[64px] w-[64px] items-center justify-center rounded-full border active:bg-eink-paper/10 ${
                    speaker ? 'border-eink-paper bg-eink-paper text-eink-ink' : 'border-eink-paper/60 text-eink-paper'
                  }`}
                >
                  <SpeakerIcon on={speaker} />
                </button>
                <span className="text-[13px] text-eink-paper/70">{speaker ? '免提开' : '免提关'}</span>
              </div>
            ) : null}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                data-testid="call-hangup"
                onClick={onHangup}
                aria-label="挂断"
                className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-eink-paper text-eink-ink active:bg-white"
              >
                <HangupIcon />
              </button>
              <span className="text-[13px] text-eink-paper/70">挂断</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AnswerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 9.5C4 7.2 6.8 5.7 10 5.5c.5 0 .9.3 1 .8l.4 2c.1.5-.2 1-.7 1.1l-1.6.5c-.3.1-.5.3-.6.6-.2.7-.1 1.4.1 2 .1.3.1.7-.2.9L7 14.6c-.4.3-.9.3-1.2-.1-1.1-1.4-1.5-3.2-1.2-5l1.9-.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 12.4l1.9-1.9 2.2 2.2 1.9-1.9a.9.9 0 0 1 1.3 0l1.4 1.4a.9.9 0 0 1 0 1.3l-2.6 2.6c-1.2 1.2-2.8 1.9-4.5 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MicIcon({ muted }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {muted ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
    </svg>
  )
}

function HangupIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 9.5C4 7.2 6.8 5.7 10 5.5c.5 0 .9.3 1 .8l.4 2c.1.5-.2 1-.7 1.1l-1.6.5c-.3.1-.5.3-.6.6-.2.7-.1 1.4.1 2 .1.3.1.7-.2.9L7 14.6c-.4.3-.9.3-1.2-.1-1.1-1.4-1.5-3.2-1.2-5l1.9-.1ZM13.2 12.4l1.9-1.9 2.2 2.2 1.9-1.9a.9.9 0 0 1 1.3 0l1.4 1.4a.9.9 0 0 1 0 1.3l-2.6 2.6c-2.3 2.3-5.8 2.7-8.6 1.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19.8 15.8 15.8 19.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function readSpeakerPref() {
  try {
    return localStorage.getItem(SPEAKER_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function writeSpeakerPref(on) {
  try {
    localStorage.setItem(SPEAKER_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function SpeakerIcon({ on }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M4 9.5h3L11.5 6v12L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      {on ? (
        <>
          <path d="M15 8.8a4.5 4.5 0 0 1 0 6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M17.6 6.2a8 8 0 0 1 0 11.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <path d="M15 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  )
}

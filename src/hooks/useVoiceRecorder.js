import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaConstraints } from '../lib/call'

export const VOICE_MAX_MS = 60 * 1000
export const VOICE_MIN_MS = 1000

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export function pickVoiceMimeType(Recorder = globalThis.MediaRecorder) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return ''
  return MIME_CANDIDATES.find((type) => Recorder.isTypeSupported(type)) || ''
}

export function formatRecordingTime(ms = 0) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function voiceDurationSeconds(ms = 0) {
  return Math.max(1, Math.round(Number(ms) / 1000))
}

export function canRecordVoice(win = typeof window === 'undefined' ? null : window) {
  return Boolean(
    win &&
      win.MediaRecorder &&
      win.navigator?.mediaDevices &&
      typeof win.navigator.mediaDevices.getUserMedia === 'function'
  )
}

export function blobToDataUrl(blob) {
  if (!blob || typeof FileReader === 'undefined') return Promise.resolve('')
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

export default function useVoiceRecorder({
  onRecorded,
  onError,
  maxMs = VOICE_MAX_MS,
  minMs = VOICE_MIN_MS,
} = {}) {
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startedRef = useRef(0)
  const cancelRef = useRef(false)
  const startingRef = useRef(false)
  const aliveRef = useRef(true)
  const callbacksRef = useRef({ onRecorded, onError })

  useEffect(() => {
    callbacksRef.current = { onRecorded, onError }
  }, [onRecorded, onError])

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    const tracks = streamRef.current?.getTracks?.() || []
    for (const track of tracks) track.stop?.()
    streamRef.current = null
    recorderRef.current = null
    startingRef.current = false
    if (aliveRef.current) {
      setRecording(false)
      setStarting(false)
    }
  }, [])

  const stop = useCallback(
    (cancel = false) => {
      cancelRef.current = cancel
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        release()
        return
      }
      try {
        recorder.stop()
      } catch {
        release()
      }
    },
    [release]
  )

  const start = useCallback(async () => {
    if (startingRef.current || recorderRef.current) return false
    if (!canRecordVoice()) {
      callbacksRef.current.onError?.('当前浏览器不支持录音')
      return false
    }
    startingRef.current = true
    cancelRef.current = false
    setStarting(true)
    setElapsed(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints())
      if (!aliveRef.current || cancelRef.current) {
        stream.getTracks?.().forEach((track) => track.stop())
        release()
        return false
      }
      streamRef.current = stream
      const mimeType = pickVoiceMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      const actualType = recorder.mimeType || mimeType || 'audio/webm'
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        cancelRef.current = true
        callbacksRef.current.onError?.('录音失败，请重试')
        try {
          recorder.stop()
        } catch {
          release()
        }
      }
      recorder.onstop = () => {
        const durationMs = Date.now() - startedRef.current
        const cancelled = cancelRef.current
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: actualType })
          : null
        release()
        if (cancelled || !aliveRef.current) return
        if (!blob || !blob.size) {
          callbacksRef.current.onError?.('没有录到声音，请重试')
          return
        }
        if (durationMs < minMs) {
          callbacksRef.current.onError?.('录音太短，请按住多说一会儿')
          return
        }
        callbacksRef.current.onRecorded?.({
          blob,
          mime: actualType,
          durationMs,
          duration: voiceDurationSeconds(durationMs),
        })
      }
      recorder.start(100)
      startedRef.current = Date.now()
      setStarting(false)
      setRecording(true)
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedRef.current
        setElapsed(ms)
        if (ms >= maxMs) stop(false)
      }, 100)
      return true
    } catch (err) {
      release()
      const message =
        err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
          ? '请允许麦克风权限后再试'
          : '无法开始录音，请检查麦克风'
      callbacksRef.current.onError?.(message)
      return false
    }
  }, [maxMs, minMs, release, stop])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      cancelRef.current = true
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop?.()
      if (timerRef.current) clearInterval(timerRef.current)
      const tracks = streamRef.current?.getTracks?.() || []
      for (const track of tracks) track.stop?.()
    }
  }, [])

  return { recording, starting, elapsed, start, stop }
}

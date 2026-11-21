const DB_NAME = 'eink-ringtone'
const DB_VERSION = 1
const STORE_NAME = 'files'
const CUSTOM_KEY = 'custom'
const FALLBACK_KEY = 'eink:custom-ringtone:v1'

export const MAX_RINGTONE_BYTES = 8 * 1024 * 1024
const FALLBACK_MAX_BYTES = 1.5 * 1024 * 1024
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|weba)$/i

function hasIndexedDb() {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function withStore(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const request = run(tx.objectStore(STORE_NAME))
        let result
        request.onsuccess = () => {
          result = request.result
        }
        tx.oncomplete = () => {
          db.close()
          resolve(result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
  )
}

function readFallback() {
  try {
    const raw = globalThis.localStorage?.getItem(FALLBACK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.dataUrl) return null
    return parsed
  } catch {
    return null
  }
}

function clearFallback() {
  try {
    globalThis.localStorage?.removeItem(FALLBACK_KEY)
  } catch {
    // 忽略存储清理失败
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取音频失败'))
    reader.readAsDataURL(file)
  })
}

export function isAudioFile(file) {
  if (!file) return false
  const type = String(file.type || '')
  const name = String(file.name || '')
  return type.startsWith('audio/') || AUDIO_EXT.test(name)
}

export function formatRingtoneSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export async function saveCustomRingtone(file) {
  if (!isAudioFile(file)) throw new Error('请选择音频文件（mp3、m4a、wav 等）')
  if (file.size > MAX_RINGTONE_BYTES) throw new Error('铃声文件不能超过 8MB')

  const record = {
    id: CUSTOM_KEY,
    name: file.name || '自定义铃声',
    size: file.size,
    type: file.type || '',
    blob: file,
    updatedAt: Date.now(),
  }

  if (hasIndexedDb()) {
    try {
      await withStore('readwrite', (store) => store.put(record))
      clearFallback()
      return { name: record.name, size: record.size }
    } catch {
      // IndexedDB 不可用时退回 localStorage 数据 URL
    }
  }

  if (file.size > FALLBACK_MAX_BYTES) {
    throw new Error('当前浏览器不支持保存大文件，请选择 1.5MB 以内的铃声')
  }
  const dataUrl = await readFileAsDataUrl(file)
  globalThis.localStorage?.setItem(
    FALLBACK_KEY,
    JSON.stringify({ name: record.name, size: record.size, type: record.type, dataUrl, updatedAt: record.updatedAt })
  )
  return { name: record.name, size: record.size }
}

export async function loadCustomRingtone() {
  if (hasIndexedDb()) {
    try {
      const record = await withStore('readonly', (store) => store.get(CUSTOM_KEY))
      if (record?.blob) {
        return { name: record.name || '自定义铃声', size: record.size || record.blob.size, type: record.type || '', blob: record.blob }
      }
    } catch {
      // 继续尝试 localStorage 兜底
    }
  }
  const fallback = readFallback()
  if (!fallback) return null
  return {
    name: fallback.name || '自定义铃声',
    size: fallback.size || 0,
    type: fallback.type || '',
    url: fallback.dataUrl,
  }
}

export async function removeCustomRingtone() {
  clearFallback()
  if (!hasIndexedDb()) return
  try {
    await withStore('readwrite', (store) => store.delete(CUSTOM_KEY))
  } catch {
    // 删除失败时保留旧数据，不影响页面继续使用
  }
}

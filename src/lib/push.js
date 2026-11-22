import { supabase } from './supabase'

export function getVapidPublicKey() {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()
}

export function isPushConfigured() {
  return Boolean(getVapidPublicKey())
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export async function currentPushSubscription() {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return null
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function enablePush(userId) {
  if (!userId) return { ok: false, error: '参数错误' }
  if (!isPushSupported()) return { ok: false, error: '当前设备不支持后台推送' }
  const publicKey = getVapidPublicKey()
  if (!publicKey) return { ok: false, error: '推送尚未配置' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, error: '通知权限未开启，请在系统设置中允许通知' }
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }))
    const json = subscription.toJSON()
    const keys = json.keys || {}
    if (!json.endpoint || !keys.p256dh || !keys.auth) {
      return { ok: false, error: '订阅信息不完整，请重试' }
    }
    await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint).eq('user_id', userId)
    const { error } = await supabase.from('push_subscriptions').insert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent || '',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch {
    return { ok: false, error: '开启失败，请稍后重试' }
  }
}

export async function disablePush(userId) {
  const subscription = await currentPushSubscription()
  try {
    if (subscription) {
      const endpoint = subscription.endpoint
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId)
      await subscription.unsubscribe()
    } else if (userId) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '关闭失败，请稍后重试' }
  }
}

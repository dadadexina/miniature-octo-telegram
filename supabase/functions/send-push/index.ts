// Supabase Edge Function: send-push
// 用法：Database Webhook 监听 public.messages INSERT，POST 到本函数；
// 请求头需带 x-webhook-secret，值与环境变量 PUSH_WEBHOOK_SECRET 一致。
// 需要环境变量：VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、VAPID_SUBJECT（mailto: 或 https:）
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function previewOf(record: Record<string, unknown>) {
  const attachments = record.attachments as { type?: string } | null
  if (attachments && attachments.type === 'image') return '[图片]'
  const content = String(record.content || '').trim()
  return content.length > 60 ? `${content.slice(0, 60)}…` : content || '你有一条新消息'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  try {
    const secret = Deno.env.get('PUSH_WEBHOOK_SECRET')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:4494507@qq.com'
    if (!secret || !publicKey || !privateKey) return json({ error: 'function not configured' }, 500)
    if (req.headers.get('x-webhook-secret') !== secret) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => null)
    const record = body?.record || body
    if (!record || !record.receiver_id || !record.sender_id) return json({ error: 'invalid payload' }, 400)
    if (record.recalled_at) return json({ ok: true, skipped: 'recalled' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return json({ error: 'function not configured' }, 500)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const receiver = record.receiver_id
    const sender = record.sender_id

    const { data: block } = await admin
      .from('blocks')
      .select('blocker_id')
      .eq('blocker_id', receiver)
      .eq('blocked_id', sender)
      .maybeSingle()
    if (block) return json({ ok: true, skipped: 'blocked' })

    const [{ data: profile }, { data: subs, error: subError }] = await Promise.all([
      admin.from('profiles').select('nickname, username').eq('id', sender).maybeSingle(),
      admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', receiver),
    ])
    if (subError) return json({ error: subError.message }, 500)
    if (!subs || !subs.length) return json({ ok: true, sent: 0 })

    const senderName = profile?.nickname || profile?.username || '新消息'
    const payload = JSON.stringify({
      title: senderName,
      body: previewOf(record),
      url: `/chat/${sender}`,
      tag: `msg-${sender}`,
    })

    let sent = 0
    const stale: string[] = []
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            TTL: 3600,
            vapidDetails: { subject, publicKey, privateKey },
          },
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) stale.push(sub.endpoint)
      }
    }
    if (stale.length) await admin.from('push_subscriptions').delete().in('endpoint', stale)
    return json({ ok: true, sent, removed: stale.length })
  } catch (err) {
    return json({ error: (err as Error)?.message || 'internal error' }, 500)
  }
})

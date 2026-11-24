// Supabase Edge Function: send-sms-hook
// 用法：Supabase Auth -> Hooks -> Send SMS Hook 指向本函数；
// 请求由 Supabase 以 Standard Webhooks 签名发送。
// 需要环境变量（Supabase Secrets）：
//   SEND_SMS_HOOK_SECRET   Send SMS Hook 生成的密钥，形如 v1,whsec_xxx
//   ALIYUN_SMS_ACCESS_KEY_ID
//   ALIYUN_SMS_ACCESS_KEY_SECRET
//   ALIYUN_SMS_SIGN_NAME
//   ALIYUN_SMS_TEMPLATE_CODE
// 可选：
//   ALIYUN_SMS_CODE_KEY    模板变量名，默认 code
//   ALIYUN_SMS_REGION_ID   默认 cn-hangzhou

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, webhook-id, webhook-timestamp, webhook-signature',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function secretBytes(value: string) {
  let raw = String(value || '').trim()
  if (raw.startsWith('v1,')) raw = raw.slice(3)
  if (raw.startsWith('whsec_')) raw = raw.slice(6)
  const binary = atob(raw)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(req: Request, rawBody: string, secret: string) {
  const id = req.headers.get('webhook-id') || ''
  const timestamp = req.headers.get('webhook-timestamp') || ''
  const signatures = req.headers.get('webhook-signature') || ''
  if (!id || !timestamp || !signatures) return false
  const now = Math.floor(Date.now() / 1000)
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > 300) return false
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
  const expected = btoa(String.fromCharCode(...mac))
  return signatures
    .trim()
    .split(/\s+/)
    .map((part) => (part.startsWith('v1,') ? part.slice(3) : part))
    .some((signature) => safeEqual(signature, expected))
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

function canonicalQuery(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
}

async function hmacSha1Base64(key: string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...mac))
}

function aliyunPhone(value: string) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '')
  if (raw.startsWith('+86') && /^1[3-9]\d{9}$/.test(raw.slice(3))) return raw.slice(3)
  return raw
}

async function sendAliyunSms(phone: string, otp: string) {
  const accessKeyId = Deno.env.get('ALIYUN_SMS_ACCESS_KEY_ID') || ''
  const accessKeySecret = Deno.env.get('ALIYUN_SMS_ACCESS_KEY_SECRET') || ''
  const signName = Deno.env.get('ALIYUN_SMS_SIGN_NAME') || ''
  const templateCode = Deno.env.get('ALIYUN_SMS_TEMPLATE_CODE') || ''
  const codeKey = Deno.env.get('ALIYUN_SMS_CODE_KEY') || 'code'
  const regionId = Deno.env.get('ALIYUN_SMS_REGION_ID') || 'cn-hangzhou'
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error('Aliyun SMS credentials are not configured')
  }
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: aliyunPhone(phone),
    RegionId: regionId,
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ [codeKey]: otp }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  }
  const stringToSign = `POST&%2F&${percentEncode(canonicalQuery(params))}`
  const signature = await hmacSha1Base64(`${accessKeySecret}&`, stringToSign)
  const body = canonicalQuery({ ...params, Signature: signature })
  const response = await fetch('https://dysmsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.Code !== 'OK') {
    throw new Error(`Aliyun SMS failed: ${result.Code || response.status} ${result.Message || ''}`.trim())
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET') || ''
  if (!secret) return json({ error: 'SEND_SMS_HOOK_SECRET is not configured' }, 500)
  const rawBody = await req.text()
  if (!(await verifySignature(req, rawBody, secret))) return json({ error: 'invalid signature' }, 401)
  let payload: { user?: { phone?: string }; sms?: { otp?: string }; phone?: string }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const phone = payload?.user?.phone || payload?.phone || ''
  const otp = String(payload?.sms?.otp || '')
  if (!phone || !/^\d{4,8}$/.test(otp)) return json({ error: 'invalid payload' }, 400)
  if (Deno.env.get('SMS_TEST_MODE') === 'true') return json({ ok: true, test: true })
  try {
    await sendAliyunSms(phone, otp)
    return json({})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send sms failed'
    return json({ error: { http_code: 500, message } }, 500)
  }
})

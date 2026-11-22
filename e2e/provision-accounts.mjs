import { randomBytes, randomUUID } from 'node:crypto'

const SUPA_URL = process.env.SUPA_URL
const SUPA_ANON = process.env.SUPA_ANON
const TM = 'https://api.mail.tm'

function rand(lower = '') {
  return lower + randomBytes(6).toString('hex')
}
function password() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  let p = ''
  for (let i = 0; i < 5; i++) p += upper[Math.floor(Math.random() * upper.length)]
  for (let i = 0; i < 9; i++) p += lower[Math.floor(Math.random() * lower.length)]
  for (let i = 0; i < 4; i++) p += digits[Math.floor(Math.random() * digits.length)]
  return p.split('').sort(() => Math.random() - 0.5).join('') + 'Zx7'
}

async function j(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

async function createInbox() {
  const { body: dom } = await j(`${TM}/domains`)
  const domain = dom['hydra:member']?.[0]?.domain
  if (!domain) throw new Error('no mail.tm domain')
  const address = `${rand('e2e.zhimo.')}@${domain}`
  const mailPass = rand('m')
  const acc = await j(`${TM}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ address, password: mailPass }),
  })
  if (acc.status !== 201) throw new Error(`mail.tm account failed ${acc.status} ${JSON.stringify(acc.body).slice(0, 150)}`)
  const canonical = acc.body.address || address
  const tok = await j(`${TM}/token`, {
    method: 'POST',
    body: JSON.stringify({ address: canonical, password: mailPass }),
  })
  if (!tok.body?.token) throw new Error(`mail.tm token failed ${JSON.stringify(tok.body).slice(0, 100)}`)
  return { address: canonical, token: tok.body.token }
}

async function waitForVerifyLink(token, timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { body } = await j(`${TM}/messages?page=1`, { headers: { authorization: `Bearer ${token}` } })
    const msgs = body['hydra:member'] || []
    for (const m of msgs) {
      const full = await j(`${TM}/messages/${m.id}`, { headers: { authorization: `Bearer ${token}` } })
      const corpus = [full.body?.text || '', ...(full.body?.html || [])].join('\n')
      const match = corpus.match(/https:\/\/[^\s"'<>\\]+\/auth\/v1\/verify[^\s"'<>\\]*/)
      if (match) return match[0].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  return null
}

async function provision(tag) {
  console.log(`[${tag}] creating inbox...`)
  const { address, token } = await createInbox()
  console.log(`[${tag}] inbox: ${address}`)

  const supaPass = password()
  const signup = await j(`${SUPA_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON },
    body: JSON.stringify({ email: address, password: supaPass }),
  })
  if (signup.status !== 200 || !signup.body?.id) {
    throw new Error(`signup failed ${signup.status} ${JSON.stringify(signup.body).slice(0, 200)}`)
  }
  const userId = signup.body.id
  console.log(`[${tag}] signup ok, user ${userId}`)

  console.log(`[${tag}] waiting for verification email...`)
  const link = await waitForVerifyLink(token)
  if (!link) throw new Error('verification email not received in time')

  const conf = await fetch(link, { redirect: 'manual' }).catch((e) => ({ status: `ERR ${e.message}` }))
  console.log(`[${tag}] verify GET status: ${conf.status}`)

  let access = null
  for (let i = 0; i < 6 && !access; i++) {
    const tok = await j(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPA_ANON },
      body: JSON.stringify({ email: address, password: supaPass }),
    })
    if (tok.body?.access_token) access = tok.body.access_token
    else {
      console.log(`[${tag}] login attempt ${i + 1}: ${JSON.stringify(tok.body).slice(0, 120)}`)
      await new Promise((r) => setTimeout(r, 8000))
    }
  }
  if (!access) throw new Error('account not confirmed / login failed')
  console.log(`[${tag}] confirmed, login ok`)

  const username = tag === 'A' ? rand('e2ea') : rand('e2eb')
  const prof = await j(`${SUPA_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: SUPA_ANON,
      authorization: `Bearer ${access}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ id: userId, nickname: tag === 'A' ? 'E2E 甲' : 'E2E 乙', username }),
  })
  if (prof.status >= 300) {
    console.log(`[${tag}] profile insert status ${prof.status}: ${JSON.stringify(prof.body).slice(0, 160)} (可能已存在，继续)`)
  } else {
    console.log(`[${tag}] profile ok: username=${username}`)
  }
  return { email: address, password: supaPass, username }
}

const a = await provision('A')
const b = await provision('B')

const env = [
  `E2E_USER_A_EMAIL='${a.email}'`,
  `E2E_USER_A_PASSWORD='${a.password}'`,
  `E2E_USER_A_USERNAME='${a.username}'`,
  `E2E_USER_B_EMAIL='${b.email}'`,
  `E2E_USER_B_PASSWORD='${b.password}'`,
  `E2E_USER_B_USERNAME='${b.username}'`,
].map((l) => `export ${l}`).join('\n')

const { writeFileSync, chmodSync } = await import('node:fs')
writeFileSync('/tmp/opencode/e2e-env.sh', env + '\n')
chmodSync('/tmp/opencode/e2e-env.sh', 0o600)
console.log('DONE: credentials written to /tmp/opencode/e2e-env.sh (not printed)')

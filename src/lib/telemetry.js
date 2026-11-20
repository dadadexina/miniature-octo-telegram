import { supabase } from './supabase'

export const CLIENT_ERRORS_SQL = `create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz default now(),
  route text,
  kind text,
  message text,
  stack text,
  session_id text,
  app_version text
);

grant usage on schema public to anon, authenticated;
grant insert on table public.client_errors to anon, authenticated;

alter table public.client_errors enable row level security;

drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert"
on public.client_errors for insert
to anon, authenticated
with check (true);

create index if not exists client_errors_occurred_idx on public.client_errors (occurred_at desc);
`

const MAX_MESSAGE = 400
const MAX_STACK = 4000

export function getSessionId() {
  try {
    const key = 'wechat-chat-app-v3:telemetry-session'
    let id = window.sessionStorage.getItem(key)
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      window.sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

export function normalizeError(err) {
  if (err instanceof Error) {
    return { message: String(err.message || ''), stack: String(err.stack || '') }
  }
  if (typeof err === 'string') return { message: err, stack: '' }
  try {
    return { message: JSON.stringify(err), stack: '' }
  } catch {
    return { message: String(err), stack: '' }
  }
}

export function createLimiter({ max = 12, windowMs = 60000, cooldownMs = 5000 } = {}) {
  const seen = new Map()
  let count = 0
  let windowStart = Date.now()
  return {
    allow(key, now = Date.now()) {
      if (now - windowStart > windowMs) {
        windowStart = now
        count = 0
        seen.clear()
      }
      if (count >= max) return false
      const last = seen.get(key)
      if (last !== undefined && now - last < cooldownMs) return false
      seen.set(key, now)
      count += 1
      return true
    },
  }
}

const limiter = createLimiter()

export function buildRow(err, meta = {}) {
  const { message, stack } = normalizeError(err)
  return {
    route: (meta.route ?? (typeof window !== 'undefined' ? window.location.pathname : '')) || '',
    kind: meta.kind || 'error',
    message: message.slice(0, MAX_MESSAGE),
    stack: stack.slice(0, MAX_STACK),
    session_id: getSessionId(),
    app_version: meta.appVersion || __APP_VERSION__ || '0.0.0',
  }
}

export async function captureError(err, meta = {}) {
  const row = buildRow(err, meta)
  if (!limiter.allow(`${row.kind}:${row.route}:${row.message}`)) {
    return { ok: true, skipped: true }
  }
  try {
    const { error } = await supabase.from('client_errors').insert(row)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || 'telemetry failed' }
  }
}

let installed = false

export function initTelemetry() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    captureError(event.error || event.message, { kind: 'window.onerror', route: window.location.pathname })
  })
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, { kind: 'unhandledrejection', route: window.location.pathname })
  })
}

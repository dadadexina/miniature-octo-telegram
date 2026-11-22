export const EXPORT_FORMAT = 'zhimo-export'
export const EXPORT_VERSION = 1
export const EXPORT_PAGE_SIZE = 500
export const EXPORT_MAX_ROWS = 50000

const EXPORT_QUERIES = [
  { key: 'profile', table: 'profiles', single: true, filter: (q, id) => q.eq('id', id) },
  { key: 'friends', table: 'friends', filter: (q, id) => q.eq('owner_id', id), order: 'created_at' },
  {
    key: 'friendRequestsSent',
    table: 'friend_requests',
    filter: (q, id) => q.eq('from_id', id),
    order: 'created_at',
  },
  {
    key: 'friendRequestsReceived',
    table: 'friend_requests',
    filter: (q, id) => q.eq('to_id', id),
    order: 'created_at',
  },
  { key: 'blocks', table: 'blocks', filter: (q, id) => q.eq('blocker_id', id), order: 'created_at' },
  { key: 'messagesSent', table: 'messages', filter: (q, id) => q.eq('sender_id', id), order: 'id' },
  {
    key: 'messagesReceived',
    table: 'messages',
    filter: (q, id) => q.eq('receiver_id', id),
    order: 'id',
  },
  {
    key: 'messageHides',
    table: 'message_hides',
    filter: (q, id) => q.eq('user_id', id),
    order: 'message_id',
  },
  { key: 'moments', table: 'moments', filter: (q, id) => q.eq('author_id', id), order: 'created_at' },
  {
    key: 'momentLikes',
    table: 'moment_likes',
    filter: (q, id) => q.eq('user_id', id),
    order: 'created_at',
  },
  {
    key: 'momentComments',
    table: 'moment_comments',
    filter: (q, id) => q.eq('user_id', id),
    order: 'created_at',
  },
  { key: 'conversationPrefs', table: 'conversation_prefs', filter: (q, id) => q.eq('user_id', id) },
  { key: 'readCursors', table: 'read_cursors', filter: (q, id) => q.eq('user_id', id) },
]

const STORAGE_PREFIXES = [
  { bucket: 'avatars', key: 'avatars' },
  { bucket: 'moments', key: 'momentImages' },
]

export function exportFileName(userId, now = new Date()) {
  const day = new Date(now).toISOString().slice(0, 10)
  const suffix = String(userId || 'account').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'account'
  return `${EXPORT_FORMAT}-${day}-${suffix}.json`
}

export function serializeExport(payload) {
  return JSON.stringify(payload, null, 2)
}

function normalizePageSize(pageSize) {
  const size = Number(pageSize)
  if (!Number.isFinite(size) || size < 1) return EXPORT_PAGE_SIZE
  return Math.min(Math.floor(size), EXPORT_PAGE_SIZE)
}

async function fetchAll(client, spec, userId, pageSize) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = client.from(spec.table).select('*')
    query = spec.filter(query, userId)
    if (spec.order) query = query.order(spec.order, { ascending: true })
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { ok: false, error: error.message || '读取失败', rows }
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (rows.length > EXPORT_MAX_ROWS) {
      return { ok: false, error: `记录超过 ${EXPORT_MAX_ROWS} 条，请联系管理员`, rows: [] }
    }
    if (page.length < pageSize) return { ok: true, rows }
  }
}

async function fetchSingle(client, spec, userId) {
  let query = client.from(spec.table).select('*')
  query = spec.filter(query, userId)
  const { data, error } = await query.maybeSingle()
  if (error) return { ok: false, error: error.message || '读取失败', rows: null }
  return { ok: true, rows: data || null }
}

function mediaPathsFromMessages(rows) {
  const paths = new Set()
  for (const row of rows || []) {
    const path = row?.attachments?.path
    if (typeof path === 'string' && path) paths.add(path)
  }
  return [...paths].sort()
}

async function listPrefix(client, bucket, prefix) {
  const rows = []
  const limit = 100
  for (let offset = 0; offset < 1000; offset += limit) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) return { ok: false, error: error.message || '读取失败', rows }
    const page = Array.isArray(data) ? data : []
    for (const item of page) {
      if (!item?.name) continue
      rows.push({
        path: `${prefix}/${item.name}`,
        size: item.metadata?.size ?? null,
        updatedAt: item.updated_at || item.updatedAt || null,
      })
    }
    if (page.length < limit) return { ok: true, rows }
  }
  return { ok: true, rows }
}

async function collectStorage(client, userId, messageRows) {
  const files = {}
  const errors = []
  for (const item of STORAGE_PREFIXES) {
    const result = await listPrefix(client, item.bucket, userId)
    if (!result.ok) errors.push(`storage.${item.key}: ${result.error}`)
    files[item.key] = result.rows
  }
  files.messageMedia = mediaPathsFromMessages(messageRows)
  return { files, errors }
}

export async function collectUserData(
  client,
  userId,
  { email = '', now = new Date(), pageSize = EXPORT_PAGE_SIZE } = {}
) {
  if (!client || typeof client.from !== 'function') return { ok: false, error: '云端未配置' }
  if (!userId) return { ok: false, error: '未登录云端账号' }

  const size = normalizePageSize(pageSize)
  const data = {}
  const counts = {}
  for (const spec of EXPORT_QUERIES) {
    const result = spec.single
      ? await fetchSingle(client, spec, userId)
      : await fetchAll(client, spec, userId, size)
    if (!result.ok) return { ok: false, error: `${spec.table}: ${result.error}` }
    data[spec.key] = result.rows
    counts[spec.key] = Array.isArray(result.rows) ? result.rows.length : result.rows ? 1 : 0
  }

  const messageRows = [...(data.messagesSent || []), ...(data.messagesReceived || [])]
  let storage = { files: {}, errors: [] }
  if (client.storage && typeof client.storage.from === 'function') {
    storage = await collectStorage(client, userId, messageRows)
  }

  const payload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    account: { id: userId, email: email || '' },
    counts,
    storage,
    data,
  }
  return { ok: true, payload }
}

export function downloadTextFile(
  fileName,
  text,
  { doc = globalThis.document, urlApi = globalThis.URL } = {}
) {
  if (!doc || typeof doc.createElement !== 'function' || !urlApi?.createObjectURL) return false
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const href = urlApi.createObjectURL(blob)
  const anchor = doc.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.rel = 'noopener'
  doc.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => {
    try {
      urlApi.revokeObjectURL?.(href)
    } catch {
      // 释放失败不影响已触发的下载
    }
  }, 0)
  return true
}

export function summarizeExport(payload) {
  const counts = payload?.counts || {}
  const total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
  const media = payload?.storage?.files
  const mediaCount =
    (media?.avatars?.length || 0) +
    (media?.momentImages?.length || 0) +
    (media?.messageMedia?.length || 0)
  return { total, mediaCount }
}

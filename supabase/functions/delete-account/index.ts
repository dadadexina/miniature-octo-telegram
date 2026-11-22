// Supabase Edge Function: delete-account
// 部署方式：Dashboard → Edge Functions → delete-account → 粘贴本文件内容 → Deploy
// 权限：仅在请求携带有效用户 JWT 时删除该用户自身账号；profiles/messages/friends 通过外键级联清除
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

async function removePrefix(admin: ReturnType<typeof createClient>, bucket: string, prefix: string) {
  let total = 0
  for (let guard = 0; guard < 50; guard += 1) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset: 0 })
    if (error) throw new Error(`${bucket} 列目录失败: ${error.message}`)
    const files = (data || []).filter((item) => item.id)
    if (!files.length) return total
    const paths = files.map((item) => `${prefix}/${item.name}`)
    const { error: removeError } = await admin.storage.from(bucket).remove(paths)
    if (removeError) throw new Error(`${bucket} 删除失败: ${removeError.message}`)
    total += paths.length
  }
  return total
}

async function removeMediaPaths(admin: ReturnType<typeof createClient>, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))]
  let total = 0
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    const { error } = await admin.storage.from('message_media').remove(batch)
    if (error) throw new Error(`message_media 删除失败: ${error.message}`)
    total += batch.length
  }
  return total
}

async function collectUserMediaPaths(admin: ReturnType<typeof createClient>, uid: string) {
  const paths: string[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('messages')
      .select('attachments')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .not('attachments', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`messages 查询失败: ${error.message}`)
    const rows = (data || []) as Array<{ attachments?: { type?: string; path?: string } | null }>
    for (const row of rows) {
      const att = row.attachments
      if (att && att.type === 'image' && att.path) paths.push(att.path)
    }
    if (rows.length < pageSize) break
  }
  return paths
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'missing authorization' }, 401)
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'function not configured' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await admin.auth.getUser(authHeader.slice(7))
    if (userError || !userData?.user) {
      return json({ error: 'invalid token' }, 401)
    }
    const uid = userData.user.id

    // messages 未设 auth.users 外键（历史原因），需显式清空双方会话，避免注销后消息残留
    const mediaPaths = await collectUserMediaPaths(admin, uid)
    const { count: messagesRemoved, error: messageError } = await admin
      .from('messages')
      .delete({ count: 'exact' })
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    if (messageError) {
      return json({ error: messageError.message }, 500)
    }

    // 再清理存储与账号：确保注销后不残留头像、朋友圈图片与聊天媒体
    const mediaRemoved = await removeMediaPaths(admin, mediaPaths)
    const avatarsRemoved = await removePrefix(admin, 'avatars', uid)
    const momentsRemoved = await removePrefix(admin, 'moments', uid)

    const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
    if (deleteError) {
      return json({ error: deleteError.message }, 500)
    }
    return json({
      ok: true,
      cleaned: {
        media: mediaRemoved,
        avatars: avatarsRemoved,
        moments: momentsRemoved,
        messages: messagesRemoved || 0,
      },
    })
  } catch (err) {
    return json({ error: err?.message || 'internal error' }, 500)
  }
})

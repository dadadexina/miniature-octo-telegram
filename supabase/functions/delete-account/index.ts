// Supabase Edge Function: delete-account
// 部署方式：Dashboard → Edge Functions → Create a new function → 名称 delete-account → 粘贴本文件内容 → Deploy
// 权限：仅在请求携带有效用户 JWT 时删除该用户自身账号；profiles/messages/friends 通过外键级联清除
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'missing authorization' }), { status: 401, headers: corsHeaders })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'function not configured' }), { status: 500, headers: corsHeaders })
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await admin.auth.getUser(authHeader.slice(7))
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders })
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id)
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'internal error' }), { status: 500, headers: corsHeaders })
  }
})
